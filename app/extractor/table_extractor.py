from __future__ import annotations

import re
from typing import Any

from app.models.metadata import DumpObject

IDENT = r'"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*'
QUALIFIED_IDENT = rf"(?:{IDENT})(?:\s*\.\s*(?:{IDENT}))?"
REFERENCE_RE = re.compile(
    rf"\bREFERENCES\s+(?P<table>{QUALIFIED_IDENT})(?:\s*\((?P<columns>[^)]+)\))?",
    re.IGNORECASE | re.DOTALL,
)


def extract_table_metadata(obj: DumpObject) -> dict[str, Any]:
    statement = obj.statement or ""
    body = _extract_table_body(statement)
    if not body:
        return {"columns": [], "primary_key": [], "foreign_keys": []}

    entries = _split_top_level(body)
    columns: list[dict[str, Any]] = []
    primary_key: list[str] = []
    foreign_keys: list[dict[str, Any]] = []
    column_lookup: dict[str, dict[str, Any]] = {}

    for entry in entries:
        stripped = entry.strip()
        if not stripped:
            continue

        constraint = _parse_constraint_entry(stripped)
        if constraint is not None:
            if constraint["type"] == "primary_key":
                primary_key.extend(constraint["columns"])
            elif constraint["type"] == "foreign_key":
                foreign_keys.append(constraint)
            continue

        column = _parse_column_entry(stripped)
        if column is None:
            continue
        columns.append(column)
        column_lookup[column["name"]] = column
        if column["primary_key"]:
            primary_key.append(column["name"])
        if column.get("references_table"):
            foreign_keys.append(
                {
                    "type": "foreign_key",
                    "constraint_name": None,
                    "columns": [column["name"]],
                    "references_table": column["references_table"],
                    "references_columns": column.get("references_columns", []),
                }
            )

    primary_key = _dedupe(primary_key)
    for column_name in primary_key:
        if column_name in column_lookup:
            column_lookup[column_name]["primary_key"] = True

    for relation in foreign_keys:
        for column_name in relation.get("columns", []):
            if column_name in column_lookup:
                column_lookup[column_name]["foreign_key"] = True

    return {
        "columns": columns,
        "primary_key": primary_key,
        "foreign_keys": _dedupe_foreign_keys(foreign_keys),
    }


def _extract_table_body(statement: str) -> str:
    start = statement.find("(")
    if start == -1:
        return ""
    depth = 0
    in_single = False
    in_double = False
    for index in range(start, len(statement)):
        char = statement[index]
        prev = statement[index - 1] if index > 0 else ""

        if char == "'" and not in_double and prev != "\\":
            in_single = not in_single
        elif char == '"' and not in_single and prev != "\\":
            in_double = not in_double

        if in_single or in_double:
            continue

        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return statement[start + 1 : index]
    return ""


def _split_top_level(value: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    depth = 0
    in_single = False
    in_double = False

    for index, char in enumerate(value):
        prev = value[index - 1] if index > 0 else ""
        if char == "'" and not in_double and prev != "\\":
            in_single = not in_single
        elif char == '"' and not in_single and prev != "\\":
            in_double = not in_double

        if not in_single and not in_double:
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            elif char == "," and depth == 0:
                parts.append("".join(current).strip())
                current = []
                continue

        current.append(char)

    if current:
        parts.append("".join(current).strip())
    return parts


def _parse_constraint_entry(entry: str) -> dict[str, Any] | None:
    normalized = re.sub(r"^\s*CONSTRAINT\s+(?P<name>" + IDENT + r")\s+", "", entry, flags=re.IGNORECASE)
    constraint_name = None
    if normalized != entry:
        name_match = re.match(r"^\s*CONSTRAINT\s+(?P<name>" + IDENT + r")\s+", entry, flags=re.IGNORECASE)
        if name_match:
            constraint_name = _clean_identifier(name_match.group("name"))

    pk_match = re.search(r"\bPRIMARY\s+KEY\s*\((?P<columns>[^)]+)\)", normalized, re.IGNORECASE)
    if pk_match:
        return {
            "type": "primary_key",
            "constraint_name": constraint_name,
            "columns": _parse_identifier_list(pk_match.group("columns")),
        }

    fk_match = re.search(
        rf"\bFOREIGN\s+KEY\s*\((?P<columns>[^)]+)\)\s+REFERENCES\s+(?P<table>{QUALIFIED_IDENT})(?:\s*\((?P<ref_columns>[^)]+)\))?",
        normalized,
        re.IGNORECASE | re.DOTALL,
    )
    if fk_match:
        return {
            "type": "foreign_key",
            "constraint_name": constraint_name,
            "columns": _parse_identifier_list(fk_match.group("columns")),
            "references_table": _normalize_qualified(fk_match.group("table")),
            "references_columns": _parse_identifier_list(fk_match.group("ref_columns") or ""),
        }
    return None


def _parse_column_entry(entry: str) -> dict[str, Any] | None:
    match = re.match(rf'^\s*(?P<name>{IDENT})\s+(?P<rest>.+)$', entry, re.DOTALL)
    if not match:
        return None

    name = _clean_identifier(match.group("name"))
    rest = match.group("rest").strip()
    lowered = rest.lower()
    cut_positions = []
    for token in (" not null", " null", " default ", " constraint ", " primary key", " references ", " check ", " unique ", " generated ", " collate "):
        position = lowered.find(token)
        if position != -1:
            cut_positions.append(position)
    type_part = rest[: min(cut_positions)] if cut_positions else rest
    data_type = re.sub(r"\s+", " ", type_part).strip()

    references_match = REFERENCE_RE.search(rest)
    references_table = _normalize_qualified(references_match.group("table")) if references_match else None
    references_columns = _parse_identifier_list(references_match.group("columns") or "") if references_match else []

    return {
        "name": name or "unknown",
        "data_type": data_type,
        "not_null": "not null" in lowered or " primary key" in lowered,
        "primary_key": "primary key" in lowered,
        "foreign_key": bool(references_table),
        "references_table": references_table,
        "references_columns": references_columns,
    }


def _parse_identifier_list(value: str) -> list[str]:
    return [_clean_identifier(part.strip()) or "unknown" for part in value.split(",") if part.strip()]


def _clean_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('""', '"')
    return value


def _normalize_qualified(value: str | None) -> str | None:
    if not value:
        return None
    parts = [_clean_identifier(part.strip()) or "unknown" for part in value.split(".", 1)]
    if len(parts) == 2:
        return f"{parts[0]}.{parts[1]}"
    return parts[0]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def _dedupe_foreign_keys(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    ordered: list[dict[str, Any]] = []
    for item in values:
        key = (
            tuple(item.get("columns", [])),
            item.get("references_table"),
            tuple(item.get("references_columns", [])),
        )
        if key in seen:
            continue
        seen.add(key)
        ordered.append(item)
    return ordered
