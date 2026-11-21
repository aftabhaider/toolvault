import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { calculateBoard, calculateProject, parseFraction, conversions } from "../construction/board-foot-engine.js";

test("a 2×4×8 ft board is 16/3 board feet", () => {
  const r = calculateBoard({ thicknessIn: 2, widthIn: 4, lengthFt: 8 });
  approx(r.bfPerBoard, 16 / 3);
  assert.equal(r.quantity, 1);
});

test("1 in × 12 in × 1 ft is exactly one board foot (144 in³)", () => {
  const r = calculateBoard({ thicknessIn: 1, widthIn: 12, lengthFt: 1 });
  approx(r.boardFeet, 1);
  approx(r.cubicFeet, 1 / 12);
  approx(r.cubicMeters, 144 * 0.0254 ** 3);
  approx(conversions.M3_PER_BF, 0.002359737216);
});

test("project totals apply quantity, waste and price", () => {
  const r = calculateProject({
    rows: [{ thicknessIn: 2, widthIn: 4, lengthFt: 8, quantity: 10 }, { thicknessIn: 1, widthIn: 6, lengthFt: 6, quantity: 4 }],
    wastePercent: 10,
    pricePerBF: 3
  });
  // 10 × 16/3 + 4 × 3 = 65.333… BF
  approx(r.rawBoardFeet, 160 / 3 + 12);
  approx(r.purchaseBoardFeet, (160 / 3 + 12) * 1.1);
  approx(r.cost, (160 / 3 + 12) * 1.1 * 3);
  assert.equal(r.totalPieces, 14);
  assert.equal(r.items[0].name, "Board 1");
});

test("no price gives null cost; negative dimensions are treated as zero", () => {
  assert.equal(calculateProject({ rows: [{ thicknessIn: 1, widthIn: 1, lengthFt: 1 }] }).cost, null);
  approx(calculateBoard({ thicknessIn: -2, widthIn: 4, lengthFt: 8 }).boardFeet, 0);
});

test("parseFraction reads fractions, mixed numbers and decimals", () => {
  approx(parseFraction("3/4"), 0.75);
  approx(parseFraction("1 1/2"), 1.5);
  approx(parseFraction("5 / 8"), 0.625);
  approx(parseFraction("2.25"), 2.25);
  approx(parseFraction(3), 3);
  assert.equal(parseFraction("", 7), 7);
  assert.equal(parseFraction("abc", 7), 7);
  assert.equal(parseFraction("1/0", 7), 7);
});
