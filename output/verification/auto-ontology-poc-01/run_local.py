"""Offline experiment for the approved synthetic WebCAD export only."""

import argparse
import copy
import hashlib
import json
import sqlite3
import sys
import time
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APPROVED_SHA256 = "b903856b2bfa98bf481cc6ff8870a372ed1f34956ec6b3b607f582ea362b8bab"
SCHEMA = """
CREATE TABLE cad_document (
  document_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  selected_object_id TEXT NOT NULL REFERENCES cad_object(object_id)
);
CREATE TABLE cad_object (
  object_id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL,
  feature_id TEXT, representation TEXT, layer_id TEXT,
  missing INTEGER NOT NULL CHECK (missing IN (0, 1))
);
CREATE TABLE cad_sketch_owner (
  object_id TEXT NOT NULL REFERENCES cad_object(object_id), sketch_id TEXT NOT NULL,
  missing INTEGER NOT NULL CHECK (missing IN (0, 1)), PRIMARY KEY (object_id, sketch_id)
);
CREATE TABLE cad_relation (
  source_id TEXT NOT NULL REFERENCES cad_object(object_id),
  target_id TEXT NOT NULL REFERENCES cad_object(object_id),
  direction TEXT NOT NULL CHECK (direction = 'profile-to-extrude'),
  viewed_from TEXT NOT NULL CHECK (viewed_from IN ('incoming', 'outgoing')),
  mode TEXT NOT NULL CHECK (mode IN ('live', 'snapshot')),
  status TEXT NOT NULL CHECK (status IN ('resolved', 'missing-source', 'missing-source-feature')),
  graph_relation TEXT NOT NULL,
  declared_mode TEXT, extrude_feature_id TEXT NOT NULL, recorded_input_id TEXT NOT NULL,
  PRIMARY KEY (source_id, target_id)
);
"""
QUERY = (ROOT / "read-relations.sql").read_text(encoding="utf-8")
RELATION_FIELDS = ("direction", "viewedFrom", "mode", "status")
SCORE_FIELDS = ("exact", "omitted", "unsupportedAdded", "reversed", "modeMismatch",
                "ownershipMismatch", "missingStatusMismatch", "viewMismatch", "revisionMismatch")


def write_json(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def ordered_owners(owners):
    return sorted(owners, key=lambda row: row["sketchId"])


def baseline(report):
    relations = []
    for edge in report["relations"]:
        row = {key: edge[key] for key in RELATION_FIELDS}
        for side in ("source", "target"):
            node = edge[side]
            row[f"{side}Id"] = node["objectId"]
            row[f"{side}Missing"] = node["missing"]
            row[f"{side}SketchOwners"] = ordered_owners(node["sketchOwners"])
        relations.append(row)
    return {"document": report["document"], "selectedObjectId": report["selectedObjectId"], "relations": relations}


def load_database(db, report):
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    nodes = {report["subject"]["objectId"]: report["subject"]}
    for edge in report["relations"]:
        for side in ("source", "target"):
            node = edge[side]
            if nodes.setdefault(node["objectId"], node) != node:
                raise ValueError("Conflicting facts for the same endpoint")
    with db:
        for node in nodes.values():
            db.execute("INSERT INTO cad_object VALUES (?, ?, ?, ?, ?, ?)", tuple(node[key] for key in (
                "objectId", "label", "featureId", "representation", "layerId", "missing")))
            db.executemany("INSERT INTO cad_sketch_owner VALUES (?, ?, ?)", (
                (node["objectId"], owner["sketchId"], owner["missing"]) for owner in node["sketchOwners"]))
        db.execute("INSERT INTO cad_document VALUES (?, ?, ?)", (
            report["document"]["id"], report["document"]["revision"], report["selectedObjectId"]))
        for edge in report["relations"]:
            evidence = edge["evidence"]
            db.execute("INSERT INTO cad_relation VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                edge["source"]["objectId"], edge["target"]["objectId"], *(edge[key] for key in RELATION_FIELDS),
                evidence["graphRelation"], evidence["declaredDependencyMode"],
                evidence["extrudeFeatureId"], evidence["recordedInputId"]))
    if db.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise ValueError("Invalid relational projection")


def read_database(db):
    db.row_factory = sqlite3.Row
    head = db.execute("SELECT document_id, revision, selected_object_id FROM cad_document").fetchone()
    relations = []
    for row in db.execute(QUERY):
        relation = {"direction": row["direction"], "viewedFrom": row["viewed_from"],
                    "mode": row["mode"], "status": row["status"]}
        for side in ("source", "target"):
            relation[f"{side}Id"] = row[f"{side}_id"]
            relation[f"{side}Missing"] = bool(row[f"{side}_missing"])
            relation[f"{side}SketchOwners"] = ordered_owners([
                {**owner, "missing": bool(owner["missing"])} for owner in json.loads(row[f"{side}_owners"])
            ])
        relations.append(relation)
    return {"document": {"id": head["document_id"], "revision": head["revision"]},
            "selectedObjectId": head["selected_object_id"], "relations": relations}


