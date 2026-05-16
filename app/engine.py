from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from app.catalog import build_catalog_payload
from app.config import SplitterConfig
from app.dependency.fk_mapper import map_foreign_keys
from app.dependency.graph_builder import DependencyGraph
from app.dependency.restore_order import grouped_restore_order
from app.models.metadata import DumpObject, SplitResult
from app.parser.pg_dump_parser import PgDumpParser
from app.visualization import build_visualization_payload
from app.writers.file_writer import SplitFileWriter
from app.writers.folder_builder import FolderBuilder
from app.writers.manifest_writer import ManifestWriter

ProgressCallback = Callable[[float, str, str, int | None], None]


class DumpSplitterEngine:
    def __init__(self, config: SplitterConfig) -> None:
        self.config = config
        self.parser = PgDumpParser(encoding=config.default_encoding)
        self.file_writer = SplitFileWriter(config)
        self.folder_builder = FolderBuilder(config)
        self.manifest_writer = ManifestWriter(config)

    def split_dump(
        self,
        dump_path: Path,
        output_root: Path | None = None,
        progress_callback: ProgressCallback | None = None,
    ) -> SplitResult:
        output_root = output_root or self.config.output_dir
        self._emit_progress(progress_callback, 3, "preparing", "Preparing output folders")
        self.folder_builder.build(output_root)

        graph = DependencyGraph()
        result = SplitResult(output_root=output_root)
        file_size = max(dump_path.stat().st_size, 1)
        processed_bytes = 0
        last_percent = -1
        self._emit_progress(progress_callback, 5, "parsing", "Reading dump stream", 0)

        for index, parsed in enumerate(self.parser.parse(dump_path), start=1):
            obj = parsed.dump_object
            self.file_writer.write(output_root, obj)
            graph.add_object(obj)
            result.objects.append(obj)
            processed_bytes += len(parsed.raw_text.encode(self.config.default_encoding, errors="replace"))
            percent = min(75, 5 + (processed_bytes / file_size) * 70)
            rounded_percent = int(percent)
            if rounded_percent != last_percent or index % 100 == 0:
                last_percent = rounded_percent
                self._emit_progress(
                    progress_callback,
                    percent,
                    "parsing",
                    f"Parsed {index:,} SQL blocks",
                    min(processed_bytes, file_size),
                )

        self._emit_progress(progress_callback, 78, "analyzing", "Building dependency graph", min(processed_bytes, file_size))
        topo_order = graph.topological_order()
        restore_plan = grouped_restore_order(result.objects, topo_order)
        fk_map = map_foreign_keys(result.objects)
        graph_payload = graph.to_dict()
        catalog_payload = build_catalog_payload(result.objects, dump_path.stem)
        visualization_payload = build_visualization_payload(result.objects)

        self._emit_progress(progress_callback, 86, "writing", "Writing manifest files", min(processed_bytes, file_size))
        self.manifest_writer.write_objects(output_root, result.objects)
        self.manifest_writer.write_json(output_root, "dependency_graph.json", graph_payload)
        self.manifest_writer.write_json(output_root, "foreign_keys.json", fk_map)
        self.manifest_writer.write_json(output_root, "restore_order.json", restore_plan)
        self.manifest_writer.write_json(output_root, "navigator.json", catalog_payload["navigator"])
        self.manifest_writer.write_json(output_root, "output_tree.json", catalog_payload["files"])
        self.manifest_writer.write_json(output_root, "schema_index.json", catalog_payload["schema_index"])
        self.manifest_writer.write_json(output_root, "visualization.json", visualization_payload)
        self.manifest_writer.write_statistics(output_root, result.objects, result.warnings)
        self.manifest_writer.write_summary(output_root, result.objects, graph.edge_count(), len(restore_plan))
        if self.config.write_combined_restore:
            self._emit_progress(progress_callback, 91, "writing", "Writing combined restore file", min(processed_bytes, file_size))
            self._write_combined_restore(output_root, restore_plan, result.objects)

        self._emit_progress(progress_callback, 94, "writing", "Split output written", min(processed_bytes, file_size))
        result.statistics = {
            "objects": len(result.objects),
            "dependencies": graph.edge_count(),
            "restore_items": len(restore_plan),
        }
        return result

    def _write_combined_restore(
        self,
        output_root: Path,
        restore_plan: list[dict[str, object]],
        objects: list[DumpObject],
    ) -> None:
        object_by_id = {obj.object_id: obj for obj in objects}
        target = output_root / self.config.combined_restore_filename
        with target.open("w", encoding="utf-8", newline="\n") as handle:
            for item in restore_plan:
                object_id = str(item["object_id"])
                obj = object_by_id.get(object_id)
                if obj is None:
                    continue
                handle.write(f"-- {obj.object_type.value}: {obj.object_id}\n")
                handle.write(obj.statement.rstrip())
                handle.write("\n\n")

    @staticmethod
    def _emit_progress(
        progress_callback: ProgressCallback | None,
        percent: float,
        stage: str,
        current_step: str,
        processed_bytes: int | None = None,
    ) -> None:
        if progress_callback is None:
            return
        progress_callback(percent, stage, current_step, processed_bytes)
