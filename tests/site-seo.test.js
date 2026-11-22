// Site-wide SEO checks. Fix failures with: npm run seo
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, access } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://toolvault.aftabjordan1.workers.dev";
const SKIP_DIRS = new Set(["og", "scripts", "tests", "node_modules", "pdf-to-word-service", ".git"]);
const SKIP = new Set(["google8f42117352f976c7.html", "404.html"]);

async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) out.push(...await htmlFiles(full)); }
    else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const pages = [];
for (const file of await htmlFiles(ROOT)) {
  const rel = relative(ROOT, file).split(sep).join("/");
  if (SKIP.has(rel)) continue;
  const source = await readFile(file, "utf8");
  const robots = source.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? "";
  pages.push({ rel, source, indexable: !robots.includes("noindex"), canonical: source.match(/<link rel="canonical" href="([^"]+)"/)?.[1] });
}
const sitemap = await readFile(join(ROOT, "sitemap.xml"), "utf8");
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]));
const exists = path => access(path).then(() => true, () => false);

test("every page has a title, description and canonical URL on this site", () => {
  for (const { rel, source, canonical } of pages) {
    assert.match(source, /<title>[^<]{10,}<\/title>/, `${rel}: missing title`);
    assert.match(source, /<meta name="description" content="[^"]{50,}"/, `${rel}: missing or short description`);
    assert.ok(canonical?.startsWith(SITE), `${rel}: missing canonical URL`);
    assert.ok(!canonical.endsWith(".html"), `${rel}: canonical should be the clean URL`);
  }
});

test("all JSON-LD blocks are valid JSON", () => {
  for (const { rel, source } of pages) {
    for (const m of source.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
      assert.doesNotThrow(() => JSON.parse(m[1]), `${rel}: invalid JSON-LD`);
    }
  }
});

test("sitemap lists exactly the indexable pages", () => {
  const indexable = new Set(pages.filter(p => p.indexable).map(p => p.canonical));
  assert.deepEqual([...sitemapUrls].sort(), [...indexable].sort());
});

test("indexable pages have a share image that exists", async () => {
  for (const { rel, source, indexable } of pages.filter(p => p.indexable)) {
    const image = source.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    assert.ok(image, `${rel}: missing og:image`);
    assert.ok(await exists(join(ROOT, image.replace(SITE, ""))), `${rel}: ${image} not generated`);
    assert.match(source, /<meta name="twitter:card" content="summary_large_image">/, `${rel}: twitter card`);
  }
});

test("pages with a visible FAQ carry matching FAQPage data", () => {
  for (const { rel, source, indexable } of pages.filter(p => p.indexable)) {
    if (!/>\s*(Frequently asked questions|FAQs?)\s*</i.test(source)) continue;
    const block = source.match(/data-seo="faq">([\s\S]*?)<\/script>/);
    assert.ok(block, `${rel}: FAQ section without FAQPage data`);
    for (const q of JSON.parse(block[1]).mainEntity) {
      assert.ok(q.name.length > 5 && q.acceptedAnswer.text.length > 10, `${rel}: empty FAQ entry`);
    }
  }
});

test("internal links point at pages that exist", async () => {
  for (const { rel, source } of pages) {
    for (const [, href] of source.matchAll(/href="(\/(?!\/)[^"#?]*)"/g)) {
      if (/\.(svg|png|jpg|xml|txt|css|js)$/.test(href)) continue;
      const base = join(ROOT, href);
      const found = href.endsWith("/") ? await exists(join(base, "index.html")) : (await exists(base + ".html")) || (await exists(join(base, "index.html")));
      assert.ok(found, `${rel}: broken internal link ${href}`);
    }
  }
});

test("llms.txt and robots.txt are present and point at the sitemap", async () => {
  assert.match(await readFile(join(ROOT, "robots.txt"), "utf8"), new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  const llms = await readFile(join(ROOT, "llms.txt"), "utf8");
  for (const url of sitemapUrls) assert.ok(llms.includes(`(${url})`), `llms.txt missing ${url}`);
});
