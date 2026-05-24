from __future__ import annotations

import re

from app.parser.object_detector import _extract_parenthesized, _normalize_function_signature

IDENT = r'"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*'
QUALIFIED_IDENT = rf"(?:{IDENT})\s*\.\s*(?:{IDENT})"

REFERENCES_RE = re.compile(rf"\bREFERENCES\s+(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)
USING_RE = re.compile(rf"\bUSING\s+(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)
PARTITION_OF_RE = re.compile(rf"\bPARTITION\s+OF\s+(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)
INHERITS_RE = re.compile(rf"\bINHERITS\s*\(\s*(?P<target>{QUALIFIED_IDENT})\s*\)", re.IGNORECASE)
OWNED_BY_RE = re.compile(rf"\bOWNED\s+BY\s+(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)
EXECUTE_ROUTINE_RE = re.compile(rf"\bEXECUTE\s+(?:FUNCTION|PROCEDURE)\s+(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)
FROM_JOIN_RE = re.compile(rf"\b(?:FROM|JOIN|UPDATE|INTO)\s+(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)
ALTER_TABLE_RE = re.compile(rf"\bALTER\s+TABLE\s+(?:ONLY\s+)?(?P<target>{QUALIFIED_IDENT})", re.IGNORECASE)


def _normalize_identifier(value: str) -> str:
    parts = [part.strip().strip('"').replace('""', '"') for part in value.split(".", 1)]
    return f"{parts[0]}.{parts[1]}" if len(parts) == 2 else parts[0]


def detect_dependencies(statement: str, object_id: str) -> list[str]:
    dependencies: set[str] = set()
    for match in EXECUTE_ROUTINE_RE.finditer(statement):
        target = _normalize_identifier(match.group("target"))
        open_index = statement.find("(", match.end("target"))
        signature = _normalize_function_signature(_extract_parenthesized(statement, open_index))
        if signature:
            target = f"{target}{signature}"
        if target != object_id:
            dependencies.add(target)

    patterns = (
        REFERENCES_RE,
        USING_RE,
        PARTITION_OF_RE,
        INHERITS_RE,
        OWNED_BY_RE,
        FROM_JOIN_RE,
        ALTER_TABLE_RE,
    )
    for pattern in patterns:
        for match in pattern.finditer(statement):
            target = _normalize_identifier(match.group("target"))
            if target != object_id:
                dependencies.add(target)
    return sorted(dependencies)
