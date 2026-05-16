from __future__ import annotations

import re
from collections.abc import Generator, Iterable
from dataclasses import dataclass

COPY_START_RE = re.compile(r"^\s*COPY\s+.+\s+FROM\s+stdin;\s*$", re.IGNORECASE)
DOLLAR_TAG_RE = re.compile(r"\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$")


@dataclass(slots=True)
class RawStatement:
    text: str
    is_copy_data: bool = False
    line_start: int = 0
    line_end: int = 0


def stream_sql_statements(lines: Iterable[str]) -> Generator[RawStatement, None, None]:
    buffer: list[str] = []
    start_line = 0
    in_single_quote = False
    in_double_quote = False
    dollar_tag: str | None = None
    block_comment_depth = 0
    line_comment = False
    copy_mode = False
    line_number = 0

    for line_number, line in enumerate(lines, start=1):
        if not buffer:
            start_line = line_number

        if copy_mode:
            buffer.append(line)
            if line.rstrip("\r\n") == r"\.":
                yield RawStatement("".join(buffer), is_copy_data=True, line_start=start_line, line_end=line_number)
                buffer = []
                start_line = 0
                copy_mode = False
            continue

        buffer.append(line)
        if COPY_START_RE.match(line) and not in_single_quote and not in_double_quote and dollar_tag is None and block_comment_depth == 0:
            copy_mode = True
            continue

        i = 0
        while i < len(line):
            char = line[i]
            nxt = line[i + 1] if i + 1 < len(line) else ""

            if line_comment:
                break

            if block_comment_depth > 0:
                if char == "*" and nxt == "/":
                    block_comment_depth -= 1
                    i += 2
                    continue
                if char == "/" and nxt == "*":
                    block_comment_depth += 1
                    i += 2
                    continue
                i += 1
                continue

            if dollar_tag is not None:
                if line.startswith(dollar_tag, i):
                    i += len(dollar_tag)
                    dollar_tag = None
                    continue
                i += 1
                continue

            if not in_single_quote and not in_double_quote:
                if char == "-" and nxt == "-":
                    line_comment = True
                    break
                if char == "/" and nxt == "*":
                    block_comment_depth += 1
                    i += 2
                    continue
                match = DOLLAR_TAG_RE.match(line, i)
                if match:
                    dollar_tag = match.group(0)
                    i = match.end()
                    continue

            if char == "'" and not in_double_quote:
                doubled = i + 1 < len(line) and line[i + 1] == "'"
                if in_single_quote and doubled:
                    i += 2
                    continue
                in_single_quote = not in_single_quote
            elif char == '"' and not in_single_quote:
                doubled = i + 1 < len(line) and line[i + 1] == '"'
                if in_double_quote and doubled:
                    i += 2
                    continue
                in_double_quote = not in_double_quote
            elif char == ";" and not in_single_quote and not in_double_quote and dollar_tag is None and block_comment_depth == 0:
                yield RawStatement("".join(buffer), line_start=start_line, line_end=line_number)
                buffer = []
                start_line = 0
            i += 1

        line_comment = False

    if buffer:
        text = "".join(buffer).strip()
        if text:
            yield RawStatement("".join(buffer), line_start=start_line, line_end=line_number)
