from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(slots=True)
class RepositoryValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    checked_files: int = 0
    checked_objects: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


class RepositoryValidator:
    REQUIRED_MANIFESTS = (
        "objects.json",
        "dependencies.json",
        "checksums.json",
        "restore_order.json",
        "repository.json",
    )

    def validate(self, repository_root: Path) -> RepositoryValidationReport:
        root = repository_root.resolve()
        report = RepositoryValidationReport()
        manifest_dir = root / "manifests"
        if not root.is_dir():
            report.errors.append(f"Repository directory does not exist: {root}")
            return report

        missing = [name for name in self.REQUIRED_MANIFESTS if not (manifest_dir / name).is_file()]
        if missing:
            report.errors.extend(f"Missing manifest: manifests/{name}" for name in missing)
            return report

        try:
            objects = self._read_json(manifest_dir / "objects.json")
            dependencies = self._read_json(manifest_dir / "dependencies.json")
            checksums = self._read_json(manifest_dir / "checksums.json")
            restore_order = self._read_json(manifest_dir / "restore_order.json")
        except (OSError, ValueError, TypeError) as exc:
            report.errors.append(f"Cannot read repository manifests: {exc}")
            return report

        self._validate_objects(root, objects, report)
        self._validate_checksums(root, checksums, report)
        self._validate_generated_coverage(root, checksums, report)
        self._validate_dependencies(objects, dependencies, report)
        self._validate_restore_order(objects, restore_order, report)
        if not (root / "migrations" / "0001_baseline.sql").is_file():
            report.warnings.append("Baseline migration is missing: migrations/0001_baseline.sql")
        return report

    def _validate_objects(
        self,
        root: Path,
        objects: list[dict[str, Any]],
        report: RepositoryValidationReport,
    ) -> None:
        seen_ids: set[str] = set()
        seen_paths: set[str] = set()
        for obj in objects:
            object_id = str(obj.get("object_id") or "")
            relative_path = str(obj.get("path") or "")
            if not object_id:
                report.errors.append("Object manifest contains an empty object_id")
                continue
            if object_id in seen_ids:
                report.errors.append(f"Duplicate object_id: {object_id}")
            seen_ids.add(object_id)
            if not self._safe_relative_path(relative_path):
                report.errors.append(f"Unsafe object path for {object_id}: {relative_path}")
                continue
            if relative_path in seen_paths:
                report.errors.append(f"Multiple objects share generated path: {relative_path}")
            seen_paths.add(relative_path)
            if not (root / relative_path).is_file():
                report.errors.append(f"Missing object file for {object_id}: {relative_path}")
        report.checked_objects = len(objects)

    def _validate_checksums(
        self,
        root: Path,
        checksums: dict[str, Any],
        report: RepositoryValidationReport,
    ) -> None:
        if checksums.get("algorithm") != "sha256":
            report.errors.append("Unsupported or missing checksum algorithm")
        files = checksums.get("files")
        if not isinstance(files, dict):
            report.errors.append("checksums.json must contain a files object")
            return
        for relative_path, expected in sorted(files.items()):
            if not self._safe_relative_path(str(relative_path)):
                report.errors.append(f"Unsafe checksum path: {relative_path}")
                continue
            target = root / str(relative_path)
            if not target.is_file():
                report.errors.append(f"Checksummed file is missing: {relative_path}")
                continue
            actual = _sha256_file(target)
            if actual != expected:
                report.errors.append(f"Checksum mismatch: {relative_path}")
            report.checked_files += 1

    @staticmethod
    def _validate_generated_coverage(
        root: Path,
        checksums: dict[str, Any],
        report: RepositoryValidationReport,
    ) -> None:
        known = {str(path).replace("\\", "/") for path in (checksums.get("files") or {})}
        generated_files = {
            str(path.relative_to(root)).replace("\\", "/")
            for dirname in ("schemas", "global")
            for path in (root / dirname).rglob("*.sql")
            if (root / dirname).exists()
        }
        for relative_path in sorted(generated_files - known):
            report.errors.append(f"Untracked generated SQL file: {relative_path}")

    @staticmethod
    def _validate_dependencies(
        objects: list[dict[str, Any]],
        dependencies: dict[str, Any],
        report: RepositoryValidationReport,
    ) -> None:
        object_ids = {str(obj.get("object_id")) for obj in objects}
        node_ids = {str(node.get("id")) for node in dependencies.get("nodes") or []}
        if node_ids != object_ids:
            report.errors.append("Dependency nodes do not match objects.json")
        for edge in dependencies.get("edges") or []:
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            if source not in object_ids:
                report.errors.append(f"Dependency source is unknown: {source}")
            if target not in object_ids and not edge.get("external"):
                report.errors.append(f"Dependency target is unknown but not marked external: {target}")
            if target not in object_ids:
                report.warnings.append(f"External dependency: {source} -> {target}")

    @staticmethod
    def _validate_restore_order(
        objects: list[dict[str, Any]],
        restore_order: list[dict[str, Any]],
        report: RepositoryValidationReport,
    ) -> None:
        object_ids = {str(obj.get("object_id")) for obj in objects}
        ordered_ids = [str(item.get("object_id") or "") for item in restore_order]
        if len(ordered_ids) != len(set(ordered_ids)):
            report.errors.append("Restore order contains duplicate object IDs")
        if set(ordered_ids) != object_ids:
            report.errors.append("Restore order does not contain every repository object exactly once")
            return
        position = {object_id: index for index, object_id in enumerate(ordered_ids)}
        for item in restore_order:
            object_id = str(item.get("object_id") or "")
            for dependency in item.get("depends_on") or []:
                if dependency in position and position[dependency] > position[object_id]:
                    report.errors.append(f"Invalid restore order: {object_id} appears before {dependency}")

    @staticmethod
    def _safe_relative_path(value: str) -> bool:
        path = Path(value)
        return bool(value) and not path.is_absolute() and ".." not in path.parts

    @staticmethod
    def _read_json(path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
