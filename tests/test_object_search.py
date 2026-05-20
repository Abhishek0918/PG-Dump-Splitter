import shutil
from pathlib import Path
from uuid import uuid4

from app.db import SQLiteStore
from app.models.metadata import DumpObject
from app.models.object_types import ObjectType


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_object_search_matches_metadata_and_filters() -> None:
    workspace = _test_dir()
    store = SQLiteStore(workspace / "pgsplit.db")
    store.create_job("job-1", "dump.sql", input_name="dump.sql")
    store.replace_objects(
        "job-1",
        [
            DumpObject(
                object_id="public.users",
                object_type=ObjectType.TABLE,
                schema="public",
                name="users",
                statement="CREATE TABLE public.users (id bigint, email_address text);",
                path="schemas/public/tables/users.sql",
                dependencies=["public.roles"],
                attributes={"columns": [{"name": "email_address", "data_type": "text"}]},
            ),
            DumpObject(
                object_id="public.order_summary",
                object_type=ObjectType.VIEW,
                schema="public",
                name="order_summary",
                statement="CREATE VIEW public.order_summary AS SELECT 1;",
                path="schemas/public/views/order_summary.sql",
            ),
            DumpObject(
                object_id="auth.refresh_session",
                object_type=ObjectType.FUNCTION,
                schema="auth",
                name="refresh_session",
                statement="CREATE FUNCTION auth.refresh_session() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;",
                path="schemas/auth/functions/refresh_session.sql",
            ),
        ],
    )

    assert [item["object_id"] for item in store.search_objects("job-1", "email")] == ["public.users"]
    assert [item["object_id"] for item in store.search_objects("job-1", "summary")] == ["public.order_summary"]
    assert [item["object_id"] for item in store.search_objects("job-1", "public", object_type="tables")] == ["public.users"]
    assert [item["object_id"] for item in store.search_objects("job-1", "session", schema="auth")] == ["auth.refresh_session"]

    facets = store.object_facets("job-1")
    assert facets["by_type"] == {"functions": 1, "tables": 1, "views": 1}
    assert facets["by_schema"] == {"auth": 1, "public": 2}
    shutil.rmtree(workspace, ignore_errors=True)


def test_sqlite_store_creates_object_search_indexes() -> None:
    workspace = _test_dir()
    store = SQLiteStore(workspace / "pgsplit.db")

    with store._connect() as connection:
        index_names = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_objects_%'"
            ).fetchall()
        }

    assert "idx_objects_job_id" in index_names
    assert "idx_objects_job_type" in index_names
    assert "idx_objects_job_schema" in index_names
    assert "idx_objects_job_name" in index_names
    shutil.rmtree(workspace, ignore_errors=True)
