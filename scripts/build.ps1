$ErrorActionPreference = "Stop"
pip install -e .
npm --prefix frontend install
npm --prefix frontend run build
