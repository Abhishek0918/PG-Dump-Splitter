from app.models.object_types import ObjectType
from app.parser.object_detector import detect_object


def test_detect_table_with_if_not_exists() -> None:
    statement = "CREATE TABLE IF NOT EXISTS auth.users (id bigint primary key);"
    obj = detect_object(statement)
    assert obj.object_type == ObjectType.TABLE
    assert obj.schema == "auth"
    assert obj.name == "users"


def test_detect_index_and_target_table() -> None:
    statement = "CREATE UNIQUE INDEX idx_users_email ON auth.users USING btree (email);"
    obj = detect_object(statement)
    assert obj.object_type == ObjectType.INDEX
    assert obj.schema == "auth"
    assert obj.name == "idx_users_email"
    assert obj.target_table == "auth.users"


def test_detect_copy_block_as_data() -> None:
    statement = "COPY public.orders (id, amount) FROM stdin;\n1\t120\n\\.\n"
    obj = detect_object(statement, is_copy_data=True)
    assert obj.object_type == ObjectType.DATA
    assert obj.schema == "public"
    assert obj.name == "orders"
