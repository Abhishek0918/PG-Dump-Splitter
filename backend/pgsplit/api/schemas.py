from __future__ import annotations

from pydantic import BaseModel, Field


class SubmitPathRequest(BaseModel):
    dump_path: str = Field(..., description="Absolute or relative path to pg_dump SQL file")
    repository_mode: bool = Field(default=False, description="Generate Git-ready database repository structure")


class JobResponse(BaseModel):
    job_id: str
    source_path: str
    source_type: str = "path"
    input_name: str = ""
    status: str
    message: str | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    output_dir: str | None = None
    archive_path: str | None = None
    object_count: int = 0
    warning_count: int = 0
    file_size_bytes: int = 0
    processed_bytes: int = 0
    progress_percent: float = 0
    stage: str = "queued"
    current_step: str = "Waiting to start"
    duration_seconds: float | None = None
    memory_bytes: int | None = None
    objects_processed: int = 0
    events_count: int = 0
    repository_mode: bool = False


class JobEventResponse(BaseModel):
    id: int
    job_id: str
    created_at: str
    level: str
    stage: str
    message: str
    metadata: dict = Field(default_factory=dict)
