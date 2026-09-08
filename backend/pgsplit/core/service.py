from __future__ import annotations

import json
import re
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from pgsplit.core.config import SplitterConfig
from pgsplit.core.job_runner import DumpAnalysisRunner, archive_basename, archive_stem
from pgsplit.core.output_tree import build_output_tree, load_manifest_summary
from pgsplit.storage import JobRecord, SQLiteStore
from pgsplit.restore.generator import RestoreScriptGenerator, find_restore_script



class SplitterService:
    def __init__(self, config: SplitterConfig) -> None:
        self.config = config
        self.config.ensure_runtime_dirs()
        self.store = SQLiteStore(config.sqlite_path)
        self.restore_generator = RestoreScriptGenerator(config)
        self.runner = DumpAnalysisRunner(config, self.store)
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pgsplit")

    def submit_job_from_path(self, dump_path: Path, user_id: str = "__legacy__") -> JobRecord:
        dump_path = dump_path.expanduser().resolve()
        self._validate_path_job(dump_path)
        job_id = uuid4().hex
        input_name = self._clean_input_name(dump_path.name)
        self.store.create_job(
            job_id=job_id,
            source_path=str(dump_path),
            source_type="path",
            input_name=input_name,
            file_size_bytes=dump_path.stat().st_size,
            user_id=user_id,
        )
        self.executor.submit(self.runner.run, job_id, dump_path)
        job = self.store.get_job(job_id)
        if job is None:
            raise RuntimeError("Failed to create job")
        return job

    def submit_job_from_upload(self, upload: UploadFile, user_id: str = "__legacy__") -> JobRecord:
        job_id = uuid4().hex
        raw_name = upload.filename or f"{job_id}.sql"
        safe_name = self._clean_input_name(raw_name)
        self._validate_sql_filename(safe_name)
        target_dir = self.config.uploads_dir / job_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / safe_name
        bytes_written = 0
        try:
            with target_path.open("wb") as handle:
                while True:
                    chunk = upload.file.read(1024 * 1024)
                    if not chunk:
                        break
                    bytes_written += len(chunk)
                    if self.config.max_upload_bytes > 0 and bytes_written > self.config.max_upload_bytes:
                        raise ValueError(f"Upload exceeds maximum size of {self.config.max_upload_bytes} bytes")
                    handle.write(chunk)
        except Exception:
            target_path.unlink(missing_ok=True)
            raise
        self.store.create_job(
            job_id=job_id,
            source_path=str(target_path),
            source_type="upload",
            input_name=safe_name,
            file_size_bytes=target_path.stat().st_size,
            user_id=user_id,
        )
        self.executor.submit(self.runner.run, job_id, target_path)
        job = self.store.get_job(job_id)
        if job is None:
            raise RuntimeError("Failed to create upload job")
        return job

    def get_job(self, job_id: str, user_id: str | None = None) -> JobRecord | None:
        return self.store.get_job(job_id, user_id=user_id)

    def list_jobs(self, limit: int = 50, user_id: str | None = None) -> list[JobRecord]:
        return self.store.list_jobs(limit=limit, user_id=user_id)

    def list_objects(self, job_id: str, schema: str | None, object_type: str | None) -> list[dict]:
        return self.store.list_objects(job_id=job_id, schema=schema, object_type=object_type)

    def search_objects(
        self,
        job_id: str,
        query_text: str | None,
        schema: str | None,
        object_type: str | None,
        limit: int,
    ) -> dict:
        return {
            "items": self.store.search_objects(
                job_id=job_id,
                query_text=query_text,
                schema=schema,
                object_type=object_type,
                limit=limit,
            ),
            "facets": self.store.object_facets(job_id),
        }

    def list_events(self, job_id: str, limit: int = 200) -> list[dict]:
        return [event.to_dict() for event in self.store.list_events(job_id=job_id, limit=limit)]

    def get_object(self, job_id: str, object_id: str) -> dict | None:
        return self.store.get_object(job_id=job_id, object_id=object_id)

    def get_output_dir(self, job_id: str) -> Path | None:
        job = self.store.get_job(job_id)
        if job is None or not job.output_dir:
            return None
        return Path(job.output_dir)

    def get_output_explorer(self, job_id: str) -> dict:
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Output structure is not ready yet")

        manifest = load_manifest_summary(output_dir)
        tree_path = output_dir / "manifest" / "output_tree.json"
        tree: dict
        if tree_path.exists():
            tree = json.loads(tree_path.read_text(encoding="utf-8"))
        else:
            tree = build_output_tree(output_dir)
        return {"tree": tree, "manifest": manifest}

    def get_visualization_payload(self, job_id: str) -> dict:
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Visualization is not ready yet")
        path = output_dir / "manifest" / "visualization.json"
        if not path.exists():
            raise FileNotFoundError("Visualization manifest is missing")
        return json.loads(path.read_text(encoding="utf-8"))

    def get_schema_intelligence_payload(self, job_id: str) -> dict:
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Schema intelligence is not ready yet")
        path = output_dir / "manifest" / "schema_intelligence.json"
        if not path.exists():
            raise FileNotFoundError("Schema intelligence manifest is missing")
        return json.loads(path.read_text(encoding="utf-8"))

    def get_restore_plan(self, job_id: str) -> dict:
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Restore assets are not ready yet")
        manifest_path = output_dir / self.config.restore_dirname / "restore_manifest.json"
        if not manifest_path.exists():
            return self.restore_generator.generate_from_output(output_dir)
        return json.loads(manifest_path.read_text(encoding="utf-8"))

    def read_restore_script(self, job_id: str, mode: str | None = None, schema: str | None = None) -> dict:
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Restore assets are not ready yet")
        manifest = self.get_restore_plan(job_id)
        script = find_restore_script(manifest, mode, schema)
        script_path = output_dir / str(script["path"])
        if not script_path.exists():
            raise FileNotFoundError(f"Restore script missing: {script['script_name']}")
        return {
            "mode": script["mode"],
            "schema": script.get("schema"),
            "script_name": script["script_name"],
            "path": script["path"],
            "sql": script_path.read_text(encoding="utf-8"),
            "metadata": script,
        }

    def archive_restore_assets(self, job_id: str) -> Path:
        job = self.get_job(job_id)
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Restore assets are not ready yet")
        restore_dir = output_dir / self.config.restore_dirname
        if not restore_dir.exists():
            self.get_restore_plan(job_id)
        archive_base = output_dir.parent / f"{archive_stem(job.input_name if job else None)}_restore_assets"
        return Path(shutil.make_archive(str(archive_base), "zip", root_dir=restore_dir))

    def read_object_source(self, job_id: str, object_id: str) -> dict[str, str | None]:
        output_dir = self.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise FileNotFoundError("Output directory is not ready yet")
        obj = self.get_object(job_id, object_id)
        if obj is None or not obj.get("path"):
            raise FileNotFoundError(f"Object not found: {object_id}")
        source_path = output_dir / str(obj["path"])
        if not source_path.exists():
            raise FileNotFoundError(f"Object file missing: {object_id}")
        return {
            "object_id": object_id,
            "path": str(obj["path"]),
            "sql": source_path.read_text(encoding="utf-8"),
        }

    def diff_jobs(
        self, base_job_id: str, target_job_id: str, user_id: str | None = None
    ) -> dict[str, Any]:
        from pgsplit.diff.engine import compare_schemas

        base_job = self.get_job(base_job_id, user_id=user_id)
        if base_job is None:
            raise FileNotFoundError(f"Base job not found: {base_job_id}")
        if base_job.status != "completed":
            raise ValueError(f"Base job {base_job_id} is not completed (status: {base_job.status})")

        target_job = self.get_job(target_job_id, user_id=user_id)
        if target_job is None:
            raise FileNotFoundError(f"Target job not found: {target_job_id}")
        if target_job.status != "completed":
            raise ValueError(f"Target job {target_job_id} is not completed (status: {target_job.status})")

        base_schema = self.get_schema_intelligence_payload(base_job_id)
        target_schema = self.get_schema_intelligence_payload(target_job_id)

        base_objects = self.list_objects(base_job_id, schema=None, object_type=None)
        target_objects = self.list_objects(target_job_id, schema=None, object_type=None)

        diff = compare_schemas(base_schema, target_schema, base_objects, target_objects)
        return {
            "base_job_id": base_job_id,
            "target_job_id": target_job_id,
            "base_job_name": base_job.input_name,
            "target_job_name": target_job.input_name,
            **diff,
        }

    @staticmethod
    def _clean_input_name(raw_name: str) -> str:
        safe_name = Path(raw_name).name.replace(" ", "_")
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", safe_name)
        safe_name = re.sub(r"^[0-9a-f]{32}_", "", safe_name, flags=re.IGNORECASE)
        return safe_name or "dump.sql"



    @staticmethod
    def _archive_basename(input_name: str | None) -> str:
        return archive_basename(input_name)

    @staticmethod
    def _archive_stem(input_name: str | None) -> str:
        return archive_stem(input_name)

    def _validate_path_job(self, dump_path: Path) -> None:
        if not self.config.allow_path_jobs:
            raise PermissionError("Path-based jobs are disabled by configuration")
        if not dump_path.exists() or not dump_path.is_file():
            raise FileNotFoundError(f"Dump file not found: {dump_path}")
        self._validate_sql_filename(dump_path.name)
        allowed_roots = tuple(root.expanduser().resolve() for root in self.config.allowed_path_roots)
        if allowed_roots and not any(self._is_relative_to(dump_path, root) for root in allowed_roots):
            roots = ", ".join(str(root) for root in allowed_roots)
            raise PermissionError(f"Dump path must be inside an allowed root: {roots}")

    @staticmethod
    def _validate_sql_filename(filename: str) -> None:
        if not filename.lower().endswith(".sql"):
            raise ValueError("Only .sql files are accepted")

    @staticmethod
    def _is_relative_to(path: Path, root: Path) -> bool:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            return False
