// ToolVault unit conversion engine.
// Every factor is an exact legal definition (international yard and pound
// agreement of 1959, US customary and UK imperial volume definitions), so
// conversions carry no rounding until display.

// Factor = how many base units in one of this unit.
// Bases: length m, mass kg, volume L. Temperature is handled separately.
export const UNITS = {
  // length (metre)
  mm: { kind: "length", factor: 0.001, name: "millimetre", plural: "millimetres", symbol: "mm" },
  cm: { kind: "length", factor: 0.01, name: "centimetre", plural: "centimetres", symbol: "cm" },
  m: { kind: "length", factor: 1, name: "metre", plural: "metres", symbol: "m" },
  km: { kind: "length", factor: 1000, name: "kilometre", plural: "kilometres", symbol: "km" },
  in: { kind: "length", factor: 0.0254, name: "inch", plural: "inches", symbol: "in" },
  ft: { kind: "length", factor: 0.3048, name: "foot", plural: "feet", symbol: "ft" },
  yd: { kind: "length", factor: 0.9144, name: "yard", plural: "yards", symbol: "yd" },
  mi: { kind: "length", factor: 1609.344, name: "mile", plural: "miles", symbol: "mi" },
  // mass (kilogram)
  g: { kind: "mass", factor: 0.001, name: "gram", plural: "grams", symbol: "g" },
  kg: { kind: "mass", factor: 1, name: "kilogram", plural: "kilograms", symbol: "kg" },
  oz: { kind: "mass", factor: 0.028349523125, name: "ounce", plural: "ounces", symbol: "oz" },
  lb: { kind: "mass", factor: 0.45359237, name: "pound", plural: "pounds", symbol: "lb" },
  st: { kind: "mass", factor: 6.35029318, name: "stone", plural: "stone", symbol: "st" },
  // volume (litre)
  ml: { kind: "volume", factor: 0.001, name: "millilitre", plural: "millilitres", symbol: "mL" },
  l: { kind: "volume", factor: 1, name: "litre", plural: "litres", symbol: "L" },
  usfloz: { kind: "volume", factor: 0.0295735295625, name: "US fluid ounce", plural: "US fluid ounces", symbol: "US fl oz" },
  ukfloz: { kind: "volume", factor: 0.0284130625, name: "UK fluid ounce", plural: "UK fluid ounces", symbol: "UK fl oz" },
  uscup: { kind: "volume", factor: 0.2365882365, name: "US cup", plural: "US cups", symbol: "US cup" },
  usgal: { kind: "volume", factor: 3.785411784, name: "US gallon", plural: "US gallons", symbol: "US gal" },
  ukgal: { kind: "volume", factor: 4.54609, name: "UK gallon", plural: "UK gallons", symbol: "UK gal" },
  // temperature (affine; see toKelvin/fromKelvin)
  c: { kind: "temperature", name: "degree Celsius", plural: "degrees Celsius", symbol: "°C" },
  f: { kind: "temperature", name: "degree Fahrenheit", plural: "degrees Fahrenheit", symbol: "°F" },
  k: { kind: "temperature", name: "kelvin", plural: "kelvins", symbol: "K" },
};

function toKelvin(value, unit) {
  if (unit === "c") return value + 273.15;
  if (unit === "f") return (value - 32) * 5 / 9 + 273.15;
  return value;
}
function fromKelvin(kelvin, unit) {
  if (unit === "c") return kelvin - 273.15;
  if (unit === "f") return (kelvin - 273.15) * 9 / 5 + 32;
  return kelvin;
}

export function convert(value, from, to) {
  const a = UNITS[from], b = UNITS[to];
  if (!a || !b) throw new Error(`Unknown unit: ${!a ? from : to}`);
  if (a.kind !== b.kind) throw new Error(`Cannot convert ${a.kind} to ${b.kind}`);
  const v = Number(value);
  if (!Number.isFinite(v)) return NaN;
  if (from === to) return v;
  if (a.kind === "temperature") {
    // Direct formulas for the common pair avoid the 273.15 round trip.
    if (from === "c" && to === "f") return v * 9 / 5 + 32;
    if (from === "f" && to === "c") return (v - 32) * 5 / 9;
    return fromKelvin(toKelvin(v, from), to);
  }
  return v * a.factor / b.factor;
}

// Ratio "1 from = x to" for linear units (used in formulas on the pages).
export function factor(from, to) {
  if (UNITS[from].kind === "temperature") throw new Error("Temperature conversion is not a simple ratio");
  return UNITS[from].factor / UNITS[to].factor;
}

// Total height/length from feet + inches, in centimetres, and back.
export function feetInchesToCm(feet, inches) {
  return (Number(feet || 0) * 12 + Number(inches || 0)) * 2.54;
}
export function cmToFeetInches(cm) {
  const totalIn = Number(cm) / 2.54;
  let feet = Math.floor(totalIn / 12);
  let inches = totalIn - feet * 12;
  // Avoid "5 ft 12 in" after rounding the inches for display.
  if (inches > 11.995) { feet += 1; inches = 0; }
  return { feet, inches, totalInches: totalIn };
}

// Display helper: up to `digits` decimals, trailing zeros removed, no
// scientific notation for everyday magnitudes.
export function formatNumber(value, digits = 4) {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toFixed(digits));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: digits, useGrouping: Math.abs(rounded) >= 10000 });
}
