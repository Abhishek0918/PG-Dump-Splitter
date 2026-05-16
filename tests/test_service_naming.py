from app.service import SplitterService


def test_clean_input_name_removes_uuid_prefixes_and_spaces() -> None:
    assert SplitterService._clean_input_name("69acf86c06fb4d49ab27bbbc463db83e_zarthi prod.sql") == "zarthi_prod.sql"


def test_archive_basename_uses_source_name() -> None:
    assert SplitterService._archive_basename("zarthi_prod.sql") == "zarthi_prod_split_output"
