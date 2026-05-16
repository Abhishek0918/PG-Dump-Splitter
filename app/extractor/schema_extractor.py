from __future__ import annotations

from app.models.metadata import DumpObject


def extract_schema_metadata(obj: DumpObject) -> dict[str, str]:
    return {"schema": obj.name}
