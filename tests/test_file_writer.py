import shutil
from pathlib import Path
from uuid import uuid4

from pgsplit.core.config import SplitterConfig
from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType
from pgsplit.writers.file_writer import SplitFileWriter


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


def test_file_writer_shortens_long_function_signature_filenames() -> None:
    workspace = _test_dir()
    writer = SplitFileWriter(SplitterConfig())
    signature = (
        "(p_request_id public.record_id, p_professional_user_id public.record_id, "
        "p_actionable_id public.record_id, p_actionable_step_id public.record_id, "
        "p_task public.single_line_text, p_from_datetime public.date_time, "
        "p_to_datetime public.date_time, p_description public.multiline_text)"
    )
    obj = DumpObject(
        object_id=f"public.app_sign_off_create_timesheet_v_0_0_1{signature}",
        object_type=ObjectType.FUNCTION,
        schema="public",
        name="app_sign_off_create_timesheet_v_0_0_1",
        statement="CREATE FUNCTION public.app_sign_off_create_timesheet_v_0_0_1() RETURNS void AS $$ BEGIN END; $$ LANGUAGE plpgsql;",
        attributes={"signature": signature},
    )

    target = writer.write(workspace / "output", obj)

    assert target.exists()
    assert obj.path is not None
    assert obj.path.startswith("schemas/public/functions/app_sign_off_create_timesheet_v_0_0_1")
    assert obj.path.endswith(".sql")
    assert len(target.name) <= 100
    shutil.rmtree(workspace, ignore_errors=True)
