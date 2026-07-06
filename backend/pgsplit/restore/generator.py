from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pgsplit.core.config import SplitterConfig
from pgsplit.models.metadata import DumpObject

PRE_DATA_TYPES = {"extensions", "schemas", "enums", "types", "sequences", "tables"}
DATA_TYPES = {"data"}
POST_DATA_TYPES = {
    "constraints",
    "indexes",
    "functions",
    "triggers",
    "views",
    "materialized_views",
    "policies",
    "comments",
    "grants",
    "unknown",
}
MODE_ALIASES = {
    "schema-only": "schema",
    "schema_only": "schema",
    "data-only": "data",
    "data_only": "data",
    "post-data": "post_data",
}


@dataclass(slots=True)
class RestoreScriptSelection:
    script_name: str
    mode: str
    schema: str | None
    objects: list[dict[str, Any]]
    warnings: list[str]


class RestoreScriptGenerator:
    def __init__(self, config: SplitterConfig | None = None) -> None:
        self.config = config or SplitterConfig()

    def generate(
        self,
        output_root: Path,
        objects: list[DumpObject | dict[str, Any]],
        restore_order: list[dict[str, Any]],
    ) -> dict[str, Any]:
        output_root.mkdir(parents=True, exist_ok=True)
        restore_dir = output_root / self.config.restore_dirname
        restore_dir.mkdir(parents=True, exist_ok=True)

        ordered_objects = self._ordered_objects(objects, restore_order)
        schemas = sorted({str(obj["schema"]) for obj in ordered_objects if obj.get("schema")})
        selections = [
            self._selection("full_restore.sql", "full", None, ordered_objects),
            self._selection("schema_only.sql", "schema", None, ordered_objects),
            self._selection("data_only.sql", "data", None, ordered_objects),
            self._selection("post_data.sql", "post_data", None, ordered_objects),
        ]
        selections.extend(
            self._selection(f"restore_{_safe_name(schema)}.sql", "schema", schema, ordered_objects)
            for schema in schemas
        )

        script_entries = [self._write_script(output_root, restore_dir, selection) for selection in selections]
        wrapper_entries = self._write_wrappers(restore_dir)
        manifest = {
            "version": "1.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "restore_dir": self.config.restore_dirname,
            "schemas": schemas,
            "scripts": script_entries,
            "wrappers": wrapper_entries,
            "warnings": sorted({warning for entry in script_entries for warning in entry["warnings"]}),
        }
        (restore_dir / "restore_manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    def generate_from_output(self, output_root: Path) -> dict[str, Any]:
        manifest_dir = output_root / self.config.manifest_dirname
        objects_path = manifest_dir / "objects.json"
        restore_order_path = manifest_dir / "restore_order.json"
        if not objects_path.exists() or not restore_order_path.exists():
            raise FileNotFoundError("objects.json and restore_order.json are required to generate restore scripts")
        objects = json.loads(objects_path.read_text(encoding="utf-8"))
        restore_order = json.loads(restore_order_path.read_text(encoding="utf-8"))
        return self.generate(output_root, objects, restore_order)

    def _ordered_objects(
        self,
        objects: list[DumpObject | dict[str, Any]],
        restore_order: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        object_by_id = {obj["object_id"]: obj for obj in (_normalize_object(item) for item in objects)}
        ordered = [object_by_id[item["object_id"]] for item in restore_order if item.get("object_id") in object_by_id]
        ordered_ids = {obj["object_id"] for obj in ordered}
        ordered.extend(obj for object_id, obj in sorted(object_by_id.items()) if object_id not in ordered_ids)
        return ordered

    def _selection(
        self,
        script_name: str,
        mode: str,
        schema: str | None,
        ordered_objects: list[dict[str, Any]],
    ) -> RestoreScriptSelection:
        selected = [obj for obj in ordered_objects if self._matches_mode(obj, mode, schema)]
        warnings = self._dependency_warnings(selected, ordered_objects) if mode != "full" else []
        return RestoreScriptSelection(script_name=script_name, mode=mode, schema=schema, objects=selected, warnings=warnings)

    def _matches_mode(self, obj: dict[str, Any], mode: str, schema: str | None) -> bool:
        object_type = str(obj.get("object_type") or "")
        if mode == "full":
            return True
        if mode == "data":
            return object_type in DATA_TYPES and (schema is None or obj.get("schema") == schema)
        if mode == "post_data":
            return object_type in POST_DATA_TYPES and (schema is None or self._in_schema_scope(obj, schema))
        if mode == "schema" and schema is None:
            return object_type not in DATA_TYPES
        if mode == "schema" and schema is not None:
            return self._in_schema_scope(obj, schema)
        return False

    def _in_schema_scope(self, obj: dict[str, Any], schema: str) -> bool:
        object_type = str(obj.get("object_type") or "")
        if obj.get("schema") == schema:
            return True
        if object_type == "schemas" and obj.get("name") == schema:
            return True
        return obj.get("schema") is None and object_type not in DATA_TYPES

    def _dependency_warnings(
        self,
        selected: list[dict[str, Any]],
        ordered_objects: list[dict[str, Any]],
    ) -> list[str]:
        known_ids = {obj["object_id"] for obj in ordered_objects}
        selected_ids = {obj["object_id"] for obj in selected}
        warnings: list[str] = []
        for obj in selected:
            for dependency in obj.get("dependencies") or []:
                if dependency in known_ids and dependency not in selected_ids:
                    warnings.append(f"{obj['object_id']} depends on {dependency} outside this restore scope")
        return sorted(set(warnings))

    def _write_script(
        self,
        output_root: Path,
        restore_dir: Path,
        selection: RestoreScriptSelection,
    ) -> dict[str, Any]:
        script_path = restore_dir / selection.script_name
        warnings = list(selection.warnings)
        include_objects = [obj for obj in selection.objects if obj.get("path")]
        missing_paths = [obj["object_id"] for obj in selection.objects if not obj.get("path")]
        warnings.extend(f"{object_id} has no split file path and was skipped" for object_id in missing_paths)

        with script_path.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write("-- Generated by PG Dump Splitter\n")
            handle.write(f"-- Mode: {selection.mode}\n")
            if selection.schema:
                handle.write(f"-- Schema: {selection.schema}\n")
            handle.write("\\set ON_ERROR_STOP on\n\n")
            if warnings:
                handle.write("-- Warnings:\n")
                for warning in warnings:
                    handle.write(f"-- - {warning}\n")
                handle.write("\n")
            if not include_objects:
                handle.write("-- No objects selected for this restore script.\n")
            for obj in include_objects:
                rel_path = f"../{str(obj['path']).replace('\\', '/')}"
                handle.write(f"-- {obj['object_type']}: {obj['object_id']}\n")
                handle.write(f"\\echo 'Restoring {obj['object_id']}'\n")
                handle.write(f"\\i {rel_path}\n\n")

        return {
            "script_name": selection.script_name,
            "path": f"{self.config.restore_dirname}/{selection.script_name}",
            "mode": selection.mode,
            "schema": selection.schema,
            "object_count": len(include_objects),
            "schemas": sorted({str(obj["schema"]) for obj in include_objects if obj.get("schema")}),
            "includes_data": any(obj.get("object_type") in DATA_TYPES for obj in include_objects),
            "warnings": sorted(set(warnings)),
            "objects": [obj["object_id"] for obj in include_objects],
            "size_bytes": script_path.stat().st_size,
        }

    def _write_wrappers(self, restore_dir: Path) -> list[dict[str, Any]]:
        bash_path = restore_dir / "restore.sh"
        bash_path.write_text(
            """#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql --set ON_ERROR_STOP=on --host "${PGHOST}" --port "${PGPORT}" --username "${PGUSER}" --dbname "${PGDATABASE}" --file "$SCRIPT_DIR/full_restore.sql"
""",
            encoding="utf-8",
            newline="\n",
        )
        powershell_path = restore_dir / "restore.ps1"
        powershell_path.write_text(
            """$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
psql --set ON_ERROR_STOP=on --host $env:PGHOST --port $env:PGPORT --username $env:PGUSER --dbname $env:PGDATABASE --file (Join-Path $ScriptDir "full_restore.sql")
""",
            encoding="utf-8",
            newline="\n",
        )
        return [
            {"script_name": "restore.sh", "path": f"{self.config.restore_dirname}/restore.sh", "shell": "bash"},
            {"script_name": "restore.ps1", "path": f"{self.config.restore_dirname}/restore.ps1", "shell": "powershell"},
        ]


def normalize_restore_mode(mode: str | None) -> str:
    normalized = (mode or "full").strip().lower()
    return MODE_ALIASES.get(normalized, normalized)


def find_restore_script(
    restore_manifest: dict[str, Any],
    mode: str | None,
    schema: str | None = None,
) -> dict[str, Any]:
    normalized_mode = normalize_restore_mode(mode)
    scripts = restore_manifest.get("scripts") or []
    for script in scripts:
        if script.get("mode") == normalized_mode and script.get("schema") == schema:
            return script
    if normalized_mode == "schema" and schema is None:
        for script in scripts:
            if script.get("script_name") == "schema_only.sql":
                return script
    raise FileNotFoundError(f"Restore script not found for mode={mode or 'full'} schema={schema or '-'}")


def _normalize_object(obj: DumpObject | dict[str, Any]) -> dict[str, Any]:
    if isinstance(obj, DumpObject):
        return {
            "object_id": obj.object_id,
            "object_type": obj.object_type.value,
            "schema": obj.schema,
            "name": obj.name,
            "path": obj.path,
            "dependencies": list(obj.dependencies),
        }
    object_type = obj.get("object_type")
    if hasattr(object_type, "value"):
        object_type = object_type.value
    return {
        "object_id": obj.get("object_id"),
        "object_type": object_type,
        "schema": obj.get("schema"),
        "name": obj.get("name"),
        "path": obj.get("path"),
        "dependencies": list(obj.get("dependencies") or []),
    }


def _safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._")
    return cleaned or "schema"
