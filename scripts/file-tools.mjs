// Generates the browser file-tool pages from the definitions below:
// PDF tools in documents/<slug>.html (processing: documents/pdf-tools.js) and
// image tools in images/<slug>.html (processing: images/image-tools.js).
//
//   node scripts/file-tools.mjs          (part of npm run seo)
//   node scripts/file-tools.mjs --check
//
// Only the <!-- tv:pdf-head --> and <!-- tv:pdf --> regions are written.

import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://toolvault.aftabjordan1.workers.dev";
const ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const LIBS = {
  pdflib: "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  pdfjs: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
  heic2any: "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js",
};

const GROUPS = {
  pdf: { dir: "documents", hub: "PDF Tools", attr: "pdftool", script: "/documents/pdf-tools.js", more: "More PDF tools", all: "All PDF tools" },
  image: { dir: "images", hub: "Image Tools", attr: "imgtool", script: "/images/image-tools.js", more: "More image tools", all: "All image tools" },
};
const groupOf = t => GROUPS[t.group || "pdf"];

const radio = (name, items, checked, toggle = false) =>
  `<div class="tv-seg" role="radiogroup">${items.map(([v, label]) => `<label><input type="radio" name="${name}" value="${v}"${v === checked ? " checked" : ""}${toggle ? " data-toggle" : ""}><span>${esc(label)}</span></label>`).join("")}</div>`;
const field = (label, control, hint = "", attrs = "") => `<div class="tv-opt"${attrs}><span class="tv-opt-label">${esc(label)}</span>${control}${hint ? `<span class="tv-opt-hint">${esc(hint)}</span>` : ""}</div>`;
const pagesInput = (placeholder = "e.g. 1-3, 5, 8-") => `<input type="text" name="pages" placeholder="${placeholder}" autocomplete="off" inputmode="numeric">`;

