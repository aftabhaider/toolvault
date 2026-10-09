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

- `ALLOWED_ORIGINS`: comma-separated browser origins permitted by CORS. Defaults to the current ToolVault Workers hostname.
- `MAX_UPLOAD_MB`: maximum accepted PDF size in megabytes; defaults to 25.

## Important limitations

This is an independent conversion service; it does not use iLovePDF's private code or API. It attempts to reconstruct editable text, images and tables in DOCX, but PDFs are a fixed-layout format and exact visual reproduction cannot be guaranteed. Complex page designs, unusual fonts, forms, and scanned PDFs may require additional handling. This initial version does not run OCR. Do not expose this API publicly without HTTPS, upload-size limits, request timeouts, monitoring, and suitable abuse protection.
