# ToolVault PDF-to-Word: Local Engine and Offline Cache

## Purpose

The PDF-to-Word page has a repository-owned browser conversion engine and no longer depends on the remote conversion API for its primary workflow. The engine does not use iLovePDF's private code or API.

## Architecture

- \`documents/pdf-to-word-engine.js\` owns the conversion logic.
- \`documents/pdf-to-word-sw.js\` caches the converter page and its open-source runtime libraries under same-origin paths.
- PDF.js reads PDF page text and coordinates and renders pages when image-based layout retention is selected.
- \`docx.js\` packages reconstructed content into a DOCX document.
- Optional English OCR uses Tesseract.js and the English trained data.
- The frontend no longer calls \`https://converter.toolvault-pdf.blitz.cloud/api/convert\`.
- The previous Python \`pdf2docx\` service is retained in the repo but is not required for the new page workflow.

## Offline behavior

**First setup requires an internet connection.** When a visitor opens the converter, it registers the service worker, fetches the converter page and engine, and caches PDF.js, its worker, and docx.js. The PDF itself is processed on the visitor's device; it is not uploaded to a ToolVault conversion API.

Once setup reports that the local converter is ready, the basic conversion modes should continue to work offline in that browser, provided the user does not clear site data and the browser retains the service-worker cache. The page and core assets are scoped to \`/documents/\`; this does not make the whole ToolVault site offline.

OCR assets are loaded only when a user enables OCR. To prepare OCR for offline use, complete at least one successful OCR conversion while online so the Tesseract script, worker, core/WASM files, and English language data are fetched and cached. Browser storage eviction can remove cached assets.

The cache fetches the pinned public library builds on first setup and serves them through same-origin paths. This reduces runtime reliance on third-party CDN availability after cache warm-up, but it is not equivalent to bundling all vendor bytes directly into the Git repository. For strict offline distribution or supply-chain independence, vendor the exact packages and their license notices into the repo instead.

## Conversion modes

Editable mode reconstructs nearby text lines into editable Word table cells where the column pattern is consistent. If a PDF includes a rendered header/footer band, that band is embedded as a page header/footer image so logos and branded artwork do not disappear. These image bands are not editable; body text and reconstructed table cells remain editable. Complex tables, multi-column forms, and unusual row merges still require manual review.
 and limits

- Maximum input: 60 MB.
- Maximum pages: 150.
- Editable mode reconstructs text lines from PDF text items, estimates spacing/horizontal positions, and conservatively detects repeated aligned rows that may be rebuilt as editable Word tables.
- Visual mode embeds each rendered PDF page as an image in the DOCX. This preserves appearance more closely but the underlying page text is not individually editable.
- OCR currently uses English and is optional. It can misread names, dates, decimal points, amounts, or technical terms.
- The editable engine is heuristic, not a full fidelity PDF layout engine. Its initial table detector only handles clear repeated rows with aligned text positions; complex tables, multi-column article reading order, rotated text, images, forms, headers/footers, unusual fonts, right-to-left scripts, and mixed page sizes can need correction.
- Large inputs and OCR can use substantial browser CPU and memory.

## Why the server sleeping issue is addressed

The main conversion flow no longer sends the PDF to the sleeping backend, so a server cold-start or outage cannot block normal local conversion. A backend may still be useful later for more advanced reconstruction, but it would need persistent/always-on hosting if immediate availability is required.

## Components and licensing

- PDF.js: https://github.com/mozilla/pdf.js — Apache-2.0 license.
- docx.js: https://github.com/dolanmiu/docx — review the package license and notices for the pinned release.
- Tesseract.js: https://github.com/naptha/tesseract.js — review the package license and notices for the pinned release.
- Tesseract language data is separate from the JavaScript API layer; verify its source/license and include notices as required.
- Existing \`pdf2docx\` package has an MIT license but the repository states it is no longer actively maintained by Artifex: https://github.com/ArtifexSoftware/pdf2docx

This is engineering documentation, not legal advice.

## Test checklist before merging to production

- [ ] First online visit: service worker installs and status confirms core library readiness.
- [ ] Reload online: converter loads from the offline cache without showing setup errors.
- [ ] Disable network in DevTools after a successful warm setup; reload the converter route.
- [ ] Offline text PDF: editable text output produces a non-empty DOCX.
- [ ] Offline visual mode: output page images are legible at normal zoom.
- [ ] English OCR: test once online, then repeat with the network disabled.
- [ ] Simple paragraphs, bold headings, mixed font sizes, two-column pages, table-heavy pages, logos, and mixed scanned/selectable pages.
- [ ] Encrypted/password-protected and damaged PDFs produce a clear error.
- [ ] 60 MB boundary and >150-page boundary produce a graceful rejection.
- [ ] Test Chrome desktop and one representative mobile browser.
- [ ] DevTools Network: verify no request containing the selected PDF goes to the old conversion API or a third party.
- [ ] Inspect outputs in Microsoft Word or LibreOffice and record actual conversion limits before calling it production-ready.

## Next engineering stages

1. Test the first-install/offline loop in a real browser and resolve any service-worker/cache quirks.
2. Test representative PDFs and improve text reading order, indentation, paragraph grouping, table detection, and image reconstruction.
3. Add multilingual OCR only after testing language assets and reading direction.
4. For strict offline or packaged distribution, vendor pinned dependencies on the same origin with license notices rather than fetching CDNs during installation.
5. Only reintroduce a backend for document types that need better reconstruction than the browser engine can provide.
