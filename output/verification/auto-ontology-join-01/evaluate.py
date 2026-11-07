"""Prepare schema-only guidance and compare the model's actual SQLite rows."""

import argparse
import json
from pathlib import Path
import runpy
import sqlite3


ROOT = Path(__file__).resolve().parent
LIVE = ROOT.parent / "auto-ontology-live-01"
POC = ROOT.parent / "auto-ontology-poc-01"
EVIDENCE = (
    "The SQLite view cad_profile_extrude is the source for recorded direct Profile/Extrude relations. "
    "It contains one row per relation and already joins the owning document by document_id, "
    "resolves both endpoint missing flags, and returns separate JSON arrays for source and target sketch owners. "
    "Use this view alone, with no extra join, and return all its columns with their existing names. "
    "Filter source_id for a profile request and target_id for an extrusion request. "
    "Keep stored source-to-target order and do not filter out missing endpoints."
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("prepare", "score", "control"))
    parser.add_argument("--db", type=Path)
    args = parser.parse_args()
    live = runpy.run_path(str(LIVE / "run_live.py"))
    questions = live["load"](LIVE / "questions.json")
    manifest = [{**q, "request": {**q["request"], "evidence": EVIDENCE}} for q in questions]
    if args.stage == "prepare":
        live["dump"](ROOT / "questions-with-schema-evidence.json", manifest)
        return
    compare = runpy.run_path(str(POC / "run_local.py"))["compare"]
    output = {}
    if args.stage == "score":
        events = [json.loads(line) for line in (ROOT / "events.jsonl").read_text(encoding="utf-8-sig").splitlines()]
    for question in manifest:
        direction = question["id"]
        if args.stage == "control":
            if args.db is None:
                parser.error("--db is required for the direct control")
            column = {"forward": "source_id", "reverse": "target_id"}[direction]
            sql = f"SELECT * FROM cad_profile_extrude WHERE {column} = ?"
            with sqlite3.connect(args.db.resolve().as_uri() + "?mode=ro", uri=True) as db:
                db.row_factory = sqlite3.Row
                rows = [dict(row) for row in db.execute(sql, (question["selectedObjectId"],))]
            result = {"sql": sql, "rawRows": rows}
        else:
            records = [event for event in events if event["direction"] == direction]
            request, = [event for event in records if event["type"] == "request"]
            if request["request"] != question["request"] or not request["calculationOnly"]:
                raise RuntimeError(f"Unexpected request for {direction}")
            duration, = [event["elapsedMs"] for event in records if event["type"] == "duration"]
            answer = next((e["answer"] for e in reversed(records) if e["type"] == "result"), {})
            sql, rows = answer.get("sql_code") or None, answer.get("sql_response_from_db")
            result = {"sql": sql, "rawRows": rows, "elapsedMs": duration,
                      "executionAttempts": sum(e.get("node") == "execute_sql_query" and e.get("phase") == "start"
                                               for e in records),
                      "streamErrors": [e.get("message") for e in records if e["type"] == "error"]}
            if sql and rows is not None:
                (ROOT / f"{direction}.sql").write_text(sql.strip() + "\n", encoding="utf-8")
        result.update(comparison=None, normalized=None)
        if sql and rows is not None:
            normalized, missing = live["normalize"](rows, question["selectedObjectId"])
            baseline = LIVE / "forward-baseline.json" if direction == "forward" else POC / "baseline.json"
            result.update(normalized=normalized, missingFieldsByRow=missing,
                          comparison=compare(live["load"](baseline), normalized))
        output[direction] = result
    live["dump"](ROOT / ("direct-control.json" if args.stage == "control" else "evaluation.json"), output)


if __name__ == "__main__":
    main()
