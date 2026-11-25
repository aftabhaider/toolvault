// Generates 1200×630 social-share images (og/<slug>.jpg) for every indexable
// page, plus logo.png (512×512, from favicon.svg) for structured data.
// Requires Playwright with Chromium: node scripts/og-images.mjs
// Then run: python3 scripts/seo.py  (links the images from each page)

import { readFile, mkdir, readdir } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// require() also finds a globally installed Playwright (NODE_PATH); import does not.
const { chromium } = createRequire(import.meta.url)("playwright");

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://toolvault.aftabjordan1.workers.dev";
const SKIP = new Set(["google8f42117352f976c7.html", "404.html"]);
const SKIP_DIRS = new Set(["og", "scripts", "tests", "node_modules", "pdf-to-word-service", "assets", ".git"]);
const SECTIONS = {
  "": "ToolVault", calculators: "Calculators", construction: "Construction", engineering: "Engineering",
  solar: "Solar", documents: "PDF & Documents", images: "Image Tools", business: "Business", converters: "Converters",
  developer: "Developer", education: "Education", "smart-tools": "Smart Tools",
};
const TAGLINES = {
  Construction: "formulas shown · metric &amp; imperial", Calculators: "formulas shown · metric &amp; imperial",
  Engineering: "formulas shown · metric &amp; imperial", Solar: "formulas shown · metric &amp; imperial",
  "PDF & Documents": "no account needed",
  Converters: "exact definitions · metric, US &amp; UK units",
  "Image Tools": "no upload · runs in your browser",
};
const ICONS = { Construction: "🏗️", Calculators: "🧮", Engineering: "⚡", Solar: "☀️", "PDF & Documents": "📄", ToolVault: "🧰" };

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...await htmlFiles(join(dir, entry.name)));
    } else if (entry.name.endsWith(".html")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

const decode = s => s.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "’").replace(/\s+/g, " ").trim();
const escape = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const stripEmoji = s => s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim();

function card({ title, subtitle, section, path }) {
  const icon = ICONS[section] ?? "🧰";
  const size = title.length > 42 ? 64 : title.length > 28 ? 76 : 88;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;font-family:Inter,system-ui,sans-serif;background:#073f39;color:#fff;
    padding:64px 72px;display:flex;flex-direction:column;position:relative;overflow:hidden}
  body:before{content:"";position:absolute;right:-160px;top:-160px;width:560px;height:560px;border-radius:50%;
    background:radial-gradient(circle,#0b8f78 0%,rgba(11,143,120,0) 70%);opacity:.55}
  .top{display:flex;align-items:center;gap:18px;position:relative}
  .mark{width:64px;height:64px}
  .brand{font-size:34px;font-weight:800;letter-spacing:-.5px}.brand span{color:#42e6ad}
  .pill{margin-left:auto;font-size:24px;font-weight:600;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);
    padding:10px 22px;border-radius:999px}
  .main{margin-top:auto;position:relative}
  h1{font-size:${size}px;line-height:1.05;font-weight:800;letter-spacing:-2px;max-width:1000px}
  p{margin-top:22px;font-size:30px;line-height:1.35;color:#cfe9e1;max-width:980px;
    display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .foot{margin-top:40px;display:flex;justify-content:space-between;font-size:24px;color:#9cc9bd;position:relative}
  .foot b{color:#42e6ad;font-weight:700}
  .bar{position:absolute;left:0;right:0;bottom:0;height:10px;background:linear-gradient(90deg,#0b8f78,#42e6ad)}
  </style></head><body>
  <div class="top">
    <svg class="mark" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b5a50"/><path d="M18 17h28v7H35v23h-6V24H18z" fill="#fff"/><path d="M34 25l8 16 9-18h-8l-5 10-5-10z" fill="#42e6ad"/><path d="M12 49h40" stroke="#42e6ad" stroke-width="3" stroke-linecap="round"/></svg>
    <div class="brand">Tool<span>Vault</span></div>
    ${section !== "ToolVault" ? `<div class="pill">${icon} ${escape(section)}</div>` : ""}
  </div>
  <div class="main"><h1>${escape(title)}</h1>${subtitle ? `<p>${escape(subtitle)}</p>` : ""}</div>
  <div class="foot"><span><b>Free</b> · ${TAGLINES[section] ?? "practical online tools"}</span><span>${escape(path)}</span></div>
  <div class="bar"></div></body></html>`;
}

const pages = [];
for (const file of (await htmlFiles(ROOT)).sort()) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (SKIP.has(rel)) continue;
  const source = await readFile(file, "utf8");
  if (/<meta name="robots" content="[^"]*noindex/.test(source)) continue;
  const url = source.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (!url) continue;
  const path = url.replace(SITE, "").replace(/^\/|\/$/g, "");
  const slug = path ? path.replace(/\//g, "-") : "home";
  const h1 = stripEmoji(decode(source.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? ""));
  const description = decode(source.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "");
  const firstSentence = description.split(/(?<=\.)\s/)[0];
  const section = SECTIONS[rel.includes("/") ? rel.split("/")[0] : ""] ?? "ToolVault";
  const title = slug === "home" ? "Free calculators & PDF tools that show their working" : h1;
  pages.push({ slug, title, subtitle: firstSentence, section, path: "toolvault" + (path ? " / " + path.split("/").pop().replace(/-/g, " ") : "") });
}

await mkdir(join(ROOT, "og"), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const item of pages) {
  await page.setContent(card(item), { waitUntil: "load" });
  await page.screenshot({ path: join(ROOT, "og", `${item.slug}.jpg`), type: "jpeg", quality: 85 });
  console.log(`og/${item.slug}.jpg  ${item.title}`);
}
await page.setViewportSize({ width: 512, height: 512 });
const svg = await readFile(join(ROOT, "favicon.svg"), "utf8");
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", '<svg width="512" height="512" ')}</body></html>`);
await page.screenshot({ path: join(ROOT, "logo.png"), omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
console.log("logo.png");
await browser.close();
