import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { calculatePaint, conversions } from "../construction/paint-engine.js";

const room = { roomLengthM: 4, roomWidthM: 3, wallHeightM: 2.5, openingAreaM2: 3, coats: 2, coverageM2PerL: 10, wastePercent: 0 };

test("4 × 3 m room, 2.5 m walls, 3 m² openings, 2 coats at 10 m²/L", () => {
  const r = calculatePaint(room);
  approx(r.grossWallArea, 35);
  approx(r.netSurfaceArea, 32);
  approx(r.coatedArea, 64);
  approx(r.purchaseLiters, 6.4);
  approx(r.gallons, 6.4 / 3.785411784);
});

test("ceiling, waste, cans and price", () => {
  const r = calculatePaint({ ...room, includeCeiling: true, wastePercent: 10, canSizeL: 2.5, pricePerLiter: 5 });
  approx(r.ceilingArea, 12);
  approx(r.theoreticalLiters, 8.8);
  approx(r.purchaseLiters, 9.68);
  assert.equal(r.canCount, 4);
  approx(r.cost, 48.4);
});

test("area mode clamps openings to the known area", () => {
  const r = calculatePaint({ mode: "area", knownAreaM2: 50, openingAreaM2: 60, wastePercent: 0 });
  approx(r.openingArea, 50);
  approx(r.netSurfaceArea, 0);
  approx(r.purchaseLiters, 0);
});

test("defaults: 2 coats, 10 m²/L, 5% waste; no can size or price gives null", () => {
  const r = calculatePaint({ mode: "area", knownAreaM2: 10 });
  assert.equal(r.coats, 2);
  approx(r.purchaseLiters, 2 * 1.05);
  assert.equal(r.canCount, null);
  assert.equal(r.cost, null);
});

test("unit conversions are inverse", () => {
  approx(conversions.ft2ToM2(1), 0.09290304);
  approx(conversions.m2ToFt2(conversions.ft2ToM2(350)), 350);
  approx(conversions.gallonsToLiters(1), 3.785411784);
  approx(conversions.litersToGallons(conversions.gallonsToLiters(2.5)), 2.5);
});
