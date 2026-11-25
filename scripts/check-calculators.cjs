// End-to-end accuracy check for every calculator page.
//
// Drives each page in a real browser (Playwright + Chromium), enters known
// cases, and compares what the page displays with values computed here from
// first principles. Also switches units to confirm values convert without
// changing the result.
//
//   python3 -m http.server 8811 --bind 127.0.0.1 &   # from the repo root
//   node scripts/check-calculators.cjs [base-url]
//
// Exit code 1 if any check fails.

const { chromium } = require("playwright");
const BASE = (process.argv[2] || "http://127.0.0.1:8811").replace(/\/$/, "");

const FT = 0.3048, IN = 0.0254, FT2_PER_M2 = 1 / (FT * FT), FT3_PER_M3 = 1 / FT ** 3, YD3_PER_M3 = 1 / (3 * FT) ** 3;
const L_PER_GAL = 3.785411784;
let failures = 0, passes = 0;

function check(name, ok, detail = "") {
  if (ok) passes++; else failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${detail ? "  " + detail : ""}`);
}
const close = (a, b, tol) => Math.abs(a - b) <= tol;

async function open(browser, path) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
  await page.goto(BASE + path);
  await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelectorAll("main details").forEach(d => (d.open = true)));
  page.errors = errors;
  return page;
}
async function set(page, selector, value) {
  await page.locator(selector).first().fill(String(value));
  await page.locator(selector).first().dispatchEvent("input");
  await page.locator(selector).first().dispatchEvent("change");
  await page.waitForTimeout(80);
}
async function choose(page, selector, value) {
  await page.locator(selector).first().selectOption(value);
  await page.waitForTimeout(80);
}
async function text(page) { return (await page.innerText("main")).replace(/\s+/g, " "); }
// Number displayed right after a result label (first exact, case-sensitive
// match), e.g. after "NET VOLUME". Result labels are upper case on the pages.
async function after(page, label) {
  const t = await text(page);
  const i = t.indexOf(label);
  if (i < 0) return NaN;
  const m = t.slice(i + label.length).match(/-?[\d,]*\.?\d+/);
  return m ? Number(m[0].replace(/,/g, "")) : NaN;
}
async function value(page, selector) { return Number(await page.locator(selector).first().inputValue()); }
function noErrors(page, name) { check(`${name}: no script errors`, page.errors.length === 0, page.errors.join("; ")); }

const tests = {
  async concrete(b) {
    const p = await open(b, "/construction/concrete-calculator.html");
    // Default: 5 m × 4 m × 10 cm slab, 10% waste, 2400 kg/m³.
    const gross = 5 * 4 * 0.1 * 1.1;
    check("concrete: order volume m³", close(await after(p, "ORDER VOLUME"), gross, 0.0005));
    check("concrete: yd³", close(await after(p, "yd³") || await after(p, "VOLUME"), gross * YD3_PER_M3, 0.002) || (await text(p)).includes((gross * YD3_PER_M3).toFixed(3)));
    check("concrete: weight kg", (await text(p)).includes((gross * 2400).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
    // Change length; switch its unit to ft — the result must not change.
    await set(p, '[data-key="length"]', 6.5);
    const g2 = 6.5 * 4 * 0.1 * 1.1;
    check("concrete: recalculates on input", close(await after(p, "ORDER VOLUME"), g2, 0.0005));
    await choose(p, 'select[data-unit-for="length"]', "ft");
    check("concrete: m→ft converts value", close(await value(p, '[data-key="length"]'), 6.5 / FT, 1e-4));
    check("concrete: result unchanged after unit switch", close(await after(p, "ORDER VOLUME"), g2, 0.0005));
    noErrors(p, "concrete"); await p.close();
  },
  async gravel(b) {
    const p = await open(b, "/construction/gravel-calculator.html");
    const gross = 10 * 5 * 0.1 * 1.1;
    check("gravel: m³", (await text(p)).includes(gross.toFixed(2) + " m³"));
    check("gravel: tonnes", close(await after(p, "WEIGHT"), gross * 1.6, 0.006));
    check("gravel: US tons", (await text(p)).includes((gross * 1.6 * 1.10231131).toFixed(2) + " US tons"));
    check("gravel: yd³", close(await after(p, "cubic metres VOLUME"), gross * YD3_PER_M3, 0.006) || (await text(p)).includes((gross * YD3_PER_M3).toFixed(2)));
    await set(p, "#bagSize", 25);
    check("gravel: bags", (await text(p)).includes(String(Math.ceil(gross * 1600 / 25))));
    await choose(p, 'select[data-unit-for="depth"]', "in");
    check("gravel: cm→in converts", close(await value(p, '[data-key="depth"]'), 0.1 / IN, 1e-4));
    check("gravel: result unchanged after unit switch", (await text(p)).includes(gross.toFixed(2) + " m³"));
    noErrors(p, "gravel"); await p.close();
  },
  async mulch(b) {
    const p = await open(b, "/construction/mulch-calculator.html");
    // Default: 20 ft × 10 ft, 3 in, 5% → 52.5 ft³ = 1.944 yd³; 2 ft³ bags.
    const ft3 = 20 * 10 * 0.25 * 1.05;
    check("mulch: cubic yards", close(await after(p, "MULCH NEEDED"), ft3 / 27, 0.006));
    check("mulch: bags", (await after(p, "BAGS NEEDED")) === Math.ceil(ft3 / 2));
    check("mulch: cubic feet", close(await after(p, "CUBIC FEET"), ft3, 0.06));
    await set(p, "#existing", 1);
    const ft3b = 20 * 10 * (2 / 12) * 1.05;
    check("mulch: existing depth reduces volume", close(await after(p, "MULCH NEEDED"), ft3b / 27, 0.006));
    noErrors(p, "mulch"); await p.close();
  },
  async paint(b) {
    const p = await open(b, "/construction/paint-calculator.html");
    const litres = 2 * (4 + 3) * 2.7 * 2 / 10 * 1.05;
    check("paint: litres", (await text(p)).includes(litres.toFixed(2) + " L"));
    check("paint: US gallons", (await text(p)).includes((litres / L_PER_GAL).toFixed(2)));
    await choose(p, "#lengthUnit", "ft");
    check("paint: m→ft converts", close(await value(p, "#length"), 4 / FT, 1e-4));
    check("paint: result unchanged after unit switch", (await text(p)).includes(litres.toFixed(2) + " L"));
    await set(p, "#canSize", 4);
    check("paint: whole cans", (await after(p, "WHOLE CANS")) === Math.ceil(litres / 4));
    noErrors(p, "paint"); await p.close();
  },
  async stair(b) {
    const p = await open(b, "/construction/stair-calculator.html");
    // Default: 9 ft rise, 7.5 in target, 10 in tread → 15 risers of 7.2 in.
    const rise = 108, risers = Math.ceil(rise / 7.5), riser = rise / risers, run = (risers - 1) * 10;
    check("stair: risers", (await after(p, "RISERS")) === risers, `got ${await after(p, "RISERS")}`);
    check("stair: riser height", close(await after(p, "RISER HEIGHT"), riser, 0.006));
    check("stair: total run", close(await after(p, "TOTAL RUN"), run, 0.006));
    check("stair: stringer length", (await text(p)).includes(Math.hypot(rise, run).toFixed(2)));
    check("stair: angle", close(await after(p, "STAIR ANGLE"), Math.atan2(riser, 10) * 180 / Math.PI, 0.006));
    await set(p, "#totalRise", "8 1/2");
    const r2 = 102, n2 = Math.ceil(r2 / 7.5);
    check("stair: fraction input (8 1/2 ft)", (await after(p, "RISERS")) === n2, `got ${await after(p, "RISERS")}`);
    noErrors(p, "stair"); await p.close();
  },
  async roof(b) {
    const p = await open(b, "/construction/roof-pitch-calculator.html");
    check("roof: 6/12 angle", (await text(p)).includes("26.57"));
    check("roof: 6/12 rafter for 12 in run", (await text(p)).includes((12 * Math.sqrt(1.25)).toFixed(2)));
    await set(p, "#rise", 9);
    check("roof: 9/12 angle", (await text(p)).includes((Math.atan(9 / 12) * 180 / Math.PI).toFixed(2)));
    noErrors(p, "roof"); await p.close();
  },
  async boardFoot(b) {
    const p = await open(b, "/construction/board-foot-calculator.html");
    check("board foot: 1×6×8 = 4 BF raw", (await after(p, "RAW BOARD FEET")) === 4);
    check("board foot: +10% = 4.4", close(await after(p, "BOARD FEET TO BUY"), 4.4, 1e-9));
    await set(p, '[data-key="thickness"]', "1 1/2");
    await set(p, '[data-key="width"]', 3.5);
    check("board foot: 1 1/2 × 3.5 × 8 = 3.5 BF", close(await after(p, "RAW BOARD FEET"), 1.5 * 3.5 * 8 / 12, 0.006));
    noErrors(p, "board foot"); await p.close();
  },
  async squareFootage(b) {
    const p = await open(b, "/calculators/square-footage-calculator.html");
    const t = await text(p);
    check("square footage: 12×10 ft = 120 ft²", t.includes("120 ft²") || t.includes("120.00 ft²"));
    check("square footage: m²", t.includes((120 / FT2_PER_M2).toFixed(2)));
    noErrors(p, "square footage"); await p.close();
  },
  async acBtu(b) {
    const p = await open(b, "/calculators/ac-btu-calculator.html");
    check("AC: 15×12 ft → 6,000 BTU/h", (await text(p)).includes("6,000 BTU/h"));
    await set(p, "#length", 20); await set(p, "#width", 20);
    check("AC: 400 ft² → 9,000 BTU/h", (await text(p)).includes("9,000 BTU/h"));
    await p.locator('label[for="kitchen-yes"], label:has(#kitchen-yes)').first().click(); await p.waitForTimeout(80);
    check("AC: +4,000 kitchen → 13,000 → 14,000 standard", (await text(p)).includes("14,000 BTU/h"));
    noErrors(p, "AC"); await p.close();
  },
  async voltageDrop(b) {
    const p = await open(b, "/engineering/voltage-drop-calculator.html");
    // Default: DC 48 V, 20 A, 30 m one way, 6 mm² copper.
    const v = 2 * 20 * 30 * 1.724e-8 / 6e-6;
    check("voltage drop: volts", close(await after(p, "VOLTAGE DROP"), v, 0.0006), `expected ${v.toFixed(3)} V`);
    check("voltage drop: percent", (await text(p)).includes((v / 48 * 100).toFixed(2)));
    await choose(p, "#material", "aluminum");
    const va = 2 * 20 * 30 * 2.826e-8 / 6e-6;
    check("voltage drop: aluminium", close(await after(p, "VOLTAGE DROP"), va, 0.0006), `expected ${va.toFixed(3)} V`);
    noErrors(p, "voltage drop"); await p.close();
  },
  async solarLoad(b) {
    const p = await open(b, "/solar/solar-load-calculator.html");
    // Defaults: 5×10 W×6 h + 3×70 W×8 h + 1×100 W×5 h = 2.48 kWh/day; 5 sun-hours, 20% losses.
    const wh = 5 * 10 * 6 + 3 * 70 * 8 + 100 * 5, pv = Math.ceil(wh / (5 * 0.8) / 10) * 10;
    const t = await text(p);
    check("solar load: daily kWh", t.includes((wh / 1000).toFixed(2) + " kWh"));
    check("solar load: PV kW", t.includes((pv / 1000).toFixed(2) + " kW"), `expected ${(pv / 1000).toFixed(2)} kW`);
    check("solar load: connected W", t.includes("360 W") || t.includes("360W"));
    noErrors(p, "solar load"); await p.close();
  },
  async solarArea(b) {
    const p = await open(b, "/solar/solar-panel-area-calculator.html");
    const one = 2.382 * 1.134, total = one * 8, install = total * 1.2;
    const t = await text(p);
    check("solar area: panel m²", t.includes(one.toFixed(2)));
    check("solar area: installation m²", t.includes(install.toFixed(2)));
    check("solar area: installation ft²", t.includes((install * FT2_PER_M2).toFixed(2)));
    check("solar area: whole-number panel count", /for 8 panels/.test(t));
    await choose(p, "#lengthUnit", "m");
    check("solar area: mm→m keeps 2.382", close(await value(p, "#length"), 2.382, 1e-9), `got ${await value(p, "#length")}`);
    check("solar area: result unchanged after unit switch", (await text(p)).includes(install.toFixed(2)));
    noErrors(p, "solar area"); await p.close();
  },
  async converters(b) {
    const cases = [
      ["cm-to-inches", 30, 30 / 2.54, 12, 12 * 2.54],
      ["mm-to-inches", 19, 19 / 25.4, 1, 25.4],
      ["feet-to-meters", 12, 12 * 0.3048, 5, 5 / 0.3048],
      ["miles-to-km", 26.2, 26.2 * 1.609344, 10, 10 / 1.609344],
      ["kg-to-lbs", 70, 70 / 0.45359237, 150, 150 * 0.45359237],
      ["grams-to-ounces", 250, 250 / 28.349523125, 8, 8 * 28.349523125],
      ["ml-to-oz", 330, 330 / 29.5735295625, 16, 16 * 29.5735295625],
      ["liters-to-gallons", 50, 50 / 3.785411784, 5, 5 * 3.785411784],
      ["celsius-to-fahrenheit", 37, 37 * 9 / 5 + 32, 350, (350 - 32) * 5 / 9],
    ];
    for (const [slug, a, aExpected, bIn, bExpected] of cases) {
      const p = await open(b, `/converters/${slug}.html`);
      await set(p, "#conv-a", a);
      check(`${slug}: forward`, close(await value(p, "#conv-b"), aExpected, 1e-6), `got ${await value(p, "#conv-b")}`);
      await set(p, "#conv-b", bIn);
      check(`${slug}: reverse`, close(await value(p, "#conv-a"), bExpected, 1e-6), `got ${await value(p, "#conv-a")}`);
      if (slug === "ml-to-oz" || slug === "liters-to-gallons") {
        await set(p, "#conv-a", 100);
        await choose(p, "#conv-b-unit", slug === "ml-to-oz" ? "ukfloz" : "ukgal");
        const uk = slug === "ml-to-oz" ? 100 / 28.4130625 : 100 / 4.54609;
        check(`${slug}: UK unit`, close(await value(p, "#conv-b"), uk, 1e-6), `got ${await value(p, "#conv-b")}`);
      }
      noErrors(p, slug); await p.close();
    }
    const p = await open(b, "/converters/feet-and-inches-to-cm.html");
    await set(p, "#conv-ft", 6); await set(p, "#conv-in", 2);
    check("height: 6 ft 2 in → 187.96 cm", close(await value(p, "#conv-cm"), 74 * 2.54, 1e-6));
    await set(p, "#conv-cm", 170);
    check("height: 170 cm → 5 ft 6.93 in", (await value(p, "#conv-ft")) === 5 && close(await value(p, "#conv-in"), 170 / 2.54 - 60, 0.006));
    noErrors(p, "height"); await p.close();
  },
};

(async () => {
  const browser = await chromium.launch();
  for (const [name, fn] of Object.entries(tests)) {
    console.log(name);
    try { await fn(browser); } catch (e) { check(`${name}: ran without exception`, false, e.message.split("\n")[0]); }
  }
  await browser.close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exitCode = failures ? 1 : 0;
})();
