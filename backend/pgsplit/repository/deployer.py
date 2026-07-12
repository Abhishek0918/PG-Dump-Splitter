from __future__ import annotations

import hashlib
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from pgsplit.repository.validator import RepositoryValidator

SAFE_MIGRATION_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*\.sql$")


class RepositoryDeploymentError(RuntimeError):
    pass


@dataclass(slots=True)
class RepositoryDeploymentResult:
    applied: list[str]
    skipped: list[str]


class RepositoryDeployer:
    """Apply immutable migrations through psql with checksum tracking."""

    def __init__(self, psql_command: str = "psql") -> None:
        self.psql_command = psql_command

    def deploy(self, repository_root: Path) -> RepositoryDeploymentResult:
        root = repository_root.resolve()
        validation = RepositoryValidator().validate(root)
        if not validation.ok:
            raise RepositoryDeploymentError(
                "Repository validation failed: " + "; ".join(validation.errors)
            )

        migrations = sorted((root / "migrations").glob("*.sql"), key=lambda path: path.name)
        self._run_sql(
            "CREATE SCHEMA IF NOT EXISTS pgsplit;\n"
            "CREATE TABLE IF NOT EXISTS pgsplit.schema_migrations (\n"
            "  version text PRIMARY KEY,\n"
            "  checksum_sha256 text NOT NULL,\n"
            "  applied_at timestamptz NOT NULL DEFAULT now()\n"
            ");\n"
        )

        applied: list[str] = []
        skipped: list[str] = []
        for migration in migrations:
            if not SAFE_MIGRATION_NAME.fullmatch(migration.name):
                raise RepositoryDeploymentError(f"Unsafe migration filename: {migration.name}")
            checksum = _sha256_file(migration)
            existing = self._query_checksum(migration.name)
            if existing == checksum:
                skipped.append(migration.name)
                continue
            if existing:
                raise RepositoryDeploymentError(
                    f"Applied migration was modified: {migration.name} "
                    f"(database={existing}, file={checksum})"
                )
            self._apply_migration(migration, checksum)
            applied.append(migration.name)
        return RepositoryDeploymentResult(applied=applied, skipped=skipped)

    def _query_checksum(self, version: str) -> str:
        escaped = version.replace("'", "''")
        completed = subprocess.run(
            [
                self.psql_command,
                "--no-psqlrc",
                "--set",
                "ON_ERROR_STOP=on",
                "--tuples-only",
                "--no-align",
                "--command",
                f"SELECT checksum_sha256 FROM pgsplit.schema_migrations WHERE version = '{escaped}';",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            raise RepositoryDeploymentError(completed.stderr.strip() or "Could not query migration ledger")
        return completed.stdout.strip()

    def _apply_migration(self, migration: Path, checksum: str) -> None:
        version = migration.name.replace("'", "''")
        include_path = migration.resolve().as_posix().replace("'", "''")
        self._run_sql(
            "\\set ON_ERROR_STOP on\n"
            "BEGIN;\n"
            f"\\ir '{include_path}'\n"
            "INSERT INTO pgsplit.schema_migrations(version, checksum_sha256) "
            f"VALUES ('{version}', '{checksum}');\n"
            "COMMIT;\n"
        )

    def _run_sql(self, sql: str) -> None:
        completed = subprocess.run(
            [self.psql_command, "--no-psqlrc", "--set", "ON_ERROR_STOP=on"],
            input=sql,
            check=False,
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0:
            raise RepositoryDeploymentError(completed.stderr.strip() or "psql deployment command failed")


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
