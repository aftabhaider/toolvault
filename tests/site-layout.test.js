// Shared layout checks. Fix failures with: npm run layout
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SKIP_DIRS = new Set(["og", "scripts", "tests", "node_modules", "pdf-to-word-service", "assets", ".git"]);
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

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
  if (rel.startsWith("google")) continue;
  pages.push({ rel, source: await readFile(file, "utf8") });
}
const count = (s, needle) => s.split(needle).length - 1;

test("every page uses the shared theme, header and footer exactly once", () => {
  for (const { rel, source } of pages) {
    assert.equal(count(source, 'href="/assets/site.css"'), 1, `${rel}: theme stylesheet`);
    assert.equal(count(source, '<header id="tv-header">'), 1, `${rel}: shared header`);
    assert.equal(count(source, "<header"), 1, `${rel}: extra <header>`);
    assert.equal(count(source, '<footer id="tv-footer">'), 1, `${rel}: shared footer`);
    assert.equal(count(source, "<footer"), 1, `${rel}: extra <footer>`);
    assert.match(source, /<body class="tv-site tv-(home|hub|tool|article|legal)">/, `${rel}: body class`);
    assert.match(source, /<main id="main"/, `${rel}: skip-link target`);
  }
});

test("the footer comes after the main content", () => {
  for (const { rel, source } of pages) {
    const mainEnd = source.lastIndexOf("</main>");
    assert.ok(mainEnd > 0 && mainEnd < source.indexOf('<footer id="tv-footer">'), `${rel}: footer inside <main>`);
  }
});

test("breadcrumbs match the BreadcrumbList structured data", () => {
  for (const { rel, source } of pages) {
    const ld = [...source.matchAll(/"@type"\s*:\s*"ListItem"/g)].length;
    const crumbs = source.match(/<nav id="tv-crumbs"[\s\S]*?<\/nav>/);
    if (rel === "index.html" || rel === "404.html") { assert.equal(crumbs, null, `${rel}: no breadcrumbs expected`); continue; }
    assert.ok(crumbs, `${rel}: breadcrumbs missing`);
    const visible = count(crumbs[0], "<li");
    assert.ok(visible >= 2, `${rel}: breadcrumb too short`);
    assert.ok(ld >= visible, `${rel}: visible trail longer than structured data`);
  }
});

test("HTML tags are balanced (outside scripts and styles)", () => {
  for (const { rel, source } of pages) {
    const html = source.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
    const stack = [];
    for (const [whole, close, name] of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>/g)) {
      const tag = name.toLowerCase();
      if (VOID.has(tag) || whole.endsWith("/>")) continue;
      if (!close) { stack.push(tag); continue; }
      assert.equal(stack.pop(), tag, `${rel}: unexpected </${tag}>`);
    }
    assert.deepEqual(stack, [], `${rel}: unclosed ${stack.join(", ")}`);
  }
});

test("layout and SEO generators are up to date", { skip: spawnSync("python3", ["--version"]).status !== 0 && "python3 not installed" }, () => {
  for (const script of ["scripts/layout.py", "scripts/seo.py"]) {
    const run = spawnSync("python3", [script, "--check"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(run.status, 0, `${script} --check: ${run.stderr.trim().split("\n").pop()}`);
  }
});
