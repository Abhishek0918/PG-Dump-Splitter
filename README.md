# PGSplit Enterprise

Full-stack PostgreSQL dump splitter with:

- Streaming SQL parser for very large `pg_dump` files
- Object-level split output (`schemas`, `global`, `data`)
- Dependency graph + restore order manifests
- SQLite-backed job tracking
- FastAPI backend
- Browser UI for submit, track, inspect objects, and download ZIP output

## Architecture

```text
Frontend (HTML/JS)
        |
        v
FastAPI API -> SplitterService -> DumpSplitterEngine
        |              |                |
        |              |                +-> parser -> detector -> dependency extractor
        |              |                +-> split writer -> manifest writer
        |              |
        |              +-> SQLite job/object metadata
        |
        +-> ZIP download for split output
```

## Project Structure

```text
app/
  api.py               # FastAPI app + endpoints
  service.py           # Job orchestration + background execution
  db.py                # SQLite metadata store
  cli.py               # CLI commands: split, validate, graph, restore, serve
  engine.py            # Core split engine
  config.py            # Runtime + output config
  frontend/            # Browser UI assets
  parser/              # Streaming parser + object detector
  extractor/           # Dependency extraction
  writers/             # File and manifest writers
  dependency/          # Graph and restore ordering
  models/              # Shared models
tests/
```

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## CLI Usage

```powershell
python -m app.main validate "C:\path\dump.sql"
python -m app.main split "C:\path\dump.sql" --output ".\output"
python -m app.main graph ".\output"
python -m app.main restore ".\output"
python -m app.main serve --host 127.0.0.1 --port 8080
```

Open UI at:

```text
http://127.0.0.1:8080
```

## API Endpoints

- `POST /api/jobs/path` -> start job from local dump path
- `POST /api/jobs/upload` -> upload `.sql` file and start job
- `GET /api/jobs` -> list recent jobs
- `GET /api/jobs/{job_id}` -> job status
- `GET /api/jobs/{job_id}/objects` -> split object list
- `GET /api/jobs/{job_id}/search` -> search completed objects
- `GET /api/jobs/{job_id}/tree` -> output tree + manifest summary
- `GET /api/jobs/{job_id}/source` -> object SQL source
- `GET /api/jobs/{job_id}/restore-plan` -> generated restore script manifest
- `GET /api/jobs/{job_id}/restore-script` -> restore script as JSON or text
- `GET /api/jobs/{job_id}/restore-download` -> download restore helper scripts
- `GET /api/jobs/{job_id}/download` -> download split ZIP

## Runtime Guardrails

Path-based jobs can be disabled or restricted with config:

```yaml
allow_path_jobs: true
allowed_path_roots:
  - "E:/PG-Dump-Splitter/input"
max_upload_bytes: 2147483648
```

When `allowed_path_roots` is set, `/api/jobs/path` only accepts `.sql` files inside those roots. Uploads are streamed to disk and rejected once `max_upload_bytes` is exceeded.

## Output Layout

```text
output/
  schemas/
    auth/
      schema.sql
      tables/
      views/
      functions/
      triggers/
      indexes/
      constraints/
      policies/
      sequences/
      enums/
      comments/
  global/
    extensions/
    grants/
    comments/
  data/
  manifest/
    manifest.json
    objects.json
    dependency_graph.json
    foreign_keys.json
    restore_order.json
    statistics.json
  restore/
    full_restore.sql
    schema_only.sql
    data_only.sql
    post_data.sql
    restore_manifest.json
  combined_restore.sql
```
