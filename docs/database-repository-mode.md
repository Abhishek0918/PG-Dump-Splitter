# Database Repository Mode

Database Repository Mode converts a PostgreSQL plain SQL dump into deterministic source files that can be opened in DataGrip, reviewed in pull requests, validated in CI, and deployed through immutable migrations.

## Generate From PostgreSQL or RDS

Use `pg_dump` from a PostgreSQL client version compatible with the server:

```powershell
$env:PGHOST = "source.cluster.amazonaws.com"
$env:PGPORT = "5432"
$env:PGDATABASE = "application"
$env:PGUSER = "readonly_export"
pg_dump --schema-only --no-owner --no-privileges --format=plain --file schema.sql
pgsplit repo schema.sql --output database
```

Passwords should be provided through `.pgpass`, AWS-supported authentication, or an interactive prompt. Do not commit passwords or database URLs.

To include small reference-data `COPY` blocks from a controlled dump:

```powershell
pgsplit repo reference_dump.sql --output database --include-data
```

Production/business data is excluded by default.

## Repository Layout

```text
database/
  README.md
  schemas/
    public/
      tables/
      views/
      materialized_views/
      functions/
      procedures/
      triggers/
      indexes/
      constraints/
      policies/
      sequences/
      types/
      enums/
      grants/
      comments/
  global/
    extensions/
    unknown/
  data/
    reference/
  migrations/
    0001_baseline.sql
    README.md
  manifests/
    repository.json
    objects.json
    dependencies.json
    checksums.json
    restore_order.json
  ci/
    validate.ps1
    validate.sh
    deploy.ps1
    deploy.sh
```

`schemas/`, `global/`, `manifests/`, and `ci/` are generated and replaced during synchronization. `migrations/` is never deleted. The baseline is a self-contained SQL snapshot created once and preserved unless `--force-baseline` is explicitly used.

## DataGrip Workflow

1. Connect DataGrip directly to the PostgreSQL/RDS instance for browsing and development.
2. Open `database/` as a DataGrip project and enable Git integration.
3. Make a database change in a development environment.
4. Export a fresh schema-only dump and run `pgsplit repo` against the same repository.
5. Review object-file changes and `pgsplit repo-diff` output.
6. Add a new immutable migration such as `0002_add_order_status.sql`.
7. Run repository validation and commit the generated files plus migration.

Do not edit generated object files to represent a desired change. The migration is the deployable change; regenerated object files represent the expected final schema.

## Validation and Diff

```powershell
pgsplit repo-validate database
pgsplit repo-diff database_before database --json
```

Validation checks:

- SHA-256 integrity for every generated SQL object.
- Duplicate object IDs and paths.
- Missing or untracked generated SQL files.
- Dependency-node consistency.
- Dependency-aware restore ordering.
- Baseline migration presence.

Diff reports objects that were added, removed, or changed based on stable identity and content checksums.

## Deployment

Set standard libpq environment variables and run the generated wrapper:

```powershell
$env:PGHOST = "target.cluster.amazonaws.com"
$env:PGPORT = "5432"
$env:PGDATABASE = "application"
$env:PGUSER = "deployment_user"
.\database\ci\deploy.ps1
```

Deployment validates the repository first, then applies migration files in filename order. Applied versions and checksums are stored in `pgsplit.schema_migrations`. Exact matches are skipped; changing an already-applied migration stops deployment.

Use separate credentials and approval gates for development, staging, and production. The deploy command intentionally relies on PostgreSQL environment configuration rather than storing connection secrets in the repository.

## CI Example

```yaml
- name: Install PGSplit
  run: pip install -e .
- name: Validate database repository
  run: pgsplit repo-validate database
```

Deployment should be a protected environment job that runs `database/ci/deploy.sh` only after review and validation.

## Current Boundary

This release establishes deterministic dump-to-repository generation, checksums, validation, object diffs, baselines, and migration deployment tracking. Live drift detection will build on this format by invoking `pg_dump` against a configured database and comparing the resulting temporary repository. Automatic SQL migration synthesis is intentionally deferred because unsafe generated DDL is worse than a reviewed migration.
