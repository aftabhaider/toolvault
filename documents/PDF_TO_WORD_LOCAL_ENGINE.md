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


## Working checkpoint — 2026-10-16 (end of session)

- **Working branch:** \`feature/local-pdf-to-word-engine\`
- **Draft PR:** https://github.com/aftabhaider/toolvault/pull/9
- **Latest local engine version:** \`2.5.2-local\`
- **Service-worker cache:** \`toolvault-pdf-word-v17\`
- **Local test launcher:** \`START-LOCAL-PDF-WORD-TEST.bat\`
- **Current local test URL:** \`http://127.0.0.1:8011/documents/pdf-to-word.html\`
- **Production:** changes are not merged; the live ToolVault site remains unchanged.

### Work completed by this checkpoint

- Keeps the local browser-based conversion flow and removes the old remote conversion API dependency from the page.
- Maps PDF.js font metadata into Word text runs, with a font fallback.
- Adds special emphasis for the bill title, installation heading, supply-order heading, and recipient heading.
- Detects ruled table boundaries and derives row cell spans from the vertical borders crossing each row, including attempts to preserve merged totals.
- Attempts to preserve separate embedded images, header/footer artwork, barcode, and the invoice vertical divider.
- Fixes the previous \`returnFormTitle is not defined\` runtime error and the latest \`leftX before initialization\` runtime error.
- JavaScript syntax checks passed for the engine, service worker, and page scripts. A mocked text-paragraph function test passed; a synthetic six-column/merged-total table test passed.

### Not yet confirmed

The latest version has **not** been validated end-to-end against \`BILL JHANG LOT-2.pdf\` in Microsoft Word after the most recent fixes. Font fidelity, real invoice metadata spacing, logos/barcode, and the complete table layout remain to be reviewed from the generated document.

### Next session

1. Download the latest branch ZIP and extract to a new folder.
2. Run \`START-LOCAL-PDF-WORD-TEST.bat\`, keep the server window open, and open \`http://127.0.0.1:8011/documents/pdf-to-word.html\`.
3. Convert \`BILL JHANG LOT-2.pdf\` in **Editable Word** mode.
4. Compare the first and second pages against the original. Fix any remaining layout errors before merging PR #9 or changing production.


## Exact appearance mode (2.6.0-local)

Exact appearance is the default mode when matching the source PDF's visible design is the priority. It renders each complete PDF page as one PNG and inserts that image at the original page dimensions into a zero-margin Word page. Raster resolution is adaptively capped at 4x scale (about 12 megapixels per page) to preserve small text, table rules, brand colors, logos, and page headers/footers while limiting browser memory usage. This mode preserves appearance rather than editable text; users should choose Editable Word only when they need to edit reconstructed content and can accept layout differences. Pixel-level differences may still arise from browser PDF rendering and Microsoft Word's image/page display, so real-output verification remains required.


## Hybrid editable mode (2.7.1-local)

The converter now offers a third mode, \`hybrid\`, as the default. It renders each complete page at an adaptive high-resolution scale, masks each selectable text run using a locally sampled background color, estimates its foreground color from the rendered glyph pixels, and places Word text runs back over the image using the extracted source coordinates. Page fills, ruling, logos and non-text artwork stay in the rendered image, while extracted text is editable. An optional English OCR path can similarly mask OCR line boxes when a page has no selectable text. The hybrid result is a visual/editability compromise: text may need alignment adjustments after edits, and tables, dividers, logos, colors/backgrounds are not independent native Word objects. Exact appearance mode remains available for image-only pages; reflowed editable mode remains available for native editable paragraphs/tables.

Validation completed: JavaScript syntax checks for the engine and HTML page passed, and a synthetic canvas/paragraph smoke test verified a sample text region is masked to its sampled background, a color value is captured for editable text, the background image run is anchored behind the text, and separated same-line fields are not centered together. **No full end-to-end Microsoft Word test has been performed against the user's real source PDF yet.**


## Hybrid mode refinement (2.7.2-local)

When OCR is used to replace a very sparse selectable-text layer, the background masker now masks both the original selectable fragments and OCR-recognized line boxes. This prevents the original PDF text from remaining visibly underneath the reconstructed OCR text. The engine version, service-worker cache, and local-test port were refreshed after this change.


## Resume checkpoint — 2026-10-19

- **Branch:** \`feature/local-pdf-to-word-engine\`
- **Draft PR:** https://github.com/aftabhaider/toolvault/pull/9
- **Engine:** \`2.7.2-local\`
- **Service-worker cache:** \`toolvault-pdf-word-v20\`
- **Current local test URL:** \`http://127.0.0.1:8014/documents/pdf-to-word.html\`
- **Default mode:** \`hybrid\` — “Keep original layout + editable text”
- **Exact visual mode:** remains available as \`visual\`
- **Reflowed/native editable mode:** remains available as \`editable\`
- **Production:** no changes merged to \`main\`; the live website is unchanged.

### Hybrid mode design

For each page, render a high-resolution background, mask selectable text regions using sampled local background colors, estimate the original text foreground color, and draw corresponding editable Word text over the page at extracted coordinates. OCR may supply editable overlays for scanned pages when enabled. The background retains lines, fills, logos and table borders. Those artwork objects are not native Word table cells; changing overlay text can disturb alignment. This is intended as the best practical compromise between fidelity and editable text, not a guarantee of pixel-identical or fully native Word reconstruction.

### Checks completed

- Engine, service-worker, and inline page-script JavaScript syntax checks pass.
- Synthetic text-mask check showed a test glyph region being removed and restored to its background color.
- Synthetic Word paragraph check showed the background image anchored behind overlay text, source text-color property carried through, and separate same-baseline fields not incorrectly centered as one block.
- Service-worker version and local launcher port refreshed after the latest code edits.

### Next action

Download the current branch ZIP, extract it to a new folder, run \`START-LOCAL-PDF-WORD-TEST.bat\` with its console left open, and open \`http://127.0.0.1:8014/documents/pdf-to-word.html\`. Convert \`BILL JHANG LOT-2.pdf\) in hybrid mode and inspect the first two pages in Microsoft Word. No end-to-end test with the actual bill has been completed yet. If text overlays, image anchors or paragraph flow do not render properly in Word, fix that before merging PR #9 or changing production.


## Hybrid editable mode (2.7.3-local)

The default \`hybrid\` mode renders each page as a high-resolution background, masks detected selectable text glyphs using a sampled local background color, and places text runs back over the masked areas as editable Word text. It samples foreground text colors from the page raster and restores detected dark horizontal/vertical border pixels after masking, helping preserve table rules and dividers. Existing embedded graphics remain in the background. Optional English OCR supplies editable text on pages without a usable text layer when OCR is enabled.

The hybrid compromise preserves page artwork, logo placement, page colors and table geometry better than reflowed reconstruction while making detected text selectable/editable. It is not a native Word reconstruction: table borders, fills and logos are part of the page background, text family/metrics may differ, and edit operations can cause overlap. Exact-appearance mode is still available for documents where editability is not needed; reflowed mode is available for users prioritizing native Word tables/paragraphs.

The latest change was syntax-checked. A full real-PDF conversion and Microsoft Word visual review are still required before production use.


## Hybrid editable mode update (2.7.4-local)

The recommended mode is now the hybrid workflow: render the original PDF page as a high-resolution background, mask text glyph boxes using locally sampled background colors, and overlay editable text runs at measured PDF coordinates. Table fill colors, borders, logos and decorative rules remain in the image layer, while the text overlay is editable. Editable text paragraphs now use exact line-box height based on the measured PDF line height rather than Word's default line spacing, reducing cumulative vertical drift. This is a best-effort workflow; text may still need manual correction because source fonts and Word's text metrics can differ, and background masks may leave minor artifacts.


## Hybrid alignment refinement (2.7.5-local)

- Tab stops in hybrid editable text use original page X positions (absolute positions relative to the paragraph/page text area), reducing horizontal shift for separated fields on the same baseline.
- Glyph-removal masks include a slightly larger margin to cover PDF.js width/antialiasing discrepancies. The hybrid renderer restores detected dark horizontal and vertical rules after masking, so ruled table borders should remain intact.
- JavaScript syntax validation passes. This was not end-to-end tested against the real invoice in Microsoft Word; the next required check is a new hybrid conversion of the same PDF, focused on table headings, numbers and wrapped specification lines.


## Hybrid overlay refinement (2.7.6-local)

The overlay now uses absolute PDF X coordinates for Word tab stops in lines containing multiple horizontal fields. Text-clearing rectangles were expanded to cover more of the PDF.js glyph bounds and antialiasing; detected dark table rules are restored after masking. This should reduce residual double-printing and horizontal shifts but requires validation against real PDFs. Engine, service-worker and page syntax checks are required before use; no production changes have been made.


## Resume checkpoint — 2026-10-22 (hybrid overlap refinement)

- **Branch:** \`feature/local-pdf-to-word-engine\`
- **Draft PR:** https://github.com/aftabhaider/toolvault/pull/9
- **Current engine:** \`2.7.6-local\`
- **Service-worker cache:** \`toolvault-pdf-word-v24\`
- **Current launcher:** \`START-LOCAL-PDF-WORD-TEST.bat\`
- **Local URL:** \`http://127.0.0.1:8018/documents/pdf-to-word.html\`
- **Default conversion mode:** \`hybrid\` — original high-resolution page artwork with selectable/editable text overlays.
- **Production status:** no changes merged to \`main\`; live ToolVault is unchanged.

### What changed since the 2.7.4 output

The hybrid editable mode now uses absolute original PDF X positions for Word tab stops on lines containing separate fields. The text-removal mask margin has been expanded to reduce residual duplicate glyphs, and the detected dark table rules are restored after masking. Service-worker cache/launcher were advanced so testing can load this exact version.

### Checks in the latest revision

- Engine JavaScript syntax: PASS.
- Service-worker JavaScript syntax: PASS.
- Inline page JavaScript syntax: PASS.
- Synthetic Word-paragraph smoke test: PASS; confirmed a tab stop is emitted at the absolute PDF X coordinate and the background image is attached behind editable text.
- Old remote conversion API remains unused by the page.

### Still needed

The screenshot-driven improvements have **not** yet been verified with a new full conversion of the user's RO plant invoice or bill in Microsoft Word. Current approach is a visual/editability compromise: artwork and borders are part of a page background, while text overlays are editable. Mask residuals, text-font width differences, and line alignment may still need tuning. Next test should use a fresh ZIP extracted into a new folder, run the launcher with the console left open, open the local URL above, convert the same PDF in default hybrid mode, and compare the text overlays and table headings. Do not merge to production until an actual Word output review is satisfactory.


## Resume checkpoint — hybrid editable mode 2.7.7 (2026-10-22)

- Working branch: \`feature/local-pdf-to-word-engine\`
- Draft PR: https://github.com/aftabhaider/toolvault/pull/9
- Current local engine: \`2.7.7-local\`
- Cache version: \`toolvault-pdf-word-v25\`
- Test launcher: \`START-LOCAL-PDF-WORD-TEST.bat\`
- Test URL: \`http://127.0.0.1:8019/documents/pdf-to-word.html\`
- Live ToolVault production remains unchanged and the PR is not merged.

### Current recommended mode: Hybrid editable

Hybrid mode renders a high-resolution background of each PDF page, masks detected text glyphs using locally sampled nearby background color, and overlays editable Word text with source-derived font/color metadata and line coordinates. This aims to keep visible page colors, logos, borders, and table fills close to the source while keeping the text selectable/editable. It is not a native Word table reconstruction: graphics and table rules remain part of the page image, and the editable text overlay can still misalign or leave mask artifacts.

### Latest change

The paragraph tab stop is now relative to the paragraph's text start (\`part.x - leftX\`) to reduce double indentation on same-line fields. Hybrid-mode completion status describes the background-artwork/editable-text trade-off. Engine JavaScript syntax passes.

### Required next validation

Download a fresh ZIP, extract to a new folder, run the launcher with its console open, and test the original invoice in hybrid mode. Inspect at least the first two pages: labels, long specifications, numbers, table heading text, masks around letters, and any remaining overlap. This update has not been verified end-to-end against the real PDF in Microsoft Word; don't merge PR #9 or change production until that review is satisfactory.


## Resume checkpoint — hybrid masking investigation (2026-10-22)

- Branch: `feature/local-pdf-to-word-engine`
- Base commit reviewed: `96c53d2b71cfd1a386a1b1c3f668392bd36556d9` (PR #9 remains draft/open).
- Prior engine version: `2.7.7-local`; cache `toolvault-pdf-word-v25`; local URL `http://127.0.0.1:8019/documents/pdf-to-word.html`.
- The screenshot indicates text overlay misalignment and duplicate/poorly masked glyphs. The main causes to inspect are per-fragment flat-color rectangle masking, DOCX paragraph-based page positioning, and OCR boxes needing consistent page coordinate mapping.
- New synthetic test page: `documents/pdf-to-word-hybrid-tests.html`. It checks coordinate scaling, mask box clamping/merging, color sampling, rule restoration, multiple page sizes, and OCR box coordinate conversion. These tests cannot certify output appearance in Word.
- Actual invoice/FBR PDF conversion and Microsoft Word visual comparison are still mandatory. Do not merge or deploy until reviewed.


