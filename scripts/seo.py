#!/usr/bin/env python3
"""ToolVault SEO maintenance script. Safe to re-run; every change is idempotent.

What it does for each public HTML page:
  * sets robots noindex on placeholder pages listed in NOINDEX (and back to
    index when a page is removed from the list);
  * adds Open Graph / Twitter image tags pointing at /og/<slug>.jpg
    (generate the images with `node scripts/og-images.mjs`);
  * builds FAQPage structured data from the page's visible FAQ section;
  * adds dates, author, publisher and image to Article structured data;
  * adds a logo to Organization structured data.

Site-wide it regenerates sitemap.xml (indexable pages only) and llms.txt.

Usage:
  python3 scripts/seo.py                 # update everything
  python3 scripts/seo.py --touch PATH... # also set sitemap lastmod to today
                                         # for pages whose content changed
"""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = "https://toolvault.aftabjordan1.workers.dev"
SITE_NAME = "ToolVault"
LOGO_URL = f"{SITE}/logo.png"
OG_DIR = ROOT / "og"

# Category hubs that only describe planned tools. They stay reachable for
# visitors but are kept out of search results until they list real tools.
# Remove a path from this set as soon as its first tool is published.
NOINDEX = {
    "business/index.html",
    "developer/index.html",
    "education/index.html",
    "smart-tools/index.html",
}

# Never processed: search-console verification and the error page.
SKIP = {"google8f42117352f976c7.html", "404.html"}

ROBOTS_INDEX = "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
ROBOTS_NOINDEX = "noindex,follow"

SECTION_NAMES = {
    "": "ToolVault",
    "calculators": "Calculators",
    "construction": "Construction",
    "engineering": "Engineering",
    "solar": "Solar",
    "documents": "PDF & Documents",
    "business": "Business",
    "converters": "Converters",
    "images": "Image Tools",
    "developer": "Developer",
    "education": "Education",
    "smart-tools": "Smart Tools",
}

TODAY = dt.date.today().isoformat()


# ---------------------------------------------------------------- helpers

def pages() -> list[Path]:
    out = []
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT).as_posix()
        if rel in SKIP or rel.startswith(("og/", "scripts/", "tests/", "node_modules/", "pdf-to-word-service/", "assets/")):
            continue
        out.append(path)
    return out


