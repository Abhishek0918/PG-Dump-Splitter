from __future__ import annotations

import json
from pathlib import Path

import typer
from rich.console import Console
from rich.table import Table

from pgsplit.core.config import SplitterConfig
from pgsplit.core.engine import DumpSplitterEngine
from pgsplit.restore.generator import RestoreScriptGenerator, find_restore_script
from pgsplit.repository.diff import RepositoryDiff
from pgsplit.repository.deployer import RepositoryDeployer, RepositoryDeploymentError
from pgsplit.repository.generator import DatabaseRepositoryGenerator
from pgsplit.repository.validator import RepositoryValidator
from pgsplit.core.validator import DumpValidator

app = typer.Typer(help="PGSplit Enterprise CLI")
console = Console()


def _load_config(config_path: Path | None) -> SplitterConfig:
    return SplitterConfig.load(config_path)


@app.command("split")
def split_dump(
    dump_file: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    output: Path = typer.Option(Path("var/output"), "--output", "-o"),
    config: Path | None = typer.Option(None, "--config", "-c"),
) -> None:
    cfg = _load_config(config)
    cfg.output_dir = output
    engine = DumpSplitterEngine(cfg)
    result = engine.split_dump(dump_file, output)
    console.print(f"Split completed for {dump_file}")
    console.print(f"Objects: {len(result.objects)}")
    console.print(f"Output: {output}")


@app.command("repo")
def generate_repository(
    dump_file: Path = typer.Argument(..., exists=True, dir_okay=False, readable=True),
    output: Path = typer.Option(Path("database"), "--output", "-o"),
    include_data: bool = typer.Option(
        False,
        "--include-data",
        help="Include COPY blocks under data/reference. Intended only for small reference datasets.",
    ),
    force_baseline: bool = typer.Option(
        False,
        "--force-baseline",
        help="Replace migrations/0001_baseline.sql. Existing migrations are otherwise preserved.",
    ),
    config: Path | None = typer.Option(None, "--config", "-c"),
) -> None:
    """Generate a deterministic, Git-ready PostgreSQL database repository."""
    cfg = _load_config(config)
    result = DatabaseRepositoryGenerator(cfg).generate(
        dump_file,
        output,
        include_data=include_data,
        force_baseline=force_baseline,
    )
    console.print("[green]Database repository generated[/green]")
    console.print(f"Output: {result.output_root}")
    console.print(
        f"Objects: {result.object_count} | Schemas: {result.schema_count} | "
        f"Checksummed files: {result.file_count}"
    )
    console.print(
        "Baseline: "
        + ("created" if result.baseline_created else "preserved")
        + " | Data: "
        + ("included" if result.included_data else "excluded")
    )


@app.command("repo-validate")
def validate_repository(
    repository: Path = typer.Argument(..., exists=True, file_okay=False, readable=True),
) -> None:
    """Validate generated files, checksums, dependencies, and restore order."""
    report = RepositoryValidator().validate(repository)
    for warning in report.warnings:
        console.print(f"[yellow]Warning:[/yellow] {warning}")
    if not report.ok:
        for error in report.errors:
            console.print(f"[red]Error:[/red] {error}")
        raise typer.Exit(code=1)
    console.print(
        f"[green]Repository validation passed[/green] | "
        f"objects={report.checked_objects} files={report.checked_files} warnings={len(report.warnings)}"
    )


@app.command("repo-deploy")
def deploy_repository(
    repository: Path = typer.Argument(..., exists=True, file_okay=False, readable=True),
    psql: str = typer.Option("psql", "--psql", help="psql executable name or path."),
) -> None:
    """Validate and apply immutable migrations using PostgreSQL environment variables."""
    try:
        result = RepositoryDeployer(psql).deploy(repository)
    except (RepositoryDeploymentError, OSError) as exc:
        console.print(f"[red]Deployment failed:[/red] {exc}")
        raise typer.Exit(code=1) from exc
    for migration in result.applied:
        console.print(f"[green]Applied:[/green] {migration}")
    for migration in result.skipped:
        console.print(f"[dim]Already applied:[/dim] {migration}")
    console.print(f"Deployment complete | applied={len(result.applied)} skipped={len(result.skipped)}")


@app.command("repo-diff")
def diff_repositories(
    old_repository: Path = typer.Argument(..., exists=True, file_okay=False, readable=True),
    new_repository: Path = typer.Argument(..., exists=True, file_okay=False, readable=True),
    json_output: bool = typer.Option(False, "--json", help="Print machine-readable JSON."),
) -> None:
    """Compare two generated database repositories by object identity and checksum."""
    result = RepositoryDiff().compare(old_repository, new_repository)
    if json_output:
        console.print_json(data=result.to_dict())
        return
    table = Table(title="Database Repository Diff")
    table.add_column("Change")
    table.add_column("Type")
    table.add_column("Object")
    for item in result.added:
        table.add_row("[green]Added[/green]", str(item.get("object_type") or ""), str(item["object_id"]))
    for item in result.removed:
        table.add_row("[red]Removed[/red]", str(item.get("object_type") or ""), str(item["object_id"]))
    for item in result.changed:
        table.add_row("[yellow]Changed[/yellow]", str(item.get("object_type") or ""), str(item["object_id"]))
    if not result.has_changes:
        table.add_row("Unchanged", "", f"{result.unchanged_count} objects")
    console.print(table)


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
    from pgsplit.api.routes import create_api

    cfg = _load_config(config)
    application = create_api(cfg)
    uvicorn.run(application, host=host, port=port)
