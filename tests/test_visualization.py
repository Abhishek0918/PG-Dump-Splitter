from app.models.metadata import DumpObject
from app.models.object_types import ObjectType
from app.visualization import build_visualization_payload


def test_visualization_payload_builds_table_edges_and_dependency_summary() -> None:
    users = DumpObject(
        "auth.users",
        ObjectType.TABLE,
        "auth",
        "users",
        statement="CREATE TABLE auth.users(id bigint primary key);",
        attributes={
            "columns": [
                {"name": "id", "data_type": "bigint", "not_null": True, "primary_key": True, "foreign_key": False},
            ],
            "foreign_keys": [],
        },
    )
    sessions = DumpObject(
        "auth.sessions",
        ObjectType.TABLE,
        "auth",
        "sessions",
        statement="CREATE TABLE auth.sessions(user_id bigint references auth.users(id));",
        dependencies=["auth.users"],
        attributes={
            "columns": [
                {
                    "name": "user_id",
                    "data_type": "bigint",
                    "not_null": False,
                    "primary_key": False,
                    "foreign_key": True,
                },
            ],
            "foreign_keys": [
                {
                    "columns": ["user_id"],
                    "references_table": "auth.users",
                    "references_columns": ["id"],
                    "constraint_name": None,
                }
            ],
        },
    )
    login_view = DumpObject(
        "auth.login_view",
        ObjectType.VIEW,
        "auth",
        "login_view",
        statement="CREATE VIEW auth.login_view AS SELECT * FROM auth.sessions;",
        dependencies=["auth.sessions"],
    )

    payload = build_visualization_payload([users, sessions, login_view])

    assert payload["statistics"]["table_count"] == 2
    assert payload["statistics"]["relationship_count"] == 1
    assert payload["erd"]["relationships"][0]["source_table"] == "auth.sessions"
    assert payload["erd"]["relationships"][0]["target_table"] == "auth.users"
    sessions_table = next(table for table in payload["erd"]["tables"] if table["id"] == "auth.sessions")
    assert sessions_table["columns"][0]["name"] == "user_id"
    assert payload["object_dependencies"][0]["object_id"] == "auth.login_view"
