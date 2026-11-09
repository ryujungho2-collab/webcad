"""Independent checks of the delivered WF-Q1 files; render PDFs with Poppler first."""
import hashlib
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree as ET

from PIL import Image, ImageChops
from pypdf import PdfReader

root = Path(sys.argv[1] if len(sys.argv) > 1 else "output/projects/residential-q1")
names = ["issue-01-50", "issue-02-50", "issue-03-100"]
report = {"method": "pypdf + XML + Pillow, independent of the WebCAD renderer", "issues": []}
for name, denominator in zip(names, [50, 50, 100]):
    pdf = PdfReader(root / f"{name}.pdf")
    assert len(pdf.pages) == 1
    page = pdf.pages[0]
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    assert abs(width * 25.4 / 72 - 420) < 0.01
    assert abs(height * 25.4 / 72 - 297) < 0.01
    svg = (root / f"{name}.svg").read_text(encoding="utf-8")
    tree = ET.fromstring(svg)
    assert tree.attrib["viewBox"] == "10000 -10297 420 297"
    assert all(s in svg for s in ["주거 평면", "단면 A-A", f"1:{denominator}"])
    weights = set(re.findall(r'stroke-width="([^"]+)"', svg))
    assert {"0.5", "0.18", "0.13"}.issubset(weights)
    image = Image.open(root / f"{name}.png").convert("RGB")
    # Paper position (30,160) + model hole center (4500,3000)/N.
    x = round((30 + 4500 / denominator) / 420 * image.width)
    y = round((297 - 160 - 3000 / denominator) / 297 * image.height)
    assert min(image.getpixel((x, y))) > 245, "Hole center must remain unfilled"
    radius = 500 / denominator / 420 * image.width
    edge = image.crop((int(x+radius)-3, y-3, int(x+radius)+4, y+4))
    assert min(low for low, high in edge.getextrema()) < 245, "Circular hole boundary must render"
    report["issues"].append({"name": name, "pages": 1, "paperMm": [420, 297],
        "denominator": denominator, "strokeWidthsMm": sorted(weights),
        "holeCenterWhite": True, "holeBoundaryRendered": True, "pdfBytes": (root / f"{name}.pdf").stat().st_size})

first = Image.open(root / "issue-01-50.png").convert("RGB")
second = Image.open(root / "issue-02-50.png").convert("RGB")
assert ImageChops.difference(first, second).getbbox(), "Wall edit must change the independently rendered PDF"
portable = json.loads((root / "residential.webcad.json").read_text(encoding="utf-8"))
assert portable["version"] == 42
document = portable["document"]
presentation = document["modelPresentation"]
assert len(presentation["parts"]) == 11
assert len(presentation["sections"]) == 2
assert all(view["status"] == "resolved" for view in presentation["sections"].values())
assert all(part["objectId"] in document["objects"] for part in presentation["parts"].values())
assert all(source in document["objects"] for f in document["features"].values() for source in f["inputs"])
contents = [f["params"]["componentContent"] for f in document["features"].values() if "componentContent" in f["params"]]
assert len(contents) == 4
assert all(c["definitionId"] in document["componentLibrary"] for c in contents)
assert all(c["slot"]["hostId"] in document["objects"] for c in contents if c["slot"]["kind"] == "opening")
assert all(layer["locked"] for layer in document["layers"].values() if layer["name"].startswith("CAD /"))
report.update({"version": 42, "parts": 11, "resolvedSections": 2, "contents": 4,
    "missingFeatureInputs": 0, "lockedReferencesPreserved": True, "editedPdfPixelsDiffer": True,
    "visualReview": "See implementation report; Korean labels, line hierarchy, hole and unclipped content inspected on all three Poppler PNGs.",
    "sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(root.iterdir()) if path.suffix in [".pdf", ".svg", ".dxf"] or path.name == "residential.webcad.json"}})
(root / "independent-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"status": "passed", "pdfs": 3, "resolvedSections": 2, "missingFeatureInputs": 0}, ensure_ascii=False))
