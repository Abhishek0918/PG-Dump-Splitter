from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from pgsplit.api.routes import create_api
from pgsplit.core.config import SplitterConfig
from pgsplit.diff.engine import SchemaDiffEngine, compare_schemas
from pgsplit.storage import SQLiteStore


def _sample_schema_intel_v1():
    return {
        "summary": {
            "schema_count": 1,
            "object_count": 2,
            "table_count": 2,
            "column_count": 4,
            "foreign_key_count": 0,
        },
        "schemas": [{"name": "public", "object_count": 2, "counts_by_type": {"tables": 2}}],
        "tables": [
            {
                "id": "tables:public.users",
                "schema": "public",
                "name": "users",
                "column_count": 2,
                "columns": [
                    {"name": "id", "data_type": "integer", "not_null": True, "primary_key": True, "foreign_key": False},
                    {"name": "email", "data_type": "character varying(255)", "not_null": True, "primary_key": False, "foreign_key": False},
                ],
                "primary_key": ["id"],
                "foreign_keys": [],
            },
            {
                "id": "tables:public.posts",
                "schema": "public",
                "name": "posts",
                "column_count": 2,
                "columns": [
                    {"name": "id", "data_type": "integer", "not_null": True, "primary_key": True, "foreign_key": False},
                    {"name": "title", "data_type": "text", "not_null": False, "primary_key": False, "foreign_key": False},
                ],
                "primary_key": ["id"],
                "foreign_keys": [],
            },
        ],
    }


def _sample_schema_intel_v2():
    return {
        "summary": {
            "schema_count": 2,
            "object_count": 3,
            "table_count": 2,
            "column_count": 5,
            "foreign_key_count": 1,
        },
        "schemas": [
            {"name": "public", "object_count": 2, "counts_by_type": {"tables": 2}},
            {"name": "audit", "object_count": 1, "counts_by_type": {"tables": 1}},
        ],
        "tables": [
            {
                "id": "tables:public.users",
                "schema": "public",
                "name": "users",
                "column_count": 3,
                "columns": [
                    {"name": "id", "data_type": "bigint", "not_null": True, "primary_key": True, "foreign_key": False},
                    {"name": "email", "data_type": "character varying(255)", "not_null": True, "primary_key": False, "foreign_key": False},
                    {"name": "created_at", "data_type": "timestamp with time zone", "not_null": False, "primary_key": False, "foreign_key": False},
                ],
                "primary_key": ["id"],
                "foreign_keys": [],
            },
            {
                "id": "tables:audit.logs",
                "schema": "audit",
                "name": "logs",
                "column_count": 2,
                "columns": [
                    {"name": "id", "data_type": "integer", "not_null": True, "primary_key": True, "foreign_key": False},
                    {"name": "action", "data_type": "text", "not_null": True, "primary_key": False, "foreign_key": False},
                ],
                "primary_key": ["id"],
                "foreign_keys": [],
            },
        ],
    }


def test_schema_diff_identical_zero_changes():
    intel = _sample_schema_intel_v1()
    diff = compare_schemas(intel, intel)

    assert diff["summary"]["total_changes"] == 0
    assert diff["summary"]["tables_added"] == 0
    assert diff["summary"]["tables_removed"] == 0
    assert diff["summary"]["tables_modified"] == 0
    assert len(diff["tables"]["added"]) == 0
    assert len(diff["tables"]["removed"]) == 0
    assert len(diff["tables"]["modified"]) == 0


def test_schema_diff_detects_table_and_column_changes():
    v1 = _sample_schema_intel_v1()
    v2 = _sample_schema_intel_v2()

    diff = compare_schemas(v1, v2)

    # 1 table added (audit.logs)
    assert len(diff["tables"]["added"]) == 1
    assert diff["tables"]["added"][0]["id"] == "tables:audit.logs"

    # 1 table removed (public.posts)
    assert len(diff["tables"]["removed"]) == 1
    assert diff["tables"]["removed"][0]["id"] == "tables:public.posts"

    # 1 table modified (public.users: id changed from integer->bigint, created_at added)
    assert len(diff["tables"]["modified"]) == 1
    users_mod = diff["tables"]["modified"][0]
    assert users_mod["id"] == "tables:public.users"

    added_col_names = [c["name"] for c in users_mod["columns"]["added"]]
    assert "created_at" in added_col_names

    mod_col_names = [c["name"] for c in users_mod["columns"]["modified"]]
    assert "id" in mod_col_names
    id_mod = next(c for c in users_mod["columns"]["modified"] if c["name"] == "id")
    assert id_mod["data_type_from"] == "integer"
    assert id_mod["data_type_to"] == "bigint"
    assert id_mod["type_changed"] is True

    # Schema changes
    assert "audit" in diff["schemas"]["added"]


