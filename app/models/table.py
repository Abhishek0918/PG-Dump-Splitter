from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class TableObject:
    schema: str
    table: str
    columns: list[str] = field(default_factory=list)
    constraints: list[str] = field(default_factory=list)
    indexes: list[str] = field(default_factory=list)
    triggers: list[str] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)
    file_path: str | None = None

    @property
    def fqname(self) -> str:
        return f"{self.schema}.{self.table}"
