from __future__ import annotations

from pathlib import Path

from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from pgsplit.api.auth import create_auth_router, current_user
from pgsplit.api.schemas import JobEventResponse, JobResponse, SubmitPathRequest
from pgsplit.core.config import SplitterConfig
from pgsplit.core.service import SplitterService
from pgsplit.storage import UserRecord


def _as_job_response(job) -> JobResponse:
    return JobResponse(**job.to_dict())


def create_api(config: SplitterConfig | None = None) -> FastAPI:
    cfg = config or SplitterConfig()
    service = SplitterService(cfg)
    app = FastAPI(title="PGSplit Enterprise", version="2.2.0")
    app.include_router(create_auth_router(service.store))
    auth_dep = current_user(service.store)

    repo_root = Path(__file__).resolve().parents[3]
    react_dist_dir = repo_root / "frontend" / "dist"
    react_assets_dir = react_dist_dir / "assets"
    if react_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=react_assets_dir), name="assets")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/", include_in_schema=False, response_model=None)
    def index() -> FileResponse | HTMLResponse:
        return _frontend_response(react_dist_dir)

    @app.post("/api/jobs/path", response_model=JobResponse)
    def create_job_from_path(payload: SubmitPathRequest, user: UserRecord = Depends(auth_dep)) -> JobResponse:
        try:
            job = service.submit_job_from_path(Path(payload.dump_path), user_id=user.user_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return _as_job_response(job)

    @app.post("/api/jobs/upload", response_model=JobResponse)
    def create_job_from_upload(file: UploadFile = File(...), user: UserRecord = Depends(auth_dep)) -> JobResponse:
        if not (file.filename or "").lower().endswith(".sql"):
            raise HTTPException(status_code=400, detail="Only .sql files are accepted")
        try:
            job = service.submit_job_from_upload(file, user_id=user.user_id)
        except ValueError as exc:
            status_code = 413 if "exceeds maximum size" in str(exc) else 400
            raise HTTPException(status_code=status_code, detail=str(exc)) from exc
        return _as_job_response(job)

    @app.get("/api/jobs", response_model=list[JobResponse])
    def list_jobs(limit: int = Query(default=50, ge=1, le=200), user: UserRecord = Depends(auth_dep)) -> list[JobResponse]:
        return [_as_job_response(job) for job in service.list_jobs(limit=limit, user_id=user.user_id)]

    @app.get("/api/jobs/{job_id}", response_model=JobResponse)
    def get_job(job_id: str, user: UserRecord = Depends(auth_dep)) -> JobResponse:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        return _as_job_response(job)

    @app.get("/api/jobs/{job_id}/objects")
    def get_job_objects(
        job_id: str,
        schema: str | None = Query(default=None),
        object_type: str | None = Query(default=None),
        user: UserRecord = Depends(auth_dep),
    ) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
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
        user: UserRecord = Depends(auth_dep),
    ) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
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
    def get_job_events(job_id: str, limit: int = Query(default=200, ge=1, le=500), user: UserRecord = Depends(auth_dep)) -> list[JobEventResponse]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        return [JobEventResponse(**event) for event in service.list_events(job_id, limit=limit)]

    @app.get("/api/jobs/{job_id}/object")
    def get_job_object(job_id: str, object_id: str = Query(...), user: UserRecord = Depends(auth_dep)) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        obj = service.get_object(job_id, object_id)
        if obj is None:
            raise HTTPException(status_code=404, detail=f"Object not found: {object_id}")
        return obj

    @app.get("/api/jobs/{job_id}/tree")
    def get_job_tree(job_id: str, user: UserRecord = Depends(auth_dep)) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            explorer = service.get_output_explorer(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        return {"job_id": job_id, **explorer}

    @app.get("/api/jobs/{job_id}/manifest")
    def get_job_manifest(job_id: str, user: UserRecord = Depends(auth_dep)) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
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
    def get_job_visualization(job_id: str, user: UserRecord = Depends(auth_dep)) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            return service.get_visualization_payload(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/jobs/{job_id}/schema-intelligence")
    def get_job_schema_intelligence(job_id: str, user: UserRecord = Depends(auth_dep)) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            return service.get_schema_intelligence_payload(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    @app.get("/api/jobs/{job_id}/restore-plan")
    def get_job_restore_plan(job_id: str, user: UserRecord = Depends(auth_dep)) -> dict[str, object]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        if job.status != "completed":
            raise HTTPException(status_code=409, detail="Restore assets are not ready yet")
        try:
            return {"job_id": job_id, **service.get_restore_plan(job_id)}
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc

    @app.get("/api/jobs/{job_id}/restore-script")
    def get_job_restore_script(
        job_id: str,
        mode: str = Query(default="full"),
        schema: str | None = Query(default=None),
        format: str = Query(default="json", pattern="^(json|text)$"),
        user: UserRecord = Depends(auth_dep),
    ) -> object:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        if job.status != "completed":
            raise HTTPException(status_code=409, detail="Restore assets are not ready yet")
        try:
            payload = service.read_restore_script(job_id, mode, schema)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        if format == "text":
            return PlainTextResponse(str(payload["sql"]), media_type="text/sql")
        return {"job_id": job_id, **payload}

    @app.get("/api/jobs/{job_id}/restore-download")
    def download_restore_assets(job_id: str, user: UserRecord = Depends(auth_dep)) -> FileResponse:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        if job.status != "completed":
            raise HTTPException(status_code=409, detail="Restore assets are not ready yet")
        try:
            archive = service.archive_restore_assets(job_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        download_name = f"{Path(job.input_name or 'dump').stem}_restore_assets.zip"
        return FileResponse(archive, media_type="application/zip", filename=download_name)

    @app.get("/api/jobs/{job_id}/source")
    def get_object_source(job_id: str, object_id: str = Query(...), user: UserRecord = Depends(auth_dep)) -> dict[str, str | None]:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        try:
            return service.read_object_source(job_id, object_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @app.get("/api/jobs/{job_id}/download")
    def download_job_archive(job_id: str, user: UserRecord = Depends(auth_dep)) -> FileResponse:
        job = service.get_job(job_id, user_id=user.user_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        if job.status != "completed" or not job.archive_path:
            raise HTTPException(status_code=409, detail="Archive is not ready yet")
        archive = Path(job.archive_path)
        if not archive.exists():
            raise HTTPException(status_code=404, detail="Archive file missing")
        download_name = f"{Path(job.input_name or 'dump').stem}_split_output.zip"
        return FileResponse(archive, media_type="application/zip", filename=download_name)

    @app.get("/{full_path:path}", include_in_schema=False, response_model=None)
    def spa_fallback(full_path: str) -> FileResponse | HTMLResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        return _frontend_response(react_dist_dir)

    return app


def _frontend_response(react_dist_dir: Path) -> FileResponse | HTMLResponse:
    index_path = react_dist_dir / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse(
        """
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>PG Dump Splitter setup required</title>
            <style>
              body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e5eefb; font-family: Segoe UI, sans-serif; }
              main { max-width: 720px; border: 1px solid #334155; border-radius: 18px; background: #111827; padding: 28px; box-shadow: 0 24px 70px rgba(0,0,0,.35); }
              code { display: block; margin-top: 10px; border-radius: 10px; background: #07111f; color: #93c5fd; padding: 12px; }
              a { color: #93c5fd; }
            </style>
          </head>
          <body>
            <main>
              <h1>React UI build is missing</h1>
              <p>The API is running, but the React frontend has not been built yet.</p>
              <code>npm --prefix frontend install</code>
              <code>npm --prefix frontend run build</code>
              <code>python -m pgsplit serve --host 127.0.0.1 --port 8091</code>
            </main>
          </body>
        </html>
        """,
        status_code=503,
    )
