import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { calculateMulch, conversions } from "../construction/mulch-engine.js";

const ft = n => n * conversions.FT_TO_M;
const inch = n => n * conversions.IN_TO_M;
const bed10x10 = { shape: "rectangle", lengthM: ft(10), widthM: ft(10) };

test("100 ft² at the default 3 in depth is 25 ft³", () => {
  const r = calculateMulch({ beds: [bed10x10], wastePercent: 0 });
  approx(r.cubicFeet, 25);
  approx(r.cubicYards, 25 / 27);
  assert.equal(r.bags, 13); // 2 ft³ bags
  approx(r.coveragePerYardFt2, 108); // 27 ft³ / 0.25 ft
});

test("existing depth reduces applied depth; waste and prices apply", () => {
  const r = calculateMulch({
    beds: [bed10x10], targetDepthM: inch(3), existingDepthM: inch(1), wastePercent: 10,
    bulkPricePerYd3: 40, bagPrice: 4, bagSizeFt3: 2
  });
  approx(r.appliedDepthM, inch(2));
  approx(r.cubicFeet, (200 / 12) * 1.1);
  assert.equal(r.bags, Math.ceil((200 / 12) * 1.1 / 2));
  approx(r.bulkCost, (200 / 12) * 1.1 / 27 * 40);
  approx(r.costDifference, r.bagCost - r.bulkCost);
});

test("existing depth deeper than target gives zero volume", () => {
  const r = calculateMulch({ beds: [bed10x10], targetDepthM: inch(2), existingDepthM: inch(4) });
  approx(r.netVolumeM3, 0);
  assert.equal(r.bags, 0);
});

test("circle, tree-ring, triangle and quantity areas", () => {
  const r = calculateMulch({
    beds: [
      { shape: "circle", diameterM: 2 },
      { shape: "tree-ring", outerDiameterM: 2, innerDiameterM: 1 },
      { shape: "tree-ring", outerDiameterM: 1, innerDiameterM: 3 },
      { shape: "triangle", baseM: 4, heightM: 3 },
      { shape: "rectangle", lengthM: 1, widthM: 2, quantity: 3 }
    ]
  });
  approx(r.beds[0].areaM2, Math.PI);
  approx(r.beds[1].areaM2, Math.PI / 4 * 3);
  approx(r.beds[2].areaM2, 0);
  approx(r.beds[3].areaM2, 6);
  approx(r.beds[4].areaM2, 6);
  approx(r.totalAreaM2, Math.PI + 0.75 * Math.PI + 12);
});

test("density and prices are optional", () => {
  const r = calculateMulch({ beds: [bed10x10] });
  assert.equal(r.weightTonnes, null);
  assert.equal(r.bulkCost, null);
  assert.equal(r.costDifference, null);
  assert.equal(r.wastePercent, 5);
});
