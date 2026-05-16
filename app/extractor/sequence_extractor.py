from __future__ import annotations

from app.models.metadata import DumpObject


def extract_sequence_metadata(obj: DumpObject) -> dict[str, object]:
    return {"sequence": obj.object_id}