## Hybrid mask/OCR refinement — 2.8.2-local (2026-10-22)

- Replaced the broad 2.4-point-per-edge text masks with tighter font-size-relative margins, reducing the chance of painting over cell backgrounds and adjacent fields.
- Mask rectangles that genuinely intersect are combined; separated columns are kept separate. Local raster samples are used for each mask and detected dark table rules are restored from the untouched page image after masking.
- OCR processing now releases its temporary canvas in a `finally` block and stores OCR boxes in page-local point coordinates derived from the actual PDF.js render viewport.
- Added `documents/pdf-to-word-hybrid-tests.html` with synthetic tests for coordinates, mask clamp/union, colored backgrounds, rule restoration, multiple page sizes, and OCR scaling.
- Engine syntax, synthetic tests, and real output still need checks in a browser/Microsoft Word. This update is not certified for production and does not replace comparison against the Jhang bill and FBR return PDFs.


## Hybrid mask regression checkpoint — 2.8.5-local (2026-10-22)

- The masking pass now uses bounded font-relative text boxes, merges intersecting masks only, and handles OCR line boxes in hybrid mode. It restores detected dark table rules from the pre-mask raster.
- The helper geometry functions are exposed only for the local synthetic test page at `documents/pdf-to-word-hybrid-tests.html`; they are not a remote API and do not receive the selected PDF.
- The overlay paragraph builder avoids applying inferred native Word left/right indents to the hybrid page overlay; the background is anchored at page origin. Real Word output still needs visual review.
- Engine: `2.8.5-local`; service worker cache: `toolvault-pdf-word-v28`; launcher URL remains `http://127.0.0.1:8019/documents/pdf-to-word.html`.


