from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class SchemaObject:
    name: str
    owner: str | None = None
    dependencies: list[str] = field(default_factory=list)
