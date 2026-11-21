import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { calculateStairs, parseFraction, inchesToMillimetres, millimetresToInches } from "../construction/stair-engine.js";

test("105 in rise at 7.5 in target gives exactly 14 risers", () => {
  const r = calculateStairs({ totalRise: 105, targetRiser: 7.5, treadDepth: 10 });
  assert.equal(r.ok, true);
  assert.equal(r.risers, 14);
  approx(r.actualRiser, 7.5);
  assert.equal(r.treads, 13);
  approx(r.totalRun, 130);
  approx(r.stringerLength, Math.hypot(105, 130));
  approx(r.comfortValue, 25);
  assert.equal(r.comfortStatus, "within common 24–25 range");
});

test("rise not divisible by target rounds risers up", () => {
  const r = calculateStairs({ totalRise: 108, targetRiser: 7.5, treadDepth: 10 });
  assert.equal(r.risers, 15);
  approx(r.actualRiser, 7.2);
});

test("riser override takes precedence", () => {
  const r = calculateStairs({ totalRise: 108, targetRiser: 7.5, treadDepth: 10, riserCountOverride: 16 });
  assert.equal(r.risers, 16);
  approx(r.actualRiser, 6.75);
});

test("available run fit check", () => {
  const short = calculateStairs({ totalRise: 105, treadDepth: 10, availableRun: 120 });
  assert.equal(short.fit.fits, false);
  approx(short.fit.excess, 10);
  const exact = calculateStairs({ totalRise: 105, treadDepth: 10, availableRun: 130 });
  assert.equal(exact.fit.fits, true);
  assert.equal(calculateStairs({ totalRise: 105, treadDepth: 10 }).fit, null);
});

test("code checks pass/fail and are null when no limits are given", () => {
  const r = calculateStairs({ totalRise: 105, treadDepth: 10, stairWidth: 36, maxRiser: 7.75, minTread: 11, minWidth: 36 });
  assert.equal(r.code.maxRiser.pass, true);
  assert.equal(r.code.minTread.pass, false);
  assert.equal(r.code.minWidth.pass, true);
  assert.equal(r.codePass, false);
  assert.equal(calculateStairs({ totalRise: 105, treadDepth: 10 }).codePass, null);
});

test("stringer and tread material totals include waste", () => {
  const r = calculateStairs({ totalRise: 105, treadDepth: 10, stairWidth: 36, stringerCount: 3, wastePercent: 10 });
  approx(r.totalStringerLengthWithWaste, Math.hypot(105, 130) * 3 * 1.1);
  approx(r.treadArea, 13 * 10 * 36);
  approx(r.treadAreaWithWaste, 13 * 10 * 36 * 1.1);
});

test("invalid inputs return errors", () => {
  assert.equal(calculateStairs({ totalRise: 0 }).ok, false);
  assert.equal(calculateStairs({ totalRise: 100, treadDepth: 0 }).ok, false);
  assert.equal(calculateStairs({ totalRise: 100, targetRiser: 0 }).ok, false);
});

test("fraction parsing and inch ↔ mm conversion", () => {
  approx(parseFraction("7 3/4"), 7.75);
  approx(parseFraction('10"'), 10);
  approx(parseFraction("-3/4"), 0);
  assert.equal(parseFraction("", 5), 5);
  approx(inchesToMillimetres(1), 25.4);
  approx(millimetresToInches(inchesToMillimetres(7.3)), 7.3);
});
