// Generates the /converters/*.html pages from the definitions below.
// Every number on the pages (default values, charts, examples) is computed
// with converters/convert-engine.js, the same code the live converter runs.
//
//   node scripts/converters.mjs          (part of npm run seo)
//   node scripts/converters.mjs --check  (exit 1 if a page is out of date)
//
// Only the regions between <!-- tv:conv-head --> and <!-- tv:conv --> markers
// are written; scripts/layout.py and scripts/seo.py own the rest of the page.

import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { UNITS, convert, feetInchesToCm, cmToFeetInches, formatNumber } from "../converters/convert-engine.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://toolvault.aftabjordan1.workers.dev";
const ROBOTS = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f = (v, d = 4) => formatNumber(v, d);
const sym = u => UNITS[u].symbol;

// Nearest 1/16 inch, as builders and machinists read a tape measure.
function sixteenths(inches) {
  const n = Math.round(inches * 16), whole = Math.floor(n / 16);
  let num = n - whole * 16, den = 16;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  if (!num) return `${whole}″`;
  return `${whole ? whole + " " : ""}${num}/${den}″`;
}

export const PAGES = [
  {
    slug: "cm-to-inches", from: "cm", to: "in", icon: "units", def: 30,
    title: "CM to Inches Converter (cm to in) – Free & Exact",
    h1: "CM to Inches Converter",
    menu: "Centimetres ↔ inches", keywords: "cm to inches centimeters to inches inches to cm convert length",
    description: "Convert centimetres to inches and inches to cm instantly. Uses the exact definition 1 in = 2.54 cm, with a cm to inches chart, formula and worked example.",
    intro: "Type a value in either box to convert between centimetres and inches. One inch is defined as exactly 2.54 centimetres, so the result is exact before rounding for display.",
    formula: ["inches = centimetres ÷ 2.54", "centimetres = inches × 2.54"],
    example: () => `To convert 30 cm to inches, divide by 2.54: 30 ÷ 2.54 = ${f(convert(30, "cm", "in"))} in. To go back, multiply: 12 in × 2.54 = ${f(convert(12, "in", "cm"))} cm.`,
    table: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200],
    reverse: [0.25, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24, 36, 48, 60, 72],
    units: [["Centimetre (cm)", "One hundredth of a metre, the SI unit of length. Used for everyday lengths and body measurements in most of the world."],
            ["Inch (in, ″)", "Defined since the 1959 international yard and pound agreement as exactly 2.54 cm. Used in the US and, informally, in the UK for heights, screens and DIY."]],
    faq: [["How many inches are in a centimetre?", `One centimetre is ${f(convert(1, "cm", "in"), 5)} inches (1 ÷ 2.54).`],
          ["How many centimetres are in an inch?", "Exactly 2.54 centimetres. This is a legal definition, not a rounded measurement, so 1 in = 2.54 cm with no error."],
          ["How do I convert cm to feet and inches?", "Divide the centimetres by 30.48 to get feet; the whole number is the feet. Convert the remainder back to inches by dividing it by 2.54. For heights, use the height converter linked below, which does both steps."],
          ["How do I convert 100 cm to inches?", `100 ÷ 2.54 = ${f(convert(100, "cm", "in"))} inches, or about 39 3/8 inches.`]],
    related: ["mm-to-inches", "feet-and-inches-to-cm", "feet-to-meters", "kg-to-lbs"],
  },
  {
    slug: "mm-to-inches", from: "mm", to: "in", icon: "units", def: 10,
    title: "MM to Inches Converter with Fractions (mm to in)",
    h1: "MM to Inches Converter",
    menu: "Millimetres ↔ inches", keywords: "mm to inches millimeters to inches inches to mm fraction 1/16",
    description: "Convert millimetres to inches and inches to mm. Exact (1 in = 25.4 mm), with a chart that also shows the nearest 1/16-inch fraction for tape measures and drill bits.",
    intro: "Convert millimetres to decimal inches, or inches back to millimetres. The chart below also gives the nearest 1/16 inch, the fraction you read on an imperial tape measure.",
    formula: ["inches = millimetres ÷ 25.4", "millimetres = inches × 25.4"],
    example: () => `A 19 mm board is 19 ÷ 25.4 = ${f(convert(19, "mm", "in"))} in, which is ${sixteenths(convert(19, "mm", "in"))} to the nearest 1/16 inch.`,
    table: [1, 2, 3, 4, 5, 6, 8, 10, 12, 13, 15, 16, 18, 19, 20, 22, 25, 30, 32, 35, 40, 45, 50, 75, 100], fractions: true,
    reverse: [0.0625, 0.125, 0.1875, 0.25, 0.3125, 0.375, 0.5, 0.625, 0.75, 0.875, 1, 1.5, 2, 3, 4, 6, 12],
    units: [["Millimetre (mm)", "One thousandth of a metre. The standard unit on engineering drawings, tools and building products outside the US."],
            ["Inch (in, ″)", "Exactly 25.4 mm. US tape measures divide it into halves, quarters, eighths and sixteenths."]],
    faq: [["How many mm are in an inch?", "Exactly 25.4 millimetres."],
          ["How do I convert mm to a fraction of an inch?", "Divide by 25.4 to get decimal inches, multiply the decimal part by 16 and round to the nearest whole number; that is the number of sixteenths. Simplify the fraction where you can (8/16 = 1/2)."],
          ["What is 1/8 inch in mm?", "1/8 in = 0.125 × 25.4 = 3.175 mm."],
          ["Is 10 mm the same as 3/8 inch?", `Not exactly: 10 mm is ${f(convert(10, "mm", "in"))} in, while 3/8 in is 9.525 mm. They are often used interchangeably for tools, but check the fit for precise work.`]],
    related: ["cm-to-inches", "feet-and-inches-to-cm", "feet-to-meters", "grams-to-ounces"],
  },
  {
    slug: "feet-and-inches-to-cm", from: "ft", to: "cm", icon: "height", converter: "height",
    title: "Height Converter: Feet and Inches to CM (and CM to Feet)",
    h1: "Height Converter: Feet and Inches to CM",
    menu: "Height: feet and inches ↔ cm", keywords: "feet and inches to cm height converter cm to feet ft to cm 5 foot 7 in cm",
    description: "Convert height in feet and inches to centimetres, or cm to feet and inches. Exact conversion with a height chart from 4′10″ to 6′8″.",
    intro: "Enter feet and inches to get centimetres, or type centimetres to get feet and inches. Heights are converted with the exact definitions 1 ft = 12 in and 1 in = 2.54 cm.",
    formula: ["cm = (feet × 12 + inches) × 2.54", "total inches = cm ÷ 2.54; feet = whole part of (total inches ÷ 12); inches = the remainder"],
    example: () => `5 ft 7 in is 5 × 12 + 7 = 67 inches, and 67 × 2.54 = ${f(feetInchesToCm(5, 7), 2)} cm. In the other direction, 180 cm ÷ 2.54 = ${f(180 / 2.54, 2)} in = ${cmToFeetInches(180).feet} ft ${f(cmToFeetInches(180).inches, 1)} in.`,
    heightTable: true,
    units: [["Feet and inches", "1 foot = 12 inches = 30.48 cm. Height is usually written 5′ 7″ or 5 ft 7 in in the US and UK."],
            ["Centimetre (cm)", "Used for height on passports, medical records and clothing sizes in most countries."]],
    faq: [["How tall is 5 foot 7 in cm?", `5′ 7″ is ${f(feetInchesToCm(5, 7), 2)} cm.`],
          ["What is 170 cm in feet and inches?", `170 cm is ${cmToFeetInches(170).feet} ft ${f(cmToFeetInches(170).inches, 1)} in.`],
          ["How many cm is 6 feet?", `6 feet is exactly ${f(feetInchesToCm(6, 0), 2)} cm.`],
          ["Why is my converted height a decimal?", "Centimetres do not divide evenly into inches (1 in = 2.54 cm), so most heights convert to a decimal. Round to the nearest whole centimetre or half inch for everyday use."]],
    related: ["cm-to-inches", "feet-to-meters", "kg-to-lbs", "mm-to-inches"],
  },
  {
    slug: "feet-to-meters", from: "ft", to: "m", icon: "units", def: 10,
    title: "Feet to Meters Converter (ft to m) – Exact",
    h1: "Feet to Meters Converter",
    menu: "Feet ↔ metres", keywords: "feet to meters ft to m meters to feet metres to feet convert",
    description: "Convert feet to metres and metres to feet. Exact (1 ft = 0.3048 m), with a feet to meters chart, the formula and a worked example.",
    intro: "Convert feet to metres or metres to feet. One foot is exactly 0.3048 metres, so one metre is about 3.28084 feet.",
    formula: ["metres = feet × 0.3048", "feet = metres ÷ 0.3048 (≈ metres × 3.28084)"],
    example: () => `A 12 ft room is 12 × 0.3048 = ${f(convert(12, "ft", "m"))} m long. A 5 m length is 5 ÷ 0.3048 = ${f(convert(5, "m", "ft"))} ft.`,
    table: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100, 500, 1000],
    reverse: [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20, 50, 100],
    units: [["Foot (ft, ′)", "Exactly 0.3048 m, or 12 inches. Used for room sizes, heights and altitudes in the US and in aviation worldwide."],
            ["Metre (m)", "The SI base unit of length, used for distances and building dimensions almost everywhere outside the US."]],
    faq: [["How many metres are in a foot?", "Exactly 0.3048 metres."],
          ["How many feet are in a metre?", `One metre is ${f(convert(1, "m", "ft"), 5)} feet.`],
          ["How do I convert square feet to square metres?", "Multiply square feet by 0.09290304 (that is 0.3048 squared). For room areas, use the square footage calculator."],
          ["Is 3 feet a metre?", `No. 3 ft is ${f(convert(3, "ft", "m"))} m, about 8.6 cm short of a metre.`]],
    related: ["cm-to-inches", "miles-to-km", "feet-and-inches-to-cm", "mm-to-inches"],
  },
  {
    slug: "miles-to-km", from: "mi", to: "km", icon: "route", def: 10,
    title: "Miles to KM Converter (mi to km) – Exact",
    h1: "Miles to Kilometres Converter",
    menu: "Miles ↔ kilometres", keywords: "miles to km mi to km km to miles kilometers to miles distance running pace",
    description: "Convert miles to kilometres and km to miles. Exact (1 mile = 1.609344 km), with a chart including 5K, 10K, half marathon and marathon distances.",
    intro: "Convert miles to kilometres or kilometres to miles. The international mile is exactly 1.609344 km.",
    formula: ["kilometres = miles × 1.609344", "miles = kilometres ÷ 1.609344 (≈ km × 0.621371)"],
    example: () => `A 60 mph speed limit is 60 × 1.609344 = ${f(convert(60, "mi", "km"), 2)} km/h. A 10 km run is 10 ÷ 1.609344 = ${f(convert(10, "km", "mi"), 3)} miles.`,
    table: [1, 2, 3, 5, 10, 15, 20, 25, 26.2, 30, 40, 50, 60, 70, 100, 200, 500],
    reverse: [1, 3, 5, 10, 15, 20, 21.0975, 25, 42.195, 50, 80, 100, 120, 200, 500],
    reverseLabels: { 5: "5 (5K)", 10: "10 (10K)", 21.0975: "21.0975 (half marathon)", 42.195: "42.195 (marathon)" },
    units: [["Mile (mi)", "The international (statute) mile is exactly 1,609.344 m, or 5,280 ft. Road distances and speed limits in the US and UK use miles."],
            ["Kilometre (km)", "1,000 m. Used for road distances in most other countries and for race distances (5K, 10K)."]],
    faq: [["How many km are in a mile?", "Exactly 1.609344 kilometres."],
          ["How many miles is 5K?", `${f(convert(5, "km", "mi"), 3)} miles.`],
          ["How far is a marathon in miles?", `The official marathon distance is 42.195 km, which is ${f(convert(42.195, "km", "mi"), 3)} miles (usually quoted as 26.2).`],
          ["Is a nautical mile the same?", "No. A nautical mile is exactly 1.852 km, used at sea and in aviation. This converter uses the statute mile used on roads."]],
    related: ["feet-to-meters", "kg-to-lbs", "liters-to-gallons", "cm-to-inches"],
  },
  {
    slug: "kg-to-lbs", from: "kg", to: "lb", icon: "scale", def: 70,
    title: "KG to LBS Converter (kilograms to pounds) – Exact",
    h1: "KG to LBS Converter",
    menu: "Kilograms ↔ pounds", keywords: "kg to lbs kilograms to pounds lbs to kg pounds to kg weight stone",
    description: "Convert kilograms to pounds and lbs to kg. Exact (1 lb = 0.45359237 kg), with a kg to lbs chart, stones and pounds for UK weights, and the formula.",
    intro: "Convert kilograms to pounds or pounds to kilograms. The pound is defined as exactly 0.45359237 kg, so 1 kg is about 2.20462 lb.",
    formula: ["pounds = kilograms ÷ 0.45359237 (≈ kg × 2.20462)", "kilograms = pounds × 0.45359237"],
    example: () => {
      const lb = convert(70, "kg", "lb"), st = Math.floor(lb / 14);
      return `70 kg ÷ 0.45359237 = ${f(lb, 2)} lb. In UK stones and pounds that is ${st} st ${f(lb - st * 14, 1)} lb (1 stone = 14 lb).`;
    },
    table: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 120, 150], stones: true,
    reverse: [1, 2, 5, 10, 20, 25, 50, 100, 120, 130, 140, 150, 160, 170, 180, 190, 200, 220, 250, 300],
    units: [["Kilogram (kg)", "The SI unit of mass, used for body weight and goods in most of the world."],
            ["Pound (lb)", "Exactly 0.45359237 kg (avoirdupois pound). Used for body weight in the US; UK weights are often given in stones and pounds."]],
    faq: [["How many pounds are in a kilogram?", `One kilogram is ${f(convert(1, "kg", "lb"), 5)} pounds.`],
          ["How many kg is 1 pound?", "Exactly 0.45359237 kg, about 454 grams."],
          ["What is 70 kg in stone?", `70 kg is ${f(convert(70, "kg", "st"), 3)} stone, or ${Math.floor(convert(70, "kg", "lb") / 14)} st ${f(convert(70, "kg", "lb") - Math.floor(convert(70, "kg", "lb") / 14) * 14, 1)} lb.`],
          ["Why is pounds written as lbs?", "“lb” comes from the Latin libra. “lbs” is a common informal plural; both mean the same unit."]],
    related: ["grams-to-ounces", "feet-and-inches-to-cm", "liters-to-gallons", "celsius-to-fahrenheit"],
  },
  {
    slug: "grams-to-ounces", from: "g", to: "oz", icon: "scale", def: 100,
    title: "Grams to Ounces Converter (g to oz) for Cooking & Weight",
    h1: "Grams to Ounces Converter",
    menu: "Grams ↔ ounces", keywords: "grams to ounces g to oz ounces to grams cooking baking weight",
    description: "Convert grams to ounces and ounces to grams for cooking and weighing. Exact (1 oz = 28.349523125 g), with a kitchen conversion chart.",
    intro: "Convert grams to ounces or ounces to grams. This is the weight ounce (avoirdupois), used for food and parcels; for liquids, use the ml to fl oz converter.",
    formula: ["ounces = grams ÷ 28.349523125", "grams = ounces × 28.349523125"],
    example: () => `250 g of flour is 250 ÷ 28.349523125 = ${f(convert(250, "g", "oz"), 2)} oz. An 8 oz steak is 8 × 28.349523125 = ${f(convert(8, "oz", "g"), 1)} g.`,
    table: [1, 5, 10, 15, 20, 25, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 454, 500, 750, 1000],
    reverse: [0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32],
    units: [["Gram (g)", "One thousandth of a kilogram. Recipes outside the US weigh dry ingredients in grams."],
            ["Ounce (oz)", "The avoirdupois ounce is exactly 28.349523125 g; 16 oz = 1 lb. Not the same as a fluid ounce (volume) or a troy ounce (31.1035 g, used for precious metals)."]],
    faq: [["How many grams are in an ounce?", "Exactly 28.349523125 grams, usually rounded to 28.35 g (or 28 g in recipes)."],
          ["How many ounces is 100 grams?", `${f(convert(100, "g", "oz"), 3)} ounces.`],
          ["Is a fluid ounce the same as an ounce?", "No. A fluid ounce measures volume; an ounce measures weight. One US fl oz of water weighs about 1.04 oz. Use the ml to fl oz converter for liquids."],
          ["How many grams are in a pound?", "453.59237 grams (16 × 28.349523125)."]],
    related: ["kg-to-lbs", "ml-to-oz", "celsius-to-fahrenheit", "liters-to-gallons"],
  },
  {
    slug: "ml-to-oz", from: "ml", to: "usfloz", options: ["usfloz", "ukfloz"], icon: "drop", def: 250,
    title: "ML to OZ Converter (ml to fl oz, US & UK)",
    h1: "ML to OZ Converter",
    menu: "Millilitres ↔ fluid ounces", keywords: "ml to oz ml to fl oz oz to ml fluid ounces milliliters us uk cups",
    description: "Convert millilitres to fluid ounces and fl oz to ml, in US or UK fluid ounces. Exact definitions, with a chart for drinks, cooking and bottles.",
    intro: "Convert millilitres to fluid ounces or back. Choose US or UK fluid ounces: they differ by about 4%, so the right choice matters for recipes and medicine.",
    formula: ["US fl oz = ml ÷ 29.5735295625", "UK fl oz = ml ÷ 28.4130625"],
    example: () => `A 330 ml can is 330 ÷ 29.5735 = ${f(convert(330, "ml", "usfloz"), 2)} US fl oz, or 330 ÷ 28.4131 = ${f(convert(330, "ml", "ukfloz"), 2)} UK fl oz.`,
    table: [1, 5, 10, 15, 30, 50, 60, 100, 120, 150, 200, 240, 250, 300, 330, 355, 375, 500, 750, 1000], dual: ["usfloz", "ukfloz"],
    reverse: [0.5, 1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24, 32, 64],
    units: [["Millilitre (mL)", "One thousandth of a litre (1 cm³). Used on bottles, cans and medicine worldwide."],
            ["Fluid ounce (fl oz)", "US: exactly 29.5735295625 mL (1/128 US gallon). UK: exactly 28.4130625 mL (1/160 imperial gallon)."]],
    faq: [["How many ml are in a fluid ounce?", "29.5735 mL in a US fluid ounce and 28.4131 mL in a UK fluid ounce."],
          ["How many ounces is 500 ml?", `${f(convert(500, "ml", "usfloz"), 2)} US fl oz, or ${f(convert(500, "ml", "ukfloz"), 2)} UK fl oz.`],
          ["Why do US nutrition labels say 1 fl oz = 30 mL?", "US food labelling rules round the fluid ounce to 30 mL for nutrition panels. The exact US fluid ounce is 29.5735 mL; the difference matters only for precise measurement."],
          ["How many ml is a cup?", "A US cup is 236.588 mL (8 US fl oz). Metric cups in Australia, Canada and the UK are often 250 mL."]],
    related: ["liters-to-gallons", "grams-to-ounces", "celsius-to-fahrenheit", "kg-to-lbs"],
  },
  {
    slug: "liters-to-gallons", from: "l", to: "usgal", options: ["usgal", "ukgal"], icon: "drop", def: 10,
    title: "Liters to Gallons Converter (L to gal, US & UK)",
    h1: "Liters to Gallons Converter",
    menu: "Litres ↔ gallons", keywords: "liters to gallons litres to gallons gallons to liters us uk imperial fuel",
    description: "Convert litres to gallons and gallons to litres, in US or UK (imperial) gallons. Exact definitions, with a chart for fuel, water tanks and paint.",
    intro: "Convert litres to gallons or gallons to litres. A US gallon (3.785 L) is smaller than a UK imperial gallon (4.546 L); choose the one you need.",
    formula: ["US gallons = litres ÷ 3.785411784", "UK gallons = litres ÷ 4.54609"],
    example: () => `A 50 L fuel tank holds 50 ÷ 3.785411784 = ${f(convert(50, "l", "usgal"), 2)} US gallons, or 50 ÷ 4.54609 = ${f(convert(50, "l", "ukgal"), 2)} UK gallons.`,
    table: [1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 200, 500, 1000], dual: ["usgal", "ukgal"],
    reverse: [0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 55, 100],
    units: [["Litre (L)", "1,000 cm³. Used for fuel, drinks and tank sizes in most countries."],
            ["Gallon (gal)", "US gallon: exactly 3.785411784 L (231 cubic inches). UK imperial gallon: exactly 4.54609 L. UK fuel economy (mpg) uses imperial gallons."]],
    faq: [["How many litres are in a gallon?", "3.785 L in a US gallon and 4.546 L in a UK (imperial) gallon."],
          ["How many gallons is 1 litre?", `${f(convert(1, "l", "usgal"), 4)} US gallons or ${f(convert(1, "l", "ukgal"), 4)} UK gallons.`],
          ["Why are US and UK gallons different?", "The US kept the old English wine gallon (231 in³); Britain redefined its gallon in 1824 as the volume of 10 lb of water. The two have been different ever since."],
          ["How many litres is a 55-gallon drum?", `A 55 US gallon drum holds ${f(convert(55, "usgal", "l"), 1)} L.`]],
    related: ["ml-to-oz", "miles-to-km", "kg-to-lbs", "celsius-to-fahrenheit"],
  },
  {
    slug: "celsius-to-fahrenheit", from: "c", to: "f", icon: "thermo", def: 25,
    title: "Celsius to Fahrenheit Converter (°C to °F) – with Chart",
    h1: "Celsius to Fahrenheit Converter",
    menu: "Celsius ↔ Fahrenheit", keywords: "celsius to fahrenheit c to f fahrenheit to celsius temperature oven body",
    description: "Convert Celsius to Fahrenheit and °F to °C. Exact formula (°F = °C × 9/5 + 32), with charts for weather, body temperature and oven settings.",
    intro: "Convert Celsius to Fahrenheit or Fahrenheit to Celsius. Unlike length or weight, temperature needs an offset as well as a ratio, so use the full formula, not a single factor.",
    formula: ["°F = °C × 9/5 + 32", "°C = (°F − 32) × 5/9"],
    example: () => `25 °C × 9/5 = 45, and 45 + 32 = ${f(convert(25, "c", "f"))} °F. An oven at 350 °F is (350 − 32) × 5/9 = ${f(convert(350, "f", "c"), 1)} °C.`,
    table: [-40, -30, -20, -10, -5, 0, 5, 10, 15, 18, 20, 22, 25, 30, 35, 37, 40, 50, 60, 100, 150, 160, 180, 200, 220, 250],
    reverse: [-40, 0, 10, 20, 32, 40, 50, 60, 68, 70, 72, 75, 80, 90, 98.6, 100, 212, 300, 325, 350, 375, 400, 425, 450],
    units: [["Degree Celsius (°C)", "Water freezes at 0 °C and boils at 100 °C at sea level. Used for weather and cooking almost everywhere outside the US."],
            ["Degree Fahrenheit (°F)", "Water freezes at 32 °F and boils at 212 °F. Used for weather, ovens and body temperature in the US."]],
    faq: [["What is 37 °C in Fahrenheit?", `${f(convert(37, "c", "f"), 1)} °F, normal body temperature.`],
          ["At what temperature are Celsius and Fahrenheit equal?", "−40. −40 °C is exactly −40 °F."],
          ["Is there a quick way to estimate °F from °C?", "Double the Celsius figure and add 30. It is close for everyday weather (20 °C → 70 °F, exact 68 °F) but drifts further off at oven temperatures, so use the exact formula for cooking."],
          ["What is 180 °C in Fahrenheit for baking?", `${f(convert(180, "c", "f"))} °F, often written as 350 °F on US recipes.`]],
    related: ["grams-to-ounces", "ml-to-oz", "kg-to-lbs", "liters-to-gallons"],
  },
];

