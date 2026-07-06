from __future__ import annotations

from pgsplit.models.metadata import DumpObject


def extract_function_metadata(obj: DumpObject) -> dict[str, object]:
    return {"language": "unknown", "signature": obj.object_id}
