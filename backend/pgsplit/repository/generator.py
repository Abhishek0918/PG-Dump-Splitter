from __future__ import annotations

import hashlib
import json
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from uuid import uuid4

from pgsplit.core.config import SplitterConfig
from pgsplit.core.engine import DumpSplitterEngine
from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType

REPOSITORY_FORMAT_VERSION = "1.0"
MANAGED_DIRECTORIES = ("schemas", "global", "manifests", "ci")


@dataclass(slots=True)
class RepositoryResult:
    output_root: Path
    object_count: int
    schema_count: int
    file_count: int
    baseline_created: bool
    included_data: bool
    objects: list[DumpObject]
    warnings: list[str]


class DatabaseRepositoryGenerator:
    """Build a deterministic, Git-friendly database source repository."""

    def __init__(self, config: SplitterConfig | None = None) -> None:
        self.config = config or SplitterConfig()

    def generate(
        self,
        dump_path: Path,
        output_root: Path,
        *,
        include_data: bool = False,
        force_baseline: bool = False,
        progress_callback: Callable[[float, str, str, int | None, int | None], None] | None = None,
    ) -> RepositoryResult:
        dump_path = dump_path.resolve()
        output_root = output_root.resolve()
        output_root.mkdir(parents=True, exist_ok=True)
        dump_size = dump_path.stat().st_size if dump_path.exists() else 0
        if progress_callback:
            progress_callback(3, "repository", "Preparing Git-ready database repository", 0, 0)

        temporary_root = output_root.parent / f"pgsplit_repository_{uuid4().hex}"
        temporary_root.mkdir(parents=True)
        try:
            split_root = temporary_root / "split"
            generated_root = temporary_root / "repository"
            split_result = DumpSplitterEngine(self.config).split_dump(
                dump_path=dump_path,
                output_root=split_root,
                progress_callback=progress_callback,
            )
            if progress_callback:
                progress_callback(96, "repository", "Writing canonical database files", dump_size, len(split_result.objects))
            restore_order = self._read_json(split_root / self.config.manifest_dirname / "restore_order.json")
            records = self._write_managed_repository(
                generated_root,
                split_root,
                split_result.objects,
                restore_order,
                include_data,
            )
            # Copy UI manifests from split output to repository manifests
            split_manifest_dir = split_root / "manifest"
            repo_manifest_dir = generated_root / "manifests"
            for filename in ("navigator.json", "schema_index.json", "visualization.json", "manifest.json", "statistics.json"):
                src_file = split_manifest_dir / filename
                if src_file.exists():
                    shutil.copy2(src_file, repo_manifest_dir / filename)
            
            split_restore_manifest = split_root / "restore" / "restore_manifest.json"
            if split_restore_manifest.exists():
                shutil.copy2(split_restore_manifest, repo_manifest_dir / "restore_manifest.json")

            self._sync_managed_content(generated_root, output_root, include_data=include_data)
            if progress_callback:
                progress_callback(97, "repository", "Syncing managed repository folders", dump_size, len(records))
            self._ensure_repository_support(output_root)
            baseline_created = self._write_baseline(
                output_root,
                restore_order,
                records,
                force=force_baseline,
            )
            if progress_callback:
                progress_callback(98, "repository", "Writing baseline migration and checksums", dump_size, len(records))
            checksums = self._write_checksums(output_root, records)
            self._write_repository_manifest(output_root, records, checksums, include_data)

            # Write final repository output tree
            from pgsplit.core.output_tree import build_output_tree
            self._write_json(
                output_root / "manifests" / "output_tree.json",
                build_output_tree(output_root)
            )

            if progress_callback:
                progress_callback(99, "repository", "Repository manifests ready", dump_size, len(records))
        finally:
            shutil.rmtree(temporary_root, ignore_errors=True)

        schemas = {str(record["schema"]) for record in records if record.get("schema")}
        
        # Update paths of objects to match repository paths
        for obj in split_result.objects:
            if obj.path:
                obj.path = DatabaseRepositoryGenerator._repository_path(obj.path)

        return RepositoryResult(
            output_root=output_root,
            object_count=len(records),
            schema_count=len(schemas),
            file_count=len(checksums["files"]),
            baseline_created=baseline_created,
            included_data=include_data,
            objects=split_result.objects,
            warnings=split_result.warnings,
        )

    def _write_managed_repository(
        self,
        generated_root: Path,
        split_root: Path,
        objects: list[DumpObject],
        restore_order: list[dict[str, Any]],
        include_data: bool,
    ) -> list[dict[str, Any]]:
        for dirname in MANAGED_DIRECTORIES:
            (generated_root / dirname).mkdir(parents=True, exist_ok=True)
        if include_data:
            (generated_root / "data" / "reference").mkdir(parents=True, exist_ok=True)

        records: list[dict[str, Any]] = []
        path_by_object_id: dict[str, str] = {}
        for obj in sorted(objects, key=lambda item: (item.object_type.value, item.object_id)):
            if obj.object_type == ObjectType.DATA and not include_data:
                continue
            if not obj.path:
                continue
            repository_path = self._repository_path(obj.path)
            source_path = split_root / obj.path
            canonical_sql = self._canonical_sql(
                source_path.read_text(encoding="utf-8"),
                obj.object_type,
            )
            if not canonical_sql:
                continue
            target_path = generated_root / repository_path
            target_path.parent.mkdir(parents=True, exist_ok=True)
            self._write_canonical_sql(target_path, canonical_sql)
            path_by_object_id[obj.object_id] = repository_path
            records.append(self._object_record(obj, repository_path))

        records.sort(key=lambda item: str(item["object_id"]))
        dependencies = self._dependency_manifest(records)
        mapped_restore_order = []
        for item in restore_order:
            object_id = str(item.get("object_id") or "")
            if object_id not in path_by_object_id:
                continue
            mapped_restore_order.append(
                {
                    "position": len(mapped_restore_order) + 1,
                    "object_id": object_id,
                    "object_type": item.get("object_type"),
                    "schema": item.get("schema"),
                    "name": item.get("name"),
                    "path": path_by_object_id[object_id],
                    "depends_on": sorted(item.get("depends_on") or []),
                }
            )

        self._write_json(generated_root / "manifests" / "objects.json", records)
        self._write_json(generated_root / "manifests" / "dependencies.json", dependencies)
        self._write_json(generated_root / "manifests" / "restore_order.json", mapped_restore_order)
        self._write_ci_scripts(generated_root / "ci")
        return records

    def _sync_managed_content(self, generated_root: Path, output_root: Path, *, include_data: bool) -> None:
        for dirname in MANAGED_DIRECTORIES:
            source = generated_root / dirname
            target = output_root / dirname
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(source, target)
        if include_data:
            source = generated_root / "data" / "reference"
            target = output_root / "data" / "reference"
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(source, target)

    def _ensure_repository_support(self, output_root: Path) -> None:
        migrations = output_root / "migrations"
        migrations.mkdir(parents=True, exist_ok=True)
        migration_readme = migrations / "README.md"
        if not migration_readme.exists():
            migration_readme.write_text(
                "# Migrations\n\n"
                "Migration files are developer-owned and run in filename order. "
                "Never edit a migration after it has been deployed; add a new numbered file instead.\n",
                encoding="utf-8",
                newline="\n",
            )
        reference_data = output_root / "data" / "reference"
        reference_data.mkdir(parents=True, exist_ok=True)
        (reference_data / ".gitkeep").touch(exist_ok=True)
        (output_root / ".gitignore").write_text(
            ".idea/\n*.log\n*.tmp\n.env\n.env.*\n",
            encoding="utf-8",
            newline="\n",
        )
        (output_root / ".gitattributes").write_text(
            "* text=auto\n*.sql text eol=lf\n*.json text eol=lf\n*.sh text eol=lf\n",
            encoding="utf-8",
            newline="\n",
        )
        (output_root / ".editorconfig").write_text(
            "root = true\n\n"
            "[*]\n"
            "charset = utf-8\n"
            "end_of_line = lf\n"
            "insert_final_newline = true\n\n"
            "[*.sql]\n"
            "indent_style = space\n"
            "indent_size = 4\n",
            encoding="utf-8",
            newline="\n",
        )
        (output_root / "README.md").write_text(self._repository_readme(), encoding="utf-8", newline="\n")

    def _write_baseline(
        self,
        output_root: Path,
        restore_order: list[dict[str, Any]],
        records: list[dict[str, Any]],
        *,
        force: bool,
    ) -> bool:
        target = output_root / "migrations" / "0001_baseline.sql"
        if target.exists() and not force:
            return False

        path_by_id = {
            str(record["object_id"]): str(record["path"])
            for record in records
            if record.get("object_type") != ObjectType.DATA.value
        }
        lines = [
            "-- PGSplit baseline migration",
            "-- Immutable SQL snapshot generated from the canonical restore order.",
            "\\set ON_ERROR_STOP on",
            "",
        ]
        for item in restore_order:
            object_id = str(item.get("object_id") or "")
            repository_path = path_by_id.get(object_id)
            if not repository_path:
                continue
            lines.append(f"-- {item.get('object_type')}: {object_id}")
            lines.append((output_root / repository_path).read_text(encoding="utf-8").rstrip())
            lines.append("")
        target.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8", newline="\n")
        return True

    def _write_checksums(self, output_root: Path, records: list[dict[str, Any]]) -> dict[str, Any]:
        files: dict[str, str] = {}
        objects: dict[str, dict[str, str]] = {}
        for record in records:
            relative_path = str(record["path"])
            digest = _sha256_file(output_root / relative_path)
            files[relative_path] = digest
            objects[str(record["object_id"])] = {"path": relative_path, "sha256": digest}
        payload = {
            "version": REPOSITORY_FORMAT_VERSION,
            "algorithm": "sha256",
            "files": dict(sorted(files.items())),
            "objects": dict(sorted(objects.items())),
        }
        self._write_json(output_root / "manifests" / "checksums.json", payload)
        return payload

    def _write_repository_manifest(
        self,
        output_root: Path,
        records: list[dict[str, Any]],
        checksums: dict[str, Any],
        include_data: bool,
    ) -> None:
        schemas = sorted({str(record["schema"]) for record in records if record.get("schema")})
        counts: dict[str, int] = {}
        for record in records:
            object_type = str(record["object_type"])
            counts[object_type] = counts.get(object_type, 0) + 1
        self._write_json(
            output_root / "manifests" / "repository.json",
            {
                "format": "pgsplit-database-repository",
                "version": REPOSITORY_FORMAT_VERSION,
                "schemas": schemas,
                "object_count": len(records),
                "file_count": len(checksums["files"]),
                "counts_by_type": dict(sorted(counts.items())),
                "includes_data": include_data,
                "managed_directories": list(MANAGED_DIRECTORIES),
            },
        )

    @staticmethod
    def _repository_path(split_path: str) -> str:
        normalized = split_path.replace("\\", "/")
        if normalized.startswith("data/"):
            return f"data/reference/{normalized.removeprefix('data/')}"
        return normalized

    @staticmethod
    def _object_record(obj: DumpObject, repository_path: str) -> dict[str, Any]:
        return {
            "object_id": obj.object_id,
            "object_type": obj.object_type.value,
            "schema": obj.schema,
            "name": obj.name,
            "path": repository_path,
            "dependencies": sorted(obj.dependencies),
            "owner": obj.owner,
            "attributes": obj.attributes,
        }

    @staticmethod
    def _dependency_manifest(records: list[dict[str, Any]]) -> dict[str, Any]:
        known_ids = {str(record["object_id"]) for record in records}
        nodes = [
            {
                "id": record["object_id"],
                "object_type": record["object_type"],
                "schema": record["schema"],
                "path": record["path"],
            }
            for record in records
        ]
        edges = [
            {
                "source": record["object_id"],
                "target": dependency,
                "external": dependency not in known_ids,
            }
            for record in records
            for dependency in record["dependencies"]
        ]
        return {
            "version": REPOSITORY_FORMAT_VERSION,
            "nodes": sorted(nodes, key=lambda item: str(item["id"])),
            "edges": sorted(edges, key=lambda item: (str(item["source"]), str(item["target"]))),
        }

    @staticmethod
    def _canonical_sql(sql: str, object_type: ObjectType) -> str:
        normalized = sql.replace("\r\n", "\n").replace("\r", "\n")
        if object_type == ObjectType.UNKNOWN:
            normalized = "\n".join(
                line
                for line in normalized.splitlines()
                if not line.lstrip().startswith(("\\restrict ", "\\unrestrict "))
            )
        return normalized.strip()

    @staticmethod
    def _write_canonical_sql(target: Path, sql: str) -> None:
        target.write_text(sql + "\n", encoding="utf-8", newline="\n")

    @staticmethod
    def _write_json(target: Path, payload: Any) -> None:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(
            json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )

    @staticmethod
    def _read_json(path: Path) -> Any:
        return json.loads(path.read_text(encoding="utf-8"))

    @staticmethod
    def _write_ci_scripts(ci_dir: Path) -> None:
        ci_dir.mkdir(parents=True, exist_ok=True)
        (ci_dir / "validate.ps1").write_text(
            '$ErrorActionPreference = "Stop"\n'
            '$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path\n'
            'python -m pgsplit repo-validate "$RepositoryRoot"\n'
            "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n",
            encoding="utf-8",
            newline="\n",
        )
        (ci_dir / "validate.sh").write_text(
            '#!/usr/bin/env bash\nset -euo pipefail\n'
            'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"\n'
            'python -m pgsplit repo-validate "$ROOT"\n',
            encoding="utf-8",
            newline="\n",
        )
        (ci_dir / "deploy.ps1").write_text(
            '$ErrorActionPreference = "Stop"\n'
            '$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path\n'
            'python -m pgsplit repo-deploy "$RepositoryRoot"\n'
            "if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }\n",
            encoding="utf-8",
            newline="\n",
        )
        (ci_dir / "deploy.sh").write_text(
            '#!/usr/bin/env bash\nset -euo pipefail\n'
            'ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"\n'
            'python -m pgsplit repo-deploy "$ROOT"\n',
            encoding="utf-8",
            newline="\n",
        )

    @staticmethod
    def _repository_readme() -> str:
        return """# PostgreSQL Database Repository

Generated by PGSplit Database Repository Mode.

## Ownership

- `schemas/`, `global/`, `manifests/`, and `ci/` are generated. Do not edit them manually.
- `migrations/` is developer-owned. Add immutable, sequential SQL migrations.
- `data/reference/` is for small, reviewable reference datasets only.

## DataGrip Workflow

1. Open this folder as a DataGrip project and initialize or attach Git.
2. Connect DataGrip directly to PostgreSQL/RDS for live browsing.
3. Export a plain SQL schema dump with `pg_dump --schema-only`.
4. Run `pgsplit repo dump.sql --output .` from this folder's parent.
5. Review generated schema and manifest changes in Git.
6. Add a new migration for intentional changes, then run `ci/validate.ps1`.

## CI and Deployment

Validation checks file checksums, object identity, dependency order, and generated-file coverage.
Deployment scripts execute migrations in filename order and use the standard PostgreSQL environment variables.
"""


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
