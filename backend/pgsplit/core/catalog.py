from __future__ import annotations

from collections import defaultdict
from typing import Any

from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType

NAVIGATOR_GROUP_ORDER: list[ObjectType] = [
    ObjectType.TABLE,
    ObjectType.VIEW,
    ObjectType.MATERIALIZED_VIEW,
    ObjectType.FUNCTION,
    ObjectType.PROCEDURE,
    ObjectType.SEQUENCE,
    ObjectType.ENUM,
    ObjectType.TYPE,
    ObjectType.CONSTRAINT,
    ObjectType.INDEX,
    ObjectType.TRIGGER,
    ObjectType.POLICY,
    ObjectType.COMMENT,
    ObjectType.GRANT,
    ObjectType.DATA,
    ObjectType.UNKNOWN,
]

GROUP_LABELS: dict[ObjectType, str] = {
    ObjectType.TABLE: "Tables",
    ObjectType.VIEW: "Views",
    ObjectType.MATERIALIZED_VIEW: "Materialized Views",
    ObjectType.FUNCTION: "Functions",
    ObjectType.PROCEDURE: "Procedures",
    ObjectType.SEQUENCE: "Sequences",
    ObjectType.ENUM: "Enums",
    ObjectType.TYPE: "Types",
    ObjectType.CONSTRAINT: "Constraints",
    ObjectType.INDEX: "Indexes",
    ObjectType.TRIGGER: "Triggers",
    ObjectType.POLICY: "Policies",
    ObjectType.COMMENT: "Comments",
    ObjectType.GRANT: "Grants",
    ObjectType.DATA: "Data",
    ObjectType.UNKNOWN: "Other",
    ObjectType.EXTENSION: "Extensions",
}


def build_catalog_payload(objects: list[DumpObject], dump_name: str) -> dict[str, Any]:
    return {
        "navigator": build_dbeaver_navigator(objects, dump_name),
        "files": build_file_tree(objects),
        "schema_index": build_schema_index(objects),
    }


def build_dbeaver_navigator(objects: list[DumpObject], dump_name: str) -> dict[str, Any]:
    database_name = dump_name or "database_dump"
    schemas: dict[str, dict[ObjectType, list[DumpObject]]] = defaultdict(lambda: defaultdict(list))
    globals_by_type: dict[ObjectType, list[DumpObject]] = defaultdict(list)

    for obj in objects:
        if obj.object_type == ObjectType.SCHEMA:
            schemas[obj.schema or obj.name]
            continue
        if obj.schema:
            schemas[obj.schema][obj.object_type].append(obj)
        else:
            globals_by_type[obj.object_type].append(obj)

    schema_nodes = [
        _schema_node(schema_name, grouped_objects)
        for schema_name, grouped_objects in sorted(schemas.items(), key=lambda item: item[0].lower())
    ]

    global_nodes = [
        _group_node(object_type, grouped)
        for object_type, grouped in sorted(globals_by_type.items(), key=lambda item: GROUP_LABELS.get(item[0], item[0].value))
        if grouped
    ]

    database_children = [
        {
            "name": "Schemas",
            "kind": "container",
            "icon": "schemas",
            "count": len(schema_nodes),
            "children": schema_nodes,
        }
    ]
    if global_nodes:
        database_children.append(
            {
                "name": "Database Objects",
                "kind": "container",
                "icon": "database",
                "count": len(global_nodes),
                "children": global_nodes,
            }
        )

    return {
        "name": "Projects",
        "kind": "workspace",
        "icon": "workspace",
        "children": [
            {
                "name": "PGSplit Workspace",
                "kind": "project",
                "icon": "project",
                "children": [
                    {
                        "name": database_name,
                        "kind": "connection",
                        "icon": "connection",
                        "engine": "PostgreSQL",
                        "children": [
                            {
                                "name": database_name,
                                "kind": "database",
                                "icon": "database",
                                "children": database_children,
                            }
                        ],
                    }
                ],
            }
        ],
    }


def build_file_tree(objects: list[DumpObject]) -> dict[str, Any]:
    root: dict[str, Any] = {"name": "output", "type": "directory", "path": "", "children": []}
    directories: dict[str, dict[str, Any]] = {"": root}

    for obj in sorted((item for item in objects if item.path), key=lambda item: item.path or ""):
        path = obj.path or ""
        parts = path.split("/")
        current_path = ""
        parent = root
        for part in parts[:-1]:
            current_path = f"{current_path}/{part}" if current_path else part
            if current_path not in directories:
                node = {"name": part, "type": "directory", "path": current_path, "children": []}
                parent["children"].append(node)
                directories[current_path] = node
            parent = directories[current_path]
        file_node = {
            "name": parts[-1],
            "type": "file",
            "path": path,
            "object_id": obj.object_id,
            "object_type": obj.object_type.value,
        }
        parent["children"].append(file_node)

    _sort_tree(root)
    return root


def build_schema_index(objects: list[DumpObject]) -> dict[str, Any]:
    by_schema: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for obj in objects:
        schema_name = obj.schema or "_global"
        by_schema[schema_name][obj.object_type.value] += 1

    return {
        schema: dict(sorted(counts.items(), key=lambda item: item[0]))
        for schema, counts in sorted(by_schema.items(), key=lambda item: item[0].lower())
    }


def _schema_node(schema_name: str, grouped_objects: dict[ObjectType, list[DumpObject]]) -> dict[str, Any]:
    children = []
    for object_type in NAVIGATOR_GROUP_ORDER:
        grouped = grouped_objects.get(object_type, [])
        if grouped:
            children.append(_group_node(object_type, grouped))
    return {
        "name": schema_name,
        "kind": "schema",
        "icon": "schema",
        "count": sum(len(items) for items in grouped_objects.values()),
        "children": children,
    }


def _group_node(object_type: ObjectType, objects: list[DumpObject]) -> dict[str, Any]:
    return {
        "name": GROUP_LABELS.get(object_type, object_type.value.title()),
        "kind": "object_group",
        "icon": object_type.value,
        "object_type": object_type.value,
        "count": len(objects),
        "children": [_object_node(obj) for obj in sorted(objects, key=lambda item: item.name.lower())],
    }


def _object_node(obj: DumpObject) -> dict[str, Any]:
    return {
        "name": obj.name,
        "kind": "object",
        "icon": obj.object_type.value,
        "object_id": obj.object_id,
        "object_type": obj.object_type.value,
        "schema": obj.schema,
        "path": obj.path,
        "line_start": obj.line_start,
        "line_end": obj.line_end,
        "dependency_count": len(obj.dependencies),
    }


def _sort_tree(node: dict[str, Any]) -> None:
    children = node.get("children")
    if not children:
        return
    children.sort(key=lambda item: (item["type"] == "file", item["name"].lower()))
    for child in children:
        if child["type"] == "directory":
            _sort_tree(child)
