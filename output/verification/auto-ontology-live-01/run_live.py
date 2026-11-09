"""Capture the two synthetic requests from an isolated Auto Ontology gateway."""

import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import re
import runpy
import time
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, Request, build_opener


ROOT = Path(__file__).resolve().parent
POC = ROOT.parent / "auto-ontology-poc-01"
GATEWAY = "http://localhost:38100"
BACKEND = "http://127.0.0.1:38101"


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def request(opener, url, body=None, *, method=None, timeout=20):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Origin": GATEWAY}
    if data is not None:
        headers["Content-Type"] = "application/json"
    return opener.open(Request(url, data, headers, method=method), timeout=timeout)


def authenticate(lab):
    settings = dict(line.split("=", 1) for line in (lab / ".env").read_text().splitlines())
    opener = build_opener(HTTPCookieProcessor(http.cookiejar.CookieJar()))
    with request(opener, GATEWAY + "/api/auth/sign-in/email", {
        "email": settings["AUTO_ONTOLOGY_ADMIN_EMAIL"],
        "password": settings["AUTO_ONTOLOGY_ADMIN_PASSWORD"],
    }) as response:
        if not json.load(response).get("user"):
            raise RuntimeError("Gateway sign-in returned no user")
    return opener


def compile_layer(opener):
    route = BACKEND + "/api/semantic-compilation/status"
    with request(opener, route) as response:
        initial = json.load(response)
    if not initial.get("calculated") or not initial.get("last_success_at"):
        with request(opener, GATEWAY + "/api/configurations/semantic-compilation", {
            "enabled": True,
        }, method="PUT") as response:
            if not json.load(response).get("enabled"):
                raise RuntimeError("Gateway did not enable semantic compilation")
    started = time.monotonic()
    deadline = started + 900
    while time.monotonic() < deadline:
        with request(opener, route) as response:
            status = json.load(response)
        dump(ROOT / "live-compilation.json", {
            "initial": initial,
            "status": status,
            "pollElapsedMs": round((time.monotonic() - started) * 1000),
        })
        if not status.get("running") and status.get("last_failure_at"):
            raise RuntimeError("Semantic compilation reported failure")
        if not status.get("running") and status.get("calculated") and status.get("last_success_at"):
            return
        time.sleep(5)
    raise TimeoutError("No successful compiled semantic layer within 900 seconds")


def capture(opener, question):
    path = ROOT / (question["id"] + "-live.json")
    result = {"request": question["request"], "sql": None, "rows": None, "sqlEvents": [], "answerText": None,
              "httpStatus": None, "done": False, "error": None}
    started = time.monotonic()
    try:
        with request(opener, GATEWAY + "/api/chat/completions", question["request"], timeout=480) as response:
            result["httpStatus"] = response.status
            if response.headers.get_content_type() != "text/event-stream":
                raise ValueError("Gateway returned an unexpected media type")
            with path.with_suffix(".sse").open("wb") as stream:
                for line in response:
                    stream.write(line)
                    stream.flush()
                    if not line.startswith(b"data:"):
                        continue
                    payload = line.removeprefix(b"data:").strip()
                    if payload == b"[DONE]":
                        result["done"] = True
                        break
                    event = json.loads(payload)
                    if event.get("type") == "sql":
                        result["sqlEvents"].append(event)
                    elif event.get("type") == "result":
                        answer = event["answer"]
                        result["sql"] = answer.get("sql_code")
                        result["rows"] = answer.get("sql_response_from_db")
                        result["answerText"] = answer.get("response")
                    elif event.get("type") == "error":
                        result["error"] = event.get("message")
    except HTTPError as error:
        result["httpStatus"] = error.code
        result["error"] = error.read(2000).decode(errors="replace")
    except (OSError, ValueError, KeyError) as error:
        result["error"] = f"{type(error).__name__}: {error}"
    finally:
        result["elapsedMs"] = round((time.monotonic() - started) * 1000)
        dump(path, result)
    print(f'{question["id"]} HTTP={result["httpStatus"]} elapsedMs={result["elapsedMs"]} '
          f'done={result["done"]} sql={bool(result["sql"])} rows={result["rows"] is not None}', flush=True)


def key(value):
    return re.sub(r"[^a-z0-9]", "", value.lower())


