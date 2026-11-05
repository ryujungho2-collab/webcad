"""Read-only QA of native R5 PDFs, exact stored boundaries and shared paper hatch."""
import hashlib
import json
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageChops
from pypdf import PdfReader

root = Path(__file__).resolve().parents[3] / "output/projects/curve-hatch-r5"
document = json.loads((root / "curve-r5.webcad.json").read_text(encoding="utf-8"))["document"]
presentation = document["modelPresentation"]
original = json.loads((root.parent / "courtyard-commons/issued-r5/courtyard-commons.webcad.json").read_text(encoding="utf-8"))["document"]["modelPresentation"]
for group in ["parts", "projections", "sections", "sheets"]:
    assert all(presentation[group].get(key) == value for key, value in original[group].items()), f"Original R5 {group} must remain unchanged"
features = {f["output"]: f for f in document["features"].values()}
assert len(presentation["parts"]) == 58
assert len(presentation["projections"]) + len(presentation["sections"]) == 16
assert len(presentation["sheets"]) == 11
section = presentation["sections"]["h2-ellipse"]
scale = section["scale"]
theta = math.radians(section["presentation"]["angle"])
center_x = 80 * math.tan(math.pi / 6)
strokes = 0
for item in section["decorations"].values():
    if item["role"] != "hatch":
        continue
    strokes += 1
    points = features[item["objectId"]]["params"]["points"]
    normalized = []
    for x, y, *_ in points:
        px, py = x - section["origin"][0], y - section["origin"][1]
        row = (-px * math.sin(theta) + py * math.cos(theta)) / 2
        assert abs(row - round(row)) < 1e-7, "Hatch spacing must remain 2 paper mm"
        normalized.append(((px / scale - center_x) / (16 / math.cos(math.pi / 6)), py / scale / 16))
    a, b = normalized
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0, min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy)))
    assert (a[0] + t * dx) ** 2 + (a[1] + t * dy) ** 2 >= 1 - 1e-6, "Hatch must not cross the elliptic hole"
assert strokes > 10

report = {"parts": 58, "drawings": 16, "sheets": 11, "originalR5DefinitionsUnchanged": True, "ellipseHatchStrokes": strokes, "holeSegmentsVerified": True, "paperSpacingMm": 2, "pdfs": []}
images = []
for name, denominator in [("curve-01-1", 1), ("curve-02-1", 1), ("curve-03-2", 2)]:
    pdf, svg = root / f"{name}.pdf", (root / f"{name}.svg").read_text(encoding="utf-8")
    reader = PdfReader(pdf)
    assert len(reader.pages) == 1
    width, height = [float(v) * 25.4 / 72 for v in reader.pages[0].mediabox[2:]]
    assert abs(width - 420) < .01 and abs(height - 297) < .01
    assert "<ellipse " in svg and 'data-source-curve="nurbs"' in svg
    assert 'stroke-width="0.13"' in svg and "H2 ELLIPSE + HOLE" in svg and "H2 SPLINE + LINE" in svg
    subprocess.run(["pdftoppm", "-r", "144", "-png", "-singlefile", str(pdf), str(root / name)], check=True, capture_output=True)
    image = Image.open(root / f"{name}.png").convert("RGB")
    images.append(image)
    sx, sy = image.width / 420, image.height / 297
    cx, cy = 60 + center_x / denominator, 117
    rx, ry = 40 / math.cos(math.pi / 6) / denominator, 40 / denominator
    hole_white, material, dark = True, 0, 0
    for y in range(round((cy - ry) * sy), round((cy + ry) * sy) + 1):
        for x in range(round((cx - rx) * sx), round((cx + rx) * sx) + 1):
            radius2 = ((x / sx - cx) / rx) ** 2 + ((y / sy - cy) / ry) ** 2
            shade = min(image.getpixel((x, y)))
            if radius2 < (.4 * .6) ** 2:
                hole_white &= shade > 245
            if (.4 * 1.2) ** 2 < radius2 < .9 ** 2:
                material += 1
                dark += shade < 220
    assert hole_white, "Independent PDF rendering must leave the hole interior white"
    assert .01 < dark / material < .35, "Material must contain visible hatch rather than blank or solid fill"
    report["pdfs"].append({"file": pdf.name, "paperMm": [width, height], "denominator": denominator, "holeWhite": hole_white, "hatchedMaterialDarkFraction": dark / material, "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest()})
assert ImageChops.difference(images[0], images[1]).getbbox(), "Cut-plane edit must change the independently rendered spline page"
(root / "artifact-verification.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
