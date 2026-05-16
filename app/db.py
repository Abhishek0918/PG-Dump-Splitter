from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.models.metadata import DumpObject


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _duration_seconds(start: str | None, end: str | None) -> float | None:
    if not start or not end:
        return None
    try:
        start_dt = datetime.fromisoformat(start)
        end_dt = datetime.fromisoformat(end)
    except ValueError:
        return None
    return max((end_dt - start_dt).total_seconds(), 0.0)


@dataclass(slots=True)
class JobRecord:
    job_id: str
    source_path: str
    source_type: str
    input_name: str
    status: str
    message: str | None
    created_at: str
    started_at: str | None
    finished_at: str | None
    output_dir: str | None
    archive_path: str | None
    object_count: int
    warning_count: int
    file_size_bytes: int
    processed_bytes: int
    progress_percent: float
    stage: str
    current_step: str
    duration_seconds: float | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "source_path": self.source_path,
            "source_type": self.source_type,
            "input_name": self.input_name,
            "status": self.status,
            "message": self.message,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "output_dir": self.output_dir,
            "archive_path": self.archive_path,
            "object_count": self.object_count,
            "warning_count": self.warning_count,
            "file_size_bytes": self.file_size_bytes,
            "processed_bytes": self.processed_bytes,
            "progress_percent": self.progress_percent,
            "stage": self.stage,
            "current_step": self.current_step,
            "duration_seconds": self.duration_seconds,
        }


class SQLiteStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._create_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.db_path, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        return connection

    def _create_schema(self) -> None:
        ddl = """
        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            source_path TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'path',
            input_name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            message TEXT,
            created_at TEXT NOT NULL,
            started_at TEXT,
            finished_at TEXT,
            output_dir TEXT,
            archive_path TEXT,
            object_count INTEGER NOT NULL DEFAULT 0,
            warning_count INTEGER NOT NULL DEFAULT 0,
            file_size_bytes INTEGER NOT NULL DEFAULT 0,
            processed_bytes INTEGER NOT NULL DEFAULT 0,
            progress_percent REAL NOT NULL DEFAULT 0,
            stage TEXT NOT NULL DEFAULT 'queued',
            current_step TEXT NOT NULL DEFAULT 'Waiting to start',
            duration_seconds REAL
        );

        CREATE TABLE IF NOT EXISTS objects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            object_id TEXT NOT NULL,
            object_type TEXT NOT NULL,
            schema_name TEXT,
            object_name TEXT NOT NULL,
            file_path TEXT,
            dependencies_json TEXT NOT NULL,
            line_start INTEGER,
            line_end INTEGER,
            FOREIGN KEY(job_id) REFERENCES jobs(job_id)
        );
        """
        with self._connect() as connection:
            connection.executescript(ddl)
            self._migrate_jobs_schema(connection)
            connection.commit()

    def _migrate_jobs_schema(self, connection: sqlite3.Connection) -> None:
        rows = connection.execute("PRAGMA table_info(jobs)").fetchall()
        existing = {row["name"] for row in rows}
        columns = {
            "source_type": "TEXT NOT NULL DEFAULT 'path'",
            "input_name": "TEXT NOT NULL DEFAULT ''",
            "file_size_bytes": "INTEGER NOT NULL DEFAULT 0",
            "processed_bytes": "INTEGER NOT NULL DEFAULT 0",
            "progress_percent": "REAL NOT NULL DEFAULT 0",
            "stage": "TEXT NOT NULL DEFAULT 'queued'",
            "current_step": "TEXT NOT NULL DEFAULT 'Waiting to start'",
            "duration_seconds": "REAL",
        }
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(f"ALTER TABLE jobs ADD COLUMN {name} {definition}")

    def create_job(
        self,
        job_id: str,
        source_path: str,
        source_type: str = "path",
        input_name: str | None = None,
        file_size_bytes: int = 0,
    ) -> None:
        created_at = _utc_now()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs (
                    job_id,
                    source_path,
                    source_type,
                    input_name,
                    status,
                    created_at,
                    file_size_bytes,
                    processed_bytes,
                    progress_percent,
                    stage,
                    current_step
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    source_path,
                    source_type,
                    input_name or Path(source_path).name,
                    "queued",
                    created_at,
                    max(file_size_bytes, 0),
                    0,
                    0,
                    "queued",
                    "Waiting to start",
                ),
            )
            connection.commit()

    def mark_running(self, job_id: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                UPDATE jobs
                SET status = ?, started_at = ?, message = NULL, progress_percent = ?, stage = ?, current_step = ?
                WHERE job_id = ?
                """,
                ("running", _utc_now(), 5, "parsing", "Preparing dump stream", job_id),
            )
            connection.commit()

    def mark_failed(self, job_id: str, message: str) -> None:
        finished_at = _utc_now()
        with self._lock, self._connect() as connection:
            duration = self._duration_for_job(connection, job_id, finished_at)
            connection.execute(
                """
                UPDATE jobs
                SET status = ?, finished_at = ?, message = ?, stage = ?, current_step = ?, duration_seconds = ?
                WHERE job_id = ?
                """,
                ("failed", finished_at, message, "failed", message, duration, job_id),
            )
            connection.commit()

    def mark_completed(
        self,
        job_id: str,
        output_dir: Path,
        archive_path: Path,
        object_count: int,
        warning_count: int,
    ) -> None:
        finished_at = _utc_now()
        with self._lock, self._connect() as connection:
            duration = self._duration_for_job(connection, job_id, finished_at)
            file_size = self._file_size_for_job(connection, job_id)
            connection.execute(
                """
                UPDATE jobs
                SET
                    status = ?,
                    finished_at = ?,
                    output_dir = ?,
                    archive_path = ?,
                    object_count = ?,
                    warning_count = ?,
                    processed_bytes = ?,
                    progress_percent = ?,
                    stage = ?,
                    current_step = ?,
                    duration_seconds = ?
                WHERE job_id = ?
                """,
                (
                    "completed",
                    finished_at,
                    str(output_dir),
                    str(archive_path),
                    object_count,
                    warning_count,
                    file_size,
                    100,
                    "completed",
                    "Completed",
                    duration,
                    job_id,
                ),
            )
            connection.commit()

    def update_progress(
        self,
        job_id: str,
        percent: float,
        stage: str,
        current_step: str,
        processed_bytes: int | None = None,
    ) -> None:
        percent = min(max(percent, 0), 100)
        with self._lock, self._connect() as connection:
            if processed_bytes is None:
                connection.execute(
                    """
                    UPDATE jobs
                    SET progress_percent = ?, stage = ?, current_step = ?
                    WHERE job_id = ?
                    """,
                    (percent, stage, current_step, job_id),
                )
            else:
                connection.execute(
                    """
                    UPDATE jobs
                    SET progress_percent = ?, stage = ?, current_step = ?, processed_bytes = ?
                    WHERE job_id = ?
                    """,
                    (percent, stage, current_step, max(processed_bytes, 0), job_id),
                )
            connection.commit()

    def _duration_for_job(self, connection: sqlite3.Connection, job_id: str, finished_at: str) -> float | None:
        row = connection.execute(
            "SELECT created_at, started_at FROM jobs WHERE job_id = ?",
            (job_id,),
        ).fetchone()
        if row is None:
            return None
        return _duration_seconds(row["started_at"] or row["created_at"], finished_at)

    def _file_size_for_job(self, connection: sqlite3.Connection, job_id: str) -> int:
        row = connection.execute("SELECT file_size_bytes FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row is None:
            return 0
        return int(row["file_size_bytes"] or 0)

    def _row_to_job(self, row: sqlite3.Row) -> JobRecord:
        return JobRecord(
            job_id=row["job_id"],
            source_path=row["source_path"],
            source_type=row["source_type"],
            input_name=row["input_name"],
            status=row["status"],
            message=row["message"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            output_dir=row["output_dir"],
            archive_path=row["archive_path"],
            object_count=row["object_count"],
            warning_count=row["warning_count"],
            file_size_bytes=row["file_size_bytes"],
            processed_bytes=row["processed_bytes"],
            progress_percent=row["progress_percent"],
            stage=row["stage"],
            current_step=row["current_step"],
            duration_seconds=row["duration_seconds"],
        )

    def replace_objects(self, job_id: str, objects: list[DumpObject]) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM objects WHERE job_id = ?", (job_id,))
            connection.executemany(
                """
                INSERT INTO objects (
                    job_id,
                    object_id,
                    object_type,
                    schema_name,
                    object_name,
                    file_path,
                    dependencies_json,
                    line_start,
                    line_end
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        job_id,
                        obj.object_id,
                        obj.object_type.value,
                        obj.schema,
                        obj.name,
                        obj.path,
                        json.dumps(obj.dependencies),
                        obj.line_start,
                        obj.line_end,
                    )
                    for obj in objects
                ],
            )
            connection.commit()

    def get_job(self, job_id: str) -> JobRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    job_id, source_path, status, message, created_at, started_at, finished_at,
                    output_dir, archive_path, object_count, warning_count,
                    source_type, input_name, file_size_bytes, processed_bytes,
                    progress_percent, stage, current_step, duration_seconds
                FROM jobs
                WHERE job_id = ?
                """,
                (job_id,),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_job(row)

    def list_jobs(self, limit: int = 50) -> list[JobRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    job_id, source_path, status, message, created_at, started_at, finished_at,
                    output_dir, archive_path, object_count, warning_count,
                    source_type, input_name, file_size_bytes, processed_bytes,
                    progress_percent, stage, current_step, duration_seconds
                FROM jobs
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def list_objects(self, job_id: str, schema: str | None = None, object_type: str | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT object_id, object_type, schema_name, object_name, file_path, dependencies_json, line_start, line_end
            FROM objects
            WHERE job_id = ?
        """
        params: list[Any] = [job_id]
        if schema:
            query += " AND schema_name = ?"
            params.append(schema)
        if object_type:
            query += " AND object_type = ?"
            params.append(object_type)
        query += " ORDER BY object_type, schema_name, object_name"

        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [
            {
                "object_id": row["object_id"],
                "object_type": row["object_type"],
                "schema": row["schema_name"],
                "name": row["object_name"],
                "path": row["file_path"],
                "dependencies": json.loads(row["dependencies_json"]),
                "line_start": row["line_start"],
                "line_end": row["line_end"],
            }
            for row in rows
        ]

    def get_object(self, job_id: str, object_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT object_id, object_type, schema_name, object_name, file_path, dependencies_json, line_start, line_end
                FROM objects
                WHERE job_id = ? AND object_id = ?
                """,
                (job_id, object_id),
            ).fetchone()
        if row is None:
            return None
        return {
            "object_id": row["object_id"],
            "object_type": row["object_type"],
            "schema": row["schema_name"],
            "name": row["object_name"],
            "path": row["file_path"],
            "dependencies": json.loads(row["dependencies_json"]),
            "line_start": row["line_start"],
            "line_end": row["line_end"],
        }
