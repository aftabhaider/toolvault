// Pure helpers for the browser image tools (no DOM), unit-tested in tests/image-utils.test.js.

export const FORMATS = {
  jpg: { mime: "image/jpeg", ext: "jpg", lossy: true, alpha: false, label: "JPG" },
  png: { mime: "image/png", ext: "png", lossy: false, alpha: true, label: "PNG" },
  webp: { mime: "image/webp", ext: "webp", lossy: true, alpha: true, label: "WebP" },
};

// Output format matching an input file ("same as original"); anything that
// is not PNG or WebP (JPEG, GIF, BMP, HEIC…) becomes JPG.
export function formatForFile(type, name = "") {
  if (/png/i.test(type) || /\.png$/i.test(name)) return "png";
  if (/webp/i.test(type) || /\.webp$/i.test(name)) return "webp";
  return "jpg";
}

// New pixel size for an image of w×h.
//   mode "percent": value = percentage (e.g. 50)
//   mode "width": value = target width, height follows the aspect ratio
//   mode "height": value = target height, width follows
//   mode "box": fit inside value×value2 keeping the aspect ratio
//   mode "exact": exactly value×value2 (may stretch)
// `upscale: false` never makes an image larger than the original.
export function resizeDimensions(w, h, mode, value, value2, { upscale = true } = {}) {
  const W = Number(w), H = Number(h), a = Number(value), b = Number(value2);
  if (!(W > 0 && H > 0)) throw new Error("The image has no size.");
  let nw, nh;
  if (mode === "percent") {
    if (!(a > 0)) throw new Error("Enter a percentage greater than 0.");
    nw = W * a / 100; nh = H * a / 100;
  } else if (mode === "width") {
    if (!(a > 0)) throw new Error("Enter a width greater than 0.");
    nw = a; nh = H * a / W;
  } else if (mode === "height") {
    if (!(a > 0)) throw new Error("Enter a height greater than 0.");
    nh = a; nw = W * a / H;
  } else if (mode === "box" || mode === "exact") {
    if (!(a > 0 && b > 0)) throw new Error("Enter a width and height greater than 0.");
    if (mode === "exact") { nw = a; nh = b; }
    else { const s = Math.min(a / W, b / H); nw = W * s; nh = H * s; }
  } else {
    throw new Error(`Unknown resize mode: ${mode}`);
  }
  if (!upscale && (nw > W || nh > H)) {
    const s = Math.min(W / nw, H / nh);
    nw *= s; nh *= s;
  }
  return { width: Math.max(1, Math.round(nw)), height: Math.max(1, Math.round(nh)) };
}

// Longest side limit used by Compress Image ("max size" option); 0 = keep.
export function limitLongestSide(w, h, max) {
  const m = Number(max);
  if (!(m > 0) || Math.max(w, h) <= m) return { width: w, height: h };
  const s = m / Math.max(w, h);
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)) };
}

export function percentSaved(before, after) {
  if (!(before > 0)) return 0;
  return Math.round((1 - after / before) * 100);
}
