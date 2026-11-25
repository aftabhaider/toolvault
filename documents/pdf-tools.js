// Browser PDF tools: JPG to PDF, PDF to JPG, Split, Rotate, Compress.
// Files are processed on the visitor's device with pdf-lib (writing PDFs),
// pdf.js (rendering pages) and JSZip (multi-file downloads); nothing is uploaded.
import { parsePageRanges, chunkPages, formatBytes, outputName, imagePlacement } from "./pdf-utils.js";

const PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
const root = document.querySelector("[data-pdftool]");
const TOOL = root?.dataset.pdftool;
const $ = sel => root.querySelector(sel);

const ui = {
  drop: $("[data-drop]"), input: $("input[type=file]"), choose: $("[data-choose]"), list: $("[data-list]"),
  run: $("[data-run]"), clear: $("[data-clear]"), bar: $("[data-bar]"), fill: $("[data-fill]"),
  status: $("[data-status]"), result: $("[data-result]"),
};
const multiple = ui.input.multiple;
let files = [];
let busy = false;

// ------------------------------------------------------------------ UI helpers
function status(text, kind = "") { ui.status.textContent = text; ui.status.dataset.kind = kind; }
function progress(fraction) {
  ui.bar.hidden = fraction === null;
  if (fraction !== null) ui.fill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}
const option = name => root.querySelector(`[name="${name}"]:checked, select[name="${name}"], input[type=text][name="${name}"], input[type=number][name="${name}"]`)?.value;
function refresh() {
  ui.list.innerHTML = "";
  files.forEach((f, i) => {
    const li = document.createElement("li");
    li.className = "tv-file";
    li.innerHTML = `<span class="tv-file-name"></span><span class="tv-file-size">${formatBytes(f.size)}</span>`
      + (multiple ? `<button type="button" data-up aria-label="Move up">↑</button><button type="button" data-down aria-label="Move down">↓</button>` : "")
      + `<button type="button" data-remove aria-label="Remove">✕</button>`;
    li.querySelector(".tv-file-name").textContent = f.name;
    li.querySelector("[data-remove]").onclick = () => { files.splice(i, 1); refresh(); };
    if (multiple) {
      li.querySelector("[data-up]").disabled = i === 0;
      li.querySelector("[data-down]").disabled = i === files.length - 1;
      li.querySelector("[data-up]").onclick = () => { [files[i - 1], files[i]] = [files[i], files[i - 1]]; refresh(); };
      li.querySelector("[data-down]").onclick = () => { [files[i + 1], files[i]] = [files[i], files[i + 1]]; refresh(); };
    }
    ui.list.appendChild(li);
  });
  ui.run.disabled = busy || files.length === 0;
  ui.drop.classList.toggle("tv-has-files", files.length > 0);
}
function accept(list) {
  const wantPdf = TOOL !== "jpg-to-pdf";
  const ok = [...list].filter(f => wantPdf ? /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) : /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
  if (ok.length < list.length) status(wantPdf ? "Only PDF files can be used here." : "Only image files (JPG, PNG, WebP, GIF, BMP) can be used here.", "error");
  else status("");
  files = multiple ? files.concat(ok) : ok.slice(0, 1);
  ui.result.innerHTML = "";
  refresh();
}
ui.choose.addEventListener("click", () => ui.input.click());
ui.drop.addEventListener("click", e => { if (e.target === ui.drop) ui.input.click(); });
ui.drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ui.input.click(); } });
ui.input.addEventListener("change", () => { accept(ui.input.files); ui.input.value = ""; });
["dragenter", "dragover"].forEach(t => ui.drop.addEventListener(t, e => { e.preventDefault(); ui.drop.classList.add("tv-drag"); }));
["dragleave", "drop"].forEach(t => ui.drop.addEventListener(t, e => { e.preventDefault(); ui.drop.classList.remove("tv-drag"); }));
ui.drop.addEventListener("drop", e => accept(e.dataTransfer.files));
ui.clear.addEventListener("click", () => { files = []; ui.result.innerHTML = ""; status(""); progress(null); refresh(); });

const urls = [];
function offer(blob, name, note = "") {
  const url = URL.createObjectURL(blob); urls.push(url);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.className = "tv-download";
  a.innerHTML = `<b>Download ${name.endsWith(".zip") ? "ZIP" : name.split(".").pop().toUpperCase()}</b><span></span>`;
  a.querySelector("span").textContent = `${name} · ${formatBytes(blob.size)}${note ? " · " + note : ""}`;
  ui.result.appendChild(a);
  a.click();
}
async function zipAndOffer(entries, name, note) {
  if (entries.length === 1) return offer(entries[0].blob, entries[0].name, note);
  const zip = new window.JSZip();
  entries.forEach(e => zip.file(e.name, e.blob));
  offer(await zip.generateAsync({ type: "blob" }), name, note || `${entries.length} files`);
}

