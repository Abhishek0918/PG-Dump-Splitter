from __future__ import annotations

import json
import shutil
from pathlib import Path
from uuid import uuid4

from pgsplit.repository.diff import RepositoryDiff
from pgsplit.repository.deployer import RepositoryDeployer, RepositoryDeploymentError
from pgsplit.repository.generator import DatabaseRepositoryGenerator
from pgsplit.repository.validator import RepositoryValidator


SAMPLE_DUMP = """
CREATE SCHEMA auth;
CREATE TYPE auth.user_status AS ENUM ('active', 'disabled');
CREATE TABLE auth.users (
    id bigint NOT NULL,
    status auth.user_status NOT NULL
);
CREATE FUNCTION auth.user_count() RETURNS bigint
LANGUAGE sql
AS $$ SELECT count(*) FROM auth.users; $$;
CREATE PROCEDURE auth.disable_users()
LANGUAGE sql
AS $$ UPDATE auth.users SET status = 'disabled'; $$;
COPY auth.users (id, status) FROM stdin;
1	active
\\.
"""


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_repository_generation_is_deterministic_and_preserves_migrations() -> None:
    workspace = _test_dir()
    dump = workspace / "schema.sql"
    repository = workspace / "database"
    dump.write_text(SAMPLE_DUMP, encoding="utf-8")
    generator = DatabaseRepositoryGenerator()

    first = generator.generate(dump, repository)
    first_checksums = (repository / "manifests" / "checksums.json").read_text(encoding="utf-8")
    first_baseline = (repository / "migrations" / "0001_baseline.sql").read_text(encoding="utf-8")
    custom_migration = repository / "migrations" / "0002_add_audit.sql"
    custom_migration.write_text("CREATE TABLE auth.audit(id bigint);\n", encoding="utf-8")

    second = generator.generate(dump, repository)
    second_checksums = (repository / "manifests" / "checksums.json").read_text(encoding="utf-8")

    assert first.object_count == 5
    assert first.baseline_created is True
    assert second.baseline_created is False
    assert first_checksums == second_checksums
    assert (repository / "migrations" / "0001_baseline.sql").read_text(encoding="utf-8") == first_baseline
    assert "\\ir " not in first_baseline
    assert "CREATE TABLE auth.users" in first_baseline
    assert custom_migration.read_text(encoding="utf-8") == "CREATE TABLE auth.audit(id bigint);\n"
    assert (repository / "schemas" / "auth" / "procedures").is_dir()
    assert not list((repository / "data" / "reference").glob("*.sql"))
    assert RepositoryValidator().validate(repository).ok
    shutil.rmtree(workspace, ignore_errors=True)


def test_repository_can_include_reference_copy_data() -> None:
    workspace = _test_dir()
    dump = workspace / "schema.sql"
    repository = workspace / "database"
    dump.write_text(SAMPLE_DUMP, encoding="utf-8")

    result = DatabaseRepositoryGenerator().generate(dump, repository, include_data=True)
    objects = json.loads((repository / "manifests" / "objects.json").read_text(encoding="utf-8"))

    assert result.included_data is True
    assert any(item["object_type"] == "data" for item in objects)
    assert list((repository / "data" / "reference").glob("*.copy.sql"))
    assert RepositoryValidator().validate(repository).ok
    shutil.rmtree(workspace, ignore_errors=True)


def test_repository_validator_detects_changed_generated_sql() -> None:
    workspace = _test_dir()
    dump = workspace / "schema.sql"
    repository = workspace / "database"
    dump.write_text(SAMPLE_DUMP, encoding="utf-8")
    DatabaseRepositoryGenerator().generate(dump, repository)
    table_path = repository / "schemas" / "auth" / "tables" / "users.sql"
    table_path.write_text("CREATE TABLE auth.users(id text);\n", encoding="utf-8")

    report = RepositoryValidator().validate(repository)

    assert not report.ok
    assert any("Checksum mismatch" in error for error in report.errors)
    shutil.rmtree(workspace, ignore_errors=True)


def test_repository_diff_reports_changed_objects() -> None:
    workspace = _test_dir()
    old_dump = workspace / "old.sql"
    new_dump = workspace / "new.sql"
    old_repository = workspace / "old_database"
    new_repository = workspace / "new_database"
    old_dump.write_text("CREATE TABLE public.users(id integer);\n", encoding="utf-8")
    new_dump.write_text("CREATE TABLE public.users(id bigint);\nCREATE TABLE public.roles(id bigint);\n", encoding="utf-8")
    generator = DatabaseRepositoryGenerator()
    generator.generate(old_dump, old_repository)
    generator.generate(new_dump, new_repository)

    result = RepositoryDiff().compare(old_repository, new_repository)

    assert [item["object_id"] for item in result.added] == ["public.roles"]
    assert [item["object_id"] for item in result.changed] == ["public.users"]
    assert result.removed == []
    shutil.rmtree(workspace, ignore_errors=True)


def test_repository_removes_volatile_pg_dump_restrict_tokens() -> None:
    workspace = _test_dir()
    dump = workspace / "schema.sql"
    repository = workspace / "database"
    dump.write_text(
        "\\restrict random-token-one\n"
        "SET statement_timeout = 0;\n"
        "CREATE TABLE public.users(id bigint);\n"
        "\\unrestrict random-token-one\n",
        encoding="utf-8",
    )

    DatabaseRepositoryGenerator().generate(dump, repository)
    generated_sql = "\n".join(
        path.read_text(encoding="utf-8")
        for path in (repository / "global" / "unknown").glob("*.sql")
    )

    assert "random-token-one" not in generated_sql
    assert (repository / ".gitattributes").is_file()
    shutil.rmtree(workspace, ignore_errors=True)


def test_repository_deployer_tracks_immutable_migrations() -> None:
    workspace = _test_dir()
    dump = workspace / "schema.sql"
    repository = workspace / "database"
    dump.write_text("CREATE TABLE public.users(id bigint);\n", encoding="utf-8")
    DatabaseRepositoryGenerator().generate(dump, repository)

    class FakeDeployer(RepositoryDeployer):
        def __init__(self) -> None:
            super().__init__("psql")
            self.ledger: dict[str, str] = {}

        def _run_sql(self, sql: str) -> None:
            return None

        def _query_checksum(self, version: str) -> str:
            return self.ledger.get(version, "")

        def _apply_migration(self, migration: Path, checksum: str) -> None:
            self.ledger[migration.name] = checksum

    deployer = FakeDeployer()
    first = deployer.deploy(repository)
    second = deployer.deploy(repository)
    (repository / "migrations" / "0001_baseline.sql").write_text("SELECT 1;\n", encoding="utf-8")

    assert first.applied == ["0001_baseline.sql"]
    assert second.skipped == ["0001_baseline.sql"]
    try:
        deployer.deploy(repository)
    except RepositoryDeploymentError as exc:
        assert "Applied migration was modified" in str(exc)
    else:
        raise AssertionError("Modified applied migration should fail deployment")
    shutil.rmtree(workspace, ignore_errors=True)
