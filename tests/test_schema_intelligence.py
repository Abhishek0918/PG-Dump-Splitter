from __future__ import annotations

from pgsplit.core.schema_intelligence import build_schema_intelligence_payload
from pgsplit.extractor.table_extractor import extract_table_metadata
from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType


def _table(schema: str, name: str, statement: str) -> DumpObject:
    obj = DumpObject(
        object_id=f"{schema}.{name}",
        object_type=ObjectType.TABLE,
        schema=schema,
        name=name,
        statement=statement,
    )
    obj.attributes = extract_table_metadata(obj)
    return obj


def test_schema_intelligence_summarizes_tables_columns_and_fk_hotspots() -> None:
    users = _table(
        "public",
        "users",
        """
        CREATE TABLE public.users (
            id bigint PRIMARY KEY,
            email text NOT NULL
        );
        """,
    )
    orders = _table(
        "sales",
        "orders",
        """
        CREATE TABLE sales.orders (
            id bigint PRIMARY KEY,
            user_id bigint REFERENCES public.users(id),
            total numeric NOT NULL
        );
        """,
    )
    view = DumpObject(
        object_id="sales.order_summary",
        object_type=ObjectType.VIEW,
        schema="sales",
        name="order_summary",
        statement="",
        dependencies=["sales.orders", "public.users"],
    )

    payload = build_schema_intelligence_payload([users, orders, view])

    assert payload["summary"]["schema_count"] == 2
    assert payload["summary"]["table_count"] == 2
    assert payload["summary"]["column_count"] == 5
    assert payload["summary"]["foreign_key_count"] == 1
    assert payload["tables"][1]["outbound_references"][0]["target_table"] == "public.users"
    assert payload["relationship_hotspots"][0]["table"] == "public.users"
    assert "views" in payload["tables"][1]["dependent_objects"]
