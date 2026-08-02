from __future__ import annotations

import os
import re
import shutil
from pathlib import Path

from pgsplit.core.config import SplitterConfig
from pgsplit.core.engine import DumpSplitterEngine
from pgsplit.storage import SQLiteStore

try:
    import psutil
except Exception:  # pragma: no cover - optional runtime metric
    psutil = None


class DumpAnalysisRunner:
    """Runs one dump analysis job; later this can be called by a worker process."""

    def __init__(self, config: SplitterConfig, store: SQLiteStore) -> None:
        self.config = config
        self.store = store

    def run(self, job_id: str, source_path: Path) -> None:
        self.store.mark_running(job_id)
        try:
            job_root = self.config.jobs_dir / job_id
            output_root = job_root / "output"
            output_root.mkdir(parents=True, exist_ok=True)
            job = self.store.get_job(job_id)
            split_result = DumpSplitterEngine(self.config).split_dump(
                source_path,
                output_root,
                progress_callback=lambda percent, stage, step, processed, objects: self.store.update_progress(
                    job_id,
                    percent,
                    stage,
                    step,
                    processed,
                    objects_processed=objects,
                    memory_bytes=memory_bytes(),
                ),
            )
            objects = split_result.objects
            warnings = split_result.warnings
            self.store.replace_objects(job_id, objects)
            self.store.update_progress(
                job_id,
                96,
                "archiving",
                "Creating downloadable ZIP",
                objects_processed=len(objects),
                memory_bytes=memory_bytes(),
            )
            archive_path = self._archive_output(output_root, job.input_name if job else None)
            self.store.mark_completed(
                job_id=job_id,
                output_dir=output_root,
                archive_path=archive_path,
                object_count=len(objects),
                warning_count=len(warnings),
            )
        except Exception as exc:  # pragma: no cover - background task exception path
            self.store.mark_failed(job_id, str(exc))

    @staticmethod
    def _archive_output(output_root: Path, input_name: str | None = None) -> Path:
        archive_base = output_root.parent / archive_basename(input_name)
        archive_path = shutil.make_archive(str(archive_base), "zip", root_dir=output_root)
        return Path(archive_path)


def archive_basename(input_name: str | None) -> str:
    return f"{archive_stem(input_name)}_split_output"


def archive_stem(input_name: str | None) -> str:
    stem = Path(input_name or "dump").stem
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
    return stem or "dump"


def memory_bytes() -> int | None:
    if psutil is None:
        return None
    return int(psutil.Process(os.getpid()).memory_info().rss)
