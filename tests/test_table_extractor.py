from pgsplit.extractor.table_extractor import extract_table_metadata
from pgsplit.models.metadata import DumpObject
from pgsplit.models.object_types import ObjectType


def test_extract_table_metadata_parses_columns_primary_key_and_foreign_key() -> None:
    statement = """
    CREATE TABLE shop.shop_vehicle_segments (
        shop_id bigint NOT NULL,
        vehicle_segment_id bigint NOT NULL,
        created_at timestamptz NOT NULL,
        CONSTRAINT shop_vehicle_segments_pkey PRIMARY KEY (shop_id, vehicle_segment_id),
        CONSTRAINT shop_vehicle_segments_vehicle_segment_id_fkey FOREIGN KEY (vehicle_segment_id) REFERENCES master.vehicle_segments(id)
    );
    """
    obj = DumpObject(
        "shop.shop_vehicle_segments",
        ObjectType.TABLE,
        "shop",
        "shop_vehicle_segments",
        statement=statement,
    )

    payload = extract_table_metadata(obj)

    assert payload["primary_key"] == ["shop_id", "vehicle_segment_id"]
    assert payload["columns"][0]["name"] == "shop_id"
    assert payload["columns"][0]["primary_key"] is True
    assert payload["columns"][1]["foreign_key"] is True
    assert payload["foreign_keys"][0]["references_table"] == "master.vehicle_segments"
