import { test } from "node:test";
import assert from "node:assert/strict";
import { formatForFile, resizeDimensions, limitLongestSide, percentSaved, FORMATS } from "../images/image-utils.js";

test("output format follows the input file", () => {
  assert.equal(formatForFile("image/png"), "png");
  assert.equal(formatForFile("image/webp"), "webp");
  assert.equal(formatForFile("image/jpeg"), "jpg");
  assert.equal(formatForFile("", "photo.HEIC"), "jpg");
  assert.equal(formatForFile("", "logo.png"), "png");
  assert.equal(FORMATS.jpg.alpha, false);
});

test("resize keeps the aspect ratio", () => {
  assert.deepEqual(resizeDimensions(4000, 3000, "percent", 50), { width: 2000, height: 1500 });
  assert.deepEqual(resizeDimensions(4000, 3000, "width", 1200), { width: 1200, height: 900 });
  assert.deepEqual(resizeDimensions(4000, 3000, "height", 600), { width: 800, height: 600 });
  assert.deepEqual(resizeDimensions(4000, 3000, "box", 1080, 1080), { width: 1080, height: 810 });
  assert.deepEqual(resizeDimensions(3000, 4000, "box", 1080, 1080), { width: 810, height: 1080 });
  assert.deepEqual(resizeDimensions(4000, 3000, "exact", 500, 500), { width: 500, height: 500 });
  assert.deepEqual(resizeDimensions(1001, 333, "percent", 33), { width: 330, height: 110 });
});

test("resize without upscaling caps at the original size", () => {
  assert.deepEqual(resizeDimensions(800, 600, "width", 1600, 0, { upscale: false }), { width: 800, height: 600 });
  assert.deepEqual(resizeDimensions(800, 600, "percent", 200), { width: 1600, height: 1200 });
});

test("resize validates input", () => {
  assert.throws(() => resizeDimensions(800, 600, "percent", 0), /greater than 0/);
  assert.throws(() => resizeDimensions(800, 600, "box", 100, ""), /width and height/);
  assert.throws(() => resizeDimensions(0, 600, "width", 100), /no size/);
  assert.throws(() => resizeDimensions(800, 600, "zoom", 2), /Unknown/);
  assert.deepEqual(resizeDimensions(800, 600, "width", 0.1), { width: 1, height: 1 });
});

test("longest side limit and savings", () => {
  assert.deepEqual(limitLongestSide(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(limitLongestSide(1000, 3000, 1500), { width: 500, height: 1500 });
  assert.deepEqual(limitLongestSide(800, 600, 2000), { width: 800, height: 600 });
  assert.deepEqual(limitLongestSide(800, 600, 0), { width: 800, height: 600 });
  assert.equal(percentSaved(1000, 250), 75);
  assert.equal(percentSaved(0, 10), 0);
});
