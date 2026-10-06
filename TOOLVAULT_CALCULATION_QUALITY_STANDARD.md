# ToolVault Calculation Quality Standard

Every calculator should follow these rules before merge.

## 1. Formula first
Write the mathematical model before building the UI. State inputs, units, assumptions, output units, rounding rules and domains.

## 2. Normalize units
Convert user input to one internal unit system before calculation. Never mix display units directly into the core formula.

## 3. Separate engine from UI
Put calculation functions in a dedicated JavaScript module whenever the calculator has more than trivial arithmetic. UI code should format values, validate inputs and call the engine.

## 4. Preserve precision
Calculate with full internal precision and round only when displaying results. Do not round intermediate quantities unless the formula explicitly requires it.

## 5. Test known cases
For each calculator, test at least:
- one simple hand-checkable example;
- one unit-conversion case;
- one boundary/error case;
- one inverse or consistency identity when an inverse calculation exists.

## 6. Make assumptions visible
Defaults such as density, resistivity, waste allowance or efficiency must be editable or clearly labeled as assumptions. Do not present an industry-dependent assumption as a universal constant.

## 7. Avoid unsafe recommendations
A calculator may calculate a mathematical quantity without claiming that the result is a complete engineering, medical, legal or financial recommendation when additional standards or professional inputs are required.

## 8. SEO must not change mathematics
Canonical URL, schema, internal links, copy and layout must remain independent from the numerical calculation engine.

## 9. Pre-merge gate
Before merging:
1. inspect formulas;
2. run independent numerical checks;
3. inspect unit labels;
4. verify internal links;
5. verify canonical URL;
6. verify sitemap entry;
7. verify no accidental `index.html` navigation links;
8. verify the calculator still works without external APIs unless an API is explicitly required.

This standard is intentionally stricter for ToolVault because calculation correctness is the product itself.
