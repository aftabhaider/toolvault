#!/usr/bin/env python3
"""Apply ToolVault's shared layout to every page. Safe to re-run.

For each HTML page this script:
  * links the shared theme (/assets/site.css) and menu script (/assets/site.js);
  * replaces the page's header with the shared header and main menu;
  * renders breadcrumbs from the page's BreadcrumbList structured data, so the
    visible trail and the one Google reads always match;
  * replaces (or adds) the shared footer;
  * tags <body> with the page type, which sets the content width.

The site structure lives in SECTIONS below. Add a new tool there and re-run:
  python3 scripts/layout.py      (npm run layout)
"""

from __future__ import annotations

import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://toolvault.aftabjordan1.workers.dev"
YEAR = "2026"
SKIP = {"google8f42117352f976c7.html"}
SKIP_DIRS = ("og/", "scripts/", "tests/", "node_modules/", "pdf-to-word-service/", "assets/")

# Main menu: (label, hub path, [(name, path, short description), ...]).
SECTIONS = [
    ("Construction", "/construction/", [
        ("Concrete Calculator", "/construction/concrete-calculator", "Slabs, footings, walls and columns"),
        ("Gravel Calculator", "/construction/gravel-calculator", "Volume, weight, bags and cost"),
        ("Mulch Calculator", "/construction/mulch-calculator", "Cubic yards, bags and coverage"),
        ("Paint Calculator", "/construction/paint-calculator", "Litres, gallons and cans"),
        ("Stair Calculator", "/construction/stair-calculator", "Risers, treads and stringers"),
        ("Roof Pitch Calculator", "/construction/roof-pitch-calculator", "Pitch, angle and rafter length"),
        ("Board Foot Calculator", "/construction/board-foot-calculator", "Lumber volume and cost"),
        ("How to Calculate Concrete", "/construction/how-to-calculate-concrete", "Step-by-step guide"),
    ]),
    ("Solar", "/solar/", [
        ("Solar Load Calculator", "/solar/solar-load-calculator", "PV, inverter and battery sizing"),
        ("Solar Energy Generation", "/solar/solar-energy-generation-calculator", "Daily kWh from your location"),
        ("Solar Panel Area", "/solar/solar-panel-area-calculator", "Roof space for your panels"),
        ("How to Size a Solar System", "/solar/how-to-calculate-solar-system-size", "Step-by-step guide"),
    ]),
    ("Engineering", "/engineering/", [
        ("Voltage Drop Calculator", "/engineering/voltage-drop-calculator", "Cable drop, length and size"),
        ("How to Calculate Voltage Drop", "/engineering/how-to-calculate-voltage-drop", "Step-by-step guide"),
    ]),
    ("Calculators", "/calculators/", [
        ("Square Footage Calculator", "/calculators/square-footage-calculator", "Area of rooms and shapes"),
        ("AC BTU Calculator", "/calculators/ac-btu-calculator", "Air conditioner size for a room"),
    ]),
    ("PDF Tools", "/documents/", [
        ("Merge PDF", "/documents/merge-pdf", "Combine PDFs in your browser"),
        ("PDF to Word", "/documents/pdf-to-word", "Convert PDF to editable DOCX"),
    ]),
]
SECTION_OF_DIR = {"construction": "/construction/", "solar": "/solar/", "engineering": "/engineering/",
                  "calculators": "/calculators/", "documents": "/documents/"}
ALL_LINK = {"/calculators/": "Browse all calculators"}
# One name per section, used in the menu, the breadcrumbs and their structured data.
HUB_NAMES = {"/construction/": "Construction", "/solar/": "Solar", "/engineering/": "Engineering",
             "/calculators/": "Calculators", "/documents/": "PDF Tools"}
SEARCH_ICON = ('<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" '
               'stroke-width="2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>')
LEGAL = {"about.html", "contact.html", "privacy.html", "terms.html", "404.html"}

LOGO_SVG = ('<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect width="64" height="64" rx="14" fill="#073f39"/>'
            '<path d="M18 17h28v7H35v23h-6V24H18z" fill="#fff"/><path d="M34 25l8 16 9-18h-8l-5 10-5-10z" fill="#42e6ad"/>'
            '<path d="M12 49h40" stroke="#0b8f78" stroke-width="3" stroke-linecap="round"/></svg>')
CARET = '<svg class="tv-caret" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 3l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>'
MENU_ICON = ('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" '
             'stroke-width="2" stroke-linecap="round"/></svg>')

HEAD_RE = re.compile(r"\n?<!-- tv:head -->.*?<!-- /tv:head -->\n?", re.S)
HEADER_RE = re.compile(r"<!-- tv:header -->.*?<!-- /tv:header -->", re.S)
CRUMBS_RE = re.compile(r"\n?<!-- tv:crumbs -->.*?<!-- /tv:crumbs -->", re.S)
FOOTER_RE = re.compile(r"<!-- tv:footer -->.*?<!-- /tv:footer -->", re.S)
e = lambda s: html.escape(s, quote=True)


