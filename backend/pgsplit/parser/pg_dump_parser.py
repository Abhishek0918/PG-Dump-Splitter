from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from pgsplit.extractor.dependency_extractor import detect_dependencies
from pgsplit.extractor.table_extractor import extract_table_metadata
from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType
from pgsplit.parser.object_detector import detect_object
from pgsplit.parser.statement_parser import StatementParser

IDENT = r'"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*'
QUALIFIED_IDENT = rf"(?:{IDENT})(?:\s*\.\s*(?:{IDENT}))?"
ALTER_FK_RE = re.compile(
    rf"\bALTER\s+TABLE\s+(?:ONLY\s+)?(?P<source>{QUALIFIED_IDENT}).*?\bFOREIGN\s+KEY\s*\((?P<columns>[^)]+)\)\s+REFERENCES\s+(?P<target>{QUALIFIED_IDENT})(?:\s*\((?P<target_columns>[^)]+)\))?",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(slots=True)
class ParsedStatement:
    raw_text: str
    dump_object: DumpObject


class PgDumpParser:
    def __init__(self, encoding: str = "utf-8") -> None:
        self.statement_parser = StatementParser(encoding=encoding)

    def parse(self, dump_path: Path):
        seen_ids: dict[str, int] = {}
        for raw in self.statement_parser.parse_file(dump_path):
            detected = detect_object(raw.text, is_copy_data=raw.is_copy_data)
            base_object_id = self._build_object_id(
                detected.object_type,
                detected.schema,
                detected.name,
                detected.target_table,
                detected.signature,
            )
            object_id = self._deduplicate_object_id(base_object_id, seen_ids)
            statement = raw.text.strip() + "\n"
            attributes = self._extract_attributes(detected.object_type, statement)
            if detected.signature:
                attributes["signature"] = detected.signature
            dump_object = DumpObject(
                object_id=object_id,
                object_type=detected.object_type,
                schema=detected.schema,
                name=detected.name,
                statement=statement,
                dependencies=detect_dependencies(raw.text, object_id),
                attributes=attributes,
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
        if object_type == ObjectType.CONSTRAINT:
            return _extract_constraint_metadata(statement)
        return {}

    @staticmethod
    def _build_object_id(
        object_type: ObjectType,
        schema: str | None,
        name: str,
        target_table: str | None,
        signature: str | None = None,
    ) -> str:
        prefix = f"{schema}.{name}" if schema else name
        if object_type == ObjectType.FUNCTION and signature:
            return f"{prefix}{signature}"
        if object_type == ObjectType.DATA:
            table = target_table or prefix
            return f"{table}#data"
        if object_type in {ObjectType.CONSTRAINT, ObjectType.TRIGGER, ObjectType.INDEX, ObjectType.POLICY}:
            table = target_table or (schema and f"{schema}.table") or "table"
            return f"{table}#{object_type.value}.{name}"
        if object_type in {ObjectType.COMMENT, ObjectType.GRANT}:
            target = target_table or prefix
            return f"{target}#{object_type.value}.{name}"
        return prefix

    @staticmethod
    def _deduplicate_object_id(object_id: str, seen_ids: dict[str, int]) -> str:
        seen_ids[object_id] = seen_ids.get(object_id, 0) + 1
        if seen_ids[object_id] == 1:
            return object_id
        return f"{object_id}#{seen_ids[object_id]}"


def _extract_constraint_metadata(statement: str) -> dict[str, object]:
    match = ALTER_FK_RE.search(statement)
    if not match:
        return {}
    return {
        "foreign_key": {
            "source_table": _normalize_qualified(match.group("source")),
            "source_columns": _parse_identifier_list(match.group("columns")),
            "target_table": _normalize_qualified(match.group("target")),
            "target_columns": _parse_identifier_list(match.group("target_columns") or ""),
        }
    }


def _parse_identifier_list(value: str) -> list[str]:
    return [_clean_identifier(part.strip()) or "unknown" for part in value.split(",") if part.strip()]


def _clean_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('""', '"')
    return value


def _normalize_qualified(value: str | None) -> str | None:
    if not value:
        return None
    parts = [_clean_identifier(part.strip()) or "unknown" for part in value.split(".", 1)]
    if len(parts) == 2:
        return f"{parts[0]}.{parts[1]}"
    return parts[0]
