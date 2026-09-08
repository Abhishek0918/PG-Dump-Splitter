from __future__ import annotations

from fastapi.testclient import TestClient

from pgsplit.api.routes import create_api
from pgsplit.core.config import SplitterConfig


def _client(tmp_path):
    return TestClient(create_api(SplitterConfig(runtime_dir=tmp_path / "runtime")))


def test_auth_register_login_me_and_logout(tmp_path) -> None:
    client = _client(tmp_path)

    register = client.post(
        "/api/auth/register",
        json={"name": "Abhishek", "email": "ab@example.com", "password": "StrongPass123"},
    )
    assert register.status_code == 200
    token = register.json()["access_token"]
    assert register.json()["user"]["email"] == "ab@example.com"

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["name"] == "Abhishek"

    client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401

    login = client.post(
        "/api/auth/login",
        json={"email": "ab@example.com", "password": "StrongPass123", "remember_me": True},
    )
    assert login.status_code == 200
    assert login.json()["token_type"] == "bearer"


def test_auth_rejects_duplicate_email_and_bad_password(tmp_path) -> None:
    client = _client(tmp_path)
    payload = {"name": "User", "email": "dupe@example.com", "password": "StrongPass123"}

    assert client.post("/api/auth/register", json=payload).status_code == 200
    assert client.post("/api/auth/register", json=payload).status_code == 409
    assert client.post("/api/auth/login", json={"email": payload["email"], "password": "wrong"}).status_code == 401


def test_jobs_api_requires_authentication(tmp_path) -> None:
    client = _client(tmp_path)

    response = client.get("/api/jobs")

    assert response.status_code == 401


def test_jobs_are_scoped_by_user(tmp_path) -> None:
    from pgsplit.storage import SQLiteStore

    store = SQLiteStore(tmp_path / "runtime" / "pgsplit.sqlite3")
    user_one = store.create_user("u1", "One", "one@example.com", "hash")
    user_two = store.create_user("u2", "Two", "two@example.com", "hash")
    store.create_job("job-one", "one.sql", user_id=user_one.user_id)
    store.create_job("job-two", "two.sql", user_id=user_two.user_id)

    assert [job.job_id for job in store.list_jobs(user_id=user_one.user_id)] == ["job-one"]
    assert store.get_job("job-two", user_id=user_one.user_id) is None
    assert store.get_job("job-two", user_id=user_two.user_id) is not None
