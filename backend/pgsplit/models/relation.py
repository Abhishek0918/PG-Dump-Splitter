from __future__ import annotations

from dataclasses import dataclass


@dataclass(slots=True)
class RelationDependency:
    source: str
    target: str
    relation_type: str
