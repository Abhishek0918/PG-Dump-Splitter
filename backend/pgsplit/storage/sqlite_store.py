from __future__ import annotations

import json
import sqlite3
import threading
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pgsplit.models.metadata import DumpObject


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
class UserRecord:
    user_id: str
    name: str
    email: str
    password_hash: str
    created_at: str
    last_login_at: str | None

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "user_id": self.user_id,
            "name": self.name,
            "email": self.email,
            "created_at": self.created_at,
            "last_login_at": self.last_login_at,
        }

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
    memory_bytes: int | None = None
    objects_processed: int = 0
    events_count: int = 0

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
            "memory_bytes": self.memory_bytes,
            "objects_processed": self.objects_processed,
            "events_count": self.events_count,
        }


@dataclass(slots=True)
class JobEvent:
    id: int
    job_id: str
    created_at: str
    level: str
    stage: str
    message: str
    metadata: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "job_id": self.job_id,
            "created_at": self.created_at,
            "level": self.level,
            "stage": self.stage,
            "message": self.message,
            "metadata": self.metadata,
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
        self._configure_connection(connection)
        return connection

    @staticmethod
    def _configure_connection(connection: sqlite3.Connection) -> None:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 5000")
        try:
            connection.execute("PRAGMA journal_mode = WAL")
        except sqlite3.DatabaseError:
            # Some SQLite targets, such as special in-memory databases, do not support WAL.
            pass

    def _create_schema(self) -> None:
        ddl = """
        CREATE TABLE IF NOT EXISTS users (
            user_id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            last_login_at TEXT
        );

        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(user_id),
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            remember_me INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS jobs (
            job_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL DEFAULT '__legacy__',
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
            duration_seconds REAL,
            memory_bytes INTEGER,
            objects_processed INTEGER NOT NULL DEFAULT 0,
            events_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS job_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            job_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            level TEXT NOT NULL,
            stage TEXT NOT NULL,
            message TEXT NOT NULL,
            metadata_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY(job_id) REFERENCES jobs(job_id)
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
            attributes_json TEXT NOT NULL DEFAULT '{}',
            line_start INTEGER,
            line_end INTEGER,
            FOREIGN KEY(job_id) REFERENCES jobs(job_id)
        );
        """
        with self._connect() as connection:
            connection.executescript(ddl)
            self._migrate_jobs_schema(connection)
            self._migrate_objects_schema(connection)
            self._migrate_job_events_schema(connection)
            self._create_indexes(connection)
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
            "memory_bytes": "INTEGER",
            "objects_processed": "INTEGER NOT NULL DEFAULT 0",
            "events_count": "INTEGER NOT NULL DEFAULT 0",
            "user_id": "TEXT NOT NULL DEFAULT '__legacy__'",
        }
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(f"ALTER TABLE jobs ADD COLUMN {name} {definition}")

    def _migrate_objects_schema(self, connection: sqlite3.Connection) -> None:
        rows = connection.execute("PRAGMA table_info(objects)").fetchall()
        existing = {row["name"] for row in rows}
        columns = {
            "attributes_json": "TEXT NOT NULL DEFAULT '{}'",
        }
        for name, definition in columns.items():
            if name not in existing:
                connection.execute(f"ALTER TABLE objects ADD COLUMN {name} {definition}")

    def _migrate_job_events_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS job_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                level TEXT NOT NULL,
                stage TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                FOREIGN KEY(job_id) REFERENCES jobs(job_id)
            )
            """
        )

    def _create_indexes(self, connection: sqlite3.Connection) -> None:
        connection.executescript(
            """
            CREATE INDEX IF NOT EXISTS idx_objects_job_id ON objects(job_id);
            CREATE INDEX IF NOT EXISTS idx_objects_job_type ON objects(job_id, object_type);
            CREATE INDEX IF NOT EXISTS idx_objects_job_schema ON objects(job_id, schema_name);
            CREATE INDEX IF NOT EXISTS idx_objects_job_name ON objects(job_id, object_name);
            CREATE INDEX IF NOT EXISTS idx_objects_job_path ON objects(job_id, file_path);
            CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id, id);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
            """
        )

    def create_user(self, user_id: str, name: str, email: str, password_hash: str) -> UserRecord:
        created_at = _utc_now()
        normalized_email = email.strip().lower()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO users (user_id, name, email, password_hash, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (user_id, name.strip(), normalized_email, password_hash, created_at),
            )
            connection.commit()
        return UserRecord(user_id, name.strip(), normalized_email, password_hash, created_at, None)

    def get_user_by_email(self, email: str) -> UserRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT user_id, name, email, password_hash, created_at, last_login_at FROM users WHERE email = ?",
                (email.strip().lower(),),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def get_user_by_id(self, user_id: str) -> UserRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT user_id, name, email, password_hash, created_at, last_login_at FROM users WHERE user_id = ?",
                (user_id,),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def create_session(self, session_id: str, user_id: str, expires_at: str, remember_me: bool) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT INTO sessions (session_id, user_id, created_at, expires_at, remember_me) VALUES (?, ?, ?, ?, ?)",
                (session_id, user_id, _utc_now(), expires_at, int(remember_me)),
            )
            connection.execute("UPDATE users SET last_login_at = ? WHERE user_id = ?", (_utc_now(), user_id))
            connection.commit()

    def get_user_for_session(self, session_id: str, now: str | None = None) -> UserRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT users.user_id, users.name, users.email, users.password_hash, users.created_at, users.last_login_at
                FROM sessions
                JOIN users ON users.user_id = sessions.user_id
                WHERE sessions.session_id = ? AND sessions.expires_at > ?
                """,
                (session_id, now or _utc_now()),
            ).fetchone()
        return self._row_to_user(row) if row else None

    def delete_session(self, session_id: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))
            connection.commit()

    @staticmethod
    def _row_to_user(row: sqlite3.Row) -> UserRecord:
        return UserRecord(
            user_id=row["user_id"],
            name=row["name"],
            email=row["email"],
            password_hash=row["password_hash"],
            created_at=row["created_at"],
            last_login_at=row["last_login_at"],
        )

    def create_job(
        self,
        job_id: str,
        source_path: str,
        source_type: str = "path",
        input_name: str | None = None,
        file_size_bytes: int = 0,
        user_id: str = "__legacy__",
    ) -> None:
        created_at = _utc_now()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO jobs (
                    job_id,
                    user_id,
                    source_path,
                    source_type,
                    input_name,
                    status,
                    created_at,
                    file_size_bytes,
                    processed_bytes,
                    progress_percent,
                    stage,
                    current_step)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    user_id,
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
            self._insert_event(
                connection,
                job_id,
                "info",
                "queued",
                "Job queued",
                {"source_type": source_type, "input_name": input_name or Path(source_path).name},
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
            self._insert_event(connection, job_id, "info", "parsing", "Preparing dump stream", {"percent": 5})
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
            self._insert_event(connection, job_id, "error", "failed", message, {"duration_seconds": duration})
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
            self._insert_event(
                connection,
                job_id,
                "success",
                "completed",
                "Completed",
                {"object_count": object_count, "warning_count": warning_count, "duration_seconds": duration},
            )
            connection.commit()

    def update_progress(
        self,
        job_id: str,
        percent: float,
        stage: str,
        current_step: str,
        processed_bytes: int | None = None,
        objects_processed: int | None = None,
        memory_bytes: int | None = None,
    ) -> None:
        percent = min(max(percent, 0), 100)
        with self._lock, self._connect() as connection:
            existing = connection.execute(
                "SELECT progress_percent, stage, current_step FROM jobs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
            assignments = ["progress_percent = ?", "stage = ?", "current_step = ?"]
            values: list[Any] = [percent, stage, current_step]
            if processed_bytes is not None:
                assignments.append("processed_bytes = ?")
                values.append(max(processed_bytes, 0))
            if objects_processed is not None:
                assignments.append("objects_processed = ?")
                values.append(max(objects_processed, 0))
            if memory_bytes is not None:
                assignments.append("memory_bytes = ?")
                values.append(max(memory_bytes, 0))
            values.append(job_id)
            connection.execute(
                f"UPDATE jobs SET {', '.join(assignments)} WHERE job_id = ?",
                values,
            )
            if self._should_log_progress_event(existing, percent, stage, current_step):
                self._insert_event(
                    connection,
                    job_id,
                    "info",
                    stage,
                    current_step,
                    {
                        "percent": round(percent, 2),
                        "processed_bytes": processed_bytes,
                        "objects_processed": objects_processed,
                        "memory_bytes": memory_bytes,
                    },
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
            memory_bytes=row["memory_bytes"],
            objects_processed=row["objects_processed"],
            events_count=row["events_count"],
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
                    attributes_json,
                    line_start,
                    line_end
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                        json.dumps(obj.attributes),
                        obj.line_start,
                        obj.line_end,
                    )
                    for obj in objects
                ],
            )
            connection.commit()

    def get_job(self, job_id: str, user_id: str | None = None) -> JobRecord | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT
                    job_id, source_path, status, message, created_at, started_at, finished_at,
                    output_dir, archive_path, object_count, warning_count,
                    source_type, input_name, file_size_bytes, processed_bytes,
                    progress_percent, stage, current_step, duration_seconds,
                    memory_bytes, objects_processed, events_count
                FROM jobs
                WHERE job_id = ? AND (? IS NULL OR user_id = ?)
                """,
                (job_id, user_id, user_id),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_job(row)

    def list_jobs(self, limit: int = 50, user_id: str | None = None) -> list[JobRecord]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT
                    job_id, source_path, status, message, created_at, started_at, finished_at,
                    output_dir, archive_path, object_count, warning_count,
                    source_type, input_name, file_size_bytes, processed_bytes,
                    progress_percent, stage, current_step, duration_seconds,
                    memory_bytes, objects_processed, events_count
                FROM jobs
                WHERE ? IS NULL OR user_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (user_id, user_id, limit),
            ).fetchall()
        return [self._row_to_job(row) for row in rows]

    def list_objects(self, job_id: str, schema: str | None = None, object_type: str | None = None) -> list[dict[str, Any]]:
        query = """
            SELECT object_id, object_type, schema_name, object_name, file_path, dependencies_json, attributes_json, line_start, line_end
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
        return [self._row_to_object(row) for row in rows]

    def search_objects(
        self,
        job_id: str,
        query_text: str | None = None,
        object_type: str | None = None,
        schema: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        query = """
            SELECT object_id, object_type, schema_name, object_name, file_path, dependencies_json, attributes_json, line_start, line_end
            FROM objects
            WHERE job_id = ?
        """
        params: list[Any] = [job_id]
        if object_type and object_type != "all":
            query += " AND object_type = ?"
            params.append(object_type)
        if schema and schema != "all":
            query += " AND schema_name = ?"
            params.append(schema)
        if query_text:
            like = self._like_pattern(query_text)
            query += """
                AND (
                    LOWER(object_id) LIKE ? ESCAPE '\\'
                    OR LOWER(object_type) LIKE ? ESCAPE '\\'
                    OR LOWER(COALESCE(schema_name, '')) LIKE ? ESCAPE '\\'
                    OR LOWER(object_name) LIKE ? ESCAPE '\\'
                    OR LOWER(COALESCE(file_path, '')) LIKE ? ESCAPE '\\'
                    OR LOWER(COALESCE(dependencies_json, '')) LIKE ? ESCAPE '\\'
                    OR LOWER(COALESCE(attributes_json, '')) LIKE ? ESCAPE '\\'
                )
            """
            params.extend([like] * 7)
        query += """
            ORDER BY
                CASE object_type
                    WHEN 'schemas' THEN 0
                    WHEN 'tables' THEN 1
                    WHEN 'views' THEN 2
                    WHEN 'materialized_views' THEN 3
                    WHEN 'functions' THEN 4
                    WHEN 'triggers' THEN 5
                    WHEN 'indexes' THEN 6
                    ELSE 7
                END,
                schema_name,
                object_name
            LIMIT ?
        """
        params.append(max(1, min(limit, 500)))
        with self._connect() as connection:
            rows = connection.execute(query, params).fetchall()
        return [self._row_to_object(row) for row in rows]

    def object_facets(self, job_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            type_rows = connection.execute(
                """
                SELECT object_type, COUNT(*) AS total
                FROM objects
                WHERE job_id = ?
                GROUP BY object_type
                ORDER BY object_type
                """,
                (job_id,),
            ).fetchall()
            schema_rows = connection.execute(
                """
                SELECT COALESCE(schema_name, '_global') AS schema_name, COUNT(*) AS total
                FROM objects
                WHERE job_id = ?
                GROUP BY COALESCE(schema_name, '_global')
                ORDER BY schema_name
                """,
                (job_id,),
            ).fetchall()
        return {
            "by_type": {row["object_type"]: int(row["total"]) for row in type_rows},
            "by_schema": {row["schema_name"]: int(row["total"]) for row in schema_rows},
        }

    def get_object(self, job_id: str, object_id: str) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                """
                SELECT object_id, object_type, schema_name, object_name, file_path, dependencies_json, attributes_json, line_start, line_end
                FROM objects
                WHERE job_id = ? AND object_id = ?
                """,
                (job_id, object_id),
            ).fetchone()
        if row is None:
            return None
        return self._row_to_object(row)

    def _row_to_object(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "object_id": row["object_id"],
            "object_type": row["object_type"],
            "schema": row["schema_name"],
            "name": row["object_name"],
            "path": row["file_path"],
            "dependencies": json.loads(row["dependencies_json"]),
            "attributes": json.loads(row["attributes_json"] or "{}"),
            "line_start": row["line_start"],
            "line_end": row["line_end"],
        }

    @staticmethod
    def _like_pattern(value: str) -> str:
        escaped = value.lower().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return f"%{escaped}%"

    def list_events(self, job_id: str, limit: int = 200) -> list[JobEvent]:
        with self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, job_id, created_at, level, stage, message, metadata_json
                FROM job_events
                WHERE job_id = ?
                ORDER BY id ASC
                LIMIT ?
                """,
                (job_id, limit),
            ).fetchall()
        return [self._row_to_event(row) for row in rows]

    def _insert_event(
        self,
        connection: sqlite3.Connection,
        job_id: str,
        level: str,
        stage: str,
        message: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        connection.execute(
            """
            INSERT INTO job_events (job_id, created_at, level, stage, message, metadata_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (job_id, _utc_now(), level, stage, message, json.dumps(metadata or {})),
        )
        connection.execute(
            "UPDATE jobs SET events_count = events_count + 1 WHERE job_id = ?",
            (job_id,),
        )

    def _should_log_progress_event(
        self,
        existing: sqlite3.Row | None,
        percent: float,
        stage: str,
        current_step: str,
    ) -> bool:
        if existing is None:
            return True
        previous_percent = float(existing["progress_percent"] or 0)
        previous_stage = str(existing["stage"] or "")
        previous_step = str(existing["current_step"] or "")
        if stage != previous_stage:
            return True
        if current_step == previous_step:
            return False
        if stage == "parsing":
            return int(percent // 10) > int(previous_percent // 10)
        return True

    def _row_to_event(self, row: sqlite3.Row) -> JobEvent:
        return JobEvent(
            id=row["id"],
            job_id=row["job_id"],
            created_at=row["created_at"],
            level=row["level"],
            stage=row["stage"],
            message=row["message"],
            metadata=json.loads(row["metadata_json"] or "{}"),
        )
