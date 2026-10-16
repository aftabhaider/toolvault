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


## Editable reconstruction improvements (2.2.0)

The local engine now reads long horizontal and vertical rules from a page render and uses those boundary positions to recover table column counts and widths when a clear ruled grid is detected. Numeric table values are right-aligned, short numeric code cells are centered, table headings/summary rows receive stronger emphasis, and the common FBR return title and field labels are styled explicitly if the embedded PDF font names do not expose bold metadata. When PDF.js makes the original embedded header/footer image objects available, the header is reused at its source pixel resolution and the original footer banner is composited into the footer strip; otherwise the high-resolution rendered bands remain a fallback. A barcode-like graphic beneath a Contact No field can be recovered as a floating image so it does not alter text flow. These are heuristics and still need document-by-document validation, especially for borderless tables and unusually complex forms.


## Editable reconstruction improvements (2.3.0)

The 2.3.0 local test branch positions page header/footer artwork relative to the page, prefers extracted source images at their original pixel resolution when PDF.js exposes them, and separates the print-date strip above the footer banner to avoid resampling that source banner. It adds multi-word metadata-label styling, explicit centered/underlined return-title handling, stronger table borders and heading/summary styling, numeric-cell alignment, and raster table-boundary detection to recover ruled column counts and widths. A detected barcode-like image can be embedded as a floating image rather than inserted into text flow. These are heuristics and still require browser/Word regression testing; output quality is not yet certified for all PDF types.


## Editable reconstruction improvements (2.4.0)

This iteration maps PDF.js text-style metadata into Word font families (Arial is used only when the source family is generic or unavailable), keeps bold/italic traits when the PDF exposes them, and recognizes the standalone "Bill" page title as bold text. It disables weak inferred-table guesses near the top of a page unless a ruled grid is detected, preventing invoice metadata from becoming an artificial table. Individual embedded page images can now be extracted from PDF.js image objects and positioned as floating Word images; this avoids cropping an entire top band for documents whose logos and title are separate elements. Image extraction and line detection remain best-effort and require end-to-end validation on the real PDF.


## Runtime fix (2.4.1)

Moved return-form and bill-title flags to the paragraph-builder scope so both title styling and alignment can access them without a ReferenceError. Bumped the service-worker cache and the local-test port for regression testing. JavaScript syntax passes; the Word output still needs an end-to-end test.


## Editable reconstruction improvements (2.5.1)

For PDFs with ruled tables, the engine now groups horizontal rules into table bands, uses detected vertical rules as column boundaries, and derives row spans from which vertical borders actually cross each horizontal band. This preserves multi-line text inside its original physical cell and reconstructs merged total rows when inner borders stop. The engine computes table geometry once per page. It also infers centered text from actual item coordinates, applies a plain Word font-family string for compatibility, and explicitly styles common bill titles, installation headings, supply-order headings, and recipient labels. This has passed syntax checks and synthetic row/merged-cell tests; the user's real PDF still needs end-to-end testing in Word.


## Runtime fix (2.5.2)

Moved the PDF line's x-coordinate and font-size calculations before the loop that creates text runs. Tab-stop offsets therefore no longer access leftX before initialization. The offline cache and test port were refreshed for this retest.
