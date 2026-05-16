from __future__ import annotations

import re
from dataclasses import dataclass

from app.models.object_types import ObjectType

IDENT = r'"(?:""|[^"])+"|[A-Za-z_][A-Za-z0-9_$]*'
QUALIFIED = rf"(?:{IDENT})(?:\s*\.\s*(?:{IDENT}))?"


def _clean_identifier(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    if value.startswith('"') and value.endswith('"'):
        return value[1:-1].replace('""', '"')
    return value


def _split_qualified(value: str | None) -> tuple[str | None, str]:
    if not value:
        return None, "unknown"
    pieces = [part.strip() for part in value.split(".", 1)]
    if len(pieces) == 2:
        schema = _clean_identifier(pieces[0]) or "public"
        name = _clean_identifier(pieces[1]) or "unknown"
        return schema, name
    return None, _clean_identifier(pieces[0]) or "unknown"


@dataclass(slots=True)
class DetectedObject:
    object_type: ObjectType
    schema: str | None
    name: str
    target_table: str | None = None

    @property
    def object_id(self) -> str:
        if self.schema:
            return f"{self.schema}.{self.name}"
        return self.name


PATTERNS: list[tuple[ObjectType, re.Pattern[str]]] = [
    (ObjectType.EXTENSION, re.compile(rf"\bCREATE\s+EXTENSION\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>{IDENT})", re.IGNORECASE | re.DOTALL)),
    (ObjectType.SCHEMA, re.compile(rf"\bCREATE\s+SCHEMA\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>{IDENT})", re.IGNORECASE | re.DOTALL)),
    (ObjectType.ENUM, re.compile(rf"\bCREATE\s+TYPE\s+(?P<qualified>{QUALIFIED})\s+AS\s+ENUM\b", re.IGNORECASE | re.DOTALL)),
    (ObjectType.TYPE, re.compile(rf"\bCREATE\s+TYPE\s+(?P<qualified>{QUALIFIED})\b", re.IGNORECASE | re.DOTALL)),
    (
        ObjectType.SEQUENCE,
        re.compile(
            rf"\bCREATE\s+(?:TEMPORARY|TEMP|UNLOGGED\s+)?SEQUENCE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<qualified>{QUALIFIED})(?=\s*(?:AS|INCREMENT|MINVALUE|MAXVALUE|START|CACHE|CYCLE|OWNED|;|$))",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        ObjectType.TABLE,
        re.compile(
            rf"\bCREATE\s+(?:UNLOGGED\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:ONLY\s+)?(?P<qualified>{QUALIFIED})(?=\s*(?:\(|PARTITION|INHERITS|WITH|TABLESPACE|;|$))",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        ObjectType.MATERIALIZED_VIEW,
        re.compile(
            rf"\bCREATE\s+MATERIALIZED\s+VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<qualified>{QUALIFIED})(?=\s+AS\b)",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        ObjectType.VIEW,
        re.compile(
            rf"\bCREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?P<qualified>{QUALIFIED})(?=\s+AS\b)",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (ObjectType.FUNCTION, re.compile(rf"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?P<qualified>{QUALIFIED})\s*\(", re.IGNORECASE | re.DOTALL)),
    (
        ObjectType.TRIGGER,
        re.compile(
            rf"\bCREATE\s+TRIGGER\s+(?P<name>{IDENT})\b.*?\bON\s+(?:ONLY\s+)?(?P<qualified>{QUALIFIED})(?=\s+(?:FOR|WHEN|EXECUTE|REFERENCING|;|$))",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        ObjectType.INDEX,
        re.compile(
            rf"\bCREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?P<name>{IDENT})\b.*?\bON\s+(?:ONLY\s+)?(?P<qualified>{QUALIFIED})(?=\s+(?:USING|WHERE|WITH|\(|TABLESPACE|;|$))",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
    (
        ObjectType.POLICY,
        re.compile(
            rf"\bCREATE\s+POLICY\s+(?P<name>{IDENT})\b.*?\bON\s+(?:ONLY\s+)?(?P<qualified>{QUALIFIED})(?=\s+(?:AS|FOR|TO|USING|WITH|;|$))",
            re.IGNORECASE | re.DOTALL,
        ),
    ),
]

COMMENT_RE = re.compile(
    rf"\bCOMMENT\s+ON\s+\w+\s+(?P<qualified>{QUALIFIED})(?:\s+IS\s+.+)?",
    re.IGNORECASE | re.DOTALL,
)
GRANT_RE = re.compile(
    rf"\bGRANT\b.+?\bON\s+\w+\s+(?P<qualified>{QUALIFIED})\b",
    re.IGNORECASE | re.DOTALL,
)
ALTER_CONSTRAINT_RE = re.compile(
    rf"\bALTER\s+TABLE\s+(?:ONLY\s+)?(?P<qualified>{QUALIFIED})\b.*?\bADD\s+CONSTRAINT\s+(?P<constraint>{IDENT})",
    re.IGNORECASE | re.DOTALL,
)
COPY_RE = re.compile(r"\bCOPY\s+(?P<qualified>[^\s(]+)\s*\(", re.IGNORECASE | re.DOTALL)


def detect_object(statement: str, is_copy_data: bool = False) -> DetectedObject:
    if is_copy_data:
        copy_match = COPY_RE.search(statement)
        if copy_match:
            schema, table = _split_qualified(copy_match.group("qualified"))
            object_schema = schema or "public"
            return DetectedObject(ObjectType.DATA, object_schema, table, target_table=f"{object_schema}.{table}")
        return DetectedObject(ObjectType.DATA, "public", "stdin_copy")

    for object_type, pattern in PATTERNS:
        match = pattern.search(statement)
        if not match:
            continue

        if object_type in {ObjectType.EXTENSION, ObjectType.SCHEMA}:
            name = _clean_identifier(match.group("name")) or "unknown"
            if object_type == ObjectType.SCHEMA:
                return DetectedObject(object_type, name, name)
            return DetectedObject(object_type, None, name)

        if object_type in {ObjectType.TRIGGER, ObjectType.INDEX, ObjectType.POLICY}:
            schema, table = _split_qualified(match.group("qualified"))
            object_schema = schema or "public"
            name = _clean_identifier(match.group("name")) or table
            return DetectedObject(object_type, object_schema, name, target_table=f"{object_schema}.{table}")

        schema, name = _split_qualified(match.group("qualified"))
        if object_type in {ObjectType.TABLE, ObjectType.VIEW, ObjectType.MATERIALIZED_VIEW, ObjectType.SEQUENCE, ObjectType.ENUM, ObjectType.TYPE, ObjectType.FUNCTION}:
            object_schema = schema or "public"
            return DetectedObject(object_type, object_schema, name)

    alter_match = ALTER_CONSTRAINT_RE.search(statement)
    if alter_match:
        schema, table = _split_qualified(alter_match.group("qualified"))
        object_schema = schema or "public"
        constraint = _clean_identifier(alter_match.group("constraint")) or "constraint"
        return DetectedObject(ObjectType.CONSTRAINT, object_schema, constraint, target_table=f"{object_schema}.{table}")

    comment_match = COMMENT_RE.search(statement)
    if comment_match:
        schema, name = _split_qualified(comment_match.group("qualified"))
        return DetectedObject(ObjectType.COMMENT, schema, name)

    grant_match = GRANT_RE.search(statement)
    if grant_match:
        schema, name = _split_qualified(grant_match.group("qualified"))
        return DetectedObject(ObjectType.GRANT, schema, name)

    return DetectedObject(ObjectType.UNKNOWN, None, "unclassified")
