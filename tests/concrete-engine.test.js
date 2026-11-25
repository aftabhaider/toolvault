import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import {
  calculateProject, calculateElement, cylindricalVolume, ringVolume,
  imperialPairToM, metresToImperialPair, FT_TO_M, IN_TO_M
} from "../construction/concrete-engine.js";

const slab10x10x4 = { shape: "slab", lengthM: 10 * FT_TO_M, widthM: 10 * FT_TO_M, depthM: 4 * IN_TO_M, quantity: 1 };

test("10 ft × 10 ft × 4 in slab is 100/3 ft³ (100/81 yd³)", () => {
  const r = calculateProject([slab10x10x4]);
  approx(r.ft3, 100 / 3, 1e-8);
  approx(r.yd3, 100 / 81, 1e-8);
  approx(r.litres, r.grossM3 * 1000);
});

test("waste, density, bag count and price per yd³", () => {
  const r = calculateProject([slab10x10x4], { wastePercent: 10, densityKgM3: 2400, bagYield: 0.6, bagYieldUnit: "ft3", price: 150, priceUnit: "yd3" });
  approx(r.grossM3, r.netM3 * 1.1);
  approx(r.weightKg, r.grossM3 * 2400);
  approx(r.weightTonnes, r.weightKg / 1000);
  assert.equal(r.bags, Math.ceil((110 / 3) / 0.6)); // 61.1 → 62
  approx(r.cost, (100 / 81) * 1.1 * 150, 1e-8);
});

test("no price or bag yield gives null cost and bags", () => {
  const r = calculateProject([slab10x10x4]);
  assert.equal(r.cost, null);
  assert.equal(r.bags, null);
});

test("cylinder and ring volumes; quantity multiplies", () => {
  approx(cylindricalVolume(1, 1), Math.PI / 4);
  approx(calculateElement({ shape: "round", diameterM: 0.3, heightM: 1.2, quantity: 4 }), 4 * Math.PI * 0.15 ** 2 * 1.2);
  approx(ringVolume(1, 0.6, 2), Math.PI / 4 * (1 - 0.36) * 2);
  approx(ringVolume(1, 1, 2), 0);
});

test("invalid elements throw", () => {
  assert.throws(() => ringVolume(0.5, 1, 1), /Inner diameter/);
  assert.throws(() => calculateElement({ shape: "pyramid" }), /Unsupported/);
});

test("imperial ↔ metric pair conversions round-trip", () => {
  approx(imperialPairToM(5, 6), 5.5 * FT_TO_M);
  const pair = metresToImperialPair(imperialPairToM(5, 6));
  assert.equal(pair.ft, 5);
  approx(pair.inches, 6);
});
