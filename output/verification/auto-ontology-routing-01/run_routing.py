"""Compare the documented evidence field against the original live requests."""

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import runpy


ROOT = Path(__file__).resolve().parent
LIVE = ROOT.parent / "auto-ontology-live-01"
POC = ROOT.parent / "auto-ontology-poc-01"
EVIDENCE = (
    "This is a read-only request to execute SQL against actual rows in the connected source database. "
    "Return the executed query and its actual rows. The requested relationships are stored data records. "
    "A catalog, glossary, or schema description does not answer the question."
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("query", "score"))
    parser.add_argument("--lab", type=Path, default=Path(os.environ["TEMP"]) / "webcad-auto-ontology-live-01")
    args = parser.parse_args()
    harness = runpy.run_path(str(LIVE / "run_live.py"))
    load, dump = harness["load"], harness["dump"]
    questions = load(LIVE / "questions.json")
    if args.stage == "query":
        opener = harness["authenticate"](args.lab)
        with harness["request"](opener, harness["BACKEND"] + "/api/semantic-compilation/status") as response:
            status = json.load(response)
        previous = load(LIVE / "live-compilation.json")["status"]
        if (not status["calculated"] or status["running"] or not status["last_success_at"]
                or datetime.fromisoformat(status["last_success_at"]) != datetime.fromisoformat(previous["last_success_at"])):
            raise RuntimeError("Previously compiled catalog could not be verified")
        dump(ROOT / "catalog-status.json", status)
        capture = harness["capture"]
        capture.__globals__["ROOT"] = ROOT
        for question in questions:
            body = {**question["request"], "evidence": EVIDENCE}
            capture(opener, {"id": question["id"], "request": body})
        return

    compare = runpy.run_path(str(POC / "run_local.py"))["compare"]
    report = {}
    for question in questions:
        direction = question["id"]
        captured = load(ROOT / (direction + "-live.json"))
        original = load(LIVE / "attempt-qwen3-14b" / (direction + "-live.json"))
        if captured["request"] != {**original["request"], "evidence": EVIDENCE}:
            raise RuntimeError(f"Unexpected difference in {direction} request")
        sql, rows = captured["sql"], captured["rows"]
        summary = {"originalMs": original["elapsedMs"], "originalHadSql": bool(original["sql"]),
                   "elapsedMs": captured["elapsedMs"], "generatedSql": sql or None,
                   "returnedRows": rows, "normalized": None, "comparison": None}
        if sql:
            (ROOT / (direction + ".sql")).write_text(sql.strip() + "\n", encoding="utf-8")
        if captured["done"] and not captured["error"] and sql and rows is not None:
            baseline = LIVE / "forward-baseline.json" if direction == "forward" else POC / "baseline.json"
            normalized, missing = harness["normalize"](rows, question["selectedObjectId"])
            summary.update(normalized=normalized, missingFieldsByRow=missing,
                           comparison=compare(load(baseline), normalized))
        report[direction] = summary
        print(direction, json.dumps({"elapsedMs": summary["elapsedMs"], "sql": bool(sql),
                                    "rows": rows is not None, "score": summary["comparison"]}), flush=True)
    dump(ROOT / "comparison.json", report)


if __name__ == "__main__":
    main()
