from __future__ import annotations

import re

from app.models.metadata import DumpObject


def extract_enum_metadata(obj: DumpObject) -> dict[str, object]:
    values = re.findall(r"'([^']+)'", obj.statement or "")
    return {"values": values}
