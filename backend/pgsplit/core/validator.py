from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from pgsplit.models.object_types import ObjectType
from pgsplit.parser.pg_dump_parser import PgDumpParser


@dataclass(slots=True)
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    object_count: int = 0

    @property
    def ok(self) -> bool:
        return not self.errors


class DumpValidator:
    def __init__(self, encoding: str = "utf-8") -> None:
        self.parser = PgDumpParser(encoding=encoding)

    def validate(self, dump_path: Path) -> ValidationReport:
        report = ValidationReport()
        seen_ids: set[str] = set()
        for parsed in self.parser.parse(dump_path):
            report.object_count += 1
            obj = parsed.dump_object

            if obj.object_type == ObjectType.UNKNOWN:
                report.warnings.append(f"Unclassified SQL between lines {obj.line_start}-{obj.line_end}")

            if obj.object_type == ObjectType.DATA and not obj.statement.rstrip().endswith(r"\."):
                report.errors.append(f"Broken COPY block around lines {obj.line_start}-{obj.line_end}")

            is_repeat_allowed = obj.object_type in {
                ObjectType.COMMENT,
                ObjectType.GRANT,
                ObjectType.CONSTRAINT,
                ObjectType.INDEX,
                ObjectType.TRIGGER,
            }
            if obj.object_id in seen_ids and not is_repeat_allowed:
                report.warnings.append(f"Duplicate object id detected: {obj.object_id}")
            seen_ids.add(obj.object_id)

        return report