// ------------------------------------------------------------------ rendering

const unitName = (u, plural = true) => (plural ? UNITS[u].plural : UNITS[u].name);
const cap = s => s[0].toUpperCase() + s.slice(1);

function widget(p) {
  if (p.converter === "height") {
    const cm = feetInchesToCm(5, 7);
    return `<div class="tv-conv" data-converter="height">
<div class="tv-conv-row tv-conv-height"><div class="tv-conv-field"><label for="conv-ft">Feet</label><div class="tv-conv-input"><input id="conv-ft" data-side="ft" type="number" inputmode="decimal" value="5" min="0" step="1"><span>ft</span></div></div>
<div class="tv-conv-field"><label for="conv-in">Inches</label><div class="tv-conv-input"><input id="conv-in" data-side="in" type="number" inputmode="decimal" value="7" min="0" step="any"><span>in</span></div></div>
<span class="tv-conv-eq" aria-hidden="true">=</span>
<div class="tv-conv-field"><label for="conv-cm">Centimetres</label><div class="tv-conv-input"><input id="conv-cm" data-side="cm" type="number" inputmode="decimal" value="${f(cm, 6)}" step="any"><span>cm</span></div></div></div>
<p class="tv-conv-out" data-result aria-live="polite">5 ft 7 in = ${f(cm, 6)} cm</p></div>`;
  }
  const to = p.to, def = p.def, res = convert(def, p.from, to);
  const right = p.options
    ? `<select id="conv-b-unit" data-unit-b aria-label="Target unit">${p.options.map(o => `<option value="${o}"${o === to ? " selected" : ""}>${esc(sym(o))}</option>`).join("")}</select>`
    : `<span>${esc(sym(to))}</span>`;
  return `<div class="tv-conv" data-converter="linear" data-from="${p.from}" data-to="${to}">
<div class="tv-conv-row"><div class="tv-conv-field"><label for="conv-a">${esc(cap(unitName(p.from)))}</label><div class="tv-conv-input"><input id="conv-a" data-side="a" type="number" inputmode="decimal" value="${def}" step="any"><span>${esc(sym(p.from))}</span></div></div>
<span class="tv-conv-eq" aria-hidden="true">=</span>
<div class="tv-conv-field"><label for="conv-b">${esc(cap(p.options ? unitName(to).replace(/^US /, "") : unitName(to)))}</label><div class="tv-conv-input"><input id="conv-b" data-side="b" type="number" inputmode="decimal" value="${f(res, 6).replace(/,/g, "")}" step="any">${right}</div></div></div>
<p class="tv-conv-out" data-result aria-live="polite">${f(def, 6)} ${esc(sym(p.from))} = ${f(res, 6)} ${esc(sym(to))}</p></div>`;
}

