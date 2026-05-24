import io
import shutil
from pathlib import Path
from uuid import uuid4

import pytest

from app.config import SplitterConfig
from app.service import SplitterService


def _test_dir() -> Path:
    path = Path("runtime") / "test_runs" / uuid4().hex
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_clean_input_name_removes_uuid_prefixes_and_spaces() -> None:
    assert SplitterService._clean_input_name("69acf86c06fb4d49ab27bbbc463db83e_zarthi prod.sql") == "zarthi_prod.sql"


def test_archive_basename_uses_source_name() -> None:
    assert SplitterService._archive_basename("zarthi_prod.sql") == "zarthi_prod_split_output"


def test_path_jobs_can_be_restricted_to_allowed_roots() -> None:
    workspace = _test_dir()
    allowed = workspace / "allowed"
    outside = workspace / "outside.sql"
    allowed.mkdir()
    outside.write_text("CREATE SCHEMA public;\n", encoding="utf-8")
    service = SplitterService(
        SplitterConfig(
            runtime_dir=workspace / "runtime",
            allowed_path_roots=(allowed,),
        )
    )

    with pytest.raises(PermissionError):
        service.submit_job_from_path(outside)

    service.executor.shutdown(wait=False, cancel_futures=True)
    shutil.rmtree(workspace, ignore_errors=True)


def test_upload_jobs_enforce_configured_size_limit() -> None:
    workspace = _test_dir()
    service = SplitterService(SplitterConfig(runtime_dir=workspace / "runtime", max_upload_bytes=4))

    class Upload:
        filename = "dump.sql"
        file = io.BytesIO(b"CREATE SCHEMA public;\n")

    with pytest.raises(ValueError):
        service.submit_job_from_upload(Upload())

    service.executor.shutdown(wait=False, cancel_futures=True)
    shutil.rmtree(workspace, ignore_errors=True)
