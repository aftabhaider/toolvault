// Pure helpers shared by the browser PDF tools. No DOM access, so they are unit-tested.

// Parses a page selection such as "1-3, 5, 8-" for a document with `pageCount`
// pages. Returns zero-based page indices in the order given (duplicates kept
// out). Throws an Error with a user-facing message on invalid input.
export function parsePageRanges(text, pageCount) {
  const input = String(text ?? "").trim();
  if (!input) throw new Error("Enter the pages you want, for example 1-3, 5.");
  const out = [], seen = new Set();
  for (const raw of input.split(/[,;]+/)) {
    const part = raw.trim().replace(/[–—]/g, "-");
    if (!part) continue;
    const m = part.match(/^(\d*)\s*-\s*(\d*)$|^(\d+)$/);
    if (!m) throw new Error(`“${part}” is not a page number or range.`);
    let start, end;
    if (m[3] !== undefined) start = end = Number(m[3]);
    else {
      start = m[1] ? Number(m[1]) : 1;
      end = m[2] ? Number(m[2]) : pageCount;
    }
    if (start < 1 || end < 1) throw new Error("Page numbers start at 1.");
    if (start > pageCount || end > pageCount) throw new Error(`This PDF has ${pageCount} page${pageCount === 1 ? "" : "s"}; “${part}” is outside it.`);
    const step = start <= end ? 1 : -1;
    for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
      if (!seen.has(p)) { seen.add(p); out.push(p - 1); }
    }
  }
  if (!out.length) throw new Error("Enter the pages you want, for example 1-3, 5.");
  return out;
}

// Splits [0..pageCount) into consecutive groups of `size` pages.
export function chunkPages(pageCount, size) {
  const n = Math.floor(Number(size));
  if (!(n >= 1)) throw new Error("Pages per file must be 1 or more.");
  const groups = [];
  for (let i = 0; i < pageCount; i += n) groups.push(Array.from({ length: Math.min(n, pageCount - i) }, (_, k) => i + k));
  return groups;
}

export function formatBytes(bytes) {
  const b = Number(bytes);
  if (!Number.isFinite(b) || b < 0) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(b < 10 * 1024 ? 1 : 0)} KB`;
  return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 2 : 1)} MB`;
}

// Safe download name: keeps letters, numbers, spaces, dots, dashes and
// underscores from the original name, then adds a suffix and extension.
export function outputName(original, suffix, ext) {
  const base = String(original || "document").replace(/\.[^./\\]+$/, "").replace(/[^\p{L}\p{N} ._-]+/gu, "").trim().slice(0, 80) || "document";
  return `${base}${suffix ? "-" + suffix : ""}.${ext}`;
}

// Page sizes in PDF points (1 pt = 1/72 in).
export const PAGE_SIZES = {
  a4: [595.28, 841.89],
  letter: [612, 792],
};

// Places an image of w×h pixels on a page. size: "fit" (page = image),
// "a4" or "letter"; margin in points. Orientation follows the image.
export function imagePlacement(w, h, size = "fit", margin = 0) {
  if (size === "fit") return { pageW: w, pageH: h, x: 0, y: 0, drawW: w, drawH: h };
  let [pw, ph] = PAGE_SIZES[size] || PAGE_SIZES.a4;
  if (w > h) [pw, ph] = [ph, pw];
  const availW = pw - 2 * margin, availH = ph - 2 * margin;
  const scale = Math.min(availW / w, availH / h);
  const drawW = w * scale, drawH = h * scale;
  return { pageW: pw, pageH: ph, x: (pw - drawW) / 2, y: (ph - drawH) / 2, drawW, drawH };
}
