"""Fetch pinned external validation inputs; originals remain local, unmodified.

Run from the repository root. No third-party code or drawings are embedded in
the application. The downloaded converter is a standalone test utility.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "output/external/civil-projects"
COMMIT = "5bdb0e47140f8bbbc59d630513971cbb11409cbb"
VERSION = "0.14.8612"
FILES = {
    "2D_FloorPlan_and_Elevation.dwg": "e2264a4d9acb5c877106b8a7d5417cb47c86d3d8858aaff864705684ebf2a7d6",
    "2D_FloorPlan_and_Elevation-Model.pdf": "f6e31754725eb270df5aa3e4ef4b54c7165c4631bb0d178f5ce43be04cd27b32",
}
OUT.mkdir(parents=True, exist_ok=True)
for name, expected in FILES.items():
    path = OUT / name
    if not path.exists():
        urllib.request.urlretrieve(f"https://raw.githubusercontent.com/Abhishekh-Jha/Civil_projects/{COMMIT}/{name}", path)
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise RuntimeError(f"Source checksum mismatch: {name}")

tool_dir = ROOT / f"tmp/tools/libredwg-{VERSION}"
tool = tool_dir / "dwg2dxf.exe"
release = f"https://github.com/LibreDWG/libredwg/releases/download/{VERSION}/libredwg-{VERSION}-win64.zip"
if not tool.exists():
    tool_dir.mkdir(parents=True, exist_ok=True)
    archive = tool_dir / "distribution.zip"
    urllib.request.urlretrieve(release, archive)
    with zipfile.ZipFile(archive) as contents:
        for item in contents.infolist():
            target = (tool_dir / item.filename).resolve()
            if not target.is_relative_to(tool_dir.resolve()):
                raise RuntimeError("Unsafe converter archive path")
        contents.extractall(tool_dir)
if not (OUT / "converted.dxf").exists():
    result = subprocess.run([str(tool), "-o", str(OUT / "converted.dxf"), str(OUT / "2D_FloorPlan_and_Elevation.dwg")], capture_output=True)
    (OUT / "conversion.log").write_bytes(result.stdout + result.stderr)
    if result.returncode or not (OUT / "converted.dxf").exists():
        raise RuntimeError("DWG conversion failed; inspect conversion.log")
manifest = {
    "repository": "https://github.com/Abhishekh-Jha/Civil_projects", "commit": COMMIT,
    "files": {p.name: {"bytes": p.stat().st_size, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()} for p in [*(OUT / name for name in FILES), OUT / "converted.dxf"]},
    "converter": {"version": VERSION, "download": release},
    "limitations": ["Public source has no observed LICENSE; local validation inputs, not application assets.", "LibreDWG reports unstable classes. Conversion is not assumed lossless."],
}
(OUT / "source-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
print(f"Pinned DWG/PDF and converted DXF ready: {OUT}")
