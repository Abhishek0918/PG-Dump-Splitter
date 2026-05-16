from __future__ import annotations

import json
import shutil
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.config import SplitterConfig
from app.db import JobRecord, SQLiteStore
from app.engine import DumpSplitterEngine
from app.output_tree import build_output_tree, load_manifest_summary


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
        self.store.create_job(
            job_id=job_id,
            source_path=str(dump_path),
            source_type="path",
            input_name=dump_path.name,
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
        safe_name = Path(raw_name).name.replace(" ", "_")
        target_path = self.config.uploads_dir / f"{job_id}_{safe_name}"
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
            split_result = self.engine.split_dump(
                source_path,
                output_root,
                progress_callback=lambda percent, stage, step, processed: self.store.update_progress(
                    job_id,
                    percent,
                    stage,
                    step,
                    processed,
                ),
            )
            self.store.replace_objects(job_id, split_result.objects)
            self.store.update_progress(job_id, 96, "archiving", "Creating downloadable ZIP")
            archive_path = self._archive_output(output_root)
            self.store.mark_completed(
                job_id=job_id,
                output_dir=output_root,
                archive_path=archive_path,
                object_count=len(split_result.objects),
                warning_count=len(split_result.warnings),
            )
        except Exception as exc:  # pragma: no cover - background task exception path
            self.store.mark_failed(job_id, str(exc))

    def _archive_output(self, output_root: Path) -> Path:
        archive_base = output_root.parent / "split_output"
        archive_path = shutil.make_archive(str(archive_base), "zip", root_dir=output_root)
        return Path(archive_path)

    def get_job(self, job_id: str) -> JobRecord | None:
        return self.store.get_job(job_id)

    def list_jobs(self, limit: int = 50) -> list[JobRecord]:
        return self.store.list_jobs(limit=limit)

    def list_objects(self, job_id: str, schema: str | None, object_type: str | None) -> list[dict]:
        return self.store.list_objects(job_id=job_id, schema=schema, object_type=object_type)

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
