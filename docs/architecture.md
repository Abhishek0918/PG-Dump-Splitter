# Architecture

PGSplit Enterprise is organized as a backend product package plus a React frontend.

## Backend

`backend/pgsplit` contains the Python package:

- `api` owns FastAPI routes and response schemas.
- `cli` owns Typer command wiring.
- `core` owns configuration, orchestration, splitting, catalog generation, output-tree helpers, and validation.
- `parser`, `extractor`, `dependency`, `writers`, `models`, `restore`, and `visualization` keep domain concerns isolated.
- `storage` owns SQLite migrations and persistence for jobs, events, and object metadata.

## Frontend

`frontend` is the only UI. FastAPI serves `frontend/dist` in production mode, while Vite provides a development server with `/api` proxied to FastAPI.

## Runtime Data

Generated data is intentionally isolated under `var/`:

- `var/runtime` for SQLite, uploads, and job working directories.
- `var/output` for explicit CLI split output.
- `var/logs` for future operational logs.

These folders are ignored by Git.
