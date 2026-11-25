"""ToolVault site structure: the single list of sections, tools and icons.

scripts/layout.py builds the main menu, the footer, the homepage tool
directory and the category-page tool grids from this file. To publish a new
tool, add it to its section here and run `npm run seo`.
"""

# Line icons drawn on a 24×24 grid (stroke only), so they look the same on
# every device, unlike emoji.
ICONS = {
    "block": '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
    "stones": '<ellipse cx="8" cy="15" rx="4.5" ry="3.5"/><ellipse cx="16.5" cy="16" rx="3.5" ry="3"/><ellipse cx="13" cy="8.5" rx="3.5" ry="3"/>',
    "leaf": '<path d="M5 19C5 11 11 5 19 5c0 8-6 14-14 14z"/><path d="M5 19l8-8"/>',
    "roller": '<rect x="4" y="4" width="13" height="5" rx="1.5"/><path d="M17 6.5h2.5v5.5H11v2.5"/><rect x="9.5" y="14.5" width="3" height="6" rx="1"/>',
    "stairs": '<path d="M3 20h5v-4.5h4.5V11H17V6.5h4"/>',
    "roof": '<path d="M3 12l9-7 9 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
    "lumber": '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M7 12h5M15.5 10.5c1 1 1 2 0 3"/>',
    "book": '<path d="M5 5a2 2 0 0 1 2-2h11v15H7a2 2 0 0 0-2 2z"/><path d="M5 20a2 2 0 0 0 2 1h11v-3"/><path d="M9 7h5"/>',
    "panel": '<path d="M5 14l2-9h10l2 9z"/><path d="M6 9.5h12M10.3 5l-.8 9M13.7 5l.8 9M12 14v5M8.5 19h7"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    "battery": '<rect x="3" y="7" width="16" height="10" rx="2"/><path d="M21 10.5v3M7 10.5v3M10.5 10.5v3"/>',
    "bolt": '<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
    "snow": '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/><path d="M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>',
    "floorplan": '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12.5h8.5V4M12.5 16v4M15.5 12.5H20"/>',
    "merge": '<path d="M8 3h7l4 4v10H8z"/><path d="M15 3v4h4"/><path d="M5 7v12.5a1.5 1.5 0 0 0 1.5 1.5H16"/>',
    "doc-convert": '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M12.5 10.5L15 13l-2.5 2.5"/>',
    "calculator": '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
    "search": '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    "formula": '<path d="M4 7h7M7.5 3.5v7M4 17h7M14 14l5 5M19 14l-5 5M14 6h6"/>',
    "units": '<path d="M3 17l14-14 4 4L7 21z"/><path d="M7 13l1.5 1.5M10 10l1.5 1.5M13 7l1.5 1.5"/>',
    "check": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    "free": '<path d="M12 21s-7-4.4-7-10.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 16.6 12 21 12 21z"/>',
    "arrow": '<path d="M5 12h14M13 6l6 6-6 6"/>',
}


def icon(name: str, cls: str = "tv-icon") -> str:
    return (f'<svg class="{cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">{ICONS[name]}</svg>')


