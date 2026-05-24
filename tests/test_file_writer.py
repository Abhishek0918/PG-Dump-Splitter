import shutil
from pathlib import Path
from uuid import uuid4

from app.config import SplitterConfig
from app.models.metadata import DumpObject
from app.models.object_types import ObjectType
from app.writers.file_writer import SplitFileWriter


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_file_writer_does_not_carry_path_state_between_output_roots() -> None:
    workspace = _test_dir()
    writer = SplitFileWriter(SplitterConfig())

    first = DumpObject("public.users", ObjectType.TABLE, "public", "users", "CREATE TABLE public.users(id int);")
    second = DumpObject("public.users", ObjectType.TABLE, "public", "users", "CREATE TABLE public.users(id int);")

    writer.write(workspace / "one", first)
    writer.write(workspace / "two", second)

    assert first.path == "schemas/public/tables/users.sql"
    assert second.path == "schemas/public/tables/users.sql"
    shutil.rmtree(workspace, ignore_errors=True)
