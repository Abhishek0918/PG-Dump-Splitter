from app.catalog import build_catalog_payload, build_dbeaver_navigator
from app.models.metadata import DumpObject
from app.models.object_types import ObjectType


def _objects() -> list[DumpObject]:
    return [
        DumpObject("auth.auth", ObjectType.SCHEMA, "auth", "auth", statement="CREATE SCHEMA auth;"),
        DumpObject("auth.users", ObjectType.TABLE, "auth", "users", statement="CREATE TABLE auth.users(id int);", path="schemas/auth/tables/users.sql"),
        DumpObject("auth.user_sessions", ObjectType.TABLE, "auth", "user_sessions", statement="CREATE TABLE auth.user_sessions(id int);", path="schemas/auth/tables/user_sessions.sql"),
        DumpObject("auth.active_users", ObjectType.VIEW, "auth", "active_users", statement="CREATE VIEW auth.active_users AS SELECT 1;", path="schemas/auth/views/active_users.sql"),
        DumpObject("public.calculate", ObjectType.FUNCTION, "public", "calculate", statement="CREATE FUNCTION public.calculate() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;", path="schemas/public/functions/calculate.sql"),
        DumpObject("pgcrypto", ObjectType.EXTENSION, None, "pgcrypto", statement="CREATE EXTENSION pgcrypto;", path="global/extensions/pgcrypto.sql"),
    ]


def test_build_dbeaver_navigator_groups_objects_like_database_browser() -> None:
    navigator = build_dbeaver_navigator(_objects(), "enterprise_dump")

    project = navigator["children"][0]
    connection = project["children"][0]
    database = connection["children"][0]
    schemas = database["children"][0]

    assert navigator["name"] == "Projects"
    assert connection["name"] == "enterprise_dump"
    assert schemas["name"] == "Schemas"
    assert [child["name"] for child in schemas["children"]] == ["auth", "public"]

    auth_schema = schemas["children"][0]
    assert [child["name"] for child in auth_schema["children"][:2]] == ["Tables", "Views"]


def test_catalog_payload_builds_file_tree_and_schema_index() -> None:
    payload = build_catalog_payload(_objects(), "enterprise_dump")

    assert payload["files"]["name"] == "output"
    assert payload["schema_index"]["auth"]["tables"] == 2
    assert payload["schema_index"]["public"]["functions"] == 1
