import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { parsePageRanges, chunkPages, formatBytes, outputName, imagePlacement } from "../documents/pdf-utils.js";

test("page ranges: singles, ranges, open ends, order and duplicates", () => {
  assert.deepEqual(parsePageRanges("1-3, 5", 10), [0, 1, 2, 4]);
  assert.deepEqual(parsePageRanges("8-", 10), [7, 8, 9]);
  assert.deepEqual(parsePageRanges("-2", 10), [0, 1]);
  assert.deepEqual(parsePageRanges("5,1", 10), [4, 0]);
  assert.deepEqual(parsePageRanges("3-1", 10), [2, 1, 0]);
  assert.deepEqual(parsePageRanges("1-3,2-4", 10), [0, 1, 2, 3]);
  assert.deepEqual(parsePageRanges(" 2 – 3 ; 6 ", 10), [1, 2, 5]);
});

test("page ranges: helpful errors", () => {
  assert.throws(() => parsePageRanges("", 5), /Enter the pages/);
  assert.throws(() => parsePageRanges("0", 5), /start at 1/);
  assert.throws(() => parsePageRanges("4-9", 5), /has 5 pages/);
  assert.throws(() => parsePageRanges("2", 1), /has 1 page;/);
  assert.throws(() => parsePageRanges("a-b", 5), /not a page number/);
});

test("chunks", () => {
  assert.deepEqual(chunkPages(5, 2), [[0, 1], [2, 3], [4]]);
  assert.deepEqual(chunkPages(3, 1), [[0], [1], [2]]);
  assert.deepEqual(chunkPages(3, 10), [[0, 1, 2]]);
  assert.throws(() => chunkPages(3, 0), /1 or more/);
});

test("formatBytes", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(200 * 1024), "200 KB");
  assert.equal(formatBytes(2.5 * 1024 * 1024), "2.50 MB");
  assert.equal(formatBytes(25 * 1024 * 1024), "25.0 MB");
});

test("outputName keeps a safe base name", () => {
  assert.equal(outputName("Report 2026.pdf", "pages-1-3", "pdf"), "Report 2026-pages-1-3.pdf");
  assert.equal(outputName("../../etc/passwd", "", "jpg"), "....etcpasswd.jpg");
  assert.equal(outputName("", "x", "zip"), "document-x.zip");
  assert.equal(outputName("photo.HEIC", "", "pdf"), "photo.pdf");
});

test("image placement keeps aspect ratio and centres the image", () => {
  const fit = imagePlacement(800, 600, "fit");
  assert.deepEqual([fit.pageW, fit.pageH, fit.drawW, fit.drawH], [800, 600, 800, 600]);
  const a4 = imagePlacement(1000, 2000, "a4", 36);
  approx(a4.drawW / a4.drawH, 0.5, 1e-12);
  assert.ok(a4.drawH <= 841.89 - 72 + 1e-9 && a4.drawW <= 595.28 - 72 + 1e-9);
  approx(a4.x * 2 + a4.drawW, 595.28, 1e-9);
  const landscape = imagePlacement(2000, 1000, "letter", 0);
  assert.deepEqual([landscape.pageW, landscape.pageH], [792, 612]);
});