// ------------------------------------------------------------------ PDF helpers
async function loadPdfLib(file) {
  const bytes = await file.arrayBuffer();
  try { return await window.PDFLib.PDFDocument.load(bytes); }
  catch (e) {
    if (/encrypt/i.test(e.message)) throw new Error("This PDF is password-protected. Remove the password in a PDF reader, then try again.");
    throw new Error("This file could not be read as a PDF. It may be damaged or not a real PDF.");
  }
}
async function loadPdfJs(file) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  try { return await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise; }
  catch (e) {
    if (e?.name === "PasswordException") throw new Error("This PDF is password-protected. Remove the password in a PDF reader, then try again.");
    throw new Error("This file could not be read as a PDF. It may be damaged or not a real PDF.");
  }
}
async function renderPage(pdf, number, dpi, type, quality) {
  const page = await pdf.getPage(number);
  const viewport = page.getViewport({ scale: dpi / 72 });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error(`Page ${number} could not be rendered.`))), type, quality));
  const size = page.getViewport({ scale: 1 });
  page.cleanup(); canvas.width = canvas.height = 0;
  return { blob, widthPt: size.width, heightPt: size.height };
}
const savePdf = async doc => new Blob([await doc.save({ useObjectStreams: true })], { type: "application/pdf" });

// Draws an image file onto a canvas (applying its EXIF orientation, as browsers
// do when displaying it) and returns encoded bytes for embedding in a PDF.
async function imageBytes(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bitmap) throw new Error(`“${file.name}” could not be read as an image.`);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  const png = /png|gif|webp/i.test(file.type) && TOOL === "jpg-to-pdf"; // may have transparency
  if (!png) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  ctx.drawImage(bitmap, 0, 0);
  const type = png ? "image/png" : "image/jpeg";
  const blob = await new Promise(res => canvas.toBlob(res, type, 0.92));
  bitmap.close?.();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), png, width: canvas.width, height: canvas.height };
}

