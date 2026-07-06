from __future__ import annotations

from pathlib import Path

from pgsplit.core.config import SplitterConfig


class FolderBuilder:
    def __init__(self, config: SplitterConfig) -> None:
        self.config = config

    def build(self, output_root: Path) -> None:
        (output_root / self.config.schema_dirname).mkdir(parents=True, exist_ok=True)
        (output_root / self.config.global_dirname).mkdir(parents=True, exist_ok=True)
        (output_root / self.config.data_dirname).mkdir(parents=True, exist_ok=True)
        (output_root / self.config.manifest_dirname).mkdir(parents=True, exist_ok=True)
