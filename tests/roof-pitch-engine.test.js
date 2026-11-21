import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import { normalizePitch, calculateRoofPitch } from "../construction/roof-pitch-engine.js";

test("6/12 pitch from rise and run", () => {
  const r = normalizePitch({ rise: 6, run: 12 });
  assert.equal(r.ok, true);
  approx(r.riseRun, 0.5);
  approx(r.angleDeg, Math.atan(0.5) * 180 / Math.PI);
  approx(r.angleDeg, 26.56505117707799);
  approx(r.slopePercent, 50);
  approx(r.pitchMultiplier, Math.sqrt(1.25));
});

test("ratio, angle and percent modes agree for a 12/12 roof", () => {
  for (const input of [{ mode: "ratio", ratio: 12 }, { mode: "angle", angleDeg: 45 }, { mode: "percent", percent: 100 }]) {
    const r = normalizePitch(input);
    approx(r.pitchRisePer12, 12, 1e-12);
    approx(r.angleDeg, 45, 1e-12);
  }
});

test("angle → pitch → angle round-trips", () => {
  const pitch = normalizePitch({ mode: "angle", angleDeg: 33.7 }).pitchRisePer12;
  approx(normalizePitch({ mode: "ratio", ratio: pitch }).angleDeg, 33.7);
});

test("rafter length = run × pitch multiplier", () => {
  const r = calculateRoofPitch({ rise: 6, run: 12, horizontalRun: 12 });
  approx(r.rafterLength, Math.hypot(6, 12));
  assert.equal(calculateRoofPitch({ rise: 6, run: 12 }).rafterLength, 0);
});

test("flat roofs are valid; zero run and negative slopes are rejected", () => {
  assert.equal(normalizePitch({ rise: 0, run: 12 }).angleDeg, 0);
  assert.equal(normalizePitch({ rise: 6, run: 0 }).ok, false);
  assert.equal(normalizePitch({ mode: "percent", percent: -10 }).ok, false);
  assert.equal(calculateRoofPitch({ mode: "ratio", ratio: "abc" }).ok, false);
});
