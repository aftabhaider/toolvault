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

## SEO maintenance

Run after adding or changing a page:

```bash
npm run seo        # share images (og/*.jpg, logo.png), then scripts/seo.py
npm test           # includes site-wide SEO checks (tests/site-seo.test.js)
```

`scripts/seo.py` is safe to re-run. It:

- adds FAQPage structured data built from each page's visible FAQ section;
- adds Open Graph and Twitter share-image tags;
- fills in Article dates, author and publisher, and the Organization logo;
- keeps placeholder category pages (`NOINDEX` in the script) out of search results;
- regenerates `sitemap.xml` and `llms.txt`.

Pass `--touch path/to/page.html` when a page's content changed, so its sitemap `lastmod` becomes today. When a placeholder category gets its first real tool, remove it from `NOINDEX`.

After a deploy is live, `npm run indexnow` notifies Bing and other IndexNow engines. The key file (`fe7d079fb00a97f7e051c835347fd49e.txt`) must stay at the site root.
