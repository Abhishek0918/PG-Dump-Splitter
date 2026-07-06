import shutil
from pathlib import Path
from uuid import uuid4

from pgsplit.parser.pg_dump_parser import PgDumpParser


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_pg_dump_parser_keeps_overloaded_functions_distinct() -> None:
    workspace = _test_dir()
    dump = workspace / "dump.sql"
    dump.write_text(
        "\n".join(
            [
                "CREATE FUNCTION public.calculate(value integer) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;",
                "CREATE FUNCTION public.calculate(value text) RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;",
            ]
        ),
        encoding="utf-8",
    )

    objects = [parsed.dump_object for parsed in PgDumpParser().parse(dump)]

    assert [obj.object_id for obj in objects] == [
        "public.calculate(value integer)",
        "public.calculate(value text)",
    ]
    assert objects[0].attributes["signature"] == "(value integer)"
    shutil.rmtree(workspace, ignore_errors=True)


def test_pg_dump_parser_deduplicates_duplicate_object_ids() -> None:
    workspace = _test_dir()
    dump = workspace / "dump.sql"
    dump.write_text(
        "CREATE TABLE public.users (id int); CREATE TABLE public.users (id int);\n",
        encoding="utf-8",
    )

    objects = [parsed.dump_object for parsed in PgDumpParser().parse(dump)]

    assert [obj.object_id for obj in objects] == ["public.users", "public.users#2"]
    shutil.rmtree(workspace, ignore_errors=True)
