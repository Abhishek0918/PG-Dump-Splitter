# PGSplit Enterprise Project Document

This document explains how to start the project locally, how the project is structured, what dependencies are required, and which technologies are used.

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

`pyproject.toml` is the main Python project definition. `requirements.txt` is kept for simple setup compatibility.

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
    repository/
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
- `cli/`: command-line commands such as `serve`, `split`, `validate`, `graph`, `restore`, `repo`, `repo-validate`, `repo-diff`, and `repo-deploy`.
- `core/`: main application logic, config, splitter engine, service layer, catalog, output tree, and validation.
- `parser/`: streaming SQL parser and PostgreSQL dump statement handling.
- `extractor/`: extracts metadata for schemas, tables, functions, procedures, triggers, sequences, enums, extensions, and dependencies.
- `dependency/`: dependency graph, foreign-key mapping, restore ordering, and topological sorting.
- `storage/`: SQLite database store for jobs, job events, objects, migrations, and metadata.
- `writers/`: writes split SQL files, folders, and manifest files.
- `models/`: shared Python domain models and object types.
- `restore/`: generates restore scripts like full restore, schema-only restore, data-only restore, and per-schema restore.
- `repository/`: generates Git-ready database repositories, validates checksums, compares repository versions, and deploys immutable migrations.
- `visualization/`: builds payloads for ERD and dependency graph UI views.

### Frontend

`frontend` contains the React + Vite + TypeScript UI.

- Login and sign-up page.
- Post-login workspace page.
- Profile page.
- Database Schema Splitter module.
- Database Migration planner module.
- SQL preview, output tree, restore planner, ERD, dependency graph, and console views.

### Config

`config/default.yaml` contains default local configuration such as runtime path, output path, API host, and API port.

### Docs

`docs/` contains architecture, development, roadmap, and database repository mode notes.

### Scripts

`scripts/` contains helper PowerShell scripts:

- `dev.ps1`: start local backend server.
- `test.ps1`: run backend tests, compile checks, and frontend build.
- `build.ps1`: install package and build frontend.

### Deploy

`deploy/Dockerfile` contains container build instructions.

### Tests

`tests/` contains Python unit tests for parser, splitter engine, output tree, restore generator, repository mode, database progress, object search, visualization, and metadata extraction.

### Runtime Data

Generated files should live under:

```text
var/runtime/
var/output/
var/logs/
```

These folders are ignored by Git.

### Path And Rename Notes

The current local folder is expected to be:

```text
C:\Users\abhishek.singh\Documents\DB Project
```

Because the folder name contains a space, always quote absolute paths in PowerShell:

```powershell
& "C:\Users\abhishek.singh\Documents\DB Project\.venv\Scripts\python.exe" -m pgsplit --help
```

Prefer relative commands from the project root whenever possible:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pgsplit --help
```

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
- Storage: SQLite
- SQL Parsing: sqlparse + custom streaming parser
- Dependency Graph: NetworkX
- Testing: Pytest

### Frontend

- React 19
- TypeScript
- Vite
- Plain CSS with CSS variables for light/dark themes
- Browser local storage for local-only login/session state
- WebCrypto PBKDF2 hashing for local password hashing

### Database And Runtime Storage

- SQLite is used internally for job metadata, progress, events, objects, and file mappings.
- PostgreSQL is the target database technology for dump parsing, restore planning, repository generation, and migration planning.

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

### Database Schema Splitter

Supports PostgreSQL dump processing:

- Local path or file upload.
- Job progress tracking.
- Output tree.
- Object navigator.
- SQL preview.
- Restore planner.
- ERD view.
- Dependency graph.
- Console/events.
- ZIP download.

### Database Repository Mode

Generates a deterministic Git-ready database folder from a PostgreSQL schema dump:

- Stable schema object files.
- Checksums and manifests.
- Baseline migration.
- CI validation scripts.
- Repository diff command.
- Immutable migration deploy command.
- DataGrip-friendly folder structure.

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

Generate a Git-ready database repository:

```powershell
pg_dump --schema-only --no-owner --no-privileges --format=plain --file schema.sql
pgsplit repo schema.sql --output database
pgsplit repo-validate database
```

Compare two database repositories:

```powershell
pgsplit repo-diff ".\database-before" ".\database"
```

Deploy reviewed migrations:

```powershell
pgsplit repo-deploy ".\database"
```
