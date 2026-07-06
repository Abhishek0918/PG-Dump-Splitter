import json
import shutil
from pathlib import Path
from uuid import uuid4

from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType
from pgsplit.core.output_tree import build_output_tree, load_manifest_summary
from pgsplit.core.output_tree import build_output_tree_from_objects


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_output_tree_returns_nested_files() -> None:
    workspace = _test_dir()
    output = workspace / "output"
    view_file = output / "schemas" / "public" / "views" / "actionable_universal.sql"
    data_file = output / "data" / "public.users.copy.sql"
    view_file.parent.mkdir(parents=True)
    data_file.parent.mkdir(parents=True)
    view_file.write_text("CREATE VIEW public.actionable_universal AS SELECT 1;\n", encoding="utf-8")
    data_file.write_text("COPY public.users FROM stdin;\n\\.\n", encoding="utf-8")

    tree = build_output_tree(output)

    assert tree["type"] == "directory"
    assert [child["name"] for child in tree["children"]] == ["data", "schemas"]
    schemas = next(child for child in tree["children"] if child["name"] == "schemas")
    public = schemas["children"][0]
    views = public["children"][0]
    assert views["children"][0]["name"] == "actionable_universal.sql"
    shutil.rmtree(workspace, ignore_errors=True)


def test_manifest_summary_loads_counts() -> None:
    workspace = _test_dir()
    output = workspace / "output"
    manifest = output / "manifest"
    manifest.mkdir(parents=True)
    (manifest / "manifest.json").write_text(
        json.dumps({"schemas": ["public"], "objects": 3, "dependencies": 2, "restore_items": 3}),
        encoding="utf-8",
    )
    (manifest / "statistics.json").write_text(
        json.dumps({"counts_by_type": {"views": 1}, "counts_by_schema": {"public": 2}}),
        encoding="utf-8",
    )

    summary = load_manifest_summary(output)

    assert summary["summary"]["objects"] == 3
    assert summary["counts_by_type"] == {"views": 1}
    assert summary["counts_by_schema"] == {"public": 2}
    shutil.rmtree(workspace, ignore_errors=True)


def test_output_tree_can_be_built_from_object_manifest() -> None:
    tree = build_output_tree_from_objects(
        [
            DumpObject(
                "auth.users",
                ObjectType.TABLE,
                "auth",
                "users",
                statement="CREATE TABLE auth.users(id int);",
                path="schemas/auth/tables/users.sql",
            ),
            DumpObject(
                "auth.users#data",
                ObjectType.DATA,
                "auth",
                "users",
                statement="COPY auth.users FROM stdin;\n\\.\n",
                path="data/auth.users.copy.sql",
            ),
        ]
    )

    assert tree["children"][0]["name"] == "data"
    assert tree["children"][1]["name"] == "schemas"
