import json
import shutil
from pathlib import Path
from uuid import uuid4

from app.config import SplitterConfig
from app.engine import DumpSplitterEngine


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_engine_does_not_retain_sql_statements_after_writing_files() -> None:
    workspace = _test_dir()
    dump = workspace / "dump.sql"
    output = workspace / "output"
    dump.write_text(
        "\n".join(
            [
                "CREATE TABLE public.users (id int);",
                "COPY public.users FROM stdin;",
                "1",
                "\\.",
            ]
        ),
        encoding="utf-8",
    )

    result = DumpSplitterEngine(SplitterConfig(output_dir=output, runtime_dir=workspace / "runtime")).split_dump(dump, output)
    objects_manifest = json.loads((output / "manifest" / "objects.json").read_text(encoding="utf-8"))
    combined_restore = (output / "combined_restore.sql").read_text(encoding="utf-8")

    assert all(obj.statement == "" for obj in result.objects)
    assert all("statement" not in obj for obj in objects_manifest)
    assert "CREATE TABLE public.users" in combined_restore
    assert "COPY public.users FROM stdin;" in combined_restore
    shutil.rmtree(workspace, ignore_errors=True)
