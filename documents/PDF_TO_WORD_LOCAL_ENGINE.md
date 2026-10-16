# ToolVault PDF-to-Word: Local Engine v2

## Purpose

The PDF-to-Word page now has a repository-owned browser engine so normal conversion does not depend on a separate conversion API staying awake. The engine does not use iLovePDF's private code or API.

## Architecture

- \`documents/pdf-to-word-engine.js\` owns conversion logic.
- PDF.js parses the PDF and reads text items and their approximate page coordinates.
- \`docx.js\` packages reconstructed text/paragraphs into a DOCX.
- The visual mode renders each PDF page as a high-resolution image inside Word when visual appearance matters more than editable text.
- Optional English OCR uses Tesseract.js in the browser for pages with little or no selectable text.
- \`documents/pdf-to-word.html\` no longer calls \`https://converter.toolvault-pdf.blitz.cloud/api/convert\`.
- The existing Python \`pdf2docx\` service remains in the repository as a future/optional server-side engine; it is not required for the new page workflow.

## What "local" means today

The PDF itself is processed in the user's browser and is not uploaded to a ToolVault conversion API. However, the required JavaScript libraries and the optional OCR engine/language model are currently loaded from CDNs. This is **server-independent local processing**, not yet a guaranteed fully offline/PWA experience. A later offline-hardening release should vendor dependencies on the same origin and add a tested service-worker cache.

## Current limits

- Maximum input: 60 MB.
- Maximum pages: 150.
- Editable text mode reconstructs text lines and approximates horizontal positioning and spacing.
- This is a heuristic converter, not a full PDF layout engine. Complex tables, multiple columns, rotated text, images, forms, headers/footers, unusual fonts, RTL scripts, and mixed page sizes can require correction.
- OCR currently uses English. OCR is probabilistic and can misread names, dates, decimal points, amounts, and technical values; users must review important output.
- Visual mode keeps page appearance by inserting a page image, which means the underlying page text is not individually editable.
- Large files and OCR can use substantial browser memory/CPU.

## Why this addresses the sleeping service

The PDF page no longer calls a conversion endpoint, so the default editable conversion path is not blocked by a server that scales to zero or needs a cold-start. A server-side converter may still be useful later for advanced reconstruction and high-volume documents, but that service would need an always-on host if it must never sleep. Hosting configuration cannot be made always-on by frontend code alone.

## Open-source components and licensing checks

- PDF.js: https://github.com/mozilla/pdf.js
- docx.js: https://github.com/dolanmiu/docx
- Tesseract.js: https://github.com/naptha/tesseract.js
- Existing \`pdf2docx\` repository is MIT licensed but states that Artifex no longer actively maintains it: https://github.com/ArtifexSoftware/pdf2docx

Review dependency notices and distribution obligations before commercial redistribution or packaging a desktop/offline product. This document is engineering guidance, not legal advice.

## Test checklist before merging to production

- [ ] Simple text PDF: text is editable and follows the original reading order.
- [ ] PDF with bold headings and different font sizes: emphasis is reasonably preserved.
- [ ] PDF with two columns: note where reading order is imperfect; do not claim exact layout.
- [ ] PDF with a table: inspect spacing and column positions in Word.
- [ ] PDF with a logo/photo: test visual mode and note that editable mode does not promise to reconstruct all images.
- [ ] Scanned English PDF with OCR off: show a clear request to enable OCR.
- [ ] Scanned English PDF with OCR on: ensure OCR starts, progresses, finishes, and can be reviewed.
- [ ] Mixed PDF with both selectable and scanned pages.
- [ ] Encrypted/password-protected and damaged PDFs: show a clear error without crashing the page.
- [ ] 60 MB boundary and >150-page boundary: graceful rejection before expensive processing.
- [ ] Test on Chrome desktop and a representative mobile browser.
- [ ] Browser DevTools Network: verify no request containing the selected PDF is sent to the old conversion API.
- [ ] Compare output to the source in Microsoft Word or LibreOffice; do not call the engine production-ready until observed results are documented.

## Next engineering stages

1. Run manual quality tests on representative, non-confidential PDFs.
2. Improve column detection and group aligned text into real Word tables.
3. Add multilingual OCR only with tested reading-order/RTL behavior.
4. Vendor pinned JavaScript/WASM assets and trained data, with license notices, if fully offline operation is required.
5. Consider the backend again only if quality tests show the local path is insufficient; use persistent/always-on hosting or clearly disclose cold-start behavior.
