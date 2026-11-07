"""Extract executed SQL and score actual rows after the container runs."""

import json
from pathlib import Path
import runpy


ROOT = Path(__file__).resolve().parent
LIVE = ROOT.parent / "auto-ontology-live-01"
POC = ROOT.parent / "auto-ontology-poc-01"


def canonical_records(records, key):
    # The SQL may give the endpoint columns explicit source/target aliases.
    aliases = {"sourceendpoint": "sourceId", "targetendpoint": "targetId"}
    normalized = []
    for record in records:
        result = dict(record)
        canonical_keys = {key(name) for name in record}
        for name, value in record.items():
            alias = aliases.get(key(name))
            if alias and key(alias) not in canonical_keys:
                result[alias] = value
        normalized.append(result)
    return normalized


def main():
    live = runpy.run_path(str(LIVE / "run_live.py"))
    compare = runpy.run_path(str(POC / "run_local.py"))["compare"]
    load, dump = live["load"], live["dump"]
    questions = load(LIVE / "questions.json")
    evaluation = {}
    for phase in ("unmodified", "patched"):
        events = [json.loads(line) for line in (ROOT / f"{phase}-events.jsonl").read_text(encoding="utf-8-sig").splitlines()]
        directions = {}
        for question in questions:
            direction = question["id"]
            records = [event for event in events if event["direction"] == direction]
            request, = [event for event in records if event["type"] == "request"]
            if request["request"] != question["request"] or not request["calculationOnly"]:
                raise RuntimeError(f"Unexpected request for {phase}/{direction}")
            duration, = [event["elapsedMs"] for event in records if event["type"] == "duration"]
            answer = next((event["answer"] for event in reversed(records) if event["type"] == "result"), {})
            sql = answer.get("sql_code") or None
            rows = answer.get("sql_response_from_db")
            stages = [event["node"] for event in records if event["type"] == "step" and event["phase"] == "start"]
            execution_errors = list(dict.fromkeys(event["thought"] for event in records if event["type"] == "step"
                                    and event["node"] == "execute_sql_query" and event.get("thought")))
            result = {"elapsedMs": duration, "sql": sql, "rawRows": rows, "normalized": None, "comparison": None,
                      "stagesReached": list(dict.fromkeys(stages)), "executionAttempts": stages.count("execute_sql_query"),
                      "executionThoughts": execution_errors,
                      "streamErrors": [event.get("message") for event in records if event["type"] == "error"]}
            if sql and rows is not None:
                (ROOT / f"{phase}-{direction}.sql").write_text(sql.strip() + "\n", encoding="utf-8")
                rows = canonical_records(live["row_records"](rows), live["key"])
                normalized, missing = live["normalize"](rows, question["selectedObjectId"])
                baseline = LIVE / "forward-baseline.json" if direction == "forward" else POC / "baseline.json"
                result.update(normalized=normalized, missingFieldsByRow=missing,
                              comparison=compare(load(baseline), normalized), rowCount=len(rows))
            directions[direction] = result
        evaluation[phase] = directions
    dump(ROOT / "evaluation.json", evaluation)


if __name__ == "__main__":
    main()
