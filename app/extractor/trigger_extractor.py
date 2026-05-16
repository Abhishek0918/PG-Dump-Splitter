from __future__ import annotations

from app.models.metadata import DumpObject


def extract_trigger_metadata(obj: DumpObject) -> dict[str, object]:
    return {"trigger": obj.name}
