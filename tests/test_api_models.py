from app.api_models import JobResponse


def test_job_response_includes_progress_and_transaction_fields() -> None:
    response = JobResponse(
        job_id="job-1",
        source_path="dump.sql",
        source_type="path",
        input_name="dump.sql",
        status="running",
        created_at="2026-05-08T10:00:00+00:00",
        file_size_bytes=1000,
        processed_bytes=500,
        progress_percent=50,
        stage="parsing",
        current_step="Parsed 10 SQL blocks",
    )

    payload = response.model_dump()

    assert payload["progress_percent"] == 50
    assert payload["source_type"] == "path"
    assert payload["current_step"] == "Parsed 10 SQL blocks"
    assert payload["memory_bytes"] is None
    assert payload["objects_processed"] == 0
    assert payload["events_count"] == 0
