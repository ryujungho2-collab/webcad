"""Read-only independent checks of native E2 DXF downloads and paper PDF.

Cox basis evaluation and a dense piecewise-polynomial natural-cubic solve do
not call the product parser, knot insertion, tridiagonal solver or evaluator.
"""
import hashlib
import json
import math
import subprocess
from pathlib import Path
from PIL import Image
from pypdf import PdfReader

root = Path(__file__).resolve().parents[3] / "output/projects/curve-dxf"


def read_splines(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    pairs = [(int(lines[i]), lines[i + 1]) for i in range(0, len(lines) - 1, 2)]
    result = []
    for i, (code, value) in enumerate(pairs):
        if code != 0 or value != "SPLINE":
            continue
        fields = {}
        for c, v in pairs[i + 1:]:
            if c == 0:
                break
            fields.setdefault(c, []).append(v)
        scalar = lambda c: int(fields.get(c, ["0"])[0])
        coords = lambda c: list(zip(*[[float(v) for v in fields.get(k, [])] for k in [c, c + 10, c + 20]]))
        result.append({"degree": scalar(71), "flags": scalar(70), "knots": list(map(float, fields.get(40, []))), "weights": list(map(float, fields.get(41, []))), "poles": coords(10), "fit": coords(11)})
    return result


def cox(s, t):
    p, u, poles = s["degree"], s["knots"], s["poles"]
    # Recursive half-open basis; evaluate the exact clamped right endpoint.
    if t == u[len(poles)] and u.count(t) == p + 1:
        return poles[-1]

    def basis(i, degree):
        if degree == 0:
            return float(u[i] <= t < u[i + 1])
        a, b = u[i + degree] - u[i], u[i + degree + 1] - u[i + 1]
        return ((t - u[i]) / a * basis(i, degree - 1) if a else 0) + ((u[i + degree + 1] - t) / b * basis(i + 1, degree - 1) if b else 0)

    weighted = [basis(i, p) * (s["weights"][i] if s["weights"] else 1) for i in range(len(poles))]
    return [sum(q[j] * w for q, w in zip(poles, weighted)) / sum(weighted) for j in range(3)]


def natural_polynomials(points):
    lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
    ts = [0]
    for length in lengths:
        ts.append(ts[-1] + length / sum(lengths))
    m, count = len(lengths), 4 * len(lengths)
    rows, values = [], []

    def equation(terms, value):
        row = [0.] * count
        for interval, coefficients in terms:
            for j, c in enumerate(coefficients):
                row[interval * 4 + j] += c
        rows.append(row)
        values.append(list(value))

    for i in range(m):
        h = ts[i + 1] - ts[i]
        equation([(i, [1, 0, 0, 0])], points[i])
        equation([(i, [1, h, h*h, h*h*h])], points[i + 1])
        if i < m - 1:
            equation([(i, [0, 1, 2*h, 3*h*h]), (i + 1, [0, -1, 0, 0])], [0, 0, 0])
            equation([(i, [0, 0, 2, 6*h]), (i + 1, [0, 0, -2, 0])], [0, 0, 0])
    equation([(0, [0, 0, 2, 0])], [0, 0, 0])
    equation([(m - 1, [0, 0, 2, 6*(ts[-1]-ts[-2])])], [0, 0, 0])
    # Dense pivoted elimination with three right-hand sides, independent of the
    # product's tridiagonal second derivatives and Bezier control construction.
    matrix = [r + v for r, v in zip(rows, values)]
    for j in range(count):
        pivot = max(range(j, count), key=lambda k: abs(matrix[k][j]))
        matrix[j], matrix[pivot] = matrix[pivot], matrix[j]
        divisor = matrix[j][j]
        assert abs(divisor) > 1e-14
        matrix[j] = [v / divisor for v in matrix[j]]
        for k in range(count):
            if k != j:
                factor = matrix[k][j]
                matrix[k] = [a - factor*b for a, b in zip(matrix[k], matrix[j])]
    coefficients = [row[count:] for row in matrix]

    def evaluate(t):
        i = next((i for i in range(m) if ts[i + 1] >= t), m - 1)
        x = t - ts[i]
        return [sum(coefficients[4*i+k][axis] * x**k for k in range(4)) for axis in range(3)]
    return evaluate


source, exported, crop = read_splines(root / "source.dxf"), read_splines(root / "curves.dxf"), read_splines(root / "crop.dxf")
assert len(source) == len(exported) == 2
assert all(not (s["flags"] & 2) and not s["fit"] for s in exported)
natural = natural_polynomials(source[1]["fit"])
deviations, samples = [], []
for i in range(1001):
    t = 3.8 if i == 1000 else .2 + 3.6*i/1000
    expected = list(cox(source[0], t)); expected[0] += 2
    actual = cox(exported[0], t)
    deviations.append(math.dist(expected, actual)); samples.append(actual)
    expected_fit = natural(i/1000)
    actual_fit = cox(exported[1], i/1000)
    deviations.append(math.dist(expected_fit, actual_fit)); samples.append(actual_fit)
assert max(deviations) < 1e-8
assert len(crop) >= 2
for s in crop:
    a, b = s["knots"][s["degree"]], s["knots"][len(s["poles"])]
    assert a < b and all(10-1e-7 <= cox(s, a+(b-a)*i/100)[0] <= 30+1e-7 for i in range(101))
pdf = root / "curves.pdf"
reader = PdfReader(pdf)
assert len(reader.pages) == 1
box = reader.pages[0].mediabox
size = [float(box.width)*25.4/72, float(box.height)*25.4/72]
assert all(abs(a-b) < .01 for a, b in zip(size, [148, 105]))
subprocess.run(["pdftoppm", "-r", "144", "-png", "-singlefile", str(pdf), str(root / "curves")], check=True, capture_output=True)
image = Image.open(root / "curves.png").convert("RGB")
sx, sy = image.width/148, image.height/105
hits = 0
for x, y, _ in samples:
    px, py = round((x+10)*sx), round((85-y)*sy)
    region = image.crop((px-3, py-3, px+4, py+4))
    hits += any(min(pixel) < 210 for pixel in region.getdata())
assert hits/len(samples) > .98, "Expected curves must be visible in the actual native PDF"
svg = (root / "curves.svg").read_text(encoding="utf-8")
assert 'data-source-curve="nurbs"' in svg and 'data-tolerance-mm="0.02"' in svg
report = {"status": "passed", "independentCurveSamples": len(deviations), "maxDeviationMm": max(deviations), "references": ["recursive Cox basis against original wrapped rational DXF, with UI pole translation and finite trim", "dense piecewise cubic polynomial solve with natural endpoint and C1/C2 constraints"], "cropPieces": len(crop), "pdf": {"pages": 1, "sizeMm": size, "renderDpi": 144, "expectedCurvePixelHitFraction": hits/len(samples), "sha256": hashlib.sha256(pdf.read_bytes()).hexdigest()}, "boundaries": ["Fit comparison is against the declared natural reconstruction policy; original between-point CAD curve is unknown", "Self-authored DXF fixtures and product downloads; no external CAD application interoperability claim"]}
(root / "artifact-verification.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
print(json.dumps(report, indent=2))
