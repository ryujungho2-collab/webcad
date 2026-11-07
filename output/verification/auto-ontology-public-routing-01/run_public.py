"""Check the public gateway on the previously compiled synthetic join catalog."""

from datetime import datetime
import json
import os
from pathlib import Path
import runpy


ROOT = Path(__file__).resolve().parent
LIVE = ROOT.parent / "auto-ontology-live-01"
JOIN = ROOT.parent / "auto-ontology-join-01"
POC = ROOT.parent / "auto-ontology-poc-01"


def main():
    live = runpy.run_path(str(LIVE / "run_live.py"))
    load, dump = live["load"], live["dump"]
    manifest = load(JOIN / "questions-with-schema-evidence.json")
    opener = live["authenticate"](Path(os.environ["TEMP"]) / "webcad-auto-ontology-join-01")
    with live["request"](opener, live["BACKEND"] + "/api/semantic-compilation/status") as response:
        status = json.load(response)
    previous = load(JOIN / "live-compilation.json")["status"]
    if (not status["calculated"] or status["running"] or not status["last_success_at"]
            or datetime.fromisoformat(status["last_success_at"]) != datetime.fromisoformat(previous["last_success_at"])):
        raise RuntimeError("The previously compiled join catalog was not verified")
    dump(ROOT / "catalog-status.json", status)
    capture = live["capture"]
    capture.__globals__["ROOT"] = ROOT

    conditions = {"original": manifest}
    for entry in manifest:
        capture(opener, {**entry, "id": f"original-{entry['id']}"})
    if any(not load(ROOT / f"original-{entry['id']}-live.json")["sql"] for entry in manifest):
        explicit = []
        for entry in manifest:
            column = {"forward": "source_id", "reverse": "target_id"}[entry["id"]]
            wording = (f"Filter the actual data rows stored in the connected SQLite view cad_profile_extrude "
                       f"where {column} equals '{entry['selectedObjectId']}'. Run a read-only data query and "
                       "return the matching rows with all their fields.")
            explicit.append({**entry, "request": {**entry["request"], "question": wording}})
        conditions["explicit-filter"] = explicit
        for entry in explicit:
            capture(opener, {**entry, "id": f"explicit-filter-{entry['id']}"})

    compare = runpy.run_path(str(POC / "run_local.py"))["compare"]
    report = {}
    for condition, entries in conditions.items():
        directions = {}
        for entry in entries:
            direction = entry["id"]
            stem = f"{condition}-{direction}-live"
            result = load(ROOT / f"{stem}.json")
            assert result["request"] == entry["request"]
            sse = ROOT / f"{stem}.sse"
            nodes = []
            if sse.is_file():
                for line in sse.read_text(encoding="utf-8").splitlines():
                    if line.startswith("data: {"):
                        event = json.loads(line[6:])
                        if event.get("type") == "step" and event.get("phase") == "start":
                            nodes.append(event.get("node"))
            result.update(nodes=list(dict.fromkeys(nodes)), comparison=None, normalized=None)
            if result["done"] and not result["error"] and result["sql"] and result["rows"] is not None:
                normalized, missing = live["normalize"](result["rows"], entry["selectedObjectId"])
                baseline = LIVE / "forward-baseline.json" if direction == "forward" else POC / "baseline.json"
                result.update(normalized=normalized, missingFieldsByRow=missing,
                              comparison=compare(load(baseline), normalized))
                (ROOT / f"{condition}-{direction}.sql").write_text(result["sql"].strip() + "\n", encoding="utf-8")
            directions[direction] = result
        report[condition] = directions
    dump(ROOT / "evaluation.json", report)


if __name__ == "__main__":
    main()
