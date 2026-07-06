# Roadmap

## Pipeline: Git-Ready Database Repository Mode

The next major product direction is to make PGSplit accurate enough to generate a database repository that can be versioned and reviewed like frontend and backend code.

Target capabilities:

- Generate a stable `database/` folder from PostgreSQL schema dumps or live database introspection.
- Keep object files deterministic so Git diffs are meaningful.
- Support DataGrip workflows by letting users open the generated database folder as a Git project while also connecting DataGrip directly to PostgreSQL/RDS.
- Track schema object checksums, dependencies, restore order, and drift status.
- Generate baseline migrations and future migration diffs.
- Add CI validation scripts for SQL syntax, dependency order, missing objects, and restore readiness.
- Support a database CI/CD flow: change in DataGrip, sync/export through PGSplit, commit to Git, review in PR, validate in CI, deploy to environments.

This is intentionally kept as a future pipeline item. The current implementation remains focused on dump splitting, restore planning, visualization, and the local React workspace.
