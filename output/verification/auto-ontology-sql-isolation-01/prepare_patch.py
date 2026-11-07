"""Prepare and record the two experimental edits from the container's original files."""

from difflib import unified_diff
from pathlib import Path
import sys


OUTPUT = Path(__file__).resolve().parent
ORIGINAL, PATCHED = map(Path, sys.argv[1:])
PATCHED.mkdir(parents=True, exist_ok=True)

EXTRACTOR = "auto_ontology/catalog/parsers/sqlglot_extractor.py"
VALIDATION = "auto_ontology/retrieval/text_to_sql/agents/sql_parse_validation.py"


def replace_once(source, original, replacement):
    if source.count(original) != 1:
        raise RuntimeError(f"Expected one patch anchor: {original!r}")
    return source.replace(original, replacement)


count_fix = '''    tables = {k: v for k, v in result.items() if v.columns}
    # Preserve a directly referenced, catalog-confirmed table for a bare COUNT(*).
    # Do not claim columns or promote unknown, joined, or virtual tables.
    if not tables and len(result) == 1 and isinstance(statement, exp.Select):
        from_clause = statement.args.get("from_")
        if (from_clause and isinstance(from_clause.this, exp.Table)
                and not statement.args.get("joins") and not statement.args.get("with_")):
            projections = (item.this if isinstance(item, exp.Alias) else item for item in statement.expressions)
            if any(isinstance(item, exp.Count) and isinstance(item.this, exp.Star) for item in projections):
                table_key, match = next(iter(result.items()))
                schema = all_schemas.get(match.schema_name)
                if schema is not None and schema.table_exists(table_key.rsplit(".", 1)[-1]):
                    tables[table_key] = match

    return ExtractionResult(
        tables=tables,
'''

sqlite_helper = '''def normalize_sqlite_catalog_tables(sql: str, database_name: str, schemas: dict) -> str:
    """Convert known catalog three-part names to SQLite's main.table form."""
    try:
        statements = sqlglot.parse(sql, read="sqlite")
    except (sqlglot.errors.ParseError, sqlglot.errors.TokenError):
        return sql  # Keep the original parser's rejection path.
    if len(statements) != 1 or not isinstance(statements[0], exp.Query):
        return sql
    statement = statements[0]
    qualified = [table for table in statement.find_all(exp.Table) if table.catalog]
    if not qualified:
        return sql
    schema = schemas.get("main")
    for table in qualified:
        if (table.catalog.casefold() != database_name.casefold()
                or table.db.casefold() != "main"
                or schema is None or not schema.table_exists(table.name)):
            raise ValueError(f"Unrecognized SQLite catalog table: {table.sql(dialect='sqlite')}")
        table.set("catalog", None)
    return statement.sql(dialect="sqlite")


'''

sqlite_validation = '''        degenerate_dialect = getattr(connector, "dialect", None)
        if degenerate_dialect == "sqlite":
            try:
                normalized_sql = normalize_sqlite_catalog_tables(
                    response.sql_code, connector.database_name, schemas
                )
            except ValueError as error:
                path_state["error"] = str(error)
                return {"decision": "invalid_sql", "path_state": path_state}
            if normalized_sql != response.sql_code:
                self.logger.info("Normalized SQLite catalog table names before validation")
                response.sql_code = normalized_sql
                path_state["sql_generation_result"] = response
'''

changes = {
    EXTRACTOR: [(
        '    # Drop real-table entries that ended up with no columns attributed.\n'
        '    return ExtractionResult(\n        tables={k: v for k, v in result.items() if v.columns},\n', count_fix,
    )],
    VALIDATION: [
        ('class SQLValidationAgent(BaseAgent):\n', sqlite_helper + 'class SQLValidationAgent(BaseAgent):\n'),
        ('        degenerate_dialect = getattr(connector, "dialect", None)\n', sqlite_validation),
    ],
}

diff = []
for path, edits in changes.items():
    name = Path(path).name
    original = (ORIGINAL / name).read_text(encoding="utf-8")
    patched = original
    for old, new in edits:
        patched = replace_once(patched, old, new)
    compile(patched, path, "exec")
    (PATCHED / name).write_bytes(patched.encode("utf-8"))
    diff.extend(unified_diff(original.splitlines(keepends=True), patched.splitlines(keepends=True),
                             fromfile="a/" + path, tofile="b/" + path))
(OUTPUT / "isolated-nvidia.patch").write_text("".join(diff), encoding="utf-8")
