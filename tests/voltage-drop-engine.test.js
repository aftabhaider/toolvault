import { test } from "node:test";
import assert from "node:assert/strict";
import { approx } from "./helpers.js";
import {
  calculateVoltageDrop, maxLengthForDrop, minimumAreaForDrop,
  resistanceOhmPerMeter, awgAreaMm2, awgCircularMils
} from "../engineering/voltage-drop-engine.js";

const base = { sourceV: 230, currentA: 20, lengthM: 30, areaMm2: 2.5, material: "copper", system: "single" };

test("single-phase copper 2.5 mm², 20 A, 30 m at 230 V", () => {
  const r = calculateVoltageDrop(base);
  approx(r.rPerM, 1.724e-8 / 2.5e-6);
  approx(r.volts, 2 * 20 * 30 * 0.006896); // 8.2752 V
  approx(r.percent, 8.2752 / 230 * 100);
  approx(r.loadV, 230 - 8.2752);
  approx(r.powerLossW, 20 * 8.2752);
});

test("three-phase uses √3 and DC uses 2", () => {
  approx(calculateVoltageDrop({ ...base, system: "three" }).volts, Math.sqrt(3) * 20 * 30 * 0.006896);
  approx(calculateVoltageDrop({ ...base, system: "dc" }).volts, calculateVoltageDrop(base).volts);
});

test("aluminium and resistivity override", () => {
  approx(calculateVoltageDrop({ ...base, material: "aluminum" }).rPerM, 2.826e-8 / 2.5e-6);
  approx(resistanceOhmPerMeter({ material: "copper", areaMm2: 1, rhoOverride: 2e-8 }), 0.02);
});

test("energy loss per day", () => {
  const r = calculateVoltageDrop({ ...base, hoursPerDay: 5 });
  approx(r.energyLossKWhPerDay, r.powerLossW * 5 / 1000);
});

test("max length and minimum area are inverses of the drop calculation", () => {
  const { percent } = calculateVoltageDrop(base);
  approx(maxLengthForDrop({ ...base, targetPercent: percent }), 30);
  approx(minimumAreaForDrop({ ...base, targetPercent: percent }), 2.5);
  const three = { ...base, system: "three", material: "aluminum" };
  approx(maxLengthForDrop({ ...three, targetPercent: calculateVoltageDrop(three).percent }), 30);
});

test("AWG geometry matches published values", () => {
  approx(awgAreaMm2(10), 5.261, 1e-3);
  approx(awgAreaMm2(12), 3.309, 1e-3);
  approx(awgCircularMils(10), 10380, 1e-3);
  approx(awgCircularMils(-3), 211600, 1e-3); // 4/0 AWG
});

test("invalid inputs throw", () => {
  assert.throws(() => calculateVoltageDrop({ ...base, sourceV: 0 }), /Supply voltage/);
  assert.throws(() => calculateVoltageDrop({ ...base, currentA: 0 }), /current/);
  assert.throws(() => calculateVoltageDrop({ ...base, lengthM: 0 }), /length/);
  assert.throws(() => calculateVoltageDrop({ ...base, areaMm2: 0 }), /area/);
  assert.throws(() => calculateVoltageDrop({ ...base, system: "two" }), /Unsupported/);
  assert.throws(() => minimumAreaForDrop({ ...base, targetPercent: 0 }), /positive/);
});
