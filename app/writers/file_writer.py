from __future__ import annotations

import re
from pathlib import Path

from app.config import SplitterConfig
from app.models.metadata import DumpObject
from app.models.object_types import ObjectType, SCHEMA_SCOPED_TYPES


def _safe_name(value: str) -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("._")
    return cleaned or "unnamed"


def _safe_object_name(obj: DumpObject) -> str:
    if obj.object_type == ObjectType.FUNCTION and obj.attributes.get("signature"):
        signature = str(obj.attributes["signature"]).strip()
        signature_token = signature[1:-1] if signature.startswith("(") and signature.endswith(")") else signature
        return _safe_name(f"{obj.name}_{signature_token or 'noargs'}")
    return _safe_name(obj.name)


class SplitFileWriter:
    def __init__(self, config: SplitterConfig) -> None:
        self.config = config

    def write(self, output_root: Path, obj: DumpObject) -> Path:
        target = self._resolve_target(output_root, obj)
        target.parent.mkdir(parents=True, exist_ok=True)
        target = self._deduplicate_path(target)
        target.write_text(obj.statement.rstrip() + "\n", encoding="utf-8")
        obj.path = str(target.relative_to(output_root)).replace("\\", "/")
        return target

    def _resolve_target(self, output_root: Path, obj: DumpObject) -> Path:
        object_name = _safe_object_name(obj)

        if obj.object_type == ObjectType.DATA:
            base_name = _safe_name(obj.object_id.replace("#data", ""))
            return output_root / self.config.data_dirname / f"{base_name}.copy.sql"

        if obj.object_type == ObjectType.SCHEMA:
            schema_name = _safe_name(obj.name)
            return output_root / self.config.schema_dirname / schema_name / "schema.sql"

        if obj.object_type in SCHEMA_SCOPED_TYPES and obj.schema:
            schema_name = _safe_name(obj.schema)
            return output_root / self.config.schema_dirname / schema_name / obj.object_type.value / f"{object_name}.sql"

        return output_root / self.config.global_dirname / obj.object_type.value / f"{object_name}.sql"

    def _deduplicate_path(self, target: Path) -> Path:
        if not target.exists():
            return target
        stem = target.stem
        suffix = target.suffix
        index = 1
        while True:
            candidate = target.with_name(f"{stem}__{index:03d}{suffix}")
            if not candidate.exists():
                return candidate
            index += 1
