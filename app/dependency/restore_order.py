from __future__ import annotations

from app.models.metadata import DumpObject
from app.models.object_types import RESTORE_PRIORITY


def grouped_restore_order(objects: list[DumpObject], topo_order: list[str]) -> list[dict[str, object]]:
    priority_index = {object_type: index for index, object_type in enumerate(RESTORE_PRIORITY)}
    topo_index = {object_id: index for index, object_id in enumerate(topo_order)}
    objects_by_id = {obj.object_id: obj for obj in objects}
    dependencies_by_id = {
        obj.object_id: {dependency for dependency in obj.dependencies if dependency in objects_by_id and dependency != obj.object_id}
        for obj in objects
    }
    dependents_by_id: dict[str, set[str]] = {obj.object_id: set() for obj in objects}
    for object_id, dependencies in dependencies_by_id.items():
        for dependency in dependencies:
            dependents_by_id.setdefault(dependency, set()).add(object_id)

    def sort_key(object_id: str) -> tuple[int, int, str]:
        obj = objects_by_id[object_id]
        return (
            priority_index.get(obj.object_type, len(priority_index)),
            topo_index.get(object_id, 10**9),
            object_id,
        )

    ready = sorted((object_id for object_id, dependencies in dependencies_by_id.items() if not dependencies), key=sort_key)
    ordered_ids: list[str] = []
    while ready:
        object_id = ready.pop(0)
        ordered_ids.append(object_id)
        for dependent in sorted(dependents_by_id.get(object_id, set()), key=sort_key):
            dependencies_by_id[dependent].discard(object_id)
            if not dependencies_by_id[dependent] and dependent not in ordered_ids and dependent not in ready:
                ready.append(dependent)
        ready.sort(key=sort_key)

    unresolved = [object_id for object_id in objects_by_id if object_id not in ordered_ids]
    ordered_ids.extend(sorted(unresolved, key=lambda object_id: (topo_index.get(object_id, 10**9), sort_key(object_id))))
    sorted_objects = [objects_by_id[object_id] for object_id in ordered_ids]
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
