from __future__ import annotations

import re
from collections.abc import Generator, Iterable
from dataclasses import dataclass

COPY_START_RE = re.compile(r"^\s*COPY\s+.+\s+FROM\s+stdin;\s*$", re.IGNORECASE)
DOLLAR_TAG_RE = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")
LINE_COMMENT_ONLY_RE = re.compile(r"(?m)^\s*--.*$")
BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)


@dataclass(slots=True)
class RawStatement:
    text: str
    is_copy_data: bool = False
    line_start: int = 0
    line_end: int = 0


def _has_sql_text(value: str) -> bool:
    without_line_comments = LINE_COMMENT_ONLY_RE.sub("", value)
    without_comments = BLOCK_COMMENT_RE.sub("", without_line_comments)
    return bool(without_comments.strip())


def stream_sql_statements(lines: Iterable[str]) -> Generator[RawStatement, None, None]:
    buffer: list[str] = []
    start_line = 0
    in_single_quote = False
    in_double_quote = False
    dollar_tag: str | None = None
    block_comment_depth = 0
    copy_mode = False
    line_number = 0

    def append_text(text: str, current_line: int) -> None:
        nonlocal start_line
        if text and not buffer:
            start_line = current_line
        buffer.append(text)

    for line_number, line in enumerate(lines, start=1):
        if copy_mode:
            append_text(line, line_number)
            if line.rstrip("\r\n") == r"\.":
                yield RawStatement("".join(buffer), is_copy_data=True, line_start=start_line, line_end=line_number)
                buffer = []
                start_line = 0
                copy_mode = False
            continue

        i = 0
        while i < len(line):
            char = line[i]
            nxt = line[i + 1] if i + 1 < len(line) else ""

            if block_comment_depth > 0:
                if char == "*" and nxt == "/":
                    append_text(line[i : i + 2], line_number)
                    block_comment_depth -= 1
                    i += 2
                    continue
                if char == "/" and nxt == "*":
                    append_text(line[i : i + 2], line_number)
                    block_comment_depth += 1
                    i += 2
                    continue
                append_text(char, line_number)
                i += 1
                continue

            if dollar_tag is not None:
                if line.startswith(dollar_tag, i):
                    append_text(dollar_tag, line_number)
                    i += len(dollar_tag)
                    dollar_tag = None
                    continue
                append_text(char, line_number)
                i += 1
                continue

            if not in_single_quote and not in_double_quote:
                if char == "-" and nxt == "-":
                    append_text(line[i:], line_number)
                    break
                if char == "/" and nxt == "*":
                    append_text(line[i : i + 2], line_number)
                    block_comment_depth += 1
                    i += 2
                    continue
                match = DOLLAR_TAG_RE.match(line, i)
                if match:
                    append_text(match.group(0), line_number)
                    dollar_tag = match.group(0)
                    i = match.end()
                    continue

            if char == "'" and not in_double_quote:
                doubled = i + 1 < len(line) and line[i + 1] == "'"
                if in_single_quote and doubled:
                    append_text(line[i : i + 2], line_number)
                    i += 2
                    continue
                append_text(char, line_number)
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote:
                doubled = i + 1 < len(line) and line[i + 1] == '"'
                if in_double_quote and doubled:
                    append_text(line[i : i + 2], line_number)
                    i += 2
                    continue
                append_text(char, line_number)
                in_double_quote = not in_double_quote
            elif char == ";" and not in_single_quote and not in_double_quote and dollar_tag is None and block_comment_depth == 0:
                append_text(char, line_number)
                text = "".join(buffer)
                if COPY_START_RE.match(text.strip()):
                    copy_mode = True
                else:
                    yield RawStatement(text, line_start=start_line, line_end=line_number)
                    buffer = []
                    start_line = 0
            else:
                append_text(char, line_number)
            i += 1

    if buffer:
        text = "".join(buffer)
        if _has_sql_text(text):
            yield RawStatement("".join(buffer), line_start=start_line, line_end=line_number)
