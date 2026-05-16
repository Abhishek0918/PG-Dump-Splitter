from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from app.models.object_types import ObjectType


@dataclass(slots=True)
class DumpObject:
    object_id: str
    object_type: ObjectType
    schema: str | None
    name: str
    statement: str
    path: str | None = None
    dependencies: list[str] = field(default_factory=list)
    owner: str | None = None
    attributes: dict[str, Any] = field(default_factory=dict)
    line_start: int | None = None
    line_end: int | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["object_type"] = self.object_type.value
        return data


@dataclass(slots=True)
class SplitResult:
    objects: list[DumpObject] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    output_root: Path | None = None
    statistics: dict[str, Any] = field(default_factory=dict)
