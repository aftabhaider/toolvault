# ToolVault

Free online calculators, converters and PDF tools, served as a static site at <https://toolvault.aftabjordan1.workers.dev/> (Cloudflare Workers).

## Layout

- `index.html`, `about.html`, `contact.html`, `privacy.html`, `terms.html`: site pages.
- Category folders (`construction/`, `calculators/`, `engineering/`, `solar/`, `documents/`, `business/`, `converters/`, `developer/`, `education/`, `smart-tools/`): each has an `index.html` hub plus its tool pages.
- `*-engine.js`: the calculation for a calculator, written as pure functions with no page code. Pages import their engine as an ES module.
- `documents/`: Merge PDF (runs in the browser) and PDF to Word (uploads to the conversion service, or converts in the browser).
- `pdf-to-word-service/`: the Python PDF-to-Word API. See its [README](pdf-to-word-service/README.md) and [deployment guide](pdf-to-word-service/DEPLOYMENT.md).
- `sitemap.xml`, `robots.txt`: search engine files. Public URLs have no `.html` extension.

There is no build step: the HTML, CSS and JavaScript are served as written.

## Standards

Read these before adding or changing a calculator:

- [Calculation quality standard](TOOLVAULT_CALCULATION_QUALITY_STANDARD.md): formulas, units, precision, tests and the pre-merge checklist.
- [Unit input standard](TOOLVAULT_UNIT_INPUT_STANDARD.md): unit labels, unit pickers and metric/imperial quick-set buttons.
- [Calculator content standard](TOOLVAULT_CALCULATOR_CONTENT_STANDARD.md): how calculator pages are written.
- [2026 keyword clusters](TOOLVAULT_2026_CALCULATOR_KEYWORD_CLUSTERS.md): the SEO plan.

## Engine tests

Calculator engines (`*-engine.js`) have known-case tests in `tests/`, as required by `TOOLVAULT_CALCULATION_QUALITY_STANDARD.md`. They use Node's built-in test runner and need no dependencies (Node 20+):

```bash
npm test
```
