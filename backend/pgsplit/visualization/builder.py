from __future__ import annotations

import re
from collections import defaultdict
from typing import Any

from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType

IDENT = r'"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*'
QUALIFIED_IDENT = rf"(?:{IDENT})(?:\s*\.\s*(?:{IDENT}))?"
ALTER_FK_RE = re.compile(
    rf"\bALTER\s+TABLE\s+(?:ONLY\s+)?(?P<source>{QUALIFIED_IDENT}).*?\bFOREIGN\s+KEY\s*\((?P<columns>[^)]+)\)\s+REFERENCES\s+(?P<target>{QUALIFIED_IDENT})(?:\s*\((?P<target_columns>[^)]+)\))?",
    re.IGNORECASE | re.DOTALL,
)


def build_visualization_payload(objects: list[DumpObject]) -> dict[str, Any]:
    tables = [obj for obj in objects if obj.object_type == ObjectType.TABLE]
    dependency_nodes = [
        {
            "id": obj.object_id,
            "label": obj.name,
            "schema": obj.schema,
            "type": obj.object_type.value,
        }
        for obj in sorted(objects, key=lambda item: (item.schema or "", item.object_type.value, item.name.lower()))
    ]
    dependency_edges = [
        {"source": dependency, "target": obj.object_id, "type": "dependency"}
        for obj in objects
        for dependency in obj.dependencies
    ]

    erd_tables = [_table_card(obj) for obj in sorted(tables, key=lambda item: (item.schema or "", item.name.lower()))]
    erd_relationships = _collect_relationships(objects)
    grouped_tables: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for table in erd_tables:
        grouped_tables[table["schema"] or "_global"].append(table)

    return {
        "erd": {
            "tables": erd_tables,
            "relationships": erd_relationships,
            "groups": [
                {"schema": schema, "tables": tables_in_schema}
                for schema, tables_in_schema in sorted(grouped_tables.items(), key=lambda item: item[0].lower())
            ],
        },
        "dependency_graph": {
            "nodes": dependency_nodes,
            "edges": dependency_edges,
        },
        "object_dependencies": build_object_dependency_summary(objects),
        "statistics": {
            "table_count": len(erd_tables),
            "relationship_count": len(erd_relationships),
            "object_count": len(objects),
            "dependency_count": len(dependency_edges),
        },
    }


def build_object_dependency_summary(objects: list[DumpObject]) -> list[dict[str, Any]]:
    ranked = sorted(
        (
            {
                "object_id": obj.object_id,
                "name": obj.name,
                "schema": obj.schema,
                "object_type": obj.object_type.value,
                "depends_on": obj.dependencies,
                "dependency_count": len(obj.dependencies),
            }
            for obj in objects
            if obj.dependencies
        ),
        key=lambda item: (-item["dependency_count"], item["object_id"]),
    )
    return ranked


def _table_card(obj: DumpObject) -> dict[str, Any]:
    attributes = obj.attributes or {}
    columns = attributes.get("columns", [])
    return {
        "id": obj.object_id,
        "label": obj.name,
        "schema": obj.schema,
        "full_name": obj.object_id,
        "column_count": len(columns),
        "columns": [
            {
                "name": column.get("name"),
                "data_type": column.get("data_type"),
                "not_null": bool(column.get("not_null")),
                "primary_key": bool(column.get("primary_key")),
                "foreign_key": bool(column.get("foreign_key")),
            }
            for column in columns
        ],
    }


def _collect_relationships(objects: list[DumpObject]) -> list[dict[str, Any]]:
    relationships: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()

    for obj in objects:
        if obj.object_type == ObjectType.TABLE:
            for fk in (obj.attributes or {}).get("foreign_keys", []):
                relationship = {
                    "source_table": obj.object_id,
                    "source_columns": fk.get("columns", []),
                    "target_table": fk.get("references_table"),
                    "target_columns": fk.get("references_columns", []),
                    "constraint_name": fk.get("constraint_name"),
                    "type": "foreign_key",
                }
                _append_relationship(relationships, seen, relationship)

        if obj.object_type == ObjectType.CONSTRAINT:
            foreign_key = (obj.attributes or {}).get("foreign_key")
            if foreign_key:
                relationship = {
                    "source_table": foreign_key.get("source_table"),
                    "source_columns": foreign_key.get("source_columns", []),
                    "target_table": foreign_key.get("target_table"),
                    "target_columns": foreign_key.get("target_columns", []),
                    "constraint_name": obj.name,
                    "type": "foreign_key",
                }
                _append_relationship(relationships, seen, relationship)
            else:
                match = ALTER_FK_RE.search(obj.statement or "")
                if not match:
                    continue
                relationship = {
                    "source_table": _normalize_qualified(match.group("source")),
                    "source_columns": _parse_identifier_list(match.group("columns")),
                    "target_table": _normalize_qualified(match.group("target")),
                    "target_columns": _parse_identifier_list(match.group("target_columns") or ""),
                    "constraint_name": obj.name,
                    "type": "foreign_key",
                }
                _append_relationship(relationships, seen, relationship)

    return relationships


def _append_relationship(
    relationships: list[dict[str, Any]],
    seen: set[tuple[Any, ...]],
    relationship: dict[str, Any],
) -> None:
    key = (
        relationship.get("source_table"),
        tuple(relationship.get("source_columns", [])),
        relationship.get("target_table"),
        tuple(relationship.get("target_columns", [])),
    )
    if not relationship.get("source_table") or not relationship.get("target_table"):
        return
    if key in seen:
        return
    seen.add(key)
    relationships.append(relationship)


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
