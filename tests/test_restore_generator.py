import shutil
from pathlib import Path
from uuid import uuid4

from app.config import SplitterConfig
from app.models.metadata import DumpObject
from app.models.object_types import ObjectType
from app.output_tree import build_augmented_output_tree
from app.restore_generator import RestoreScriptGenerator, find_restore_script


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def _objects() -> list[DumpObject]:
    return [
        DumpObject("uuid-ossp", ObjectType.EXTENSION, None, "uuid-ossp", "CREATE EXTENSION;", path="global/extensions/uuid-ossp.sql"),
        DumpObject("public", ObjectType.SCHEMA, "public", "public", "CREATE SCHEMA public;", path="schemas/public/schema.sql"),
        DumpObject("auth", ObjectType.SCHEMA, "auth", "auth", "CREATE SCHEMA auth;", path="schemas/auth/schema.sql"),
        DumpObject("auth.roles", ObjectType.TABLE, "auth", "roles", "CREATE TABLE auth.roles(id int);", path="schemas/auth/tables/roles.sql"),
        DumpObject(
            "public.users",
            ObjectType.TABLE,
            "public",
            "users",
            "CREATE TABLE public.users(id int);",
            path="schemas/public/tables/users.sql",
            dependencies=["uuid-ossp", "public"],
        ),
        DumpObject(
            "public.users#data",
            ObjectType.DATA,
            "public",
            "users",
            "COPY public.users (id) FROM stdin;\n1\n\\.\n",
            path="data/public.users.copy.sql",
            dependencies=["public.users"],
        ),
        DumpObject(
            "public.user_roles",
            ObjectType.VIEW,
            "public",
            "user_roles",
            "CREATE VIEW public.user_roles AS SELECT 1;",
            path="schemas/public/views/user_roles.sql",
            dependencies=["auth.roles"],
        ),
    ]


def _restore_order(objects: list[DumpObject]) -> list[dict[str, object]]:
    return [
        {
            "object_id": obj.object_id,
            "object_type": obj.object_type.value,
            "schema": obj.schema,
            "name": obj.name,
            "path": obj.path,
            "depends_on": obj.dependencies,
        }
        for obj in objects
    ]


def test_restore_generator_writes_phase_scripts_and_preserves_order() -> None:
    workspace = _test_dir()
    output = workspace / "output"
    objects = _objects()
    manifest = RestoreScriptGenerator(SplitterConfig()).generate(output, objects, _restore_order(objects))

    full = (output / "restore" / "full_restore.sql").read_text(encoding="utf-8")
    schema_only = (output / "restore" / "schema_only.sql").read_text(encoding="utf-8")
    data_only = (output / "restore" / "data_only.sql").read_text(encoding="utf-8")
    post_data = (output / "restore" / "post_data.sql").read_text(encoding="utf-8")

    assert full.index("\\i ../global/extensions/uuid-ossp.sql") < full.index("\\i ../schemas/public/schema.sql")
    assert full.index("\\i ../schemas/public/tables/users.sql") < full.index("\\i ../data/public.users.copy.sql")
    assert "\\i ../data/public.users.copy.sql" not in schema_only
    assert "\\i ../data/public.users.copy.sql" in data_only
    assert "\\i ../schemas/public/views/user_roles.sql" in post_data
    assert find_restore_script(manifest, "schema-only")["script_name"] == "schema_only.sql"
    shutil.rmtree(workspace, ignore_errors=True)


def test_schema_restore_includes_global_dependencies_and_warns_for_external_schema_deps() -> None:
    workspace = _test_dir()
    output = workspace / "output"
    objects = _objects()
    manifest = RestoreScriptGenerator(SplitterConfig()).generate(output, objects, _restore_order(objects))

    public_script = find_restore_script(manifest, "schema", "public")
    public_sql = (output / public_script["path"]).read_text(encoding="utf-8")

    assert "\\i ../global/extensions/uuid-ossp.sql" in public_sql
    assert "\\i ../schemas/public/tables/users.sql" in public_sql
    assert "\\i ../data/public.users.copy.sql" in public_sql
    assert "\\i ../schemas/auth/tables/roles.sql" not in public_sql
    assert public_script["warnings"] == ["public.user_roles depends on auth.roles outside this restore scope"]
    shutil.rmtree(workspace, ignore_errors=True)


def test_augmented_output_tree_includes_restore_folder_without_losing_object_links() -> None:
    workspace = _test_dir()
    output = workspace / "output"
    objects = _objects()
    RestoreScriptGenerator(SplitterConfig()).generate(output, objects, _restore_order(objects))

    tree = build_augmented_output_tree(output, objects)
    child_names = [child["name"] for child in tree["children"]]
    restore = next(child for child in tree["children"] if child["name"] == "restore")
    schemas = next(child for child in tree["children"] if child["name"] == "schemas")

    assert "restore" in child_names
    assert restore["path"] == "restore"
    assert any(child["name"] == "full_restore.sql" and child["path"] == "restore/full_restore.sql" for child in restore["children"])
    assert _tree_has_object_id(schemas, "public.users")
    shutil.rmtree(workspace, ignore_errors=True)


def _tree_has_object_id(node: dict, object_id: str) -> bool:
    if node.get("object_id") == object_id:
        return True
    return any(_tree_has_object_id(child, object_id) for child in node.get("children", []))
