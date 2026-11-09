"""Independently exercise the catalog validator and SQLite execution."""

import json
import sys

from auto_ontology.connectors import get_connectors
from auto_ontology.retrieval.text_to_sql.agents import sql_parse_validation as validator
from auto_ontology.retrieval.text_to_sql.agents.sql_execution import _run_sql


patched = sys.argv[1] == "patched"
connector, = get_connectors()
assert connector.database_name == "source" and connector.dialect == "sqlite"
schemas = validator.get_schemas_by_ids(validator.fetch_all_schema_ids())
normalize = getattr(validator, "normalize_sqlite_catalog_tables", None)
assert (normalize is not None) == patched


def control(sql):
    validation = validator.SQLValidationAgent._sql_parse_validation(schemas, sql, [connector.dialect])
    executed = _run_sql(sql, connector)
    return {"sql": sql, "catalogValidated": bool(validation.get("success")),
            "catalogError": validation.get("error"), "sqliteRows": executed.result, "sqliteError": executed.error}


star = control("SELECT COUNT(*) AS n FROM cad_relation")
assert star["catalogValidated"] == patched and json.loads(star["sqliteRows"][0]) == [{"n": 1}]
unknown = validator.SQLValidationAgent._sql_parse_validation(
    schemas, "SELECT COUNT(*) FROM nonexistent", [connector.dialect]
)
assert not unknown.get("success")
qualified = "SELECT COUNT(source_id) AS n FROM source.main.cad_relation"
before = control(qualified)
assert before["catalogValidated"] and before["sqliteError"]
report = {"countStar": star, "unknownCountRejected": bool(unknown.get("error")), "threePartAsWritten": before}
if patched:
    sql = normalize(qualified, connector.database_name, schemas)
    assert "FROM main.cad_relation" in sql
    after = control(sql)
    assert after["catalogValidated"] and json.loads(after["sqliteRows"][0]) == [{"n": 1}]
    rejected = []
    for name in ("other.main.cad_relation", "source.temp.cad_relation", "source.main.nonexistent"):
        try:
            normalize(f"SELECT COUNT(source_id) FROM {name}", connector.database_name, schemas)
        except ValueError:
            rejected.append(name)
        else:
            raise AssertionError(f"Unexpectedly accepted {name}")
    no_change = "SELECT 'source.main.cad_relation' AS label FROM cad_relation"
    assert normalize(no_change, connector.database_name, schemas) == no_change
    report.update(threePartAfterNormalization=after, rejectedQualifiers=rejected, literalPreserved=True)
print(json.dumps(report, indent=2))
