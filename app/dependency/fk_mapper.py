from __future__ import annotations

from app.models.metadata import DumpObject
from app.models.object_types import ObjectType


def map_foreign_keys(objects: list[DumpObject]) -> list[dict[str, object]]:
    mapped: list[dict[str, object]] = []
    for obj in objects:
        if obj.object_type not in {ObjectType.TABLE, ObjectType.CONSTRAINT}:
            continue
        fk_targets = [item for item in obj.dependencies if "." in item]
        if fk_targets:
            mapped.append({"table": obj.object_id, "depends_on": obj.dependencies})
    return mapped
