from __future__ import annotations

from enum import Enum


class ObjectType(str, Enum):
    EXTENSION = "extensions"
    SCHEMA = "schemas"
    ENUM = "enums"
    TYPE = "types"
    SEQUENCE = "sequences"
    TABLE = "tables"
    CONSTRAINT = "constraints"
    INDEX = "indexes"
    FUNCTION = "functions"
    PROCEDURE = "procedures"
    TRIGGER = "triggers"
    VIEW = "views"
    MATERIALIZED_VIEW = "materialized_views"
    DATA = "data"
    POLICY = "policies"
    COMMENT = "comments"
    GRANT = "grants"
    UNKNOWN = "unknown"


RESTORE_PRIORITY: list[ObjectType] = [
    ObjectType.EXTENSION,
    ObjectType.SCHEMA,
    ObjectType.ENUM,
    ObjectType.TYPE,
    ObjectType.SEQUENCE,
    ObjectType.TABLE,
    ObjectType.CONSTRAINT,
    ObjectType.INDEX,
    ObjectType.FUNCTION,
    ObjectType.PROCEDURE,
    ObjectType.TRIGGER,
    ObjectType.VIEW,
    ObjectType.MATERIALIZED_VIEW,
    ObjectType.DATA,
    ObjectType.POLICY,
    ObjectType.COMMENT,
    ObjectType.GRANT,
    ObjectType.UNKNOWN,
]


SCHEMA_SCOPED_TYPES: set[ObjectType] = {
    ObjectType.ENUM,
    ObjectType.TYPE,
    ObjectType.SEQUENCE,
    ObjectType.TABLE,
    ObjectType.CONSTRAINT,
    ObjectType.INDEX,
    ObjectType.FUNCTION,
    ObjectType.PROCEDURE,
    ObjectType.TRIGGER,
    ObjectType.VIEW,
    ObjectType.MATERIALIZED_VIEW,
    ObjectType.POLICY,
    ObjectType.COMMENT,
    ObjectType.GRANT,
}
