from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api_models import JobEventResponse, JobResponse, SubmitPathRequest
from app.config import SplitterConfig
from app.service import SplitterService


def _as_job_response(job) -> JobResponse:
    return JobResponse(**job.to_dict())


def create_api(config: SplitterConfig | None = None) -> FastAPI:
    cfg = config or SplitterConfig()
    service = SplitterService(cfg)

    app = FastAPI(title="PGSplit Enterprise", version="2.0.0")
    frontend_dir = Path(__file__).parent / "frontend"
    app.mount("/ui", StaticFiles(directory=frontend_dir), name="ui")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(frontend_dir / "index.html")

    @app.post("/api/jobs/path", response_model=JobResponse)
    def create_job_from_path(payload: SubmitPathRequest) -> JobResponse:
        try:
            job = service.submit_job_from_path(Path(payload.dump_path))
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return _as_job_response(job)

    @app.post("/api/jobs/upload", response_model=JobResponse)
    def create_job_from_upload(file: UploadFile = File(...)) -> JobResponse:
        if not (file.filename or "").lower().endswith(".sql"):
            raise HTTPException(status_code=400, detail="Only .sql files are accepted")
        job = service.submit_job_from_upload(file)
        return _as_job_response(job)

    @app.get("/api/jobs", response_model=list[JobResponse])
    def list_jobs(limit: int = Query(default=50, ge=1, le=200)) -> list[JobResponse]:
        return [_as_job_response(job) for job in service.list_jobs(limit=limit)]

    @app.get("/api/jobs/{job_id}", response_model=JobResponse)
    def get_job(job_id: str) -> JobResponse:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        return _as_job_response(job)

    @app.get("/api/jobs/{job_id}/objects")
    def get_job_objects(
        job_id: str,
        schema: str | None = Query(default=None),
        object_type: str | None = Query(default=None),
    ) -> dict[str, object]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        objects = service.list_objects(job_id, schema=schema, object_type=object_type)
        return {"job_id": job_id, "count": len(objects), "items": objects}

    @app.get("/api/jobs/{job_id}/search")
    def search_job_objects(
        job_id: str,
        q: str | None = Query(default=None, max_length=200),
        schema: str | None = Query(default=None),
        object_type: str | None = Query(default=None),
        limit: int = Query(default=100, ge=1, le=500),
    ) -> dict[str, object]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        payload = service.search_objects(
            job_id=job_id,
            query_text=(q or "").strip() or None,
            schema=schema,
            object_type=object_type,
            limit=limit,
        )
        items = payload["items"]
        return {
            "job_id": job_id,
            "query": q or "",
            "count": len(items),
            "items": items,
            "facets": payload["facets"],
        }

    @app.get("/api/jobs/{job_id}/events", response_model=list[JobEventResponse])
    def get_job_events(job_id: str, limit: int = Query(default=200, ge=1, le=500)) -> list[JobEventResponse]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        return [JobEventResponse(**event) for event in service.list_events(job_id, limit=limit)]

    @app.get("/api/jobs/{job_id}/object")
    def get_job_object(job_id: str, object_id: str = Query(...)) -> dict[str, object]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        obj = service.get_object(job_id, object_id)
        if obj is None:
            raise HTTPException(status_code=404, detail=f"Object not found: {object_id}")
        return obj

    @app.get("/api/jobs/{job_id}/tree")
    def get_job_tree(job_id: str) -> dict[str, object]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            explorer = service.get_output_explorer(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"job_id": job_id, **explorer}

    @app.get("/api/jobs/{job_id}/manifest")
    def get_job_manifest(job_id: str) -> dict[str, object]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        output_dir = service.get_output_dir(job_id)
        if output_dir is None or not output_dir.exists():
            raise HTTPException(status_code=409, detail="Manifest is not ready yet")
        manifest_path = output_dir / "manifest" / "manifest.json"
        if not manifest_path.exists():
            raise HTTPException(status_code=404, detail="Manifest file missing")
        return service.get_output_explorer(job_id)["manifest"]

    @app.get("/api/jobs/{job_id}/visualization")
    def get_job_visualization(job_id: str) -> dict[str, object]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            return service.get_visualization_payload(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/jobs/{job_id}/source")
    def get_object_source(job_id: str, object_id: str = Query(...)) -> dict[str, str | None]:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            return service.read_object_source(job_id, object_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/jobs/{job_id}/download")
    def download_job_archive(job_id: str) -> FileResponse:
        job = service.get_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        if job.status != "completed" or not job.archive_path:
            raise HTTPException(status_code=409, detail="Archive is not ready yet")
        archive = Path(job.archive_path)
        if not archive.exists():
            raise HTTPException(status_code=404, detail="Archive file missing")
        download_name = f"{Path(job.input_name or 'dump').stem}_split_output.zip"
        return FileResponse(archive, media_type="application/zip", filename=download_name)

    return app
