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
    "img-pdf": '<rect x="3" y="4" width="10" height="9" rx="1.5"/><path d="M3 11l3-3 3 3 2-2 2 2"/><path d="M14 9h4l3 3v8H10v-4"/><path d="M18 9v3h3"/>',
    "pdf-img": '<path d="M5 3h7l4 4v6"/><path d="M12 3v4h4"/><rect x="9" y="12" width="12" height="9" rx="1.5"/><path d="M9 19l3-3 3 3 2-2 4 4"/>',
    "split": '<path d="M6 3h7l4 4v4"/><path d="M13 3v4h4"/><path d="M6 3v8"/><path d="M3 14h18" stroke-dasharray="2 2"/><path d="M6 17v4h11v-4"/>',
    "rotate": '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    "compress": '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M12.5 9.5v3m0 0l-1.5-1.5m1.5 1.5l1.5-1.5M12.5 18.5v-3m0 0l-1.5 1.5m1.5-1.5l1.5 1.5"/>',
    "scale": '<path d="M6 8h12l2 12H4z"/><circle cx="12" cy="5" r="2"/><path d="M12 11v4"/>',
    "thermo": '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>',
    "drop": '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    "route": '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6.5a3 3 0 0 0 0-6h-5a3 3 0 0 1 0-6H16"/>',
    "height": '<circle cx="9" cy="5" r="2"/><path d="M9 7v7M6 21l3-7 3 7M5.5 10.5h7"/><path d="M18 3v18M16 5l2-2 2 2M16 19l2 2 2-2"/>',
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
        "label": "Converters", "hub": "/converters/", "icon": "units",
        "h1": "Unit Converters",
        "intro": "Convert length, weight, volume and temperature between metric and US or UK units. Every converter uses the exact legal definition of each unit and includes a conversion chart.",
        "summary": "Length, weight, volume and temperature: cm to inches, kg to lbs, °C to °F and more.",
        "tools": [
            ("CM to Inches", "/converters/cm-to-inches", "Centimetres ↔ inches",
             "Convert centimetres to inches and inches to cm, with a chart.", "units",
             "cm to inches centimeters to inches inches to cm convert length", "tool"),
            ("KG to LBS", "/converters/kg-to-lbs", "Kilograms ↔ pounds",
             "Convert kilograms to pounds and lbs to kg, including stones.", "scale",
             "kg to lbs kilograms to pounds lbs to kg pounds to kg weight stone", "tool"),
            ("Celsius to Fahrenheit", "/converters/celsius-to-fahrenheit", "Celsius ↔ Fahrenheit",
             "Convert °C to °F and °F to °C for weather, cooking and body temperature.", "thermo",
             "celsius to fahrenheit c to f fahrenheit to celsius temperature oven", "tool"),
            ("Height: Feet & Inches to CM", "/converters/feet-and-inches-to-cm", "Feet and inches ↔ cm",
             "Convert height in feet and inches to centimetres and back.", "height",
             "height converter feet and inches to cm cm to feet ft to cm", "tool"),
            ("Feet to Meters", "/converters/feet-to-meters", "Feet ↔ metres",
             "Convert feet to metres and metres to feet.", "units",
             "feet to meters ft to m meters to feet metres", "tool"),
            ("Miles to KM", "/converters/miles-to-km", "Miles ↔ kilometres",
             "Convert miles to kilometres, with 5K, 10K and marathon distances.", "route",
             "miles to km mi to km km to miles kilometers distance running", "tool"),
            ("Grams to Ounces", "/converters/grams-to-ounces", "Grams ↔ ounces",
             "Convert grams to ounces and back for cooking and weighing.", "scale",
             "grams to ounces g to oz ounces to grams cooking baking", "tool"),
            ("ML to OZ", "/converters/ml-to-oz", "Millilitres ↔ fluid ounces",
             "Convert millilitres to US or UK fluid ounces and back.", "drop",
             "ml to oz ml to fl oz oz to ml fluid ounces milliliters", "tool"),
            ("Liters to Gallons", "/converters/liters-to-gallons", "Litres ↔ gallons",
             "Convert litres to US or UK gallons and back.", "drop",
             "liters to gallons litres gallons to liters us uk imperial fuel", "tool"),
            ("MM to Inches", "/converters/mm-to-inches", "Millimetres ↔ inches",
             "Convert millimetres to inches, with the nearest 1/16-inch fraction.", "units",
             "mm to inches millimeters to inches inches to mm fraction", "tool"),
        ],
    },
    {
        "label": "PDF Tools", "hub": "/documents/", "icon": "merge",
        "h1": "Free PDF Tools Online",
        "intro": "Merge, split, compress and rotate PDFs, convert images to PDF and PDF pages to images, or turn a PDF into an editable Word document. The browser tools process files on your device, so nothing is uploaded.",
        "summary": "Merge, split, compress and rotate PDFs; convert JPG to PDF, PDF to JPG and PDF to Word.",
        "tools": [
            ("Merge PDF", "/documents/merge-pdf", "Combine PDFs in your browser",
             "Combine PDF files in the order you choose. Files stay in your browser.", "merge",
             "merge pdf combine join pdf files documents browser", "tool"),
            ("PDF to Word", "/documents/pdf-to-word", "Convert PDF to editable DOCX",
             "Convert a PDF to a Word DOCX, keeping the layout or extracting editable text.", "doc-convert",
             "pdf to word converter docx editable microsoft word convert", "tool"),
            ("JPG to PDF", "/documents/jpg-to-pdf", "Images to one PDF",
             "Turn JPG, PNG or WebP images into a PDF, in your browser.", "img-pdf",
             "jpg to pdf image to pdf png to pdf photo to pdf convert combine images", "tool"),
            ("PDF to JPG", "/documents/pdf-to-jpg", "Save pages as images",
             "Save PDF pages as JPG or PNG images, up to 300 DPI.", "pdf-img",
             "pdf to jpg pdf to image pdf to png convert pages to images", "tool"),
            ("Compress PDF", "/documents/compress-pdf", "Reduce PDF file size",
             "Make a PDF smaller for email and upload limits.", "compress",
             "compress pdf reduce pdf size shrink pdf smaller file size", "tool"),
            ("Split PDF", "/documents/split-pdf", "Extract or separate pages",
             "Extract pages or split a PDF into separate files.", "split",
             "split pdf extract pages separate pdf delete pages", "tool"),
            ("Rotate PDF", "/documents/rotate-pdf", "Turn pages the right way up",
             "Rotate all or selected PDF pages and save them.", "rotate",
             "rotate pdf turn pages sideways upside down orientation", "tool"),
        ],
    },
]

# Homepage "popular" shortcuts under the search box.
POPULAR = ["/converters/cm-to-inches", "/converters/kg-to-lbs", "/construction/concrete-calculator",
           "/calculators/square-footage-calculator", "/documents/pdf-to-word"]


def all_tools():
    for section in SECTIONS:
        for name, path, menu_desc, card_desc, icon_name, keywords, kind in section["tools"]:
            yield section, {"name": name, "path": path, "menu": menu_desc, "card": card_desc,
                            "icon": icon_name, "keywords": keywords, "kind": kind}