def text_of(fragment: str) -> str:
    fragment = re.sub(r"<br\s*/?>", " ", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    text = re.sub(r"\s+", " ", html.unescape(fragment)).strip()
    return re.sub(r"\s+([.,;:!?)])", r"\1", text)


def canonical(source: str) -> str | None:
    m = re.search(r'<link rel="canonical" href="([^"]+)"', source)
    return m.group(1) if m else None


def slug_for(url: str) -> str:
    path = url.replace(SITE, "").strip("/")
    return path.replace("/", "-") if path else "home"


def git_first_date(rel: str) -> str | None:
    out = subprocess.run(
        ["git", "log", "--follow", "--diff-filter=A", "--format=%as", "--", rel],
        cwd=ROOT, capture_output=True, text=True,
    ).stdout.split()
    return out[-1] if out else None


def first_match(pattern: str, source: str) -> str | None:
    m = re.search(pattern, source, re.S | re.I)
    return m.group(1) if m else None


def head_insert(source: str, block: str) -> str:
    # Mirror of the removal patterns below: "\n" + block + "\n" before </head>.
    return source.replace("</head>", "\n" + block + "\n</head>", 1)


def json_ld(data: dict, marker: str) -> str:
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f'<script type="application/ld+json" data-seo="{marker}">{body}</script>'


def replace_marked_script(source: str, marker: str, block: str | None) -> str:
    pattern = re.compile(rf'\n?<script type="application/ld\+json" data-seo="{marker}">.*?</script>\n?', re.S)
    source = pattern.sub("", source)
    return head_insert(source, block) if block else source


# ---------------------------------------------------------------- robots

def set_robots(source: str, rel: str) -> str:
    wanted = ROBOTS_NOINDEX if rel in NOINDEX else ROBOTS_INDEX
    tag = f'<meta name="robots" content="{wanted}">'
    if re.search(r'<meta name="robots"[^>]*>', source):
        return re.sub(r'<meta name="robots"[^>]*>', tag, source, count=1)
    return head_insert(source, tag)


def is_indexable(source: str) -> bool:
    robots = first_match(r'<meta name="robots" content="([^"]*)"', source) or ""
    return "noindex" not in robots


# ---------------------------------------------------------------- social

SOCIAL_RE = re.compile(r"\n?<!-- seo:social -->.*?<!-- /seo:social -->\n?", re.S)


def set_social(source: str, url: str, rel: str) -> str:
    source = SOCIAL_RE.sub("", source)
    # Drop tags this block now owns, wherever the page declared them.
    source = re.sub(r'<meta (?:property="og:image[^"]*"|name="twitter:(?:card|image[^"]*)")[^>]*>\n?', "", source)
    if not is_indexable(source):
        return source
    slug = slug_for(url)
    if not (OG_DIR / f"{slug}.jpg").exists():
        print(f"  warning: og/{slug}.jpg missing for {rel}; run node scripts/og-images.mjs", file=sys.stderr)
        return source
    title = text_of(first_match(r"<title>(.*?)</title>", source) or SITE_NAME)
    image = f"{SITE}/og/{slug}.jpg"
    block = "\n".join([
        "<!-- seo:social -->",
        f'<meta property="og:image" content="{image}">',
        '<meta property="og:image:type" content="image/jpeg">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{html.escape(title, quote=True)}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<meta name="twitter:image" content="{image}">',
        "<!-- /seo:social -->",
    ])
    return head_insert(source, block)


# ---------------------------------------------------------------- FAQ

def extract_faq(source: str) -> list[tuple[str, str]]:
    m = re.search(
        r"<h([23])[^>]*>\s*(?:Frequently asked questions|FAQs?)\s*</h\1>(.*?)(?=<h2|</section>|$)",
        source, re.S | re.I,
    )
    if not m:
        return []
    level, body = m.group(1), m.group(2)
    # Stop the section at the next heading of the same level (e.g. "Explore more").
    body = re.split(rf"<h{level}[\s>]", body, maxsplit=1)[0]
    pairs: list[tuple[str, str]] = []

    # Format 1: <details><summary>Q</summary> answer </details>
    for q, a in re.findall(r"<details[^>]*>\s*<summary[^>]*>(.*?)</summary>(.*?)</details>", body, re.S):
        pairs.append((text_of(q), text_of(a)))
    if pairs:
        return pairs

    # Format 2: <h3>Q</h3> answer paragraphs until next <h3>
    parts = re.split(r"<h3[^>]*>(.*?)</h3>", body, flags=re.S)
    for i in range(1, len(parts) - 1, 2):
        pairs.append((text_of(parts[i]), text_of(parts[i + 1])))
    if pairs:
        return pairs

    # Format 3: <p><strong>Q</strong><br>A</p>
    for q, a in re.findall(r"<p>\s*<strong>(.*?)</strong>\s*<br\s*/?>(.*?)</p>", body, re.S):
        pairs.append((text_of(q), text_of(a)))
    return pairs


def set_faq(source: str, url: str) -> tuple[str, int]:
    pairs = [(q, a) for q, a in extract_faq(source) if q and a]
    if not pairs or not is_indexable(source):
        return replace_marked_script(source, "faq", None), 0
    data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "@id": f"{url}#faq",
        "url": url,
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in pairs
        ],
    }
    return replace_marked_script(source, "faq", json_ld(data, "faq")), len(pairs)


# ---------------------------------------------------------------- Article / Organization

LD_RE = re.compile(r'(<script type="application/ld\+json">)(.*?)(</script>)', re.S)


def enrich_structured_data(source: str, url: str, rel: str, lastmod: str) -> str:
    def nodes(data):
        if isinstance(data, list):
            for item in data:
                yield from nodes(item)
        elif isinstance(data, dict):
            yield data
            for key in ("@graph",):
                if key in data:
                    yield from nodes(data[key])

    def fix(match: re.Match) -> str:
        raw = match.group(2)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            print(f"  warning: invalid JSON-LD left untouched in {rel}", file=sys.stderr)
            return match.group(0)
        changed = False
        for node in nodes(data):
            kind = node.get("@type")
            if kind == "Organization" and node.get("name") == SITE_NAME and "logo" not in node:
                node["logo"] = {"@type": "ImageObject", "url": LOGO_URL, "width": 512, "height": 512}
                changed = True
            if kind == "Article":
                publisher = {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE}/",
                             "logo": {"@type": "ImageObject", "url": LOGO_URL}}
                wanted = {
                    "mainEntityOfPage": url,
                    "datePublished": git_first_date(rel) or lastmod,
                    "dateModified": lastmod,
                    "author": {"@type": "Organization", "name": SITE_NAME, "url": f"{SITE}/about"},
                    "publisher": publisher,
                }
                if (OG_DIR / f"{slug_for(url)}.jpg").exists():
                    wanted["image"] = f"{SITE}/og/{slug_for(url)}.jpg"
                for key, value in wanted.items():
                    if node.get(key) != value:
                        node[key] = value
                        changed = True
        if not changed:
            return match.group(0)
        indent = "\n" if raw.startswith("\n") else ""
        body = json.dumps(data, ensure_ascii=False, indent=1 if indent else None,
                          separators=(",", ":") if not indent else None)
        return f"{match.group(1)}{indent}{body}{indent}{match.group(3)}"

    return LD_RE.sub(fix, source)


