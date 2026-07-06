from pgsplit.parser.lexer import stream_sql_statements


def test_stream_sql_statements_handles_dollar_quotes_and_copy() -> None:
    lines = [
        "CREATE FUNCTION public.test()\n",
        "RETURNS void\n",
        "AS $$\n",
        "BEGIN\n",
        "  RAISE NOTICE 'hello';\n",
        "END;\n",
        "$$ LANGUAGE plpgsql;\n",
        "COPY public.users (id, name) FROM stdin;\n",
        "1\tJohn\n",
        "2\tJane\n",
        "\\.\n",
    ]

    statements = list(stream_sql_statements(lines))

    assert len(statements) == 2
    assert statements[0].is_copy_data is False
    assert "RAISE NOTICE 'hello';" in statements[0].text
    assert statements[1].is_copy_data is True
    assert statements[1].text.rstrip().endswith("\\.")


def test_stream_sql_statements_splits_multiple_statements_on_one_line() -> None:
    statements = list(stream_sql_statements(["CREATE SCHEMA auth; CREATE TABLE auth.users (id int);\n"]))

    assert len(statements) == 2
    assert statements[0].text.strip() == "CREATE SCHEMA auth;"
    assert statements[1].text.strip() == "CREATE TABLE auth.users (id int);"


def test_stream_sql_statements_ignores_trailing_inline_comment_after_statement() -> None:
    statements = list(stream_sql_statements(["CREATE SCHEMA auth; -- restored from dump\n"]))

    assert len(statements) == 1
    assert statements[0].text.strip() == "CREATE SCHEMA auth;"