# Each section: hub path, menu label, icon, one-line summary, tools.
# Each tool: name, path, menu description, card description, icon, search keywords, kind.
SECTIONS = [
    {
        "label": "Construction", "hub": "/construction/", "icon": "block",
        "h1": "Construction Calculators & Estimating Tools",
        "intro": "Free calculators for concrete, gravel, mulch, paint, stairs, roof pitch and lumber. Enter metric or imperial measurements and get quantities, weights and costs, with the formula behind every result.",
        "summary": "Material quantities for concrete, gravel, mulch, paint, stairs, roofs and lumber.",
        "tools": [
            ("Concrete Calculator", "/construction/concrete-calculator", "Slabs, footings, walls and columns",
             "Concrete volume, weight, bags and cost for slabs, footings, walls and round columns.", "block",
             "concrete cement slab footing wall column cubic yards bags cost", "tool"),
            ("Gravel Calculator", "/construction/gravel-calculator", "Volume, weight, bags and cost",
             "Gravel, crushed stone and aggregate volume, weight, bags and cost.", "stones",
             "gravel crushed stone aggregate driveway landscaping volume weight cost", "tool"),
            ("Mulch Calculator", "/construction/mulch-calculator", "Cubic yards, bags and coverage",
             "Mulch for garden beds and tree rings in cubic yards, bags and coverage.", "leaf",
             "mulch coverage cubic yards bags landscaping garden beds tree ring", "tool"),
            ("Paint Calculator", "/construction/paint-calculator", "Litres, gallons and cans",
             "Paint for walls, rooms and ceilings in litres, US gallons and cans.", "roller",
             "paint wall coverage quantity room ceiling gallons litres cans", "tool"),
            ("Stair Calculator", "/construction/stair-calculator", "Risers, treads and stringers",
             "Riser height, tread count, total run, stair angle and stringer length.", "stairs",
             "stair staircase rise run riser tread stringer length angle steps", "tool"),
            ("Roof Pitch Calculator", "/construction/roof-pitch-calculator", "Pitch, angle and rafter length",
             "Roof pitch, angle, slope percentage, pitch multiplier and rafter length.", "roof",
             "roof pitch slope rise run angle pitch multiplier rafter length", "tool"),
            ("Board Foot Calculator", "/construction/board-foot-calculator", "Lumber volume and cost",
             "Board feet, cubic volume, waste and cost for mixed lumber sizes.", "lumber",
             "board foot lumber board feet hardwood wood volume cost", "tool"),
            ("How to Calculate Concrete", "/construction/how-to-calculate-concrete", "Step-by-step guide",
             "Concrete volume formulas for slabs, footings and round forms, with worked examples.", "book",
             "how to calculate concrete volume slab footing yards guide formula", "guide"),
        ],
    },
    {
        "label": "Solar", "hub": "/solar/", "icon": "sun",
        "h1": "Solar Tools & Calculators",
        "intro": "Plan a solar PV system: add up your appliance load, size the panels, inverter and batteries, estimate daily generation for your location, and check how much roof space the panels need.",
        "summary": "Size a PV system, estimate daily generation and plan panel space.",
        "tools": [
            ("Solar Load Calculator", "/solar/solar-load-calculator", "PV, inverter and battery sizing",
             "Appliance load, daily kWh, PV capacity, inverter size and battery capacity.", "battery",
             "solar load pv battery inverter energy load sizing appliances kwh", "tool"),
            ("Solar Energy Generation", "/solar/solar-energy-generation-calculator", "Daily kWh from your location",
             "Daily and multi-day PV output in kWh from your location and weather.", "sun",
             "solar energy generation pv output weather location kwh forecast", "tool"),
            ("Solar Panel Area", "/solar/solar-panel-area-calculator", "Roof space for your panels",
             "Panel surface and the roof or ground area your panels need.", "panel",
             "solar panel area roof space panel surface pv area", "tool"),
            ("How to Size a Solar System", "/solar/how-to-calculate-solar-system-size", "Step-by-step guide",
             "How load, PV capacity, inverter size and battery capacity fit together.", "book",
             "how to calculate solar system size guide panels inverter battery", "guide"),
        ],
    },
    {
        "label": "Engineering", "hub": "/engineering/", "icon": "bolt",
        "h1": "Engineering Calculators",
        "intro": "Electrical calculations with the formulas shown. Check the voltage drop on a cable run, find the longest run for an allowed drop, or the smallest cable size that meets it.",
        "summary": "Electrical calculations for cable runs, with the formulas shown.",
        "tools": [
            ("Voltage Drop Calculator", "/engineering/voltage-drop-calculator", "Cable drop, length and size",
             "Voltage drop, maximum cable length and minimum cable size for DC, single and three phase.", "bolt",
             "voltage drop dc ac three phase cable wire awg mm2 copper aluminium electrical", "tool"),
            ("How to Calculate Voltage Drop", "/engineering/how-to-calculate-voltage-drop", "Step-by-step guide",
             "Resistance-based voltage drop formulas with a worked cable example.", "book",
             "how to calculate voltage drop formula awg cable length guide", "guide"),
        ],
    },
    {
        "label": "Calculators", "hub": "/calculators/", "icon": "calculator",
        # This hub lists every calculator; its own two tools are grouped as "Home & room".
        "group_label": "Home & room", "card_label": "All calculators",
        "card_summary": "Every ToolVault calculator in one place, from concrete and stairs to solar and voltage drop.",
        "h1": "All Calculators",
        "intro": "Every ToolVault calculator in one place: construction materials, solar sizing, electrical cable runs, floor area and air-conditioner size. Each one shows its formula and accepts metric or imperial units.",
        "summary": "Everyday home and room calculations: floor area and air-conditioner size.",
        "tools": [
            ("Square Footage Calculator", "/calculators/square-footage-calculator", "Area of rooms and shapes",
             "Square feet, metres and yards for rooms, floors, triangles and circles.", "floorplan",
             "square footage feet room area floor plan square meters sqft", "tool"),
            ("AC BTU Calculator", "/calculators/ac-btu-calculator", "Air conditioner size for a room",
             "Room air-conditioner size in BTU/h, tons and kW.", "snow",
             "ac btu air conditioner size room cooling tons kilowatts hvac", "tool"),
        ],
    },
    {
        "label": "PDF Tools", "hub": "/documents/", "icon": "merge",
        "h1": "Free PDF Tools Online",
        "intro": "Merge PDF files in your browser, or convert a PDF to an editable Word document.",
        "summary": "Merge PDFs in your browser and convert PDF to editable Word.",
        "tools": [
            ("Merge PDF", "/documents/merge-pdf", "Combine PDFs in your browser",
             "Combine PDF files in the order you choose. Files stay in your browser.", "merge",
             "merge pdf combine join pdf files documents browser", "tool"),
            ("PDF to Word", "/documents/pdf-to-word", "Convert PDF to editable DOCX",
             "Convert a PDF to a Word DOCX, keeping the layout or extracting editable text.", "doc-convert",
             "pdf to word converter docx editable microsoft word convert", "tool"),
        ],
    },
]

# Homepage "popular" shortcuts under the search box.
POPULAR = ["/construction/concrete-calculator", "/construction/paint-calculator",
           "/calculators/square-footage-calculator", "/calculators/ac-btu-calculator", "/documents/pdf-to-word"]


def all_tools():
    for section in SECTIONS:
        for name, path, menu_desc, card_desc, icon_name, keywords, kind in section["tools"]:
            yield section, {"name": name, "path": path, "menu": menu_desc, "card": card_desc,
                            "icon": icon_name, "keywords": keywords, "kind": kind}
