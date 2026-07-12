# PGSplit Enterprise

Enterprise PostgreSQL dump splitter with a FastAPI backend, React/Vite UI, streaming parser, metadata catalog, dependency graph, restore script generation, and Git-ready database repository mode for database CI/CD.

## Capabilities

- Stream large plain SQL PostgreSQL dumps without loading the full file into memory.
- Split schemas, objects, data, manifests, dependency graphs, visualization payloads, and restore assets.
- Track jobs, progress, events, objects, and generated files in SQLite.
- Serve a React IDE-style UI from FastAPI after `frontend/dist` is built.
- Support CLI workflows for validation, splitting, dependency graph inspection, restore planning, and serving the UI/API.
- Generate deterministic, DataGrip-friendly database repositories with checksums, diffs, CI validation, and tracked migrations.

## Project Structure

```text
backend/
  pgsplit/
    api/              # FastAPI routes and response schemas
    cli/              # Typer CLI commands
    core/             # Config, engine, service, catalog, validation
    parser/           # Streaming SQL parser and object detector
    extractor/        # Metadata and dependency extractors
    dependency/       # Dependency graph and restore ordering
    storage/          # SQLite store, migrations, job/object metadata
    writers/          # Split file, folder, and manifest writers
    models/           # Shared domain models
    restore/          # Restore script generation
    repository/       # Git-ready repository generation, validation, diff, deployment
    visualization/    # ERD/dependency visualization payloads
frontend/
  src/                # React + TypeScript UI
  public/
config/              # Local YAML config examples
docs/                # Architecture and development notes
scripts/             # Local PowerShell helper scripts
deploy/              # Container/deployment scaffolding
tests/               # Python test suite
var/                 # Ignored runtime/output/log folders
```

## Setup

Run these commands from the renamed local project folder:

```powershell
cd "C:\Users\abhishek.singh\Documents\DB Project"
py -3.13 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e .
cd frontend
npm install
npm run build
cd ..
```

`pyproject.toml` is the authoritative Python project definition. `requirements.txt` is kept for simple virtualenv compatibility.

### Recreate `.venv` After A Folder Rename

If the project was renamed from `New project` to `DB Project`, recreate `.venv`. Windows virtual environment launchers keep the old absolute path and will fail with messages pointing to `Documents\New project`.

```powershell
cd "C:\Users\abhishek.singh\Documents\DB Project"
deactivate
Remove-Item -Recurse -Force .\.venv
py -3.13 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -e .
```

If `deactivate` says the command does not exist, no environment is currently active. Continue with the next command.

Use quoted paths or relative commands when a folder contains spaces:

```powershell
& "C:\Users\abhishek.singh\Documents\DB Project\.venv\Scripts\python.exe" -m pgsplit --help
```

Prefer this after activation:

```powershell
python -m pgsplit --help
```

## Local Development

Run the packaged backend and built React UI:

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
```

Open:

```text
http://127.0.0.1:8091
```

Run React through Vite while FastAPI serves `/api`:

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
cd frontend
npm run dev
```

Open the Vite app:

```text
http://127.0.0.1:5173
```

If `frontend/dist` is missing, FastAPI returns a setup page with the build commands.

## CLI Usage

```powershell
pgsplit validate "C:\path\dump.sql"
pgsplit split "C:\path\dump.sql" --output ".\var\output"
pgsplit repo "C:\path\schema.sql" --output ".\database"
pgsplit repo-validate ".\database"
pgsplit repo-diff ".\database-before" ".\database"
pgsplit repo-deploy ".\database"
pgsplit graph ".\var\output"
pgsplit restore ".\var\output" --mode full
pgsplit serve --host 127.0.0.1 --port 8091
```

The module entrypoint is also supported:

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
```

## API Endpoints

- `POST /api/jobs/path` starts a job from a local dump path.
- `POST /api/jobs/upload` uploads a `.sql` file and starts a job.
- `GET /api/jobs` lists recent jobs.
- `GET /api/jobs/{job_id}` returns job status and progress.
- `GET /api/jobs/{job_id}/events` returns job console events.
- `GET /api/jobs/{job_id}/objects` returns split object metadata.
- `GET /api/jobs/{job_id}/search` searches completed objects.
- `GET /api/jobs/{job_id}/tree` returns the generated output tree.
- `GET /api/jobs/{job_id}/source` returns object SQL source.
- `GET /api/jobs/{job_id}/restore-plan` returns restore script metadata.
- `GET /api/jobs/{job_id}/restore-script` returns restore script content.
- `GET /api/jobs/{job_id}/restore-download` downloads restore helper assets.
- `GET /api/jobs/{job_id}/download` downloads the split output ZIP.

## Runtime Guardrails

Path-based jobs can be disabled or restricted in YAML config:

```yaml
allow_path_jobs: true
allowed_path_roots:
  - "E:/PG-Dump-Splitter/input"
max_upload_bytes: 2147483648
```

Default generated data is written under ignored `var/` folders:

```text
var/runtime/
var/output/
var/logs/
```

## Output Layout

```text
var/output/
  schemas/
  global/
  data/
  manifest/
    manifest.json
    objects.json
    dependency_graph.json
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

## Verification

```powershell
python -m pytest -q
python -m compileall backend tests
cd frontend
npm run build
cd ..
```

Helper scripts are available in `scripts/`.

## Database CI/CD

Database Repository Mode keeps generated schema sources deterministic while preserving developer-owned migration history:

```powershell
pg_dump --schema-only --no-owner --no-privileges --format=plain --file schema.sql
pgsplit repo schema.sql --output database
pgsplit repo-validate database
```

Open the generated `database/` folder as a Git project in DataGrip. Connect DataGrip directly to RDS/PostgreSQL for live browsing, and use the generated folder for reviewed schema source control.

See [Database Repository Mode](docs/database-repository-mode.md) for the complete DataGrip, RDS, CI, diff, and deployment workflow.