def page_type(rel: str) -> str:
    if rel == "index.html":
        return "home"
    if rel in LEGAL:
        return "legal"
    if rel.endswith("/index.html"):
        return "hub"
    if "/how-to-" in rel:
        return "article"
    return "tool"


def canonical_path(source: str) -> str | None:
    m = re.search(r'<link rel="canonical" href="([^"]+)"', source)
    return m.group(1).replace(SITE, "") or "/" if m else None


# ------------------------------------------------------------ blocks

def head_block() -> str:
    return "\n".join([
        "<!-- tv:head -->",
        '<link rel="preload" href="/assets/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>',
        '<link rel="stylesheet" href="/assets/site.css">',
        '<script src="/assets/site.js" defer></script>',
        "<!-- /tv:head -->",
    ])


def header_block(current_section: str | None, current_path: str | None) -> str:
    items = []
    for label, hub, links in SECTIONS:
        cur = ' aria-current="true"' if hub == current_section else ""
        panel = []
        for name, path, desc in links:
            here = ' aria-current="page"' if path == current_path else ""
            panel.append(f'<li><a href="{path}"{here}>{e(name)}<span>{e(desc)}</span></a></li>')
        all_label = ALL_LINK.get(hub, f"All {label.lower()} tools")
        panel.append(f'<li><a class="tv-all" href="{hub}">{e(all_label)} →</a></li>')
        items.append(f'<li class="tv-item"><a class="tv-top" href="{hub}"{cur}>{e(label)}{CARET}</a>'
                     f'<ul class="tv-panel">{"".join(panel)}</ul></li>')
    return (
        "<!-- tv:header -->"
        '<a id="tv-skip" href="#main">Skip to content</a>'
        '<header id="tv-header"><div class="tv-container tv-bar">'
        f'<a class="tv-logo" href="/" aria-label="ToolVault home">{LOGO_SVG}<span>Tool<b>Vault</b></span></a>'
        '<button class="tv-menu-btn" type="button" aria-expanded="false" aria-controls="tv-nav">'
        f'{MENU_ICON}<span class="tv-menu-label">Menu</span></button>'
        f'<nav id="tv-nav" class="tv-nav" aria-label="Main"><ul>{"".join(items)}</ul>'
        '<a class="tv-mobile-cta" href="/calculators/">Browse all calculators</a></nav>'
        f'<a class="tv-cta" href="/#search">{SEARCH_ICON}<span>Search tools</span></a>'
        "</div></header>"
        "<!-- /tv:header -->"
    )


def breadcrumb_items(source: str) -> list[tuple[str, str | None]]:
    for raw in re.findall(r'<script type="application/ld\+json"[^>]*>(.*?)</script>', source, re.S):
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                if node.get("@type") == "BreadcrumbList":
                    out = []
                    for el in sorted(node.get("itemListElement", []), key=lambda x: x.get("position", 0)):
                        item = el.get("item")
                        url = item.get("@id") if isinstance(item, dict) else item
                        out.append((el.get("name", ""), url.replace(SITE, "") if url else None))
                    return out
                stack.extend(v for v in node.values() if isinstance(v, (dict, list)))
    return []


def crumbs_block(source: str, rel: str, current_path: str | None) -> str | None:
    items = breadcrumb_items(source)
    if not items:
        return None
    lis = []
    for i, (name, path) in enumerate(items):
        last = i == len(items) - 1
        if last or not path:
            lis.append(f'<li aria-current="page">{e(name)}</li>' if last else f"<li>{e(name)}</li>")
        else:
            lis.append(f'<li><a href="{path or "/"}">{e(name)}</a></li>')
    return ("<!-- tv:crumbs -->"
            '<nav id="tv-crumbs" aria-label="Breadcrumb"><div class="tv-container tv-crumbs-inner">'
            f'<ol>{"".join(lis)}</ol></div></nav>'
            "<!-- /tv:crumbs -->")