export const TOOLS = [
  {
    slug: "jpg-to-pdf", libs: ["pdflib"], multiple: true, accept: "image/*,.jpg,.jpeg,.png,.webp,.gif,.bmp",
    title: "JPG to PDF Converter – Combine Images into a PDF (Free)",
    h1: "JPG to PDF Converter",
    description: "Convert JPG, PNG and WebP images to a PDF in your browser. Put several photos in one PDF, choose A4, Letter or original size, and download. No upload, no sign-up.",
    intro: "Turn one or more images into a single PDF. Photos are processed on your device, so nothing is uploaded, and phone photos keep their correct orientation.",
    drop: "Drop images here", chooseLabel: "Choose images", run: "Convert to PDF",
    options: () => field("Page size", radio("pagesize", [["fit", "Same as image"], ["a4", "A4"], ["letter", "US Letter"]], "a4"))
      + field("Margin", radio("margin", [["0", "None"], ["18", "Small"], ["36", "Normal"]], "18"), "Margins apply to A4 and Letter pages."),
    steps: ["Choose or drop your images (JPG, PNG, WebP, GIF or BMP).", "Put them in order with the ↑ and ↓ buttons; each image becomes one page.", "Pick a page size and margin, then select Convert to PDF."],
    about: [["Image quality", "Photos are placed at full resolution. JPEGs are re-encoded at 92% quality so that phone photos are turned the right way up; PNG, WebP and GIF images keep transparency as PNG."],
            ["Page size", "“Same as image” makes each page the shape of its photo. A4 (210 × 297 mm) and US Letter (8.5 × 11 in) fit each image inside the page without stretching, turning the page sideways for landscape photos."]],
    faq: [["Is this JPG to PDF converter free?", "Yes. There is no account, watermark or file limit beyond what your device’s memory can handle."],
          ["Are my images uploaded?", "No. The PDF is built in your browser with the open-source pdf-lib library. Your images never leave your device."],
          ["Can I combine multiple JPGs into one PDF?", "Yes. Add as many images as you like; each becomes a page, in the order shown in the list."],
          ["Why is my phone photo sideways in other converters?", "Phones store rotation as a tag instead of turning the pixels. This tool applies that tag before building the PDF, so pages appear the way the photo looks in your gallery."]],
    related: ["pdf-to-jpg", "compress-pdf", "merge-pdf", "pdf-to-word"],
  },
  {
    slug: "pdf-to-jpg", libs: ["pdfjs", "jszip"], multiple: false, accept: "application/pdf,.pdf",
    title: "PDF to JPG Converter – Save PDF Pages as Images (Free)",
    h1: "PDF to JPG Converter",
    description: "Convert PDF pages to JPG or PNG images in your browser. Choose the resolution (up to 300 DPI), convert all pages or selected ones, and download a ZIP. No upload.",
    intro: "Save every page of a PDF, or just the pages you choose, as JPG or PNG images. Pages are rendered on your device; multi-page results download as one ZIP file.",
    drop: "Drop a PDF here", chooseLabel: "Choose PDF", run: "Convert to images",
    options: () => field("Format", radio("format", [["jpg", "JPG"], ["png", "PNG"]], "jpg"), "JPG files are smaller; PNG keeps sharp text and lines exactly.")
      + field("Resolution", radio("dpi", [["72", "72 DPI (screen)"], ["150", "150 DPI"], ["300", "300 DPI (print)"]], "150"))
      + field("Pages", radio("pages-mode", [["all", "All pages"], ["some", "Selected pages"]], "all", true))
      + field("Page numbers", pagesInput(), "Separate with commas; use a dash for ranges.", ` data-when="pages-mode" data-value="some"`),
    steps: ["Choose or drop a PDF.", "Pick JPG or PNG and a resolution: 150 DPI suits screens and email, 300 DPI suits printing.", "Select Convert to images. One page downloads as an image; several pages download as a ZIP."],
    about: [["Resolution", "DPI is pixels per inch of the printed page. An A4 page at 150 DPI is about 1240 × 1754 pixels; at 300 DPI it is about 2480 × 3508 pixels."],
            ["Text and fonts", "Pages are rendered exactly as a PDF viewer shows them. The images contain pictures of the text, not editable text; use PDF to Word if you need to edit it."]],
    faq: [["How do I convert a PDF to JPG for free?", "Choose your PDF, pick JPG and a resolution, and select Convert to images. There is no sign-up or watermark."],
          ["Is my PDF uploaded?", "No. Pages are rendered in your browser with Mozilla’s pdf.js. The file stays on your device."],
          ["Which resolution should I use?", "150 DPI for viewing on screen or sending by email; 300 DPI for printing or zooming into detail. 72 DPI gives the smallest files."],
          ["Can I convert only one page?", "Yes. Choose “Selected pages” and type the page number, for example 3, or a range such as 2-4."]],
    related: ["jpg-to-pdf", "split-pdf", "compress-pdf", "pdf-to-word"],
  },
  {
    slug: "split-pdf", libs: ["pdflib", "jszip"], multiple: false, accept: "application/pdf,.pdf",
    title: "Split PDF – Extract Pages or Split into Separate Files (Free)",
    h1: "Split PDF",
    description: "Split a PDF in your browser: extract selected pages into a new PDF, split every page into its own file, or split into equal parts. No upload, no sign-up.",
    intro: "Extract the pages you need into a new PDF, or split a document into single pages or equal-sized parts. Everything happens on your device.",
    drop: "Drop a PDF here", chooseLabel: "Choose PDF", run: "Split PDF",
    options: () => field("How to split", radio("split-mode", [["ranges", "Extract pages"], ["each", "Every page"], ["chunks", "Equal parts"]], "ranges", true))
      + field("Pages to extract", pagesInput(), "Example: 1-3, 5 makes one PDF with pages 1, 2, 3 and 5, in that order.", ` data-when="split-mode" data-value="ranges"`)
      + field("Pages per file", `<input type="number" name="chunk" min="1" step="1" value="2">`, "", ` data-when="split-mode" data-value="chunks"`),
    steps: ["Choose or drop a PDF.", "Pick how to split it: extract pages into one new PDF, save every page as its own PDF, or split into parts with a fixed number of pages.", "Select Split PDF. Several files download together as a ZIP."],
    about: [["Extract pages", "Type pages and ranges separated by commas. “8-” means page 8 to the end; “-3” means the first three pages. Pages appear in the order you type them, so “3, 1, 2” also reorders."],
            ["Quality", "Pages are copied, not re-rendered, so text stays selectable and images keep their original quality."]],
    faq: [["How do I extract pages from a PDF?", "Choose “Extract pages”, type the pages you want (for example 2-4, 7) and select Split PDF. You get one new PDF with just those pages."],
          ["How do I split a PDF into single pages?", "Choose “Every page”. Each page becomes its own PDF, downloaded together in a ZIP file."],
          ["Is my PDF uploaded?", "No. The split is done in your browser with pdf-lib; the file never leaves your device."],
          ["Can I delete pages from a PDF with this?", "Yes: extract every page except the ones you want to remove. For a 10-page file without page 4, type 1-3, 5-10."]],
    related: ["merge-pdf", "rotate-pdf", "compress-pdf", "pdf-to-jpg"],
  },
  {
    slug: "rotate-pdf", libs: ["pdflib"], multiple: false, accept: "application/pdf,.pdf",
    title: "Rotate PDF – Turn Pages 90°, 180° or 270° (Free, No Upload)",
    h1: "Rotate PDF",
    description: "Rotate PDF pages permanently in your browser: turn all pages or selected pages by 90°, 180° or 270°, then download. No upload, no sign-up.",
    intro: "Fix sideways or upside-down pages and save the PDF with the new orientation. Rotate every page or only the ones you choose.",
    drop: "Drop a PDF here", chooseLabel: "Choose PDF", run: "Rotate and download",
    options: () => field("Rotate by", radio("angle", [["90", "90° clockwise"], ["180", "180°"], ["270", "90° anticlockwise"]], "90"))
      + field("Pages", radio("rotate-pages", [["all", "All pages"], ["some", "Selected pages"]], "all", true))
      + field("Page numbers", pagesInput("e.g. 2, 4-6"), "", ` data-when="rotate-pages" data-value="some"`),
    steps: ["Choose or drop a PDF.", "Pick the rotation and whether it applies to every page or only some.", "Select Rotate and download."],
    about: [["Permanent rotation", "The rotation is saved in the PDF, so the pages open the right way up in every viewer and when printed."],
            ["Quality", "Rotating does not re-render anything: text, links and images are unchanged."]],
    faq: [["How do I rotate a PDF and save it?", "Choose the PDF, pick 90°, 180° or 270°, and select Rotate and download. The saved file keeps the new orientation."],
          ["Can I rotate only one page?", "Yes. Choose “Selected pages” and type the page number."],
          ["Is my PDF uploaded?", "No. The rotation is applied in your browser; the file stays on your device."],
          ["Does rotating reduce quality?", "No. Only the page orientation setting changes; the content is untouched."]],
    related: ["split-pdf", "merge-pdf", "compress-pdf", "jpg-to-pdf"],
  },
  {
    slug: "compress-pdf", libs: ["pdflib", "pdfjs"], multiple: false, accept: "application/pdf,.pdf",
    title: "Compress PDF – Reduce PDF File Size Online (Free, No Upload)",
    h1: "Compress PDF",
    description: "Reduce PDF file size in your browser, for email and upload limits. Choose basic (keeps text) or strong compression, see the size before and after. No upload.",
    intro: "Make a PDF smaller for email or upload limits. Choose how strongly to compress; you see the size before and after, and nothing is downloaded if the file would not get smaller.",
    drop: "Drop a PDF here", chooseLabel: "Choose PDF", run: "Compress PDF",
    options: () => field("Compression", radio("level", [["basic", "Basic"], ["strong", "Strong"], ["extreme", "Extreme"]], "strong"),
      "Basic keeps text selectable but saves little. Strong and Extreme turn each page into a compressed image (144 or 96 DPI), which makes scanned and image-heavy PDFs much smaller but means text can no longer be selected."),
    steps: ["Choose or drop a PDF.", "Pick a compression level. Start with Strong; use Extreme for the smallest file, or Basic if text must stay selectable.", "Select Compress PDF and compare the sizes shown before downloading."],
    about: [["How the levels work", "Basic rewrites the PDF structure more compactly without touching content. Strong and Extreme re-create each page as a JPEG image at a lower resolution, the same approach used for scanned documents, which is where most PDF size comes from."],
            ["When to keep the original", "If a PDF is mostly text, it is usually already small. Strong compression could make it larger or blur small print; in that case the tool tells you and does not download a worse file."]],
    faq: [["How do I reduce a PDF’s file size?", "Choose the PDF, pick Strong and select Compress PDF. The result shows the original and new sizes and the percentage saved."],
          ["Is my PDF uploaded?", "No. Compression runs in your browser with pdf.js and pdf-lib. The file never leaves your device."],
          ["Will the text still be selectable?", "With Basic, yes. Strong and Extreme turn pages into images, so text can be read but not selected or searched."],
          ["Why did my PDF not get smaller?", "Text-only PDFs are already compact. Try Basic for a small saving, or keep the original."]],
    related: ["merge-pdf", "split-pdf", "pdf-to-jpg", "jpg-to-pdf"],
  },
  {
    slug: "heic-to-jpg", group: "image", libs: ["heic2any", "jszip"], multiple: true, accept: ".heic,.heif,image/heic,image/heif",
    title: "HEIC to JPG Converter – Convert iPhone Photos (Free, No Upload)",
    h1: "HEIC to JPG Converter",
    description: "Convert HEIC photos from iPhone and iPad to JPG or PNG in your browser. Convert many photos at once and download a ZIP. No upload, no sign-up.",
    intro: "iPhones save photos as HEIC, which many websites, Windows apps and printers cannot open. Convert them to JPG or PNG here; the photos are decoded on your device and never uploaded.",
    drop: "Drop HEIC photos here", chooseLabel: "Choose HEIC photos", run: "Convert photos",
    options: () => field("Convert to", radio("format", [["jpg", "JPG"], ["png", "PNG"]], "jpg"), "JPG is smaller and opens everywhere; PNG is lossless but much larger.")
      + field("JPG quality", radio("quality", [["0.92", "High"], ["0.8", "Smaller files"]], "0.92")),
    steps: ["Choose or drop one or more .heic or .heif photos.", "Pick JPG (best for sharing) or PNG.", "Select Convert photos. One photo downloads directly; several download as a ZIP."],
    about: [["What is HEIC?", "HEIC (High Efficiency Image Container) is the photo format iPhones and iPads use by default since iOS 11. It stores photos at about half the size of JPG, but many apps, websites and Windows PCs still cannot open it."],
            ["Privacy", "The photos are decoded in your browser with the open-source heic2any library. The converted files do not carry the original’s embedded metadata, such as the GPS location where a photo was taken."]],
    faq: [["How do I convert HEIC to JPG for free?", "Choose your HEIC photos, keep JPG selected and select Convert photos. There is no sign-up, watermark or limit on the number of photos."],
          ["Are my photos uploaded?", "No. Conversion happens on your device; the photos never leave it."],
          ["Can I stop my iPhone saving HEIC?", "Yes: Settings → Camera → Formats → Most Compatible saves new photos as JPG. Photos you already took stay HEIC, which is what this converter is for."],
          ["Is the quality reduced?", "JPG at High quality is visually identical for normal viewing. Choose PNG if you need a lossless copy."]],
    related: ["compress-image", "resize-image", "convert-image", "jpg-to-pdf"],
  },
  {
    slug: "compress-image", group: "image", libs: ["jszip"], multiple: true, accept: "image/*",
    title: "Compress Image – Reduce JPG, PNG and WebP File Size (Free)",
    h1: "Compress Image",
    description: "Reduce image file size in your browser for email, websites and upload limits. Compress JPG, PNG and WebP, optionally shrink large photos, and see the size saved. No upload.",
    intro: "Make photos and images smaller for email, websites and upload limits. Pick a quality level and, for large photos, a maximum size; you see exactly how much each file shrinks.",
    drop: "Drop images here", chooseLabel: "Choose images", run: "Compress images",
    options: () => field("Quality", radio("quality", [["0.85", "High"], ["0.72", "Balanced"], ["0.55", "Smallest"]], "0.72"), "Balanced is hard to tell apart from the original on screen.")
      + field("Maximum size", radio("max", [["0", "Keep size"], ["2560", "2560 px"], ["1920", "1920 px"], ["1280", "1280 px"]], "1920"), "Limits the longest side. Phone photos are often 4000 px or more; 1920 px is plenty for screens and email.")
      + field("Save as", radio("format", [["same", "Same format"], ["webp", "WebP"], ["jpg", "JPG"]], "same"), "WebP is usually the smallest and works in all modern browsers; PNG files only get smaller when resized or saved as WebP or JPG."),
    steps: ["Choose or drop your images.", "Pick a quality level and, for large photos, a maximum size.", "Select Compress images. Each file shows its size before and after; several files download as a ZIP."],
    about: [["How image compression works", "JPG and WebP store photos with adjustable quality: a lower setting removes detail the eye barely notices. Most of the saving on phone photos comes from reducing their pixel dimensions, which is what the maximum-size option does."],
            ["Files that are already small", "If an image would not get smaller at the chosen settings, it is skipped and listed as kept, so you never download a larger file."]],
    faq: [["How do I reduce the file size of a photo?", "Choose the photo, keep Balanced quality and a maximum size of 1920 px, and select Compress images. A 4 MB phone photo usually becomes a few hundred kilobytes."],
          ["Are my images uploaded?", "No. Compression runs in your browser using its built-in image encoder; the images never leave your device."],
          ["Will compression remove location data?", "Yes. The compressed files are newly encoded and do not include the original’s embedded metadata, such as GPS location."],
          ["Why did my PNG not get smaller?", "PNG is lossless, so its quality cannot be lowered. Choose a maximum size, or save as WebP or JPG for a much smaller file."]],
    related: ["resize-image", "convert-image", "heic-to-jpg", "compress-pdf"],
  },
  {
    slug: "resize-image", group: "image", libs: ["jszip"], multiple: true, accept: "image/*",
    title: "Resize Image – Change Image Size in Pixels or Percent (Free)",
    h1: "Resize Image",
    description: "Resize images in your browser by percentage, width, height or to fit a box, keeping the aspect ratio. Resize JPG, PNG and WebP in bulk. No upload.",
    intro: "Change the pixel size of one image or many at once. Resize by percentage, to a set width or height, or to fit inside a box; the proportions are always kept.",
    drop: "Drop images here", chooseLabel: "Choose images", run: "Resize images",
    options: () => field("Resize by", radio("mode", [["percent", "Percentage"], ["width", "Width"], ["height", "Height"], ["box", "Fit in box"]], "percent", true))
      + field("Percentage", `<input type="number" name="percent" min="1" max="1000" step="1" value="50">`, "50% halves the width and height.", ` data-when="mode" data-value="percent"`)
      + field("Width (px)", `<input type="number" name="a" min="1" step="1" value="1200">`, "", ` data-when="mode" data-value="width box"`)
      + field("Height (px)", `<input type="number" name="b" min="1" step="1" value="1200">`, "", ` data-when="mode" data-value="height box"`),
    steps: ["Choose or drop one or more images.", "Pick how to resize: a percentage, a width, a height, or a box the image must fit inside.", "Select Resize images. Each image keeps its format; several download as a ZIP."],
    about: [["Keeping proportions", "With Width or Height, the other side is calculated from the original aspect ratio, so the image is never stretched. Fit in box shrinks or enlarges the image until it just fits inside the width and height you give."],
            ["Common sizes", "1920 px wide suits full-screen web images, 1080 × 1080 px suits Instagram posts, and 1200 × 630 px suits link previews on social media."]],
    faq: [["How do I resize an image without losing quality?", "Making an image smaller keeps it sharp. Enlarging beyond its original size cannot add detail, so use percentages above 100% sparingly."],
          ["Can I resize many images at once?", "Yes. Add several images; they are all resized with the same setting and downloaded as a ZIP."],
          ["Are my images uploaded?", "No. Resizing runs in your browser; the images stay on your device."],
          ["What format will the resized image be?", "The same as the original: JPG stays JPG, PNG stays PNG, WebP stays WebP. Other formats such as GIF or BMP are saved as JPG."]],
    related: ["compress-image", "convert-image", "heic-to-jpg", "jpg-to-pdf"],
  },
  {
    slug: "convert-image", group: "image", libs: ["jszip"], multiple: true, accept: "image/*",
    title: "Image Converter – PNG to JPG, JPG to PNG, WebP to JPG (Free)",
    h1: "Image Converter: PNG, JPG and WebP",
    description: "Convert images between JPG, PNG and WebP in your browser: PNG to JPG, JPG to PNG, WebP to JPG and more, in bulk. No upload, no sign-up.",
    intro: "Convert images to JPG, PNG or WebP. Use it for PNG to JPG, JPG to PNG, WebP to JPG or any other combination; GIF, BMP and AVIF files can be converted too.",
    drop: "Drop images here", chooseLabel: "Choose images", run: "Convert images",
    options: () => field("Convert to", radio("format", [["jpg", "JPG"], ["png", "PNG"], ["webp", "WebP"]], "jpg"), "Transparent areas become white in JPG; PNG and WebP keep transparency."),
    steps: ["Choose or drop one or more images.", "Pick the format you need.", "Select Convert images. One image downloads directly; several download as a ZIP."],
    about: [["Which format should I use?", "JPG for photos you want to share or upload; PNG for screenshots, logos and graphics with sharp edges or transparency; WebP for websites, where it is usually the smallest of the three."],
            ["Quality", "JPG and WebP are saved at 92% quality, which is visually identical to the original for normal viewing. PNG is lossless."]],
    faq: [["How do I convert PNG to JPG?", "Choose the PNG, pick JPG and select Convert images. Transparent areas are filled with white because JPG cannot store transparency."],
          ["How do I convert WebP to JPG?", "Choose the WebP image, pick JPG and select Convert images. Use this when an app or website will not accept WebP."],
          ["Are my images uploaded?", "No. Conversion runs in your browser; the images never leave your device."],
          ["Why was my WebP saved as PNG?", "A few browsers, mostly older Safari versions, cannot create WebP files. The tool tells you when this happens; use Chrome, Edge or Firefox for WebP."]],
    related: ["compress-image", "resize-image", "heic-to-jpg", "jpg-to-pdf"],
  },
];

