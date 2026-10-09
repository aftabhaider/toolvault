# ToolVault PDF-to-Word: quality roadmap

This plan records product requirements informed by public converter documentation. It does not copy that project's application code (the reference repository says its website source is not included).

## Current baseline
- Python FastAPI endpoint accepts one PDF and returns a DOCX using `pdf2docx`.
- Upload size is limited by `MAX_UPLOAD_MB` (default 25 MB).
- Invalid extensions, empty uploads, and files missing the PDF signature are rejected.
- Conversion is CPU-bound and currently runs in a thread pool.
- The service has not yet been deployed or end-to-end tested.

## Quality priorities

### P0 — deploy and verify
- Deploy the backend, verify `/health`, and configure the frontend to call `/api/convert`.
- Ensure frontend errors explain unsupported, encrypted, oversized, or failed conversions.
- Test with a non-sensitive sample PDF containing headings, paragraphs, a real table, and a logo.
- Verify DOCX text and table cells are editable and images remain separate image objects.
- Compare page breaks, margins, headers/footers, alignment, and fonts; record observed limitations instead of claiming exact fidelity.

### P1 — handle scanned PDFs
- Add OCR as an explicit, opt-in mode rather than silently processing every PDF with OCR.
- Detect likely image-only pages and explain when OCR is needed.
- Review OCR output for numbers, names, dates, currency amounts, and table relationships.
- Choose an OCR engine only after checking its license, language support, deployment footprint, and data-handling implications.

### P1 — privacy and safe file handling
- Keep temporary files short-lived and delete them on both success and failure.
- Do not log uploaded document contents, document text, or download tokens.
- Keep a configurable upload limit and return clear errors for oversized files.
- Publish a clear statement that uploads are sent to the conversion service for processing; do not claim browser-only processing once the backend is connected.
- Verify deployment platform retention, request limits, and logs before making deletion or confidentiality promises.

### P2 — usability improvements
- Consider batch conversion only after single-file conversion is stable.
- Display processing state, actionable error messages, and a clear download action.
- Add automated tests for invalid PDFs, empty uploads, encrypted PDFs, size limits, and representative text/table/image files.

## Acceptance checklist
- [ ] Service health endpoint is live.
- [ ] Frontend points to the deployed service and CORS only allows the intended site origin.
- [ ] A text PDF produces a non-empty DOCX.
- [ ] Paragraph text is editable.
- [ ] Table cells are editable where the source structure can be reconstructed.
- [ ] Logos/images appear as distinct image objects.
- [ ] Output is visually inspected against the original.
- [ ] Scanned input receives a clear limitation message until OCR is implemented.
- [ ] Temporary files are cleaned up on success and on failures.
- [ ] Privacy wording accurately describes server-side processing.

## Known constraints
PDF-to-DOCX conversion is reconstruction, not a guarantee of pixel-perfect reproduction. PDF fonts, positioning, unusual tables, complex multi-column layouts, scanned pages, and headers/footers can require manual correction. OCR may introduce character and number errors, so important output must be reviewed.