function chart(p) {
  if (p.heightTable) {
    const rows = [];
    for (let total = 58; total <= 80; total++) {
      const ft = Math.floor(total / 12), inch = total % 12;
      rows.push(`<tr><td>${ft}′ ${inch}″</td><td>${f(feetInchesToCm(ft, inch), 1)} cm</td></tr>`);
    }
    const back = [];
    for (let cm = 145; cm <= 205; cm += 5) {
      const h = cmToFeetInches(cm);
      back.push(`<tr><td>${cm} cm</td><td>${h.feet}′ ${f(h.inches, 1)}″</td></tr>`);
    }
    return `<h2>Height chart: feet and inches to cm</h2><div class="tv-table-wrap"><table class="tv-table"><thead><tr><th>Height</th><th>Centimetres</th></tr></thead><tbody>${rows.join("")}</tbody></table></div>
<h2>Height chart: cm to feet and inches</h2><div class="tv-table-wrap"><table class="tv-table"><thead><tr><th>Centimetres</th><th>Feet and inches</th></tr></thead><tbody>${back.join("")}</tbody></table></div>`;
  }
  const targets = p.dual || [p.to];
  const colName = t => (targets.length > 1 ? sym(t) : `${cap(unitName(t))} (${sym(t)})`);
  const head = `<tr><th>${esc(cap(unitName(p.from)))} (${esc(sym(p.from))})</th>${targets.map(t => `<th>${esc(colName(t))}</th>`).join("")}${p.fractions ? "<th>Nearest 1/16 in</th>" : ""}${p.stones ? "<th>Stones and pounds</th>" : ""}</tr>`;
  const rows = p.table.map(v => {
    const cells = targets.map(t => `<td>${f(convert(v, p.from, t))}</td>`).join("");
    let extra = "";
    if (p.fractions) extra = `<td>${sixteenths(convert(v, p.from, "in"))}</td>`;
    if (p.stones) { const lb = convert(v, p.from, "lb"), st = Math.floor(lb / 14); extra = `<td>${st} st ${f(lb - st * 14, 1)} lb</td>`; }
    return `<tr><td>${f(v)} ${esc(sym(p.from))}</td>${cells}${extra}</tr>`;
  }).join("");
  const toName = p.options ? unitName(p.to).replace(/^US /, "") : unitName(p.to);
  let revHead, revRows;
  if (targets.length > 1) {
    // Same count of US and UK units side by side, e.g. "8 fl oz | 236.6 mL (US) | 227.3 mL (UK)".
    revHead = `<tr><th>${esc(cap(toName))}</th>${targets.map(t => `<th>${esc(sym(p.from))} (${t.startsWith("us") ? "US" : "UK"})</th>`).join("")}</tr>`;
    revRows = p.reverse.map(v => `<tr><td>${f(v)}</td>${targets.map(t => `<td>${f(convert(v, t, p.from))}</td>`).join("")}</tr>`).join("");
  } else {
    revHead = `<tr><th>${esc(cap(toName))} (${esc(sym(p.to))})</th><th>${esc(cap(unitName(p.from)))} (${esc(sym(p.from))})</th></tr>`;
    revRows = p.reverse.map(v => `<tr><td>${p.reverseLabels?.[v] ?? f(v)} ${esc(sym(p.to))}</td><td>${f(convert(v, p.to, p.from))} ${esc(sym(p.from))}</td></tr>`).join("");
  }
  return `<h2>${esc(cap(unitName(p.from)))} to ${esc(toName)} chart</h2><div class="tv-table-wrap"><table class="tv-table"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
<h2>${esc(cap(toName))} to ${esc(unitName(p.from))} chart</h2><div class="tv-table-wrap"><table class="tv-table"><thead>${revHead}</thead><tbody>${revRows}</tbody></table></div>`;
}

