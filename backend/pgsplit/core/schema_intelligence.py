from __future__ import annotations

from collections import Counter, defaultdict
from typing import Any

from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType


def build_schema_intelligence_payload(objects: list[DumpObject]) -> dict[str, Any]:
    counts_by_type = Counter(obj.object_type.value for obj in objects)
    schema_counts: dict[str, Counter[str]] = defaultdict(Counter)
    tables = [obj for obj in objects if obj.object_type == ObjectType.TABLE]
    table_ids = {obj.object_id for obj in tables}

    relationships = _relationships(objects)
    inbound: dict[str, list[dict[str, Any]]] = defaultdict(list)
    outbound: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for relation in relationships:
        source = str(relation["source_table"])
        target = str(relation["target_table"])
        outbound[source].append(relation)
        inbound[target].append(relation)

    object_refs: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
    for obj in objects:
        if obj.object_type == ObjectType.TABLE:
            continue
        for dependency in obj.dependencies:
            if dependency in table_ids:
                object_refs[dependency][obj.object_type.value].append(obj.object_id)

    for obj in objects:
        schema_counts[obj.schema or "_global"][obj.object_type.value] += 1

    schemas = []
    for schema, counts in sorted(schema_counts.items(), key=lambda item: item[0].lower()):
        schemas.append(
            {
                "name": None if schema == "_global" else schema,
                "object_count": sum(counts.values()),
                "counts_by_type": dict(sorted(counts.items())),
            }
        )

    table_payload = []
    for table in sorted(tables, key=lambda item: (item.schema or "", item.name.lower())):
        attributes = table.attributes or {}
        columns = attributes.get("columns", [])
        refs = object_refs.get(table.object_id, {})
        table_payload.append(
            {
                "id": table.object_id,
                "schema": table.schema,
                "name": table.name,
                "column_count": len(columns),
                "columns": columns,
                "primary_key": attributes.get("primary_key", []),
                "foreign_keys": attributes.get("foreign_keys", []),
                "outbound_references": outbound.get(table.object_id, []),
                "inbound_references": inbound.get(table.object_id, []),
                "dependent_objects": {key: sorted(set(value)) for key, value in sorted(refs.items())},
            }
        )

    return {
        "summary": {
            "schema_count": len([item for item in schemas if item["name"]]),
            "object_count": len(objects),
            "table_count": counts_by_type.get(ObjectType.TABLE.value, 0),
            "column_count": sum(len((table.attributes or {}).get("columns", [])) for table in tables),
            "foreign_key_count": len(relationships),
            "view_count": counts_by_type.get(ObjectType.VIEW.value, 0),
            "function_count": counts_by_type.get(ObjectType.FUNCTION.value, 0),
            "index_count": counts_by_type.get(ObjectType.INDEX.value, 0),
            "trigger_count": counts_by_type.get(ObjectType.TRIGGER.value, 0),
        },
        "schemas": schemas,
        "tables": table_payload,
        "relationship_hotspots": _relationship_hotspots(table_payload),
        "counts_by_type": dict(sorted(counts_by_type.items())),
    }


def _relationships(objects: list[DumpObject]) -> list[dict[str, Any]]:
    relationships: list[dict[str, Any]] = []
    seen: set[tuple[Any, ...]] = set()
    for obj in objects:
        if obj.object_type == ObjectType.TABLE:
            for fk in (obj.attributes or {}).get("foreign_keys", []):
                _append_relationship(
                    relationships,
                    seen,
                    {
                        "source_table": obj.object_id,
                        "source_columns": fk.get("columns", []),
                        "target_table": fk.get("references_table"),
                        "target_columns": fk.get("references_columns", []),
                        "constraint_name": fk.get("constraint_name"),
                    },
                )
        elif obj.object_type == ObjectType.CONSTRAINT:
            foreign_key = (obj.attributes or {}).get("foreign_key")
            if foreign_key:
                _append_relationship(
                    relationships,
                    seen,
                    {
                        "source_table": foreign_key.get("source_table"),
                        "source_columns": foreign_key.get("source_columns", []),
                        "target_table": foreign_key.get("target_table"),
                        "target_columns": foreign_key.get("target_columns", []),
                        "constraint_name": obj.name,
                    },
                )
    return relationships


def _append_relationship(relationships: list[dict[str, Any]], seen: set[tuple[Any, ...]], relationship: dict[str, Any]) -> None:
    if not relationship.get("source_table") or not relationship.get("target_table"):
        return
    key = (
        relationship.get("source_table"),
        tuple(relationship.get("source_columns", [])),
        relationship.get("target_table"),
        tuple(relationship.get("target_columns", [])),
    )
    if key in seen:
        return
    seen.add(key)
    relationships.append(relationship)


def _relationship_hotspots(tables: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ranked = sorted(
        (
            {
                "table": table["id"],
                "inbound_count": len(table["inbound_references"]),
                "outbound_count": len(table["outbound_references"]),
                "dependent_object_count": sum(len(items) for items in table["dependent_objects"].values()),
            }
            for table in tables
        ),
        key=lambda item: (-(item["inbound_count"] + item["outbound_count"] + item["dependent_object_count"]), item["table"]),
    )
    return [item for item in ranked[:20] if item["inbound_count"] or item["outbound_count"] or item["dependent_object_count"]]
