from __future__ import annotations

from app.models.metadata import DumpObject


def extract_extension_metadata(obj: DumpObject) -> dict[str, object]:
    return {"extension": obj.name}