## Hybrid mode positioning fix (2.8.7-local)

Fixed a malformed duplicate OCR loader that made the full engine fail syntax validation. Hybrid mode is now passed explicitly to every page-text paragraph, not inferred from whether that individual paragraph contains the background image. Each selectable PDF text line begins at its page-local X coordinate using a Word tab stop, later separated fields use page-local tab stops, and large vertical gaps are not clipped by the smaller reflow-mode spacing limit. Mask padding was slightly increased to cover more source glyph edges while keeping detected table rules restored. This should reduce duplicate/overlapping text in hybrid output. It has passed whole-engine syntax validation and needs another real DOCX check in Microsoft Word.


## Automatic scanned-page OCR fallback — 2.9.0-local (2026-10-23)

- Fixed the workflow behind the reported `BOQ_Layout_AutoCAD.pdf` failure: Hybrid Editable Mode previously initialized OCR only when the optional checkbox was checked, then stopped when a page had no selectable text.
- Hybrid mode now checks each page independently and lazily loads browser-based Tesseract OCR only when a page has fewer than eight non-whitespace text characters. This supports mixed PDFs with both scanned and selectable-text pages without OCR-processing every page.
- OCR stays in the browser; no remote document-conversion API is used. The first scanned page may require internet access to load the OCR library/language data unless those assets are already cached.
- Updated UI copy to explain automatic Hybrid OCR fallback and clarified that the checkbox enables OCR for Reflowed editable Word. Service-worker cache bumped to `toolvault-pdf-word-v30`.
- Validation still required: syntax/CI checks, OCR-library load test, mixed-page PDF test, the user's BOQ PDF, and visual comparison of the generated DOCX in Microsoft Word. No claim of production readiness until those checks pass.


## Dense table glyph masking adjustment — 2.9.1-local (2026-10-23)

- Updated hybrid mask clearance around source glyphs to reduce duplicate/ghost text in dense BOQ table headings and cells. Padding remains bounded and local background sampling is retained; detected table rules are restored from the original raster after masking.
- Engine version: `2.9.1-local`; service-worker cache: `toolvault-pdf-word-v31`.
- This is a targeted mitigation, not a verified full table reconstruction. Native editable table cells are not generated by Hybrid mode; table rules/fills remain background artwork and extracted text is overlaid. Must test against the user's invoice/BOQ in Word to verify no patches, missing borders, or misaligned overlay remain.