const EXISTING = {
  "merge-pdf": ["Merge PDF", "Combine PDFs in the order you choose."],
  "pdf-to-word": ["PDF to Word", "Convert a PDF to an editable DOCX."],
};

function body(t, byslug) {
  const g = groupOf(t);
  const related = t.related.map(s => {
    const r = byslug[s];
    const [name, desc] = r ? [r.h1, r.intro.split(". ")[0] + "."] : EXISTING[s];
    return `<a class="tv-card" href="/${r ? groupOf(r).dir : "documents"}/${s}"><span class="tv-card-body"><span class="tv-card-title">${esc(name)}</span><span class="tv-card-desc">${esc(desc)}</span></span></a>`;
  }).join("");
  return `<!-- tv:pdf -->
<section class="tv-page-hero tv-conv-hero"><div class="tv-conv-head"><h1>${esc(t.h1)}</h1><p class="tv-lead">${esc(t.intro)}</p></div>
<div class="tv-pdftool" data-${g.attr}="${t.slug}">
<div class="tv-drop" data-drop role="button" tabindex="0" aria-label="${esc(t.chooseLabel)}"><strong>${esc(t.drop)}</strong><span>or</span><button type="button" class="tv-btn tv-btn-secondary" data-choose>${esc(t.chooseLabel)}</button>
<input type="file" accept="${t.accept}"${t.multiple ? " multiple" : ""} hidden></div>
<ul class="tv-files" data-list aria-live="polite"></ul>
<div class="tv-opts">${t.options()}</div>
<div class="tv-actions"><button type="button" class="tv-btn tv-btn-primary" data-run disabled>${esc(t.run)}</button><button type="button" class="tv-btn tv-btn-secondary" data-clear>Clear</button></div>
<div class="tv-progress" data-bar hidden><div data-fill></div></div>
<p class="tv-status" data-status role="status" aria-live="polite"></p>
<div class="tv-results" data-result></div>
<p class="tv-private">Private: files are processed on your device and never uploaded.</p>
</div></section>
<div class="tv-conv-layout"><article class="tv-prose">
<h2>How to use ${esc(t.h1)}</h2>
<ol class="tv-steps">${t.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>
${t.about.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join("\n")}
<h2>Frequently asked questions</h2>
${t.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n")}
</article>
<aside class="tv-conv-aside"><h2 class="tv-aside-h">${g.more}</h2><div class="tv-related">${related}</div>
<a class="tv-aside-all" href="/${g.dir}/">${g.all} →</a></aside></div>
${t.libs.map(l => `<script src="${LIBS[l]}"></script>`).join("\n")}
<script type="module" src="${g.script}"></script>
<!-- /tv:pdf -->`;
}

