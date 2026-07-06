from __future__ import annotations

from pgsplit.models.metadata import DumpObject


def extract_trigger_metadata(obj: DumpObject) -> dict[str, object]:
    return {"trigger": obj.name}
