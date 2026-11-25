import assert from "node:assert/strict";

// Compare floating-point results with a relative tolerance (absolute near zero).
export function approx(actual, expected, tolerance = 1e-9, message) {
  const scale = Math.max(1, Math.abs(expected));
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance * scale,
    message ?? `expected ${actual} ≈ ${expected} (tolerance ${tolerance})`
  );
}
