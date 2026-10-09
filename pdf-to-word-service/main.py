import os
import tempfile
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from starlette.concurrency import run_in_threadpool
from pdf2docx import Converter

APP_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "https://toolvault.aftabjordan1.workers.dev"
    ).split(",")
    if origin.strip()
]
MAX_UPLOAD_BYTES = int(os.getenv("MAX_UPLOAD_MB", "25")) * 1024 * 1024

app = FastAPI(
    title="ToolVault PDF-to-Word Engine",
    description="Self-hosted PDF to editable DOCX conversion using open-source tooling.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=APP_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)


def cleanup(*paths: str) -> None:
    for item in paths:
        try:
            Path(item).unlink(missing_ok=True)
        except OSError:
            pass


def convert_file(source_path: str, output_path: str) -> None:
    converter = Converter(source_path)
    try:
        converter.convert(output_path, multi_processing=False)
    finally:
        converter.close()


@app.get("/health")
def health():
    return {"ok": True, "service": "toolvault-pdf-to-word", "version": "1.1.0"}


@app.post("/api/convert")
async def convert_pdf(file: UploadFile = File(...)):
    original_name = Path(file.filename or "document.pdf").name
    if not original_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

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

        # Run CPU-bound conversion away from the async event loop.
        # The platform should also enforce an upstream request timeout.
        await run_in_threadpool(convert_file, temp_pdf, temp_docx)

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
