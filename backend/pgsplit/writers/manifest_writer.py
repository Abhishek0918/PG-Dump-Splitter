from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from pgsplit.core.config import SplitterConfig
from pgsplit.models.metadata import DumpObject


class ManifestWriter:
    def __init__(self, config: SplitterConfig) -> None:
        self.config = config

    def write_json(self, output_root: Path, name: str, payload: object) -> Path:
        target = output_root / self.config.manifest_dirname / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return target

    def write_objects(self, output_root: Path, objects: list[DumpObject]) -> Path:
        return self.write_json(output_root, "objects.json", [obj.to_dict() for obj in objects])

    def write_statistics(self, output_root: Path, objects: list[DumpObject], warnings: list[str]) -> Path:
        by_type: dict[str, int] = {}
        by_schema: dict[str, int] = {}
        for obj in objects:
            by_type[obj.object_type.value] = by_type.get(obj.object_type.value, 0) + 1
            if obj.schema:
                by_schema[obj.schema] = by_schema.get(obj.schema, 0) + 1
        payload = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "object_count": len(objects),
            "warning_count": len(warnings),
            "warnings": warnings,
            "counts_by_type": by_type,
            "counts_by_schema": by_schema,
        }
        return self.write_json(output_root, "statistics.json", payload)

    def write_summary(self, output_root: Path, objects: list[DumpObject], dependency_count: int, restore_count: int) -> Path:
        schemas = sorted({obj.schema for obj in objects if obj.schema})
        payload = {
            "version": "2.0",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "schemas": schemas,
            "objects": len(objects),
            "dependencies": dependency_count,
            "restore_items": restore_count,
        }
        return self.write_json(output_root, "manifest.json", payload)
