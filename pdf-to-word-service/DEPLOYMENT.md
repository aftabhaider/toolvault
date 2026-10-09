# Deploy the PDF-to-Word service

This service is separate from the Cloudflare Pages/Workers frontend because the conversion engine needs a Python runtime.

## Deploy on Render

1. Sign in to Render and choose **New + → Blueprint**.
2. Connect the GitHub repository `aftabhaider/toolvault`.
3. Select the repository's `render.yaml` blueprint and deploy the service named `toolvault-pdf-to-word`.
4. Wait until the service reports **Live**.
5. Open the service's public URL with `/health` appended. It should return JSON containing a healthy status.
6. Copy the service's base URL (without `/health`) and keep it available for the frontend connection step.

The blueprint uses Render's free plan. Free services may sleep when idle, so the first conversion after a period of inactivity can take longer.

## Connect the frontend after deployment

The frontend must send the selected PDF to the deployed service's `/api/convert` endpoint. Do not add the endpoint to the page until the service is live and its health endpoint has been checked.

## Test before calling it finished

- Convert a text-based PDF with paragraphs and a table.
- Open the DOCX in Microsoft Word or LibreOffice and verify that text and table cells can be edited.
- Check that logos and other images are present as image objects.
- Compare page breaks, headers/footers, fonts, and alignment against the source PDF.
- Test an invalid file and an oversized PDF to verify that errors are handled clearly.

## Known limitations

The initial converter uses a rule-based PDF-to-DOCX engine. It cannot guarantee pixel-perfect layout for every PDF, and scanned PDFs generally need OCR, which is not included in this initial version. Always inspect important documents after conversion.
