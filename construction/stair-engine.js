/**
 * ToolVault Stair Calculator engine
 *
 * Straight-flight stair geometry only.
 * All calculations use the same displayed length unit; the UI handles
 * conversion between inches and millimetres before/after calculation.
 */

export function positive(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseFraction(value, fallback = 0) {
  if (typeof value === "number") return positive(value, fallback);
  const s = String(value ?? "").trim();
  if (!s) return fallback;

  const mixed = s.match(/^([+-]?\d+(?:\.\d+)?)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    return Number.isFinite(whole) && den > 0 ? Math.max(0, whole + num / den) : fallback;
  }

  const frac = s.match(/^([+-]?\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    return den > 0 ? Math.max(0, num / den) : fallback;
  }

  const n = Number(s.replace(/[″\"]/g, "").replace(/[′']/g, "").trim());
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

export const MM_PER_IN = 25.4;

export function inchesToMillimetres(value) {
  return Number(value) * MM_PER_IN;
}

export function millimetresToInches(value) {
  return Number(value) / MM_PER_IN;
}

function codeCheck(value, limit, comparator) {
  if (!(limit > 0)) return null;
  const epsilon = Math.max(Math.abs(limit) * 1e-12, 1e-9);
  const pass = comparator === "max"
    ? value <= limit + epsilon
    : value + epsilon >= limit;
  return { value, limit, pass, comparator };
}

export function calculateStairs(input = {}) {
  const totalRise = positive(input.totalRise);
  const targetRiser = positive(input.targetRiser, 7.5);
  const treadDepth = positive(input.treadDepth, 10);
  const requestedRisers = Math.max(0, Math.floor(positive(input.riserCountOverride, 0)));
  const availableRun = positive(input.availableRun, 0);
  const stairWidth = positive(input.stairWidth, 0);
  const stringerCount = Math.max(1, Math.floor(positive(input.stringerCount, 2) || 2));
  const wastePercent = Math.max(0, positive(input.wastePercent, 0));

  if (!(totalRise > 0)) return { ok: false, error: "Enter a total rise greater than zero." };
  if (!(treadDepth > 0)) return { ok: false, error: "Enter a tread depth greater than zero." };

  let risers;
  if (requestedRisers > 0) {
    risers = requestedRisers;
  } else if (targetRiser > 0) {
    risers = Math.max(1, Math.ceil(totalRise / targetRiser - 1e-12));
  } else {
    return { ok: false, error: "Enter a target riser height or a riser-count override." };
  }

  const actualRiser = totalRise / risers;
  const treads = Math.max(0, risers - 1);
  const totalRun = treads * treadDepth;
  const stairAngleRadians = Math.atan2(actualRiser, treadDepth);
  const stairAngleDegrees = stairAngleRadians * 180 / Math.PI;
  const stringerLength = Math.hypot(totalRise, totalRun);
  const stepDiagonal = Math.hypot(actualRiser, treadDepth);

  const comfortValue = (2 * actualRiser) + treadDepth;
  let comfortStatus = "outside common 24–25 range";
  if (comfortValue >= 24 && comfortValue <= 25) comfortStatus = "within common 24–25 range";

  const fit = availableRun > 0 ? {
    availableRun,
    totalRun,
    fits: totalRun <= availableRun + Math.max(availableRun * 1e-12, 1e-9),
    excess: Math.max(0, totalRun - availableRun),
    spare: Math.max(0, availableRun - totalRun)
  } : null;

  const code = {
    maxRiser: codeCheck(actualRiser, positive(input.maxRiser, 0), "max"),
    minTread: codeCheck(treadDepth, positive(input.minTread, 0), "min"),
    minWidth: codeCheck(stairWidth, positive(input.minWidth, 0), "min")
  };

  const allCodeChecksPresent = Object.values(code).some(Boolean);
  const codePass = allCodeChecksPresent
    ? Object.values(code).filter(Boolean).every(check => check.pass)
    : null;

  const totalStringerLengthBeforeWaste = stringerLength * stringerCount;
  const totalStringerLengthWithWaste = totalStringerLengthBeforeWaste * (1 + wastePercent / 100);
  const treadArea = stairWidth > 0 ? treads * treadDepth * stairWidth : null;
  const treadAreaWithWaste = treadArea == null ? null : treadArea * (1 + wastePercent / 100);

  return {
    ok: true,
    totalRise,
    targetRiser,
    requestedRisers,
    risers,
    actualRiser,
    treadDepth,
    treads,
    totalRun,
    stairAngleRadians,
    stairAngleDegrees,
    stringerLength,
    stepDiagonal,
    comfortValue,
    comfortStatus,
    fit,
    stairWidth,
    stringerCount,
    wastePercent,
    totalStringerLengthBeforeWaste,
    totalStringerLengthWithWaste,
    treadArea,
    treadAreaWithWaste,
    code,
    codePass
  };
}