def test_diff_api_endpoint(tmp_path: Path):
    runtime_dir = tmp_path / "runtime"
    cfg = SplitterConfig(runtime_dir=runtime_dir)
    api = create_api(cfg)
    client = TestClient(api)

    # 1. Register user
    reg = client.post("/api/auth/register", json={"name": "Alice", "email": "alice@diff.com", "password": "Password123"})
    assert reg.status_code == 200
    token = reg.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 2. Setup 2 completed jobs in the store
    store = SQLiteStore(cfg.sqlite_path)
    job1_out = runtime_dir / "jobs" / "job-1" / "output"
    job2_out = runtime_dir / "jobs" / "job-2" / "output"
    (job1_out / "manifest").mkdir(parents=True, exist_ok=True)
    (job2_out / "manifest").mkdir(parents=True, exist_ok=True)

    # Write schema_intelligence.json
    (job1_out / "manifest" / "schema_intelligence.json").write_text(json.dumps(_sample_schema_intel_v1()), encoding="utf-8")
    (job2_out / "manifest" / "schema_intelligence.json").write_text(json.dumps(_sample_schema_intel_v2()), encoding="utf-8")

    store.create_job("job-1", "v1.sql", user_id=reg.json()["user"]["user_id"])
    store.mark_completed("job-1", job1_out, job1_out.parent / "archive.zip", 2, 0)

    store.create_job("job-2", "v2.sql", user_id=reg.json()["user"]["user_id"])
    store.mark_completed("job-2", job2_out, job2_out.parent / "archive.zip", 3, 0)

    # 3. Call POST /api/diff
    diff_resp = client.post(
        "/api/diff",
        json={"base_job_id": "job-1", "target_job_id": "job-2"},
        headers=auth_headers,
    )
    assert diff_resp.status_code == 200
    payload = diff_resp.json()
    assert payload["base_job_id"] == "job-1"
    assert payload["target_job_id"] == "job-2"
    assert payload["summary"]["tables_added"] == 1
    assert payload["summary"]["tables_removed"] == 1
    assert payload["summary"]["tables_modified"] == 1


def test_diff_api_requires_auth(tmp_path: Path):
    runtime_dir = tmp_path / "runtime"
    api = create_api(SplitterConfig(runtime_dir=runtime_dir))
    client = TestClient(api)

    resp = client.post("/api/diff", json={"base_job_id": "job-1", "target_job_id": "job-2"})
    assert resp.status_code == 401


def test_diff_api_prevents_cross_user_access(tmp_path: Path):
    runtime_dir = tmp_path / "runtime"
    cfg = SplitterConfig(runtime_dir=runtime_dir)
    api = create_api(cfg)
    client = TestClient(api)

    # Register User 1 and User 2
    u1_reg = client.post("/api/auth/register", json={"name": "U1", "email": "u1@test.com", "password": "Password123"})
    u2_reg = client.post("/api/auth/register", json={"name": "U2", "email": "u2@test.com", "password": "Password123"})

    u1_token = u1_reg.json()["access_token"]
    u1_id = u1_reg.json()["user"]["user_id"]
    u2_id = u2_reg.json()["user"]["user_id"]

    store = SQLiteStore(cfg.sqlite_path)
    j1_out = runtime_dir / "jobs" / "j1" / "output"
    j2_out = runtime_dir / "jobs" / "j2" / "output"
    (j1_out / "manifest").mkdir(parents=True, exist_ok=True)
    (j2_out / "manifest").mkdir(parents=True, exist_ok=True)
    (j1_out / "manifest" / "schema_intelligence.json").write_text(json.dumps(_sample_schema_intel_v1()), encoding="utf-8")
    (j2_out / "manifest" / "schema_intelligence.json").write_text(json.dumps(_sample_schema_intel_v2()), encoding="utf-8")

    # j1 belongs to u1, j2 belongs to u2
    store.create_job("j1", "j1.sql", user_id=u1_id)
    store.mark_completed("j1", j1_out, j1_out.parent / "a1.zip", 1, 0)
    store.create_job("j2", "j2.sql", user_id=u2_id)
    store.mark_completed("j2", j2_out, j2_out.parent / "a2.zip", 1, 0)

    # User 1 tries to diff j1 with j2 (which belongs to User 2) -> 404 (Target job not found)
    resp = client.post(
        "/api/diff",
        json={"base_job_id": "j1", "target_job_id": "j2"},
        headers={"Authorization": f"Bearer {u1_token}"},
    )
    assert resp.status_code == 404
    assert "Target job not found" in resp.json()["detail"]
