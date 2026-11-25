# ToolVault PDF-to-Word Engine

A small, self-hostable HTTP API for converting PDF files into editable DOCX documents with the open-source `pdf2docx` library.

## Run locally

Requires Python 3.10+.

```bash
python -m venv .venv
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell:
# .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn main:app --host 127.0.0.1 --port 8000
```

Health check: `GET /health`

Convert: `POST /api/convert` as multipart form data with a `file` field containing a PDF. The response is a DOCX download.

## Container

```bash
docker build -t toolvault-pdf-to-word .
docker run --rm -p 8000:8000 -e ALLOWED_ORIGINS=https://toolvault.aftabjordan1.workers.dev toolvault-pdf-to-word
```

## Configuration

- `ALLOWED_ORIGINS`: comma-separated browser origins permitted by CORS. Defaults to the current ToolVault Workers hostname. Requests from any other origin are not granted CORS access. Set `*` only if you deliberately want any website to call the API.
- `MAX_UPLOAD_MB`: maximum accepted PDF size in megabytes; defaults to 25.
- `CONVERSION_TIMEOUT_SECONDS`: hard limit for one conversion; defaults to 90. Each conversion runs in a child process (`converter.py`) that is killed when the limit is reached, and the API returns `504`. Keep this below the frontend's 120-second request timeout.
- `MAX_CONCURRENT_CONVERSIONS`: how many conversions may run at once; defaults to 1, which suits small free instances. Extra requests get `503` with a `Retry-After` header instead of queueing.

## Tests

```bash
pip install fastapi python-multipart pytest httpx
python -m pytest tests
```

The tests replace `converter.py` with small fake scripts, so they do not need `pdf2docx` installed. `requirements-dev.txt` installs the full set, including `pdf2docx`.

## Important limitations

This is an independent conversion service; it does not use iLovePDF's private code or API. It attempts to reconstruct editable text, images and tables in DOCX, but PDFs are a fixed-layout format and exact visual reproduction cannot be guaranteed. Complex page designs, unusual fonts, forms, and scanned PDFs may require additional handling. This initial version does not run OCR. The service limits upload size, conversion time and concurrency itself, but it does not rate-limit per client: add rate limiting at the hosting platform or a proxy in front of it before heavy public use, and monitor it.
