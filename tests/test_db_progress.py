import sqlite3
import shutil
from pathlib import Path
from uuid import uuid4

from app.db import SQLiteStore


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_sqlite_store_migrates_existing_jobs_table() -> None:
    workspace = _test_dir()
    db_path = workspace / "pgsplit.db"
    with sqlite3.connect(db_path) as connection:
        connection.execute(
            """
            CREATE TABLE jobs (
                job_id TEXT PRIMARY KEY,
                source_path TEXT NOT NULL,
                status TEXT NOT NULL,
                message TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                output_dir TEXT,
                archive_path TEXT,
                object_count INTEGER NOT NULL DEFAULT 0,
                warning_count INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        connection.commit()

    store = SQLiteStore(db_path)
    with sqlite3.connect(db_path) as connection:
        columns = {row[1] for row in connection.execute("PRAGMA table_info(jobs)").fetchall()}

    assert "progress_percent" in columns
    assert "source_type" in columns
    assert "duration_seconds" in columns
    shutil.rmtree(workspace, ignore_errors=True)


def test_progress_updates_move_job_to_completed() -> None:
    workspace = _test_dir()
    db_path = workspace / "pgsplit.db"
    store = SQLiteStore(db_path)
    store.create_job("job-1", "dump.sql", source_type="path", input_name="dump.sql", file_size_bytes=1000)

    queued = store.get_job("job-1")
    assert queued is not None
    assert queued.status == "queued"
    assert queued.progress_percent == 0

    store.mark_running("job-1")
    store.update_progress("job-1", 42, "parsing", "Parsed 10 SQL blocks", 420)
    running = store.get_job("job-1")
    assert running is not None
    assert running.status == "running"
    assert running.stage == "parsing"
    assert running.progress_percent == 42
    assert running.processed_bytes == 420

    store.mark_completed("job-1", workspace / "output", workspace / "split_output.zip", 12, 1)
    completed = store.get_job("job-1")
    assert completed is not None
    assert completed.status == "completed"
    assert completed.progress_percent == 100
    assert completed.stage == "completed"
    assert completed.duration_seconds is not None
    shutil.rmtree(workspace, ignore_errors=True)
