import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { calculateAcBtu, conversions, BTU_PER_TON } from "../calculators/ac-btu-engine.js";

const ft = n => n * 0.3048;

test("120 ft² room with defaults uses the 5,000 BTU chart row", () => {
  const r = calculateAcBtu({ lengthM: ft(12), widthM: ft(10) });
  assert.equal(r.ok, true);
  approx(r.areaSqFt, 120);
  assert.equal(r.chartBaseBTU, 5000);
  assert.equal(r.ceilingFactor, 1);
  assert.equal(r.recommendedBTU, 5000);
  approx(r.recommendedTons, 5000 / BTU_PER_TON);
});

test("sun, extra occupants and kitchen adjustments add up and round to next standard size", () => {
  const r = calculateAcBtu({ lengthM: ft(12), widthM: ft(10), sunExposure: "sunny", occupants: 4, kitchen: true });
  // 5000 × 1.10 + 2 × 600 + 4000 = 10,700 → next standard size 12,000
  approx(r.estimatedBTU, 10700);
  assert.equal(r.recommendedBTU, 12000);
});

test("ceilings above 8 ft scale capacity; lower ceilings do not reduce it", () => {
  const tall = calculateAcBtu({ lengthM: ft(12), widthM: ft(10), ceilingM: ft(10) });
  approx(tall.ceilingFactor, 1.25);
  approx(tall.estimatedBTU, 6250);
  assert.equal(tall.recommendedBTU, 7000);
  const low = calculateAcBtu({ lengthM: ft(12), widthM: ft(10), ceilingM: 2 });
  assert.equal(low.ceilingFactor, 1);
});

test("chart boundaries pick the correct row", () => {
  assert.equal(calculateAcBtu({ lengthM: ft(149), widthM: ft(1) }).chartBaseBTU, 5000);
  assert.equal(calculateAcBtu({ lengthM: ft(151), widthM: ft(1) }).chartBaseBTU, 6000);
  assert.equal(calculateAcBtu({ lengthM: ft(2499), widthM: ft(1) }).chartBaseBTU, 34000);
});

test("rooms beyond the chart and invalid dimensions are rejected", () => {
  const big = calculateAcBtu({ lengthM: ft(60), widthM: ft(50) });
  assert.equal(big.ok, false);
  assert.equal(big.reason, "area-too-large");
  assert.equal(calculateAcBtu({ lengthM: 0, widthM: 3 }).ok, false);
  assert.equal(calculateAcBtu({ lengthM: 3, widthM: -1 }).ok, false);
});

test("unit conversions are inverse", () => {
  approx(conversions.ftToM(conversions.mToFt(3.7)), 3.7);
  approx(conversions.ft2ToM2(conversions.m2ToFt2(42)), 42);
  approx(conversions.m2ToFt2(1), 10.763910416709722);
});