function body(p, byslug) {
  const fromName = p.converter === "height" ? "feet and inches" : unitName(p.from);
  const toName = p.converter === "height" ? "centimetres" : (p.options ? unitName(p.to).replace(/^US /, "") : unitName(p.to));
  const related = p.related.map(s => byslug[s]).map(r => `<a class="tv-card" href="/converters/${r.slug}"><span class="tv-card-body"><span class="tv-card-title">${esc(r.h1)}</span><span class="tv-card-desc">${esc(r.menu)}</span></span></a>`).join("");
  return `<!-- tv:conv -->
<section class="tv-page-hero tv-conv-hero"><div class="tv-conv-head"><h1>${esc(p.h1)}</h1><p class="tv-lead">${esc(p.intro)}</p></div>
${widget(p)}</section>
<div class="tv-conv-layout"><article class="tv-prose">
<h2>How to convert ${esc(fromName)} to ${esc(toName)}</h2>
<div class="tv-formula">${p.formula.map(x => `<p>${esc(x)}</p>`).join("")}</div>
<p><strong>Worked example.</strong> ${esc(p.example())}</p>
${chart(p)}
<h2>About the units</h2>
<dl class="tv-defs">${p.units.map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join("")}</dl>
<h2>Frequently asked questions</h2>
${p.faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join("\n")}
</article>
<aside class="tv-conv-aside"><h2 class="tv-aside-h">Related converters</h2><div class="tv-related">${related}</div>
<a class="tv-aside-all" href="/converters/">All unit converters →</a></aside></div>
<script type="module" src="/converters/converter-ui.js"></script>
<!-- /tv:conv -->`;
}

