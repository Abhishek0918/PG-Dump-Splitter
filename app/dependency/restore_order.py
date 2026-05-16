from __future__ import annotations

from app.models.metadata import DumpObject
from app.models.object_types import RESTORE_PRIORITY


def grouped_restore_order(objects: list[DumpObject], topo_order: list[str]) -> list[dict[str, object]]:
    priority_index = {object_type: index for index, object_type in enumerate(RESTORE_PRIORITY)}
    topo_index = {object_id: index for index, object_id in enumerate(topo_order)}
    sorted_objects = sorted(
        objects,
        key=lambda obj: (
            priority_index.get(obj.object_type, len(priority_index)),
            topo_index.get(obj.object_id, 10**9),
            obj.object_id,
        ),
    )
    return [
        {
            "object_id": obj.object_id,
            "object_type": obj.object_type.value,
            "schema": obj.schema,
            "name": obj.name,
            "path": obj.path,
            "depends_on": obj.dependencies,
        }
        for obj in sorted_objects
    ]
