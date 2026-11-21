import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { calculateSquareFootage, areaFromShape, convertArea } from "../calculators/square-footage-engine.js";

test("12 ft × 10 ft rectangle is 120 ft²", () => {
  const r = calculateSquareFootage({ shape: "rectangle", length: 12, width: 10, lengthUnit: "ft" });
  approx(r.areaFt2, 120);
  approx(r.areaM2, 120 * 0.09290304);
  approx(r.areaYd2, 120 / 9);
});

test("mixed units are normalised before multiplying", () => {
  const r = areaFromShape("rectangle", { length: 3, lengthUnit: "m", width: 100, widthUnit: "cm" });
  approx(r.areaM2, 3);
});

test("triangle and circle formulas", () => {
  approx(areaFromShape("triangle", { base: 10, height: 6, baseUnit: "ft" }).areaM2 * 10.763910416709722, 30);
  approx(areaFromShape("circle", { diameter: 2, diameterUnit: "m" }).areaM2, Math.PI);
});

test("multiple areas are summed", () => {
  const r = calculateSquareFootage({
    shape: "rectangle",
    areas: [{ length: 2, width: 3, lengthUnit: "m" }, { length: 1, width: 4, lengthUnit: "m" }]
  });
  assert.equal(r.count, 2);
  approx(r.areaM2, 10);
});

test("negative, blank and unknown-shape inputs give zero area", () => {
  approx(areaFromShape("rectangle", { length: -5, width: 3, lengthUnit: "m" }).areaM2, 0);
  approx(areaFromShape("rectangle", { length: "", width: 3, lengthUnit: "m" }).areaM2, 0);
  assert.equal(areaFromShape("hexagon", {}).areaM2, 0);
});

test("area conversions are inverse and 1 yd² = 9 ft²", () => {
  approx(convertArea.ft2ToM2(convertArea.m2ToFt2(17.5)), 17.5);
  approx(convertArea.yd2ToM2(convertArea.m2ToYd2(17.5)), 17.5);
  approx(convertArea.m2ToFt2(convertArea.yd2ToM2(1)), 9);
});
