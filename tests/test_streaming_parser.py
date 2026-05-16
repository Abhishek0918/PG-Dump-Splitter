from app.parser.lexer import stream_sql_statements


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
