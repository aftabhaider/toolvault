import asyncio
import os
import sys
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask

DEFAULT_ALLOWED_ORIGINS = "https://toolvault.aftabjordan1.workers.dev"
CONVERTER_SCRIPT = str(Path(__file__).with_name("converter.py"))


def parse_allowed_origins(raw: str | None) -> list[str]:
    """Parse the comma-separated ALLOWED_ORIGINS setting.

    Origins are compared exactly by the CORS middleware, so trailing slashes are
    stripped. An unset or blank value falls back to the ToolVault frontend; an
    explicit "*" is honoured but must be opted into deliberately.
    """
    value = raw if raw and raw.strip() else DEFAULT_ALLOWED_ORIGINS
    origins = [item.strip().rstrip("/") for item in value.split(",") if item.strip()]
    return ["*"] if "*" in origins else origins


def positive_int_env(name: str, default: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return value if value > 0 else default


# Browser access is limited to the configured frontend origins. Credentials stay
# disabled because the API is cookie-free.
APP_ORIGINS = parse_allowed_origins(os.getenv("ALLOWED_ORIGINS"))
MAX_UPLOAD_BYTES = positive_int_env("MAX_UPLOAD_MB", 25) * 1024 * 1024
# Kept below the frontend's 120 s request timeout, which also covers the upload.
CONVERSION_TIMEOUT_SECONDS = positive_int_env("CONVERSION_TIMEOUT_SECONDS", 90)
# Conversions are CPU- and memory-heavy; small instances should run one at a time.
MAX_CONCURRENT_CONVERSIONS = positive_int_env("MAX_CONCURRENT_CONVERSIONS", 1)

conversion_slots = asyncio.Semaphore(MAX_CONCURRENT_CONVERSIONS)

app = FastAPI(
    title="ToolVault PDF-to-Word Engine",
    description="Self-hosted PDF to editable DOCX conversion using open-source tooling.",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=APP_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


class ConversionError(Exception):
    pass


def cleanup(*paths: str) -> None:
    for item in paths:
        try:
            Path(item).unlink(missing_ok=True)
        except OSError:
            pass


def busy_error() -> HTTPException:
    return HTTPException(
        status_code=503,
        detail="The converter is busy with another file. Please try again in a minute.",
        headers={"Retry-After": "30"},
    )


async def run_conversion(source_path: str, output_path: str) -> None:
    """Convert in a child process so it can be killed when it runs too long."""
    process = await asyncio.create_subprocess_exec(
        sys.executable, CONVERTER_SCRIPT, source_path, output_path,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _, stderr = await asyncio.wait_for(process.communicate(), timeout=CONVERSION_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        process.kill()
        await process.wait()
        raise
    except asyncio.CancelledError:
        # Client disconnected or server shutting down: do not leave the worker running.
        process.kill()
        await process.wait()
        raise
    if process.returncode != 0:
        raise ConversionError(stderr.decode("utf-8", "replace").strip())


@app.get("/health")
def health():
    return {"ok": True, "service": "toolvault-pdf-to-word", "version": "1.2.0"}


@app.post("/api/convert")
async def convert_pdf(file: UploadFile = File(...)):
    original_name = Path(file.filename or "document.pdf").name
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")
    # Fail fast before storing the upload if every conversion slot is taken.
    if conversion_slots.locked():
        await file.close()
        raise busy_error()

    temp_pdf = None
    temp_docx = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as source:
            temp_pdf = source.name
            total = 0
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"PDF is too large. Maximum size is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
                    )
                source.write(chunk)

        if total == 0:
            raise HTTPException(status_code=400, detail="The uploaded file is empty.")

        with open(temp_pdf, "rb") as source:
            if not source.read(5).startswith(b"%PDF-"):
                raise HTTPException(status_code=400, detail="The file does not appear to be a valid PDF.")

        with tempfile.NamedTemporaryFile(suffix=".docx", delete=False) as target:
            temp_docx = target.name

        # Another upload may have taken the slot while this one was arriving.
        if conversion_slots.locked():
            raise busy_error()
        async with conversion_slots:
            await run_conversion(temp_pdf, temp_docx)

        if not os.path.exists(temp_docx) or os.path.getsize(temp_docx) == 0:
            raise HTTPException(status_code=422, detail="No Word document could be generated from this PDF.")

        download_name = Path(original_name).stem[:100] or "converted-document"
        return FileResponse(
            temp_docx,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            filename=f"{download_name}.docx",
            background=BackgroundTask(cleanup, temp_pdf, temp_docx),
        )
    except HTTPException:
        cleanup(*(p for p in (temp_pdf, temp_docx) if p))
        raise
    except asyncio.CancelledError:
        cleanup(*(p for p in (temp_pdf, temp_docx) if p))
        raise
    except asyncio.TimeoutError as exc:
        cleanup(*(p for p in (temp_pdf, temp_docx) if p))
        raise HTTPException(
            status_code=504,
            detail=f"Conversion took longer than {CONVERSION_TIMEOUT_SECONDS} seconds and was stopped. Try a smaller or simpler PDF.",
        ) from exc
    except Exception as exc:
        cleanup(*(p for p in (temp_pdf, temp_docx) if p))
        message = str(exc).lower()
        if "password" in message or "encrypted" in message:
            raise HTTPException(status_code=422, detail="This PDF may be password-protected. Remove its password and try again.") from exc
        raise HTTPException(
            status_code=422,
            detail="Conversion failed. The PDF may be damaged, encrypted, scanned, or contain unsupported layout features.",
        ) from exc
    finally:
        await file.close()
