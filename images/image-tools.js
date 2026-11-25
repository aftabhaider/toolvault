// Browser image tools: HEIC to JPG, Compress, Resize, Convert.
// Images are decoded and re-encoded with the browser's canvas on the
// visitor's device; HEIC is decoded with heic2any. Nothing is uploaded.
// Re-encoding also drops embedded metadata such as GPS location.
import { FORMATS, formatForFile, resizeDimensions, limitLongestSide, percentSaved } from "./image-utils.js";
import { formatBytes, outputName } from "../documents/pdf-utils.js";

const root = document.querySelector("[data-imgtool]");
const TOOL = root?.dataset.imgtool;
const $ = sel => root.querySelector(sel);
const ui = {
  drop: $("[data-drop]"), input: $("input[type=file]"), choose: $("[data-choose]"), list: $("[data-list]"),
  run: $("[data-run]"), clear: $("[data-clear]"), bar: $("[data-bar]"), fill: $("[data-fill]"),
  status: $("[data-status]"), result: $("[data-result]"),
};
let files = [], busy = false;
const urls = [];

const status = (text, kind = "") => { ui.status.textContent = text; ui.status.dataset.kind = kind; };
const progress = f => { ui.bar.hidden = f === null; if (f !== null) ui.fill.style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`; };
const option = name => root.querySelector(`[name="${name}"]:checked, select[name="${name}"], input[type=number][name="${name}"], input[type=text][name="${name}"]`)?.value;
const isHeic = f => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

function refresh() {
  ui.list.innerHTML = "";
  files.forEach((f, i) => {
    const li = document.createElement("li");
    li.className = "tv-file";
    li.innerHTML = `<span class="tv-file-name"></span><span class="tv-file-size">${formatBytes(f.size)}</span><button type="button" aria-label="Remove">✕</button>`;
    li.querySelector(".tv-file-name").textContent = f.name;
    li.querySelector("button").onclick = () => { files.splice(i, 1); refresh(); };
    ui.list.appendChild(li);
  });
  ui.run.disabled = busy || !files.length;
  ui.drop.classList.toggle("tv-has-files", files.length > 0);
}
function accept(list) {
  const ok = [...list].filter(f => TOOL === "heic-to-jpg" ? isHeic(f) : /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(f.name));
  status(ok.length < list.length ? (TOOL === "heic-to-jpg" ? "Only HEIC or HEIF photos can be used here." : "Only image files can be used here.") : "", ok.length < list.length ? "error" : "");
  files = files.concat(ok); ui.result.innerHTML = ""; refresh();
}
ui.choose.addEventListener("click", () => ui.input.click());
ui.drop.addEventListener("click", e => { if (e.target === ui.drop) ui.input.click(); });
ui.drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ui.input.click(); } });
ui.input.addEventListener("change", () => { accept(ui.input.files); ui.input.value = ""; });
["dragenter", "dragover"].forEach(t => ui.drop.addEventListener(t, e => { e.preventDefault(); ui.drop.classList.add("tv-drag"); }));
["dragleave", "drop"].forEach(t => ui.drop.addEventListener(t, e => { e.preventDefault(); ui.drop.classList.remove("tv-drag"); }));
ui.drop.addEventListener("drop", e => accept(e.dataTransfer.files));
ui.clear.addEventListener("click", () => { files = []; ui.result.innerHTML = ""; status(""); progress(null); refresh(); });

root.querySelectorAll("[data-toggle]").forEach(ctrl => {
  const sync = () => root.querySelectorAll(`[data-when="${ctrl.name}"]`).forEach(el => {
    const v = root.querySelector(`[name="${ctrl.name}"]:checked`)?.value;
    el.hidden = !el.dataset.value.split(" ").includes(v);
  });
  root.querySelectorAll(`[name="${ctrl.name}"]`).forEach(r => r.addEventListener("change", sync));
  sync();
});

function offer(blob, name, note = "") {
  const url = URL.createObjectURL(blob); urls.push(url);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.className = "tv-download";
  a.innerHTML = `<b>Download ${name.endsWith(".zip") ? "ZIP" : name.split(".").pop().toUpperCase()}</b><span></span>`;
  a.querySelector("span").textContent = `${name} · ${formatBytes(blob.size)}${note ? " · " + note : ""}`;
  ui.result.appendChild(a);
  a.click();
}
async function deliver(entries, zipName) {
  if (!entries.length) return;
  if (entries.length === 1) return offer(entries[0].blob, entries[0].name, entries[0].note);
  const zip = new window.JSZip();
  const used = new Set();
  for (const e of entries) {
    let n = e.name, k = 2;
    while (used.has(n)) n = e.name.replace(/(\.[^.]+)$/, `-${k++}$1`);
    used.add(n); zip.file(n, e.blob);
  }
  offer(await zip.generateAsync({ type: "blob" }), zipName, `${entries.length} images`);
}
function report(lines) {
  if (!lines.length) return;
  const ul = document.createElement("ul");
  ul.className = "tv-report";
  lines.forEach(t => { const li = document.createElement("li"); li.textContent = t; ul.appendChild(li); });
  ui.result.prepend(ul);
}

// Decode with the photo's EXIF orientation applied (as galleries show it).
async function decode(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!bmp) throw new Error(`“${file.name}” could not be opened. ${isHeic(file) ? "Use HEIC to JPG for iPhone photos." : "The file may be damaged or in an unsupported format."}`);
  return bmp;
}
// Draws a bitmap at w×h and encodes it. JPG gets a white background.
async function encode(bmp, w, h, format, quality) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!FORMATS[format].alpha) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise(res => canvas.toBlob(res, FORMATS[format].mime, FORMATS[format].lossy ? quality : undefined));
  canvas.width = canvas.height = 0;
  if (!blob) throw new Error("Your browser could not save this image.");
  // Some browsers cannot write WebP and silently return PNG.
  const actual = blob.type === FORMATS[format].mime ? format : formatForFile(blob.type);
  return { blob, format: actual, fallback: actual !== format };
}

const TOOLS = {
  async "heic-to-jpg"() {
    if (!window.heic2any) throw new Error("The HEIC decoder did not load. Check your connection and reload the page.");
    const format = option("format") || "jpg", quality = Number(option("quality") || 0.92);
    const out = [];
    for (let i = 0; i < files.length; i++) {
      status(`Converting ${files[i].name} (${i + 1} of ${files.length})…`); progress(i / files.length);
      let result;
      try { result = await window.heic2any({ blob: files[i], toType: FORMATS[format].mime, quality }); }
      catch { throw new Error(`“${files[i].name}” could not be decoded. It may not be a HEIC photo or may be damaged.`); }
      const blobs = Array.isArray(result) ? result : [result];
      blobs.forEach((b, k) => out.push({ blob: b, name: outputName(files[i].name, blobs.length > 1 ? String(k + 1) : "", format) }));
    }
    progress(1);
    await deliver(out, "heic-converted.zip");
    return `Done. ${out.length} photo${out.length === 1 ? "" : "s"} converted to ${FORMATS[format].label}.`;
  },

  async "compress-image"() {
    const quality = Number(option("quality") || 0.72), max = Number(option("max") || 0), target = option("format") || "same";
    const out = [], lines = [];
    let before = 0, after = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status(`Compressing ${f.name} (${i + 1} of ${files.length})…`); progress(i / files.length);
      const bmp = await decode(f);
      const { width, height } = limitLongestSide(bmp.width, bmp.height, max);
      const format = target === "same" ? formatForFile(f.type, f.name) : target;
      const r = await encode(bmp, width, height, format, quality); bmp.close?.();
      if (r.blob.size >= f.size) { lines.push(`${f.name}: already well compressed (${formatBytes(f.size)}); kept the original.`); continue; }
      before += f.size; after += r.blob.size;
      lines.push(`${f.name}: ${formatBytes(f.size)} → ${formatBytes(r.blob.size)} (${percentSaved(f.size, r.blob.size)}% smaller${width !== bmp.width ? `, ${width}×${height}` : ""})`);
      out.push({ blob: r.blob, name: outputName(f.name, "compressed", r.format) });
    }
    progress(1); report(lines);
    await deliver(out, "compressed-images.zip");
    if (!out.length) return "None of the images got smaller at this setting. Try a lower quality, a maximum size, or WebP.";
    return `Done. ${formatBytes(before)} → ${formatBytes(after)} (${percentSaved(before, after)}% smaller).`;
  },

  async "resize-image"() {
    const mode = option("mode") || "percent", a = option("a"), b = option("b");
    const out = [], lines = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status(`Resizing ${f.name} (${i + 1} of ${files.length})…`); progress(i / files.length);
      const bmp = await decode(f);
      const value = mode === "percent" ? option("percent") : mode === "height" ? b : a;
      const { width, height } = resizeDimensions(bmp.width, bmp.height, mode, value, b);
      const r = await encode(bmp, width, height, formatForFile(f.type, f.name), 0.92);
      lines.push(`${f.name}: ${bmp.width}×${bmp.height} → ${width}×${height} px`); bmp.close?.();
      out.push({ blob: r.blob, name: outputName(f.name, `${width}x${height}`, r.format) });
    }
    progress(1); report(lines);
    await deliver(out, "resized-images.zip");
    return `Done. Resized ${out.length} image${out.length === 1 ? "" : "s"}.`;
  },

  async "convert-image"() {
    const format = option("format") || "jpg", quality = 0.92;
    const out = [];
    let fellBack = false;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      status(`Converting ${f.name} (${i + 1} of ${files.length})…`); progress(i / files.length);
      const bmp = await decode(f);
      const r = await encode(bmp, bmp.width, bmp.height, format, quality); bmp.close?.();
      fellBack ||= r.fallback;
      out.push({ blob: r.blob, name: outputName(f.name, "", r.format) });
    }
    progress(1);
    await deliver(out, `converted-${format}.zip`);
    if (fellBack) return `Your browser cannot save ${FORMATS[format].label} images, so they were saved as PNG instead. Try Chrome, Edge or Firefox for ${FORMATS[format].label}.`;
    return `Done. ${out.length} image${out.length === 1 ? "" : "s"} converted to ${FORMATS[format].label}.`;
  },
};

ui.run.addEventListener("click", async () => {
  if (busy || !files.length) return;
  busy = true; refresh(); ui.result.innerHTML = ""; urls.splice(0).forEach(u => URL.revokeObjectURL(u));
  status("Working…"); progress(0);
  try {
    const message = await TOOLS[TOOL]();
    status(message, "success");
  } catch (e) {
    status(e.message || "Something went wrong while processing this image.", "error");
  } finally {
    busy = false; progress(null); refresh();
  }
});
refresh();
