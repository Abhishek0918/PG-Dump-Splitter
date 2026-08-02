# PGSplit Enterprise Project Document

This document explains how to start the project locally, how the project is structured, what dependencies are required, which technologies are used, and how the product is evolving into an enterprise PG Dump Analyzer.

## 1. How To Start The Project

### Step 1: Open The Project Folder

Open PowerShell inside the project root:

```powershell
cd "C:\Users\abhishek.singh\Documents\DB Project"
```

### Step 2: Create Or Activate Python Virtual Environment

If `.venv` already exists and was created in this same folder:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
```

If `.venv` does not exist:

```powershell
py -3.13 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
```

### Recreate `.venv` After Renaming The Folder

If the project folder was renamed, recreate `.venv`. Python virtual environments on Windows store absolute paths, so a `.venv` created under `New project` will break after renaming the folder to `DB Project`.

```powershell
cd "C:\Users\abhishek.singh\Documents\DB Project"
deactivate
Remove-Item -Recurse -Force .\.venv
py -3.13 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

If `deactivate` says the command does not exist, it only means no virtual environment is currently active. Continue with the next command.

### Step 3: Install Backend Dependencies

Recommended local setup:

```powershell
python -m pip install -r requirements.txt
python -m pip install -e .
```

Use `python -m pip ...` instead of bare `pip ...` when recovering from a folder rename. This avoids accidentally using an old broken `pip.exe` launcher.

### Step 4: Install Frontend Dependencies

```powershell
cd frontend
npm install
```

### Step 5: Build React Frontend

```powershell
npm run build
cd ..
```

### Step 6: Start Backend Server

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
```

After server starts, open:

```text
http://127.0.0.1:8091
```

### Development Mode

Run backend:

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
```

Run React dev server in another terminal:

```powershell
cd "C:\Users\abhishek.singh\Documents\DB Project"
.\.venv\Scripts\Activate.ps1
cd frontend
npm run dev
```

Open:

```text
http://127.0.0.1:5173
```

### Run Tests

```powershell
python -m pytest -q
python -m compileall backend tests
cd frontend
npm run build
cd ..
```

## 2. Project Structure

```text
backend/
  pgsplit/
    api/
    cli/
    core/
    parser/
    extractor/
    dependency/
    storage/
    writers/
    models/
    restore/
    visualization/

frontend/
  src/
  public/
  dist/

config/
docs/
scripts/
deploy/
tests/
var/
```

### Backend

`backend/pgsplit` contains the Python backend package.

- `api/`: FastAPI routes and API response schemas.
- `cli/`: command-line commands such as `serve`, `split`, `validate`, `graph`, and `restore`.
- `core/`: main application logic, config, splitter engine, service layer, catalog, output tree, and validation.
- `parser/`: streaming SQL parser and PostgreSQL dump statement handling.
- `extractor/`: extracts metadata for schemas, tables, functions, procedures, triggers, sequences, enums, extensions, and dependencies.
- `dependency/`: dependency graph, foreign-key mapping, restore ordering, and topological sorting.
- `storage/`: SQLite database store for jobs, job events, objects, and metadata.
- `writers/`: writes split SQL files, folders, and manifest files.
- `models/`: shared Python domain models and object types.
- `restore/`: generates restore scripts like full restore, schema-only restore, data-only restore, and per-schema restore.
- `visualization/`: builds payloads for ERD and dependency graph UI views.

### Frontend

`frontend` contains the React + Vite + TypeScript UI.

- Login and sign-up page.
- Post-login workspace page.
- Profile page.
- Database Schema Splitter / PG Dump Analyzer module.
- Database Migration planner module.
- SQL preview, output tree, restore planner, ERD, dependency graph, and console views.

### Config

`config/default.yaml` contains default local configuration such as runtime path, output path, API host, and API port.

### Docs

`docs/` contains architecture, development, roadmap, and AWS microservice planning notes.

### Scripts

`scripts/` contains helper PowerShell scripts:

