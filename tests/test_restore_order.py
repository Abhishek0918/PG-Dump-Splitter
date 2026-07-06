from pgsplit.dependency.graph_builder import DependencyGraph
from pgsplit.dependency.restore_order import grouped_restore_order
from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType


def test_restore_order_respects_dependencies_and_type_priority() -> None:
    schema = DumpObject("auth.auth", ObjectType.SCHEMA, "auth", "auth", statement="CREATE SCHEMA auth;", path="schemas/auth/schema.sql")
    users = DumpObject(
        "auth.users",
        ObjectType.TABLE,
        "auth",
        "users",
        statement="CREATE TABLE auth.users(id int);",
        dependencies=["auth.auth"],
        path="schemas/auth/tables/users.sql",
    )
    sessions = DumpObject(
        "auth.sessions",
        ObjectType.TABLE,
        "auth",
        "sessions",
        statement="CREATE TABLE auth.sessions(id int, user_id int);",
        dependencies=["auth.auth", "auth.users"],
        path="schemas/auth/tables/sessions.sql",
    )
    data = DumpObject(
        "auth.sessions#data",
        ObjectType.DATA,
        "auth",
        "sessions",
        statement="COPY auth.sessions (id, user_id) FROM stdin;\n\\.\n",
        dependencies=["auth.users"],
        path="data/auth.sessions.copy.sql",
    )

    graph = DependencyGraph()
    for obj in (schema, users, sessions, data):
        graph.add_object(obj)

    order = grouped_restore_order([data, sessions, users, schema], graph.topological_order())

    assert [entry["object_type"] for entry in order[:3]] == ["schemas", "tables", "tables"]
    assert order[-1]["object_type"] == "data"


def test_restore_order_prioritizes_dependencies_before_type_groups() -> None:
    helper = DumpObject(
        "public.build_default()",
        ObjectType.FUNCTION,
        "public",
        "build_default",
        statement="CREATE FUNCTION public.build_default() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;",
        path="schemas/public/functions/build_default_noargs.sql",
    )
    table = DumpObject(
        "public.uses_default",
        ObjectType.TABLE,
        "public",
        "uses_default",
        statement="CREATE TABLE public.uses_default(id int DEFAULT public.build_default());",
        dependencies=["public.build_default()"],
        path="schemas/public/tables/uses_default.sql",
    )

    graph = DependencyGraph()
    for obj in (table, helper):
        graph.add_object(obj)

    order = grouped_restore_order([table, helper], graph.topological_order())

    assert [entry["object_id"] for entry in order] == ["public.build_default()", "public.uses_default"]
