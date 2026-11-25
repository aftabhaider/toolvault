#!/usr/bin/env python3
"""Apply ToolVault's shared layout to every page. Safe to re-run.

For each HTML page this script:
  * links the shared theme (/assets/site.css) and menu script (/assets/site.js);
  * replaces the page's header with the shared header and main menu;
  * renders breadcrumbs from the page's BreadcrumbList structured data, so the
    visible trail and the one Google reads always match;
  * replaces (or adds) the shared footer;
  * tags <body> with the page type, which sets the content width.

It also generates the homepage tool directory and the category pages' tool
grids. The site structure lives in scripts/site_data.py. Add a new tool there
and re-run:
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
from site_data import POPULAR, SECTIONS as SITE_SECTIONS, all_tools, icon  # noqa: E402

# Menu view of the site structure: (label, hub path, [(name, path, short description), ...]).
SECTIONS = [(sec["label"], sec["hub"], [(t[0], t[1], t[2]) for t in sec["tools"]]) for sec in SITE_SECTIONS]
SECTION_OF_DIR = {"construction": "/construction/", "solar": "/solar/", "engineering": "/engineering/",
                  "calculators": "/calculators/", "converters": "/converters/", "documents": "/documents/"}
ALL_LINK = {"/calculators/": "Browse all calculators"}
# One name per section, used in the menu, the breadcrumbs and their structured data.
HUB_NAMES = {"/construction/": "Construction", "/solar/": "Solar", "/engineering/": "Engineering",
             "/calculators/": "Calculators", "/converters/": "Converters", "/documents/": "PDF Tools"}
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


# ------------------------------------------------------------ homepage and category pages

HOME_RE = re.compile(r"<!-- tv:home -->.*?<!-- /tv:home -->", re.S)
HUB_RE = re.compile(r"<!-- tv:hub -->.*?<!-- /tv:hub -->", re.S)
HUB_MORE_RE = re.compile(r"<!-- tv:hub-more -->.*?<!-- /tv:hub-more -->", re.S)
SECTION_BY_HUB = {sec["hub"]: sec for sec in SITE_SECTIONS}


def tool_card(tool: dict) -> str:
    tag = '<span class="tv-tag">Guide</span>' if tool["kind"] == "guide" else ""
    search = e(f'{tool["name"]} {tool["keywords"]} {tool["card"]}'.lower())
    return (f'<a class="tv-card" href="{tool["path"]}" data-search="{search}">'
            f'<span class="tv-card-ic">{icon(tool["icon"])}</span>'
            f'<span class="tv-card-body"><span class="tv-card-title">{e(tool["name"])}{tag}</span>'
            f'<span class="tv-card-desc">{e(tool["card"])}</span></span>'
            f'{icon("arrow", "tv-card-go")}</a>')


def section_tools(sec: dict) -> list[dict]:
    return [t for s, t in all_tools() if s is sec]


def count_label(tools: list[dict]) -> str:
    calc = sum(t["kind"] == "tool" for t in tools)
    guides = len(tools) - calc
    noun = noun_for(tools)
    parts = [f"{calc} {noun if calc != 1 else noun[:-1]}"]
    if guides:
        parts.append(f"{guides} guide" + ("s" if guides != 1 else ""))
    return " · ".join(parts)


def sec_is_pdf(tools: list[dict]) -> bool:
    return all(t["path"].startswith("/documents/") for t in tools)


def noun_for(tools: list[dict]) -> str:
    if sec_is_pdf(tools):
        return "tools"
    if all(t["path"].startswith("/converters/") for t in tools):
        return "converters"
    return "calculators"


# Sections that belong on the all-calculators page (converters and PDF tools have their own).
def is_calculator_section(sec: dict) -> bool:
    return sec["hub"] not in ("/documents/", "/converters/")


def category_cards(exclude: str | None = None) -> str:
    cards = []
    for sec in SITE_SECTIONS:
        if sec["hub"] == exclude:
            continue
        if sec["hub"] == "/calculators/":
            listed = [t for s, t in all_tools() if is_calculator_section(s)]
        else:
            listed = section_tools(sec)
        cards.append(f'<a class="tv-cat" href="{sec["hub"]}"><span class="tv-cat-ic">{icon(sec["icon"])}</span>'
                     f'<span class="tv-cat-title">{e(sec.get("card_label", sec["label"]))}</span>'
                     f'<span class="tv-cat-desc">{e(sec.get("card_summary", sec["summary"]))}</span>'
                     f'<span class="tv-cat-meta">{count_label(listed)} {icon("arrow", "tv-cat-go")}</span></a>')
    return f'<div class="tv-cats">{"".join(cards)}</div>'


def tool_groups(sections: list[dict], heading_tag: str = "h3") -> str:
    out = []
    for sec in sections:
        cards = "".join(tool_card(t) for t in section_tools(sec))
        label = sec.get("group_label", sec["label"])
        out.append(f'<div class="tv-group" data-group><div class="tv-group-head">'
                   f'<{heading_tag}>{icon(sec["icon"])}{e(label)}</{heading_tag}>'
                   f'<a href="{sec["hub"]}" aria-label="View all {e(label)} tools">View all →</a></div>'
                   f'<div class="tv-grid">{cards}</div></div>')
    return "".join(out)


FEATURES = [
    ("formula", "Formulas shown", "Every calculator shows the formula and a worked example, so you can check the result."),
    ("units", "Metric and imperial", "Enter metres, feet, inches or litres. Units are converted before anything is calculated."),
    ("check", "Tested calculations", "Each calculation engine is covered by automated tests built from hand-checked examples."),
    ("free", "Free, no account", "No sign-up and no paywall. Calculators run in your browser."),
]

HOME_SCRIPT = """<script>
(function(){
 var input=document.getElementById("search"),form=document.getElementById("tv-search-form");
 if(!input)return;
 var cards=[].slice.call(document.querySelectorAll("#tools .tv-card")),groups=[].slice.call(document.querySelectorAll("#tools [data-group]"));
 var count=document.getElementById("tv-count"),empty=document.getElementById("tv-empty"),browse=document.getElementById("tv-browse");
 function apply(){
  var words=input.value.toLowerCase().trim().split(/\\s+/).filter(Boolean),shown=0;
  cards.forEach(function(c){var ok=words.every(function(w){return c.dataset.search.indexOf(w)>-1});c.hidden=!ok;if(ok)shown++});
  groups.forEach(function(g){g.hidden=!g.querySelector(".tv-card:not([hidden])")});
  count.textContent=words.length?shown+" of "+cards.length+" tools match":cards.length+" tools";
  empty.hidden=shown>0;browse.hidden=words.length>0;
 }
 input.addEventListener("input",apply);
 form.addEventListener("submit",function(ev){ev.preventDefault();apply();var first=document.querySelector("#tools .tv-card:not([hidden])");
  if(first&&input.value.trim())document.getElementById("tools").scrollIntoView({behavior:"smooth"});});
 if(location.hash==="#search")input.focus();
 apply();
})();
</script>"""


def home_block() -> str:
    tools = [t for _, t in all_tools()]
    by_path = {t["path"]: t for t in tools}
    calcs = sum(t["kind"] == "tool" and not t["path"].startswith(("/documents/", "/converters/")) for t in tools)
    convs = sum(t["path"].startswith("/converters/") for t in tools)
    guides = sum(t["kind"] == "guide" for t in tools)
    pdf = sum(t["path"].startswith("/documents/") for t in tools)
    popular = "".join(f'<a href="{p}">{e(by_path[p]["name"].replace(" Calculator", ""))}</a>' for p in POPULAR)
    features = "".join(f'<li>{icon(i)}<div><h3>{e(t)}</h3><p>{e(d)}</p></div></li>' for i, t, d in FEATURES)
    return (
        "<!-- tv:home -->"
        '<section class="tv-home-hero"><div class="tv-container">'
        '<p class="tv-eyebrow">Free · No sign-up · Formulas shown</p>'
        "<h1>Free online calculators and PDF tools</h1>"
        '<p class="tv-lead">Estimate concrete, paint, stairs and solar systems, check cable voltage drop and air-conditioner size, '
        "and merge or convert PDFs. Every calculator shows the formula, the units and the assumptions behind its result.</p>"
        '<form class="tv-search" id="tv-search-form" role="search" action="/">'
        f'<label class="tv-sr" for="search">Search ToolVault tools</label>{icon("search")}'
        '<input id="search" name="q" type="search" placeholder="Search tools, e.g. concrete, paint, voltage drop" autocomplete="off">'
        '<button type="submit">Search</button></form>'
        f'<p class="tv-popular"><span>Popular:</span>{popular}</p>'
        f'<ul class="tv-stats"><li><b>{calcs}</b> calculators</li><li><b>{convs}</b> unit converters</li><li><b>{guides}</b> step-by-step guides</li><li><b>{pdf}</b> PDF tools</li></ul>'
        "</div></section>"
        '<section class="tv-container tv-home-section" id="tv-browse" aria-labelledby="tv-cats-h">'
        '<h2 id="tv-cats-h" class="tv-h2">Browse by category</h2>'
        f"{category_cards()}</section>"
        '<section class="tv-container tv-home-section" id="tools" aria-labelledby="tv-tools-h">'
        '<div class="tv-dir-head"><h2 id="tv-tools-h" class="tv-h2">All tools</h2><p id="tv-count" aria-live="polite"></p></div>'
        f"{tool_groups(SITE_SECTIONS)}"
        '<p id="tv-empty" class="tv-empty" hidden>No tools match your search. Try a shorter word, or '
        '<a href="/calculators/">browse all calculators</a>.</p></section>'
        '<section class="tv-container tv-home-section" aria-labelledby="tv-why-h">'
        f'<h2 id="tv-why-h" class="tv-h2">Why people use ToolVault</h2><ul class="tv-features">{features}</ul></section>'
        '<section class="tv-container tv-home-section tv-home-about"><h2 class="tv-h2">About ToolVault</h2>'
        "<p>ToolVault is a growing library of free calculators and practical web tools. Each tool puts the task first, "
        "then shows the formula, a worked example and the assumptions behind the result, so you can understand the number "
        'rather than simply receive it. <a href="/about">How results are checked →</a></p></section>'
        f"{HOME_SCRIPT}"
        "<!-- /tv:home -->"
    )


def hub_block(sec: dict) -> str:
    if sec["hub"] == "/calculators/":
        # The calculators hub lists every calculator on the site, grouped by category.
        groups = tool_groups([s for s in SITE_SECTIONS if is_calculator_section(s)], "h2")
        tools = [t for s, t in all_tools() if is_calculator_section(s)]
        body = f'<div class="tv-hub-groups">{groups}</div>'
    else:
        tools = section_tools(sec)
        calcs = [t for t in tools if t["kind"] == "tool"]
        guides = [t for t in tools if t["kind"] == "guide"]
        noun = noun_for(tools).capitalize()
        body = (f'<section class="tv-hub-section"><h2 class="tv-h2">{noun}</h2>'
                f'<div class="tv-grid">{"".join(tool_card(t) for t in calcs)}</div></section>')
        if guides:
            body += (f'<section class="tv-hub-section"><h2 class="tv-h2">Guides</h2>'
                     f'<div class="tv-grid">{"".join(tool_card(t) for t in guides)}</div></section>')
    return (
        "<!-- tv:hub -->"
        f'<section class="tv-page-hero"><span class="tv-page-ic">{icon(sec["icon"])}</span>'
        f'<div><h1>{e(sec["h1"])}</h1><p class="tv-lead">{e(sec["intro"])}</p>'
        f'<p class="tv-page-meta">{count_label(tools)} · Free · No account needed</p></div></section>'
        f"{body}"
        "<!-- /tv:hub -->"
    )


def hub_more_block(sec: dict) -> str:
    return ("<!-- tv:hub-more -->"
            '<section class="tv-hub-section"><h2 class="tv-h2">Other categories</h2>'
            f"{category_cards(exclude=sec['hub'])}</section>"
            "<!-- /tv:hub-more -->")


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

    # Generated page bodies (homepage directory, category tool grids).
    if HOME_RE.search(source):
        source = HOME_RE.sub(lambda _: home_block(), source, count=1)
    sec = SECTION_BY_HUB.get(path or "") if kind == "hub" else None
    if sec and HUB_RE.search(source):
        source = HUB_RE.sub(lambda _: hub_block(sec), source, count=1)
    if sec and HUB_MORE_RE.search(source):
        source = HUB_MORE_RE.sub(lambda _: hub_more_block(sec), source, count=1)

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
