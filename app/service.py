from __future__ import annotations

import json
import re
import shutil
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.config import SplitterConfig
from app.db import JobRecord, SQLiteStore
from app.engine import DumpSplitterEngine
from app.output_tree import build_output_tree, load_manifest_summary

try:
    import psutil
except Exception:  # pragma: no cover - optional runtime metric
    psutil = None


class SplitterService:
    def __init__(self, config: SplitterConfig) -> None:
        self.config = config
        self.config.ensure_runtime_dirs()
        self.store = SQLiteStore(config.sqlite_path)
        self.engine = DumpSplitterEngine(config)
        self.executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="pgsplit")

    def submit_job_from_path(self, dump_path: Path) -> JobRecord:
        if not dump_path.exists() or not dump_path.is_file():
            raise FileNotFoundError(f"Dump file not found: {dump_path}")
        job_id = uuid4().hex
        input_name = self._clean_input_name(dump_path.name)
        self.store.create_job(
            job_id=job_id,
            source_path=str(dump_path),
            source_type="path",
            input_name=input_name,
            file_size_bytes=dump_path.stat().st_size,
        )
        self.executor.submit(self._run_job, job_id, dump_path)
        job = self.store.get_job(job_id)
        if job is None:
            raise RuntimeError("Failed to create job")
        return job

    def submit_job_from_upload(self, upload: UploadFile) -> JobRecord:
        job_id = uuid4().hex
        raw_name = upload.filename or f"{job_id}.sql"
        safe_name = self._clean_input_name(raw_name)
        target_dir = self.config.uploads_dir / job_id
        target_dir.mkdir(parents=True, exist_ok=True)
        target_path = target_dir / safe_name
        with target_path.open("wb") as handle:
            while True:
                chunk = upload.file.read(1024 * 1024)
                if not chunk:
                    break
                handle.write(chunk)
        self.store.create_job(
            job_id=job_id,
            source_path=str(target_path),
            source_type="upload",
            input_name=safe_name,
            file_size_bytes=target_path.stat().st_size,
        )
        self.executor.submit(self._run_job, job_id, target_path)
        job = self.store.get_job(job_id)
        if job is None:
            raise RuntimeError("Failed to create upload job")
        return job

    def _run_job(self, job_id: str, source_path: Path) -> None:
        self.store.mark_running(job_id)
        try:
            job_root = self.config.jobs_dir / job_id
            output_root = job_root / "output"
            output_root.mkdir(parents=True, exist_ok=True)
            job = self.store.get_job(job_id)
            split_result = self.engine.split_dump(
                source_path,
                output_root,
                progress_callback=lambda percent, stage, step, processed, objects: self.store.update_progress(
                    job_id,
                    percent,
                    stage,
                    step,
                    processed,
                    objects_processed=objects,
                    memory_bytes=self._memory_bytes(),
                ),
            )
            self.store.replace_objects(job_id, split_result.objects)
            self.store.update_progress(
                job_id,
                96,
                "archiving",
                "Creating downloadable ZIP",
                objects_processed=len(split_result.objects),
                memory_bytes=self._memory_bytes(),
            )
            archive_path = self._archive_output(output_root, job.input_name if job else None)
            self.store.mark_completed(
                job_id=job_id,
                output_dir=output_root,
                archive_path=archive_path,
                object_count=len(split_result.objects),
                warning_count=len(split_result.warnings),
            )
        except Exception as exc:  # pragma: no cover - background task exception path
            self.store.mark_failed(job_id, str(exc))

    def _archive_output(self, output_root: Path, input_name: str | None = None) -> Path:
        archive_base = output_root.parent / self._archive_basename(input_name)
        archive_path = shutil.make_archive(str(archive_base), "zip", root_dir=output_root)
        return Path(archive_path)

    def get_job(self, job_id: str) -> JobRecord | None:
        return self.store.get_job(job_id)

    def list_jobs(self, limit: int = 50) -> list[JobRecord]:
        return self.store.list_jobs(limit=limit)

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

    @staticmethod
    def _clean_input_name(raw_name: str) -> str:
        safe_name = Path(raw_name).name.replace(" ", "_")
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", safe_name)
        safe_name = re.sub(r"^[0-9a-f]{32}_", "", safe_name, flags=re.IGNORECASE)
        return safe_name or "dump.sql"

    @staticmethod
    def _archive_basename(input_name: str | None) -> str:
        stem = Path(input_name or "dump").stem
        stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
        if not stem:
            stem = "dump"
        return f"{stem}_split_output"

    @staticmethod
    def _memory_bytes() -> int | None:
        if psutil is None:
            return None
        return int(psutil.Process(os.getpid()).memory_info().rss)
