/**
 * ToolVault Roof Pitch Calculator engine
 *
 * Pure roof-slope geometry. Inputs are normalized to a rise/run ratio.
 * No structural or building-code recommendation is made here.
 */

export function finitePositive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function normalizePitch({ mode="rise-run", rise=0, run=0, ratio=0, angleDeg=0, percent=0 } = {}) {
  let riseRun;

  if (mode === "ratio") {
    riseRun = Number(ratio) / 12;
  } else if (mode === "angle") {
    const angle = Number(angleDeg);
    riseRun = Math.tan((angle * Math.PI) / 180);
  } else if (mode === "percent") {
    riseRun = Number(percent) / 100;
  } else {
    const r = Number(rise);
    const d = Number(run);
    riseRun = d !== 0 ? r / d : NaN;
  }

  if (!Number.isFinite(riseRun) || riseRun < 0) {
    return { ok:false, error:"Enter valid non-negative roof slope values." };
  }

  const angleRadians = Math.atan(riseRun);
  const angleDegOut = angleRadians * 180 / Math.PI;
  const slopePercent = riseRun * 100;
  const pitchRisePer12 = riseRun * 12;
  const pitchMultiplier = Math.sqrt(1 + riseRun * riseRun);
  const rafterPerUnitRun = pitchMultiplier;

  return {
    ok:true,
    riseRun,
    pitchRisePer12,
    angleDeg:angleDegOut,
    slopePercent,
    pitchMultiplier,
    rafterPerUnitRun
  };
}

export function calculateRoofPitch(input = {}) {
  const base = normalizePitch(input);
  if (!base.ok) return base;

  const horizontalRun = finitePositive(input.horizontalRun);
  const rafterLength = horizontalRun > 0 ? horizontalRun * base.pitchMultiplier : 0;

  return {
    ...base,
    horizontalRun,
    rafterLength
  };
}
