from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except Exception:  # pragma: no cover - optional dependency fallback
    yaml = None


@dataclass(slots=True)
class SplitterConfig:
    output_dir: Path = Path("output")
    runtime_dir: Path = Path("runtime")
    uploads_dirname: str = "uploads"
    jobs_dirname: str = "jobs"
    sqlite_filename: str = "pgsplit.db"
    manifest_dirname: str = "manifest"
    schema_dirname: str = "schemas"
    global_dirname: str = "global"
    data_dirname: str = "data"
    combined_restore_filename: str = "combined_restore.sql"
    default_encoding: str = "utf-8"
    write_combined_restore: bool = True
    include_comments: bool = True
    api_host: str = "127.0.0.1"
    api_port: int = 8080
    extras: dict[str, Any] = field(default_factory=dict)

    @property
    def uploads_dir(self) -> Path:
        return self.runtime_dir / self.uploads_dirname

    @property
    def jobs_dir(self) -> Path:
        return self.runtime_dir / self.jobs_dirname

    @property
    def sqlite_path(self) -> Path:
        return self.runtime_dir / self.sqlite_filename

    def ensure_runtime_dirs(self) -> None:
        self.runtime_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def load(cls, config_path: Path | None) -> "SplitterConfig":
        if config_path is None:
            return cls()
        if yaml is None:
            raise RuntimeError("PyYAML is required to load config files. Install dependencies from requirements.txt.")
        payload = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
        known = {
            "output_dir",
            "runtime_dir",
            "uploads_dirname",
            "jobs_dirname",
            "sqlite_filename",
            "manifest_dirname",
            "schema_dirname",
            "global_dirname",
            "data_dirname",
            "combined_restore_filename",
            "default_encoding",
            "write_combined_restore",
            "include_comments",
            "api_host",
            "api_port",
        }
        kwargs = {key: payload[key] for key in known if key in payload}
        for key in ("output_dir", "runtime_dir"):
            if key in kwargs:
                kwargs[key] = Path(kwargs[key])
        extras = {key: value for key, value in payload.items() if key not in known}
        return cls(**kwargs, extras=extras)
