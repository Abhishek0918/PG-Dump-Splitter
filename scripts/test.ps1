$ErrorActionPreference = "Stop"
python -m pytest -q
python -m compileall backend tests
npm --prefix frontend run build
