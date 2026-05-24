from __future__ import annotations

import json
from collections import defaultdict
from os import scandir
from pathlib import Path
from typing import Any

from app.catalog import build_file_tree
from app.models.metadata import DumpObject


def build_output_tree(output_root: Path) -> dict[str, Any]:
    output_root = output_root.resolve()
    return _node_for_path(output_root, output_root)


def build_output_tree_from_objects(objects: list[DumpObject]) -> dict[str, Any]:
    return build_file_tree(objects)


def build_augmented_output_tree(output_root: Path, objects: list[DumpObject], extra_dirs: tuple[str, ...] = ("restore",)) -> dict[str, Any]:
    tree = build_file_tree(objects)
    children = [child for child in tree.get("children", []) if child.get("name") not in extra_dirs]
    for dirname in extra_dirs:
        extra_path = output_root / dirname
        if not extra_path.exists():
            continue
        extra_node = build_output_tree(extra_path)
        _prefix_paths(extra_node, dirname)
        children.append(extra_node)
    tree["children"] = sorted(children, key=lambda item: (item.get("type") == "file", str(item.get("name", "")).lower()))
    return tree


def load_manifest_summary(output_root: Path) -> dict[str, Any]:
    manifest_dir = output_root / "manifest"
    summary_path = manifest_dir / "manifest.json"
    statistics_path = manifest_dir / "statistics.json"
    navigator_path = manifest_dir / "navigator.json"
    schema_index_path = manifest_dir / "schema_index.json"
    restore_manifest_path = output_root / "restore" / "restore_manifest.json"
    summary: dict[str, Any] = {}
    statistics: dict[str, Any] = {}
    navigator: dict[str, Any] = {}
    schema_index: dict[str, Any] = {}
    restore: dict[str, Any] = {}

    if summary_path.exists():
        summary = json.loads(summary_path.read_text(encoding="utf-8"))
    if statistics_path.exists():
        statistics = json.loads(statistics_path.read_text(encoding="utf-8"))
    if navigator_path.exists():
        navigator = json.loads(navigator_path.read_text(encoding="utf-8"))
    if schema_index_path.exists():
        schema_index = json.loads(schema_index_path.read_text(encoding="utf-8"))
    if restore_manifest_path.exists():
        restore = json.loads(restore_manifest_path.read_text(encoding="utf-8"))

    return {
        "summary": summary,
        "counts_by_type": statistics.get("counts_by_type", {}),
        "counts_by_schema": statistics.get("counts_by_schema", {}),
        "navigator": navigator,
        "schema_index": schema_index,
        "restore": restore,
    }


def _node_for_path(path: Path, root: Path) -> dict[str, Any]:
    relative = "" if path == root else path.relative_to(root).as_posix()
    if path.is_file():
        return {
            "name": path.name,
            "type": "file",
            "path": relative,
            "size_bytes": path.stat().st_size,
        }

    children = [_node_for_path(child, root) for child in _sorted_children(path)]
    return {
        "name": path.name,
        "type": "directory",
        "path": relative,
        "children": children,
    }


def _sorted_children(path: Path) -> list[Path]:
    children: list[Path] = []
    with scandir(path) as entries:
        for entry in entries:
            children.append(Path(entry.path))
    return sorted(children, key=lambda item: (item.is_file(), item.name.lower()))


def _prefix_paths(node: dict[str, Any], prefix: str) -> None:
    current_path = str(node.get("path") or "")
    node["path"] = f"{prefix}/{current_path}" if current_path else prefix
    for child in node.get("children") or []:
        _prefix_paths(child, prefix)