def compare(expected, candidate):
    counts = dict.fromkeys(SCORE_FIELDS, 0)
    counts["revisionMismatch"] = int(expected["document"] != candidate.get("document"))
    counts["viewMismatch"] = int(expected["selectedObjectId"] != candidate.get("selectedObjectId"))
    remaining = list(candidate["relations"])
    unmatched = []
    for row in expected["relations"]:
        if row in remaining:
            remaining.remove(row)
            counts["exact"] += 1
        else:
            unmatched.append(row)
    for row in unmatched:
        a, b = row["sourceId"], row["targetId"]
        match = next((other for other in remaining if (other.get("sourceId"), other.get("targetId")) == (a, b)), None)
        if match is None:
            match = next((other for other in remaining if (other.get("sourceId"), other.get("targetId")) == (b, a)), None)
        if match is None:
            counts["omitted"] += 1
            continue
        remaining.remove(match)
        reversed_ids = match.get("sourceId") != a
        counts["reversed"] += int(reversed_ids or match.get("direction") != row["direction"])
        counts["modeMismatch"] += int(match.get("mode") != row["mode"])
        counts["viewMismatch"] += int(match.get("viewedFrom") != row["viewedFrom"])
        sides = (("source", "target"), ("target", "source")) if reversed_ids else (("source", "source"), ("target", "target"))
        counts["ownershipMismatch"] += int(any(row[f"{s}SketchOwners"] != match.get(f"{t}SketchOwners") for s, t in sides))
        counts["missingStatusMismatch"] += int(row["status"] != match.get("status") or
            any(row[f"{s}Missing"] != match.get(f"{t}Missing") for s, t in sides))
    counts["unsupportedAdded"] = len(remaining)
    return counts


def check_controls(report, expected):
    # These mutations test the scorer and storage, not an NVIDIA model.
    row = expected["relations"][0]
    controls = {
        "omitted": [],
        "unsupportedAdded": [row, {**row, "sourceId": "unrelated"}],
        "reversed": [{**row, "sourceId": row["targetId"], "targetId": row["sourceId"]}],
        "modeMismatch": [{**row, "mode": "snapshot"}],
        "ownershipMismatch": [{**row, "sourceSketchOwners": [{"sketchId": "unexpected", "missing": False}]}],
        "missingStatusMismatch": [{**row, "status": "missing-source", "sourceMissing": True}],
        "viewMismatch": [{**row, "viewedFrom": "outgoing"}],
    }
    scores = {name: compare(expected, {**expected, "relations": edges}) for name, edges in controls.items()}
    scores["revisionMismatch"] = compare(expected, {**expected, "document": {**expected["document"], "revision": 999}})
    for name, score in scores.items():
        assert score[name] == 1, (name, score)
        assert all(value == 0 for key, value in score.items() if key not in (name, "exact")), (name, score)

    alternate = copy.deepcopy(report)
    edge = alternate["relations"][0]
    edge.update(mode="snapshot", status="missing-source")
    edge["source"].update(missing=True, featureId=None, representation=None,
                          sketchOwners=[{"sketchId": "synthetic-owner", "missing": True}])
    edge["evidence"].update(graphRelation="snapshot-source", declaredDependencyMode="snapshot")
    with closing(sqlite3.connect(":memory:")) as db:
        load_database(db, alternate)
        alternate_score = compare(baseline(alternate), read_database(db))
    assert alternate_score == {**dict.fromkeys(SCORE_FIELDS, 0), "exact": 1}
    return scores, alternate_score


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, help="Score a separately captured result in baseline.json shape")
    args = parser.parse_args()
    started = time.perf_counter()
    raw = (ROOT / "input.json").read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != APPROVED_SHA256:
        raise ValueError("Only the approved synthetic fixture is accepted")
    report = json.loads(raw)
    expected = baseline(report)
    source = ROOT / "source.sqlite3"
    with closing(sqlite3.connect(":memory:")) as db, closing(sqlite3.connect(source)) as disk:
        load_database(db, report)
        db.backup(disk)
    with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as disk:
        result = read_database(disk)
    score = compare(expected, result)
    assert score == {**dict.fromkeys(SCORE_FIELDS, 0), "exact": 1}
    controls, alternate = check_controls(report, expected)
    write_json("baseline.json", expected)
    write_json("local-result.json", result)
    summary = {
        "inputSha256": digest, "python": sys.version.split()[0], "sqlite": sqlite3.sqlite_version,
        "localEngine": "Python standard library SQLite, reopened with mode=ro",
        "localScore": score, "comparatorControls": controls, "syntheticAlternateRoundTrip": alternate,
        "nvidiaExecution": "not-run", "nvidiaScore": None,
    }
    if args.candidate:
        candidate = json.loads(args.candidate.read_text(encoding="utf-8"))
        summary["suppliedCandidateScore"] = compare(expected, candidate)
    summary["elapsedMs"] = round((time.perf_counter() - started) * 1000, 3)
    write_json("comparison.json", summary)
    print(json.dumps({"localScore": score, "controlsPassed": len(controls),
                      "alternatePassed": True, "elapsedMs": summary["elapsedMs"]}, indent=2))


if __name__ == "__main__":
    main()
