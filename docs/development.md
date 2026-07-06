# Development

## First Setup

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
npm --prefix frontend install
npm --prefix frontend run build
```

## Run Locally

```powershell
python -m pgsplit serve --host 127.0.0.1 --port 8091
```

For frontend development:

```powershell
npm --prefix frontend run dev
```

## Test

```powershell
python -m pytest -q
python -m compileall backend tests
npm --prefix frontend run build
```

## Notes

- The old `python -m app.main` command has been removed.
- The React build is the only browser UI; the legacy `/ui` route is removed.
- Parser accuracy is intentionally separate from this structure refactor.
