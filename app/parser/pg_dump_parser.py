from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.extractor.dependency_extractor import detect_dependencies
from app.extractor.table_extractor import extract_table_metadata
from app.models.metadata import DumpObject
from app.models.object_types import ObjectType
from app.parser.object_detector import detect_object
from app.parser.statement_parser import StatementParser


@dataclass(slots=True)
class ParsedStatement:
    raw_text: str
    dump_object: DumpObject


class PgDumpParser:
    def __init__(self, encoding: str = "utf-8") -> None:
        self.statement_parser = StatementParser(encoding=encoding)

    def parse(self, dump_path: Path):
        for raw in self.statement_parser.parse_file(dump_path):
            detected = detect_object(raw.text, is_copy_data=raw.is_copy_data)
            object_id = self._build_object_id(detected.object_type, detected.schema, detected.name, detected.target_table)
            dump_object = DumpObject(
                object_id=object_id,
                object_type=detected.object_type,
                schema=detected.schema,
                name=detected.name,
                statement=raw.text.strip() + "\n",
                dependencies=detect_dependencies(raw.text, object_id),
                attributes=self._extract_attributes(detected.object_type, raw.text.strip() + "\n"),
                line_start=raw.line_start,
                line_end=raw.line_end,
            )
            yield ParsedStatement(raw_text=raw.text, dump_object=dump_object)

    @staticmethod
    def _extract_attributes(object_type: ObjectType, statement: str) -> dict[str, object]:
        if object_type == ObjectType.TABLE:
            probe = DumpObject(
                object_id="__probe__",
                object_type=ObjectType.TABLE,
                schema=None,
                name="__probe__",
                statement=statement,
            )
            return extract_table_metadata(probe)
        return {}

    @staticmethod
    def _build_object_id(
        object_type: ObjectType,
        schema: str | None,
        name: str,
        target_table: str | None,
    ) -> str:
        prefix = f"{schema}.{name}" if schema else name
        if object_type == ObjectType.DATA:
            table = target_table or prefix
            return f"{table}#data"
        if object_type in {ObjectType.CONSTRAINT, ObjectType.TRIGGER, ObjectType.INDEX, ObjectType.POLICY}:
            table = target_table or (schema and f"{schema}.table") or "table"
            return f"{table}#{object_type.value}.{name}"
        if object_type in {ObjectType.COMMENT, ObjectType.GRANT} and target_table:
            return f"{target_table}#{object_type.value}.{name}"
        return prefix