function head(p) {
  const url = `${SITE}/converters/${p.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebApplication", "@id": `${url}#app`, name: p.h1, url, applicationCategory: "UtilitiesApplication", operatingSystem: "Any",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description: p.description },
      { "@type": "WebPage", "@id": `${url}#page`, name: p.title, url, description: p.description,
        isPartOf: { "@type": "WebSite", name: "ToolVault", url: `${SITE}/` } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "ToolVault", item: `${SITE}/` },
        { "@type": "ListItem", position: 2, name: "Converters", item: `${SITE}/converters/` },
        { "@type": "ListItem", position: 3, name: p.h1, item: url }] },
    ],
  };
  const title = `${p.title} | ToolVault`;
  return `<!-- tv:conv-head -->
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="${ROBOTS}">
<meta name="theme-color" content="#0b8f78">
<meta property="og:site_name" content="ToolVault">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${url}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<!-- /tv:conv-head -->`;
}

const HEAD_RE = /<!-- tv:conv-head -->[\s\S]*?<!-- \/tv:conv-head -->/;
const BODY_RE = /<!-- tv:conv -->[\s\S]*?<!-- \/tv:conv -->/;

async function main() {
  const check = process.argv.includes("--check");
  const byslug = Object.fromEntries(PAGES.map(p => [p.slug, p]));
  let stale = 0;
  for (const p of PAGES) {
    const file = join(ROOT, "converters", `${p.slug}.html`);
    const exists = await access(file).then(() => true, () => false);
    const original = exists ? await readFile(file, "utf8") : "";
    let html = exists
      ? original.replace(HEAD_RE, () => head(p)).replace(BODY_RE, () => body(p, byslug))
      : `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n${head(p)}\n</head>\n<body>\n<main id="main" class="wrap">${body(p, byslug)}</main>\n</body>\n</html>\n`;
    if (html !== original) {
      stale++;
      if (!check) await writeFile(file, html);
    }
    console.log(`converters/${p.slug}.html`);
  }
  if (check && stale) { console.error(`${stale} converter page(s) out of date: run node scripts/converters.mjs`); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
