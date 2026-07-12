from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class RepositoryDiffResult:
    added: list[dict[str, Any]]
    removed: list[dict[str, Any]]
    changed: list[dict[str, Any]]
    unchanged_count: int

    @property
    def has_changes(self) -> bool:
        return bool(self.added or self.removed or self.changed)

    def to_dict(self) -> dict[str, Any]:
        return {
            "added": self.added,
            "removed": self.removed,
            "changed": self.changed,
            "unchanged_count": self.unchanged_count,
            "has_changes": self.has_changes,
        }


class RepositoryDiff:
    def compare(self, old_root: Path, new_root: Path) -> RepositoryDiffResult:
        old = self._load_objects(old_root)
        new = self._load_objects(new_root)
        old_ids = set(old)
        new_ids = set(new)
        added = [new[object_id] for object_id in sorted(new_ids - old_ids)]
        removed = [old[object_id] for object_id in sorted(old_ids - new_ids)]
        changed = [
            {
                "object_id": object_id,
                "object_type": new[object_id].get("object_type"),
                "schema": new[object_id].get("schema"),
                "old_path": old[object_id].get("path"),
                "new_path": new[object_id].get("path"),
                "old_sha256": old[object_id].get("sha256"),
                "new_sha256": new[object_id].get("sha256"),
            }
            for object_id in sorted(old_ids & new_ids)
            if old[object_id].get("sha256") != new[object_id].get("sha256")
            or old[object_id].get("path") != new[object_id].get("path")
        ]
        return RepositoryDiffResult(
            added=added,
            removed=removed,
            changed=changed,
            unchanged_count=len(old_ids & new_ids) - len(changed),
        )

    @staticmethod
    def _load_objects(root: Path) -> dict[str, dict[str, Any]]:
        manifest_dir = root / "manifests"
        objects = json.loads((manifest_dir / "objects.json").read_text(encoding="utf-8"))
        checksums = json.loads((manifest_dir / "checksums.json").read_text(encoding="utf-8"))
        hashes = checksums.get("objects") or {}
        return {
            str(obj["object_id"]): {
                "object_id": obj["object_id"],
                "object_type": obj.get("object_type"),
                "schema": obj.get("schema"),
                "name": obj.get("name"),
                "path": obj.get("path"),
                "sha256": (hashes.get(str(obj["object_id"])) or {}).get("sha256"),
            }
            for obj in objects
        }
