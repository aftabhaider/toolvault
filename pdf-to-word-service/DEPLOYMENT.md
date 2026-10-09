# Deploy the PDF-to-Word service

This service is separate from the Cloudflare frontend because the conversion engine needs a Python runtime. **Start with Koyeb's free Web Service instance** if you do not want a paid hosting plan.

## Option A: Koyeb free instance

Koyeb documents one free Web Service instance per organization with 512 MB RAM, 0.1 vCPU, and 2 GB disk. It scales to zero after one hour without traffic. Koyeb describes this tier as suitable for testing and hobby projects, not production. PDF conversion may be slow or fail for large/complex PDFs under these limits.

1. Sign in at [Koyeb](https://www.koyeb.com/).
2. Create a **Web Service** from the GitHub repository `aftabhaider/toolvault`.
3. Choose the repository's `main` branch and use the Dockerfile in the `pdf-to-word-service` directory as the service build source/root directory.
4. Configure the service to listen on the platform-provided `PORT`. If the platform does not automatically pass the port to the container, update the Docker start command to use `uvicorn main:app --host 0.0.0.0 --port $PORT`.
5. Set these environment variables:
   - `ALLOWED_ORIGINS=https://toolvault.aftabjordan1.workers.dev`
   - `MAX_UPLOAD_MB=10` (keep the upload limit modest for the free instance)
6. Select the **Free** instance and a supported region (Frankfurt or Washington, D.C., according to current Koyeb free-instance documentation).
7. Deploy, then open the public service URL with `/health` appended. It should return JSON with `"ok": true`.
8. Keep the base service URL (without `/health`) for the frontend connection step.

If Koyeb's current account flow asks for a payment method or does not offer the free instance, stop before confirming any paid resources. Do not select an Eco or larger instance for this no-cost setup.

## Option B: Render (only if a suitable free plan is offered)

1. Sign in to Render and choose **New + → Blueprint**.
2. Connect `aftabhaider/toolvault`, select `render.yaml`, and review the plan and pricing shown before confirming.
3. Continue only if the dashboard explicitly confirms the service will be free. Otherwise cancel and use another option.

## Connect the frontend after deployment

The frontend must send the selected PDF to the deployed service's `/api/convert` endpoint. Do not connect it until the service is live and its health endpoint has been checked. The service URL is required to finish this step; it cannot safely be guessed.

## Test before calling it finished

- Convert a non-sensitive, text-based PDF with paragraphs and a table.
- Open the DOCX in Microsoft Word or LibreOffice and verify that text and table cells can be edited.
- Check that logos and other images are present as image objects.
- Compare page breaks, headers/footers, fonts, and alignment against the source PDF.
- Test an invalid file and an oversized PDF to verify that errors are handled clearly.
- Confirm the service handles the chosen free-tier resource limits without crashing.

## Known limitations

The initial converter uses a rule-based PDF-to-DOCX engine. It cannot guarantee pixel-perfect layout for every PDF, and scanned PDFs generally need OCR, which is not included in this initial version. Small free instances may not have enough CPU or memory for complex PDFs. Always inspect important documents after conversion.