// ------------------------------------------------------------------ tools
const TOOLS = {
  async "jpg-to-pdf"() {
    const { PDFDocument } = window.PDFLib;
    const doc = await PDFDocument.create();
    const size = option("pagesize") || "fit", margin = Number(option("margin") || 0);
    for (let i = 0; i < files.length; i++) {
      status(`Adding image ${i + 1} of ${files.length}…`); progress(i / files.length);
      const img = await imageBytes(files[i]);
      const embedded = img.png ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
      // "fit" pages use the image at 72 DPI-equivalent points, capped so huge photos stay printable.
      let w = img.width, h = img.height;
      if (size === "fit") { const s = Math.min(1, 1440 / Math.max(w, h)); w *= s; h *= s; }
      const p = imagePlacement(w, h, size, size === "fit" ? 0 : margin);
      const page = doc.addPage([p.pageW, p.pageH]);
      page.drawImage(embedded, { x: p.x, y: p.y, width: p.drawW, height: p.drawH });
    }
    progress(1);
    offer(await savePdf(doc), outputName(files[0].name, files.length > 1 ? "images" : "", "pdf"), `${files.length} page${files.length === 1 ? "" : "s"}`);
    return `Done. Your PDF has ${files.length} page${files.length === 1 ? "" : "s"}.`;
  },

  async "pdf-to-jpg"() {
    const pdf = await loadPdfJs(files[0]);
    const dpi = Number(option("dpi") || 150), format = option("format") || "jpg";
    const type = format === "png" ? "image/png" : "image/jpeg";
    let pages;
    const which = option("pages-mode") === "some" ? parsePageRanges(option("pages"), pdf.numPages) : [...Array(pdf.numPages).keys()];
    pages = which;
    const out = [], digits = String(pdf.numPages).length;
    for (let i = 0; i < pages.length; i++) {
      status(`Rendering page ${pages[i] + 1} (${i + 1} of ${pages.length})…`); progress(i / pages.length);
      const r = await renderPage(pdf, pages[i] + 1, dpi, type, 0.92);
      out.push({ blob: r.blob, name: outputName(files[0].name, `page-${String(pages[i] + 1).padStart(digits, "0")}`, format) });
    }
    progress(1); status("Packing files…");
    await zipAndOffer(out, outputName(files[0].name, "images", "zip"), `${out.length} ${format.toUpperCase()} images at ${dpi} DPI`);
    return `Done. ${out.length} page${out.length === 1 ? "" : "s"} saved as ${format.toUpperCase()}.`;
  },

  async "split-pdf"() {
    const { PDFDocument } = window.PDFLib;
    const src = await loadPdfLib(files[0]);
    const count = src.getPageCount(), mode = option("split-mode") || "ranges";
    const groups = mode === "ranges" ? [parsePageRanges(option("pages"), count)]
      : mode === "each" ? chunkPages(count, 1) : chunkPages(count, Number(option("chunk")));
    const out = [];
    for (let g = 0; g < groups.length; g++) {
      status(`Creating file ${g + 1} of ${groups.length}…`); progress(g / groups.length);
      const doc = await PDFDocument.create();
      (await doc.copyPages(src, groups[g])).forEach(p => doc.addPage(p));
      const first = groups[g][0] + 1, last = groups[g][groups[g].length - 1] + 1;
      const label = mode === "ranges" ? "selected-pages" : first === last ? `page-${first}` : `pages-${first}-${last}`;
      out.push({ blob: await savePdf(doc), name: outputName(files[0].name, label, "pdf") });
    }
    progress(1);
    await zipAndOffer(out, outputName(files[0].name, "split", "zip"));
    return mode === "ranges" ? `Done. Your new PDF has ${groups[0].length} page${groups[0].length === 1 ? "" : "s"}.` : `Done. Split into ${out.length} PDF files.`;
  },

  async "rotate-pdf"() {
    const { degrees } = window.PDFLib;
    const doc = await loadPdfLib(files[0]);
    const angle = Number(option("angle") || 90), count = doc.getPageCount();
    const targets = option("rotate-pages") === "some" ? parsePageRanges(option("pages"), count) : [...Array(count).keys()];
    targets.forEach(i => { const page = doc.getPage(i); page.setRotation(degrees((page.getRotation().angle + angle) % 360)); });
    progress(1);
    offer(await savePdf(doc), outputName(files[0].name, "rotated", "pdf"));
    return `Done. Rotated ${targets.length} of ${count} page${count === 1 ? "" : "s"} by ${angle}°.`;
  },

  async "compress-pdf"() {
    const level = option("level") || "strong";
    const original = files[0].size;
    let blob;
    if (level === "basic") {
      status("Optimising the PDF structure…"); progress(0.3);
      const doc = await loadPdfLib(files[0]);
      blob = await savePdf(doc);
    } else {
      const { PDFDocument } = window.PDFLib;
      const pdf = await loadPdfJs(files[0]);
      const dpi = level === "extreme" ? 96 : 144, quality = level === "extreme" ? 0.55 : 0.72;
      const doc = await PDFDocument.create();
      for (let n = 1; n <= pdf.numPages; n++) {
        status(`Compressing page ${n} of ${pdf.numPages}…`); progress((n - 1) / pdf.numPages);
        const r = await renderPage(pdf, n, dpi, "image/jpeg", quality);
        const img = await doc.embedJpg(new Uint8Array(await r.blob.arrayBuffer()));
        doc.addPage([r.widthPt, r.heightPt]).drawImage(img, { x: 0, y: 0, width: r.widthPt, height: r.heightPt });
      }
      blob = await savePdf(doc);
    }
    progress(1);
    if (blob.size >= original) {
      return `This PDF is already well compressed: the result (${formatBytes(blob.size)}) would not be smaller than the original (${formatBytes(original)}), so nothing was downloaded. ${level === "basic" ? "Try Strong for scanned or image-heavy PDFs." : "Your original file is already the smaller one; keep it."}`;
    }
    const saved = Math.round((1 - blob.size / original) * 100);
    offer(blob, outputName(files[0].name, "compressed", "pdf"), `${saved}% smaller`);
    return `Done. ${formatBytes(original)} → ${formatBytes(blob.size)} (${saved}% smaller).`;
  },
};

// Show/hide the page-range field when a mode needs it.
root.querySelectorAll("[data-toggle]").forEach(ctrl => {
  const sync = () => root.querySelectorAll(`[data-when="${ctrl.name}"]`).forEach(el => {
    const on = root.querySelector(`[name="${ctrl.name}"]:checked`)?.value === el.dataset.value;
    el.hidden = !on;
  });
  root.querySelectorAll(`[name="${ctrl.name}"]`).forEach(r => r.addEventListener("change", sync));
  sync();
});

ui.run.addEventListener("click", async () => {
  if (busy || !files.length) return;
  busy = true; refresh(); ui.result.innerHTML = ""; urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  status("Working…"); progress(0);
  try {
    if (!window.PDFLib && TOOL !== "pdf-to-jpg") throw new Error("The PDF library did not load. Check your connection and reload the page.");
    const message = await TOOLS[TOOL]();
    status(message, "success");
  } catch (e) {
    status(e.message || "Something went wrong while processing this file.", "error");
  } finally {
    busy = false; progress(null); refresh();
  }
});
refresh();