function head(t) {
  const g = groupOf(t), url = `${SITE}/${g.dir}/${t.slug}`, title = `${t.title} | ToolVault`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebApplication", "@id": `${url}#app`, name: t.h1, url, applicationCategory: "UtilitiesApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: t.description },
    { "@type": "WebPage", "@id": `${url}#page`, name: title, url, description: t.description, isPartOf: { "@type": "WebSite", name: "ToolVault", url: `${SITE}/` } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "ToolVault", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: g.hub, item: `${SITE}/${g.dir}/` },
      { "@type": "ListItem", position: 3, name: t.h1, item: url }] }] };
  return `<!-- tv:pdf-head -->
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="description" content="${esc(t.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${ROBOTS}">
<meta name="theme-color" content="#0b8f78">
<meta property="og:site_name" content="ToolVault">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(t.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(t.description)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<!-- /tv:pdf-head -->`;
}

const HEAD_RE = /<!-- tv:pdf-head -->[\s\S]*?<!-- \/tv:pdf-head -->/;
const BODY_RE = /<!-- tv:pdf -->[\s\S]*?<!-- \/tv:pdf -->/;

async function main() {
  const check = process.argv.includes("--check");
  const byslug = Object.fromEntries(TOOLS.map(t => [t.slug, t]));
  let stale = 0;
  for (const t of TOOLS) {
    const file = join(ROOT, groupOf(t).dir, `${t.slug}.html`);
    const exists = await access(file).then(() => true, () => false);
    const original = exists ? await readFile(file, "utf8") : "";
    const html = exists
      ? original.replace(HEAD_RE, () => head(t)).replace(BODY_RE, () => body(t, byslug))
      : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${head(t)}\n</head>\n<body>\n<main id="main" class="wrap">${body(t, byslug)}</main>\n</body>\n</html>\n`;
    if (html !== original) { stale++; if (!check) await writeFile(file, html); }
    console.log(`${groupOf(t).dir}/${t.slug}.html`);
  }
  if (check && stale) { console.error(`${stale} file tool page(s) out of date: run node scripts/file-tools.mjs`); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