- `dev.ps1`: start local backend server.
- `test.ps1`: run backend tests, compile checks, and frontend build.
- `build.ps1`: install package and build frontend.

### Deploy

`deploy/Dockerfile` contains container build instructions.

### Tests

`tests/` contains Python unit tests for parser, splitter engine, output tree, restore generator, database progress, object search, visualization, and metadata extraction.

### Runtime Data

Generated files should live under:

```text
var/runtime/
var/output/
var/logs/
```

These folders are ignored by Git.

## 3. Project Dependencies

### Backend Python Dependencies

Defined in `pyproject.toml` and mirrored in `requirements.txt`.

- `fastapi`: backend API framework.
- `uvicorn`: ASGI server for FastAPI.
- `typer`: command-line interface framework.
- `rich`: formatted CLI output.
- `sqlparse`: SQL parsing support.
- `PyYAML`: YAML config loading.
- `loguru`: logging.
- `networkx`: dependency graph handling.
- `python-multipart`: file upload support in FastAPI.
- `psutil`: optional runtime memory/process metrics.
- `pytest`: test framework.

### Frontend Dependencies

Defined in `frontend/package.json`.

- `react`: UI library.
- `react-dom`: React DOM renderer.
- `vite`: frontend build/dev server.
- `typescript`: typed JavaScript.
- `@vitejs/plugin-react`: React support for Vite.
- `@types/react`, `@types/react-dom`, `@types/node`: TypeScript type definitions.

## 4. Tech Stack Used

### Backend

- Language: Python 3.12+
- API: FastAPI
- Server: Uvicorn
- CLI: Typer
- Local metadata storage: SQLite
- SQL parsing: sqlparse + custom streaming parser
- Dependency graph: NetworkX
- Testing: Pytest

### Frontend

- React 19
- TypeScript
- Vite
- Plain CSS with CSS variables for light/dark themes
- Browser local storage for local-only login/session state
- WebCrypto PBKDF2 hashing for local password hashing

### Database And Runtime Storage

- SQLite is used locally for job metadata, progress, events, objects, and file mappings.
- PostgreSQL is the target database technology for dump parsing, restore planning, analysis, and migration planning.

### Packaging And Deployment

- Python package metadata: `pyproject.toml`
- CLI command: `pgsplit`
- Frontend build output: `frontend/dist`
- Docker scaffold: `deploy/Dockerfile`
- CI scaffold: `.github/workflows/ci.yml`

## 5. Main Product Modules

### Login And Sign Up

The UI starts with a local email/password login and sign-up page. User accounts are stored locally in the browser, not in a backend database.

### Profile

Shows current local user, account type, local auth details, active job information, and workspace summary.

### PG Dump Analyzer / Database Schema Splitter

Supports PostgreSQL dump processing:

- Local path or file upload.
- Streaming parse and validation.
- Job progress tracking.
- Output tree.
- Object navigator.
- SQL preview.
- Restore planner.
- ERD view.
- Dependency graph.
- Console/events.
- ZIP download.

### Database Migration

Provides a PostgreSQL RDS-to-RDS migration planner:

- Source RDS and target RDS endpoint forms.
- Migration strategy selection.
- Offline or minimal-downtime cutover planning.
- System design diagram.
- Readiness checklist.
- Validation checklist.
- Generated `pg_dump`, `pg_restore`, and `psql` commands.
- Execution runbook.

## 6. Important Commands

Start app:

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
```

Validate dump:

```powershell
pgsplit validate "C:\path\dump.sql"
```

Split dump:

```powershell
pgsplit split "C:\path\dump.sql" --output ".\var\output"
```

Generate graph summary:

```powershell
pgsplit graph ".\var\output"
```

Generate restore scripts:

```powershell
pgsplit restore ".\var\output" --mode full
```

## 7. Target Enterprise Microservice Direction

The current local application is intentionally simple. The enterprise target is a microservice system where dump ingestion, parsing, analysis, metadata search, artifact generation, visualization, and notifications are independently deployable services.

See `docs/aws-microservices-plan.md` for the AWS hosting plan.
