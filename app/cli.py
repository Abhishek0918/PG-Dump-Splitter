from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from app.config import SplitterConfig
from app.engine import DumpSplitterEngine
from app.restore_generator import RestoreScriptGenerator, find_restore_script
from app.validator import DumpValidator

app = typer.Typer(help="PGSplit Enterprise CLI")
console = Console()


def _load_config(config_path: Path | None) -> SplitterConfig:
    return SplitterConfig.load(config_path)


@app.command("split")
def split_dump(
    dump_file: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    output: Path = typer.Option(Path("output"), "--output", "-o"),
    config: Path | None = typer.Option(None, "--config", "-c"),
) -> None:
    cfg = _load_config(config)
    cfg.output_dir = output
    engine = DumpSplitterEngine(cfg)
    result = engine.split_dump(dump_file, output)
    console.print(f"Split completed for {dump_file}")
    console.print(f"Objects: {len(result.objects)}")
    console.print(f"Output: {output}")


@app.command("validate")
def validate_dump(
    dump_file: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    config: Path | None = typer.Option(None, "--config", "-c"),
) -> None:
    cfg = _load_config(config)
    report = DumpValidator(cfg.default_encoding).validate(dump_file)
    if report.ok:
        console.print(f"Validation passed | statements={report.object_count} warnings={len(report.warnings)}")
        return
    console.print(f"Validation failed | errors={len(report.errors)} warnings={len(report.warnings)}")
    for error in report.errors:
        console.print(f"- {error}")


@app.command("graph")
def show_graph(
    output: Path = typer.Argument(..., exists=True, file_okay=False, readable=True),
) -> None:
    graph_path = output / "manifest" / "dependency_graph.json"
    payload = json.loads(graph_path.read_text(encoding="utf-8"))
    table = Table(title="Dependency Graph")
    table.add_column("Nodes", justify="right")
    table.add_column("Edges", justify="right")
    table.add_row(str(len(payload.get("nodes", []))), str(len(payload.get("edges", []))))
    console.print(table)


@app.command("restore")
def show_restore_order(
    output: Path = typer.Argument(..., exists=True, file_okay=False, readable=True),
    mode: str = typer.Option("full", "--mode", "-m", help="full, schema-only, data-only, post-data"),
    schema: str | None = typer.Option(None, "--schema", "-s", help="Generate/select a schema restore script"),
    config: Path | None = typer.Option(None, "--config", "-c"),
) -> None:
    cfg = _load_config(config)
    generator = RestoreScriptGenerator(cfg)
    restore_manifest = generator.generate_from_output(output)
    script = find_restore_script(restore_manifest, "schema" if schema else mode, schema)
    console.print(f"Restore script: {output / script['path']}")
    console.print(f"Objects: {script['object_count']} | Data: {'yes' if script['includes_data'] else 'no'}")
    for warning in script.get("warnings") or []:
        console.print(f"[yellow]Warning:[/yellow] {warning}")

    restore_path = output / "manifest" / "restore_order.json"
    payload = json.loads(restore_path.read_text(encoding="utf-8"))
    table = Table(title="Restore Order")
    table.add_column("#", justify="right")
    table.add_column("Type")
    table.add_column("Object ID")
    table.add_column("Path")
    selected_ids = set(script.get("objects") or [])
    filtered_payload = [entry for entry in payload if entry.get("object_id") in selected_ids]
    for index, entry in enumerate(filtered_payload, start=1):
        table.add_row(str(index), entry["object_type"], entry["object_id"], entry.get("path") or "")
    console.print(table)


@app.command("serve")
def serve(
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8080, "--port"),
    config: Path | None = typer.Option(None, "--config", "-c"),
) -> None:
    import uvicorn
    from app.api import create_api

    cfg = _load_config(config)
    application = create_api(cfg)
    uvicorn.run(application, host=host, port=port)
