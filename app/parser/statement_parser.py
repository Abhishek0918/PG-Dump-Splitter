from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

from app.parser.lexer import RawStatement, stream_sql_statements


class StatementParser:
    def __init__(self, encoding: str = "utf-8") -> None:
        self.encoding = encoding

    def parse_file(self, dump_path: Path) -> Generator[RawStatement, None, None]:
        with dump_path.open("r", encoding=self.encoding, errors="replace", newline="") as handle:
            yield from stream_sql_statements(handle)
