"""Build a read-only experiment input from the approved single-document fixture."""

import hashlib
import json
from pathlib import Path
import sqlite3
import sys


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "auto-ontology-poc-01" / "source.sqlite3"
APPROVED_SHA = "baaed1af1334c5e7ce76b3c72c17ba8a1f1494ba06285c97092e9eaf2348ce75"

SCHEMA = """
CREATE TABLE cad_document (
  document_id TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 0)
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
  document_id TEXT NOT NULL REFERENCES cad_document(document_id),
  source_id TEXT NOT NULL REFERENCES cad_object(object_id),
  target_id TEXT NOT NULL REFERENCES cad_object(object_id),
  direction TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL,
  PRIMARY KEY (document_id, source_id, target_id)
);
CREATE VIEW cad_profile_extrude AS
SELECT r.document_id, d.revision, r.source_id, r.target_id, r.direction, r.mode, r.status,
       s.missing AS source_missing, t.missing AS target_missing,
       (SELECT json_group_array(json_object('sketchId', o.sketch_id, 'missing', o.missing))
        FROM cad_sketch_owner AS o WHERE o.object_id = r.source_id) AS source_sketch_owners,
       (SELECT json_group_array(json_object('sketchId', o.sketch_id, 'missing', o.missing))
        FROM cad_sketch_owner AS o WHERE o.object_id = r.target_id) AS target_sketch_owners
FROM cad_relation AS r
JOIN cad_document AS d ON d.document_id = r.document_id
JOIN cad_object AS s ON s.object_id = r.source_id
JOIN cad_object AS t ON t.object_id = r.target_id;
"""


def check_join(db):
    test = sqlite3.connect(":memory:")
    db.backup(test)
    with test:
        test.execute("PRAGMA foreign_keys = ON")
        test.execute("INSERT INTO cad_document VALUES ('other-document', 999)")
        source, target = test.execute("SELECT source_id, target_id FROM cad_relation").fetchone()
        test.executemany("INSERT INTO cad_sketch_owner VALUES (?, ?, ?)", [
            (source, "source-one", 0), (source, "source-two", 1), (target, "target-one", 0),
        ])
        test.execute("UPDATE cad_object SET missing = 1 WHERE object_id = ?", (source,))
        actual, = test.execute("SELECT document_id, revision, source_missing, source_sketch_owners, "
                               "target_sketch_owners FROM cad_profile_extrude").fetchall()
        document = db.execute("SELECT document_id, revision FROM cad_document").fetchone()
        assert actual[:3] == (*document, 1)
        assert len(json.loads(actual[3])) == 2 and len(json.loads(actual[4])) == 1
        try:
            test.execute("UPDATE cad_relation SET document_id = 'unknown-document'")
        except sqlite3.IntegrityError:
            return {"decoyDocumentExcluded": True, "missingEndpointPreserved": True,
                    "ownerListsIndependent": True, "unknownDocumentRejected": True}
        raise AssertionError("Foreign key accepted an unknown document")


def main():
    destination = Path(sys.argv[1]).resolve()
    if destination.exists():
        raise SystemExit(f"Refusing to overwrite {destination}")
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != APPROVED_SHA:
        raise RuntimeError("Unexpected synthetic source digest")
    with sqlite3.connect(SOURCE.as_uri() + "?mode=ro", uri=True) as source, sqlite3.connect(destination) as db:
        document, = source.execute("SELECT document_id, revision FROM cad_document").fetchall()
        db.execute("PRAGMA foreign_keys = ON")
        db.executescript(SCHEMA)
        with db:
            db.execute("INSERT INTO cad_document VALUES (?, ?)", document)
            db.executemany("INSERT INTO cad_object VALUES (?, ?, ?, ?, ?, ?)", source.execute("SELECT * FROM cad_object"))
            db.executemany("INSERT INTO cad_sketch_owner VALUES (?, ?, ?)", source.execute("SELECT * FROM cad_sketch_owner"))
            db.executemany("INSERT INTO cad_relation VALUES (?, ?, ?, ?, ?, ?)", source.execute(
                "SELECT ?, source_id, target_id, direction, mode, status FROM cad_relation", (document[0],)))
        assert db.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert not db.execute("PRAGMA foreign_key_check").fetchall()
        controls = check_join(db)
    summary = {"sourceSha256": APPROVED_SHA, "derivedSha256": hashlib.sha256(destination.read_bytes()).hexdigest(),
               "controls": controls}
    (ROOT / "fixture-checks.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary))


if __name__ == "__main__":
    main()
