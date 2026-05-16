from __future__ import annotations

import re

from app.models.metadata import DumpObject


def extract_table_metadata(obj: DumpObject) -> dict[str, object]:
    statement = obj.statement or ""
    columns = re.findall(r'^\s*"?(?P<column>[A-Za-z_][A-Za-z0-9_$]*)"?\s+', statement, re.MULTILINE)
    return {"columns": columns}