def footer_block() -> str:
    def col(title, links):
        lis = "".join(f'<li><a href="{p}">{e(n)}</a></li>' for n, p in links)
        return f'<div><h2>{e(title)}</h2><ul>{lis}</ul></div>'

    by_hub = {hub: [(n, p) for n, p, _ in links if "/how-to-" not in p] for _, hub, links in SECTIONS}
    cols = [
        col("Construction", by_hub["/construction/"]),
        col("Solar & electrical", by_hub["/solar/"] + by_hub["/engineering/"]),
        col("Home & PDF", by_hub["/calculators/"] + by_hub["/documents/"]),
        col("ToolVault", [("All calculators", "/calculators/"), ("About", "/about"), ("Contact", "/contact"),
                          ("Privacy", "/privacy"), ("Terms", "/terms")]),
    ]
    return (
        "<!-- tv:footer -->"
        '<footer id="tv-footer"><div class="tv-container tv-foot-grid">'
        '<div class="tv-foot-brand">'
        f'<a class="tv-logo" href="/">{LOGO_SVG}<span>Tool<b>Vault</b></span></a>'
        "<p>Free calculators and PDF tools that show their working: the formula, the units and the assumptions behind every result.</p>"
        "</div>"
        f'{"".join(cols)}</div>'
        '<div class="tv-container tv-foot-bottom">'
        f"<span>© {YEAR} ToolVault. Free practical tools.</span>"
        "<span>Results are planning estimates. Check critical work with a qualified professional.</span>"
        "</div></footer>"
        "<!-- /tv:footer -->"
    )


# ------------------------------------------------------------ apply

def apply(source: str, rel: str) -> str:
    kind = page_type(rel)
    path = canonical_path(source)
    section = SECTION_OF_DIR.get(rel.split("/")[0]) if "/" in rel else None

    # Theme assets, last in <head> so they win over each page's own styles.
    # Updated in place once present, so other generators' head blocks keep their order.
    if HEAD_RE.search(source):
        source = re.sub(r"<!-- tv:head -->.*?<!-- /tv:head -->", lambda _: head_block(), source, count=1, flags=re.S)
    else:
        source = source.replace("</head>", "\n" + head_block() + "\n</head>", 1)

    # Body classes.
    source = re.sub(r"<body(?: class=\"[^\"]*\")?>", f'<body class="tv-site tv-{kind}">', source, count=1)

    # Header: replace the shared block, or the page's original <header> the first time.
    header = header_block(section, path)
    if HEADER_RE.search(source):
        source = HEADER_RE.sub(lambda _: header, source, count=1)
    elif re.search(r"<header\b.*?</header>", source, re.S):
        source = re.sub(r"<header\b.*?</header>", lambda _: header, source, count=1, flags=re.S)
    else:
        source = re.sub(r"(<body[^>]*>)", lambda m: m.group(1) + "\n" + header, source, count=1)

    # Consistent section names in the BreadcrumbList structured data.
    for hub, name in HUB_NAMES.items():
        url = re.escape(SITE + hub)
        source = re.sub(rf'("name"\s*:\s*")[^"]*("\s*,\s*"item"\s*:\s*"{url}")', rf"\g<1>{name}\g<2>", source)
        source = re.sub(rf'("item"\s*:\s*"{url}"\s*,\s*"name"\s*:\s*")[^"]*(")', rf"\g<1>{name}\g<2>", source)

    # Breadcrumbs directly under the header; remove legacy trails.
    source = CRUMBS_RE.sub("", source)
    source = re.sub(r'<div class="crumb">.*?</div>\n?', "", source, flags=re.S)
    crumbs = crumbs_block(source, rel, path) if kind != "home" else None
    if crumbs:
        source = source.replace("<!-- /tv:header -->", "<!-- /tv:header -->\n" + crumbs, 1)

    # Skip-link target.
    if 'id="main"' not in source:
        source = re.sub(r"<main\b", '<main id="main"', source, count=1)

    # Footer.
    # Repair document structure: a single </body></html>, and <main> closed
    # before the footer (several pages never closed it, so browsers pulled the
    # footer inside the content area).
    source = re.sub(r"(?:\s*</body>\s*</html>)+\s*$", "\n</body>\n</html>\n", source)
    # Old per-page copyright lines, replaced by the shared footer.
    source = re.sub(r'\n?[ \t]*<div class="footer">\s*©[^<]*</div>', "", source)
    if "<main" in source and "</main>" not in source:
        source = source.replace("</body>", "</main>\n</body>", 1)

    # Footer: always a direct child of <body>, after everything else, so it spans
    # the full width even where a page had put its old footer inside a container.
    source = re.sub(r"\n?<!-- tv:footer -->.*?<!-- /tv:footer -->\n?", "", source, flags=re.S)
    source = re.sub(r"<footer\b.*?</footer>", "", source, count=1, flags=re.S)
    source = source.replace("</body>", "\n" + footer_block() + "\n</body>", 1)
    return source


def main() -> int:
    check = "--check" in sys.argv
    stale = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT).as_posix()
        if rel in SKIP or rel.startswith(SKIP_DIRS):
            continue
        original = path.read_text()
        updated = apply(original, rel)
        if updated != original:
            stale.append(rel)
            if not check:
                path.write_text(updated)
        print(f"{rel:52} {page_type(rel)}")
    if check and stale:
        print(f"\n{len(stale)} page(s) out of date: run python3 scripts/layout.py", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
