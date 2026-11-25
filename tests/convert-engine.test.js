import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { convert, factor, feetInchesToCm, cmToFeetInches, formatNumber, UNITS } from "../converters/convert-engine.js";

test("exact length definitions", () => {
  approx(convert(1, "in", "cm"), 2.54, 1e-15);
  approx(convert(1, "ft", "m"), 0.3048, 1e-15);
  approx(convert(1, "mi", "km"), 1.609344, 1e-15);
  approx(convert(1, "yd", "ft"), 3, 1e-15);
  approx(convert(1, "mi", "ft"), 5280, 1e-12);
  approx(convert(100, "cm", "in"), 39.37007874015748, 1e-14);
  approx(convert(25.4, "mm", "in"), 1, 1e-15);
});

test("exact mass definitions", () => {
  approx(convert(1, "lb", "kg"), 0.45359237, 1e-15);
  approx(convert(1, "kg", "lb"), 2.2046226218487757, 1e-14);
  approx(convert(1, "lb", "oz"), 16, 1e-14);
  approx(convert(1, "oz", "g"), 28.349523125, 1e-12);
  approx(convert(1, "st", "lb"), 14, 1e-14);
});

test("US and UK volume definitions differ correctly", () => {
  approx(convert(1, "usgal", "l"), 3.785411784, 1e-15);
  approx(convert(1, "ukgal", "l"), 4.54609, 1e-15);
  approx(convert(1, "usgal", "usfloz"), 128, 1e-12);
  approx(convert(1, "ukgal", "ukfloz"), 160, 1e-12);
  approx(convert(1, "uscup", "usfloz"), 8, 1e-12);
  approx(convert(1, "usfloz", "ml"), 29.5735295625, 1e-12);
  approx(convert(1, "ukfloz", "ml"), 28.4130625, 1e-12);
});

test("temperature fixed points", () => {
  approx(convert(0, "c", "f"), 32, 1e-15);
  approx(convert(100, "c", "f"), 212, 1e-12);
  approx(convert(-40, "c", "f"), -40, 1e-12);
  approx(convert(98.6, "f", "c"), 37, 1e-12);
  approx(convert(0, "k", "c"), -273.15, 1e-12);
  approx(convert(32, "f", "k"), 273.15, 1e-12);
});

test("every linear pair round-trips", () => {
  const kinds = {};
  for (const [id, u] of Object.entries(UNITS)) (kinds[u.kind] ??= []).push(id);
  for (const ids of Object.values(kinds)) for (const a of ids) for (const b of ids) {
    approx(convert(convert(123.456, a, b), b, a), 123.456, 1e-12, `${a}→${b}→${a}`);
  }
});

test("factor matches convert for 1 unit; temperature has no factor", () => {
  approx(factor("kg", "lb"), convert(1, "kg", "lb"), 1e-15);
  assert.throws(() => factor("c", "f"));
});

test("mismatched kinds and unknown units throw; bad numbers give NaN", () => {
  assert.throws(() => convert(1, "kg", "m"), /Cannot convert/);
  assert.throws(() => convert(1, "kg", "parsec"), /Unknown unit/);
  assert.ok(Number.isNaN(convert("abc", "kg", "lb")));
});

test("feet and inches ↔ centimetres", () => {
  approx(feetInchesToCm(5, 7), 170.18, 1e-12);
  approx(feetInchesToCm(6, 0), 182.88, 1e-12);
  const h = cmToFeetInches(170.18);
  assert.equal(h.feet, 5);
  approx(h.inches, 7, 1e-12);
  // 182.87 cm is 5 ft 11.996 in: show it as 6 ft 0 in, never "5 ft 12 in".
  assert.deepEqual([cmToFeetInches(182.87).feet, cmToFeetInches(182.87).inches], [6, 0]);
});

test("formatNumber trims zeros and keeps precision", () => {
  assert.equal(formatNumber(2.54), "2.54");
  assert.equal(formatNumber(39.37007874), "39.3701");
  assert.equal(formatNumber(2.5, 2), "2.5");
  assert.equal(formatNumber(1000), "1000");
  assert.equal(formatNumber(12345.6), "12,345.6");
  assert.equal(formatNumber(-40), "-40");
});
