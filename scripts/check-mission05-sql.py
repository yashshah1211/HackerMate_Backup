"""Offline grammar/checksum qualification. Never connects to or executes SQL on a DB."""
import argparse
import hashlib
import json
import re

import pglast


def check(sql, expected):
    normalized = sql.replace("\r\n", "\n")
    digest = hashlib.sha256(normalized.encode()).hexdigest()
    assert digest == expected, f"Migration checksum mismatch: {digest}"
    grammar = pglast.get_postgresql_version()
    assert grammar[0] == 17, f"PG17 grammar required, found {grammar}"
    nodes = pglast.parse_sql(normalized)
    shape = [type(node.stmt).__name__ for node in nodes]
    assert shape == ["VariableSetStmt", "DoStmt"], shape
    block = re.search(r"DO \$migration\$[\s\S]*?\$migration\$;", normalized).group()
    parsed = pglast.parse_plpgsql(block)
    assert len(parsed) == 1
    controls = [
        ("SQL syntax", normalized.replace("SET LOCAL statement_timeout", "SET LOCAL = statement_timeout", 1), pglast.parse_sql),
        ("PL/pgSQL syntax", block.replace("lock_timeout_value :=", "lock_timeout_value := ;", 1), pglast.parse_plpgsql),
    ]
    for name, mutated, parser in controls:
        try:
            parser(mutated)
        except pglast.Error:
            continue
        raise AssertionError(f"Negative control accepted: {name}")
    # A valid but dangerous mutation passes grammar, so checksum must reject it.
    changed = normalized.replace("FROM PUBLIC, anon, authenticated", "FROM PUBLIC, anon", 1)
    assert len(pglast.parse_sql(changed)) == 2
    assert hashlib.sha256(changed.encode()).hexdigest() != expected
    return {"status": "grammar_and_integrity_passed", "sha256_lf": digest,
            "pglast": pglast.__version__, "postgresql_grammar": grammar,
            "sql_ast": shape, "plpgsql_blocks": len(parsed), "checks_passed": 7,
            "negative_controls": 3, "database_executed": False,
            "limitations": ["No catalog/type resolution", "No privilege or RLS enforcement",
                            "No PG17 server, lock, timeout, ledger or rollback proof"]}


if __name__ == "__main__":
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("--migration", required=True)
    args.add_argument("--expected-sha256", required=True)
    args.add_argument("--catalog", help="Parse proposed read-only catalog SQL; never execute it")
    options = args.parse_args()
    with open(options.migration, encoding="utf-8", newline="") as source:
        result = check(source.read(), options.expected_sha256)
    if options.catalog:
        with open(options.catalog, encoding="utf-8") as source:
            catalog = source.read()
        kinds = [type(node.stmt).__name__ for node in pglast.parse_sql(catalog)]
        assert set(kinds) <= {"TransactionStmt", "VariableSetStmt", "SelectStmt"}, kinds
        assert kinds.count("SelectStmt") == 8
        assert "BEGIN READ ONLY;" in catalog and "ROLLBACK;" in catalog
        result["catalog_grammar_only"] = {"select_statements": 8, "database_executed": False}
    print(json.dumps(result, indent=2))