def row_records(raw):
    # The NVIDIA SQL executor returns a list containing one JSON records payload.
    if isinstance(raw, list) and len(raw) == 1 and isinstance(raw[0], str):
        raw = json.loads(raw[0])
    if isinstance(raw, dict):
        if "columns" in raw and "data" in raw:
            return [dict(zip(raw["columns"], row, strict=True)) for row in raw["data"]]
        raw = raw.get("rows")
    if not isinstance(raw, list) or not all(isinstance(row, dict) for row in raw):
        raise ValueError("Unrecognized DB row shape")
    return raw


def boolean(value):
    if value is True or value == 1 or str(value).lower() in {"true", "1"}:
        return True
    if value is False or value == 0 or str(value).lower() in {"false", "0"}:
        return False
    return None


def owners(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return None
    if not isinstance(value, list):
        return None
    normalized = []
    for owner in value:
        if not isinstance(owner, dict):
            return None
        fields = {key(name): field for name, field in owner.items()}
        row = {}
        if isinstance(fields.get("sketchid"), str):
            row["sketchId"] = fields["sketchid"]
        if boolean(fields.get("missing")) is not None:
            row["missing"] = boolean(fields["missing"])
        normalized.append(row)
    return sorted(normalized, key=lambda owner: owner.get("sketchId", ""))


def normalize(raw, selected):
    relations, documents = [], set()
    missing_fields = []
    for record in row_records(raw):
        fields = {key(name): field for name, field in record.items()}
        doc_id, revision = fields.get("documentid"), fields.get("revision", fields.get("documentrevision"))
        if isinstance(revision, str) and revision.isdecimal():
            revision = int(revision)
        documents.add((doc_id if isinstance(doc_id, str) else None, revision if type(revision) is int else None))
        relation = {name: fields[key(name)] for name in ("direction", "mode", "status", "sourceId", "targetId")
                    if isinstance(fields.get(key(name)), str)}
        for side in ("source", "target"):
            flag = boolean(fields.get(side + "missing"))
            if flag is not None:
                relation[side + "Missing"] = flag
            owner_values = owners(fields.get(side + "sketchowners", fields.get(side + "owners")))
            if owner_values is not None:
                relation[side + "SketchOwners"] = owner_values
        if relation.get("sourceId") == selected and relation.get("targetId") not in (None, selected):
            relation["viewedFrom"] = "outgoing"
        elif relation.get("targetId") == selected and relation.get("sourceId") not in (None, selected):
            relation["viewedFrom"] = "incoming"
        expected_keys = ("direction", "mode", "status", "sourceId", "targetId", "sourceMissing", "targetMissing",
                         "sourceSketchOwners", "targetSketchOwners", "viewedFrom")
        missing_fields.append([name for name in expected_keys if name not in relation])
        relations.append(relation)
    document = {}
    if len(documents) == 1:
        doc_id, revision = documents.pop()
        if doc_id is not None:
            document["id"] = doc_id
        if revision is not None:
            document["revision"] = revision
    return {"document": document, "selectedObjectId": selected, "relations": relations}, missing_fields


def score(questions):
    compare = runpy.run_path(str(POC / "run_local.py"))["compare"]
    for question in questions:
        direction = question["id"]
        path = ROOT / (direction + "-live.json")
        if not path.exists():
            continue
        captured = load(path)
        if not captured["done"] or captured["error"] or not captured["sql"] or captured["rows"] is None:
            print(f"{direction} unscored: incomplete SQL or DB response")
            continue
        normalized, missing_fields = normalize(captured["rows"], question["selectedObjectId"])
        baseline_path = ROOT / "forward-baseline.json" if direction == "forward" else POC / "baseline.json"
        result = compare(load(baseline_path), normalized)
        dump(ROOT / (direction + "-score.json"), {
            "normalized": normalized,
            "missingFieldsByRow": missing_fields,
            "comparison": result,
        })
        print(direction, json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("stage", choices=("compile", "query", "score"))
    parser.add_argument("--lab", type=Path, default=Path(os.environ["TEMP"]) / "webcad-auto-ontology-live-01")
    args = parser.parse_args()
    if args.stage == "compile":
        compile_layer(authenticate(args.lab))
        return
    questions = load(ROOT / "questions.json")
    if args.stage == "score":
        score(questions)
        return
    opener = authenticate(args.lab)
    for question in questions:
        capture(opener, question)


if __name__ == "__main__":
    main()