# ---------------------------------------------------------------- sitemap / llms.txt

def existing_lastmods() -> dict[str, str]:
    path = ROOT / "sitemap.xml"
    if not path.exists():
        return {}
    return dict(re.findall(r"<loc>([^<]+)</loc>\s*<lastmod>([^<]+)</lastmod>", path.read_text()))


def write_sitemap(entries: list[tuple[str, str]]) -> None:
    def order(item):
        path = item[0].replace(SITE, "")
        return (path != "/", path.count("/"), path)

    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in sorted(entries, key=order):
        lines.append(f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n")


def write_llms(index: list[dict]) -> None:
    groups: dict[str, list[dict]] = {}
    for item in index:
        groups.setdefault(item["section"], []).append(item)
    out = [
        f"# {SITE_NAME}",
        "",
        "> Free online calculators and PDF tools with visible formulas, unit conversion and "
        "worked examples. Calculations run in the browser; every result states its assumptions.",
        "",
        "Calculators normalise units before calculating, keep full precision internally and round only "
        "for display. Engines are covered by known-case tests. Results are planning estimates, not "
        "engineering, legal or financial advice.",
        "",
    ]
    preferred = ["Construction", "Calculators", "Solar", "Engineering", "PDF & Documents", "ToolVault"]
    for section in sorted(groups, key=lambda s: preferred.index(s) if s in preferred else 99):
        heading = "About" if section == "ToolVault" else section
        out.append(f"## {heading}")
        out.append("")
        for item in sorted(groups[section], key=lambda i: (not i["url"].endswith("/"), i["url"])):
            out.append(f"- [{item['name']}]({item['url']}): {item['description']}")
        out.append("")
    (ROOT / "llms.txt").write_text("\n".join(out).rstrip() + "\n")


# ---------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--touch", nargs="*", default=[], help="pages whose sitemap lastmod becomes today")
    parser.add_argument("--check", action="store_true", help="report pages that would change; write nothing")
    args = parser.parse_args()
    touched = {Path(p).as_posix().removeprefix("./") for p in args.touch}

    lastmods = existing_lastmods()
    sitemap: list[tuple[str, str]] = []
    llms: list[dict] = []
    stale = []

    for path in pages():
        rel = path.relative_to(ROOT).as_posix()
        original = path.read_text()
        url = canonical(original)
        if not url:
            print(f"  warning: no canonical URL in {rel}; skipped", file=sys.stderr)
            continue
        lastmod = TODAY if rel in touched else lastmods.get(url, TODAY)

        source = set_robots(original, rel)
        source = set_social(source, url, rel)
        source, faq_count = set_faq(source, url)
        source = enrich_structured_data(source, url, rel, lastmod)

        if source != original:
            stale.append(rel)
            if not args.check:
                path.write_text(source)

        if is_indexable(source):
            sitemap.append((url, lastmod))
            title = text_of(first_match(r"<title>(.*?)</title>", source) or "")
            name = re.sub(r"\s*[|—–-]\s*ToolVault\s*$", "", title).strip() or title
            description = text_of(first_match(r'<meta name="description" content="([^"]*)"', source) or "")
            section = SECTION_NAMES.get(rel.split("/")[0] if "/" in rel else "", "ToolVault")
            llms.append({"url": url, "name": name, "description": description, "section": section})
        status = "noindex" if not is_indexable(source) else f"faq={faq_count}"
        print(f"{rel:52} {status}")

    if args.check:
        if stale:
            print(f"\n{len(stale)} page(s) out of date: run python3 scripts/seo.py", file=sys.stderr)
            return 1
        return 0
    write_sitemap(sitemap)
    write_llms(llms)
    print(f"\nsitemap.xml: {len(sitemap)} URLs · llms.txt: {len(llms)} entries")
    return 0


if __name__ == "__main__":
    sys.exit(main())
