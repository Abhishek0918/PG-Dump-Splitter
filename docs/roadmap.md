# Roadmap

## Implemented: Git-Ready Database Repository Mode

The next major product direction is to make PGSplit accurate enough to generate a database repository that can be versioned and reviewed like frontend and backend code.

Delivered foundation:

- Generate a stable `database/` folder from PostgreSQL plain SQL dumps.
- Keep object files deterministic so Git diffs are meaningful.
- Support DataGrip workflows by letting users open the generated database folder as a Git project while also connecting DataGrip directly to PostgreSQL/RDS.
- Track schema object checksums, dependencies, and restore order.
- Generate and preserve a baseline plus developer-owned migrations.
- Compare repositories by stable object identity and SHA-256.
- Add CI validation and checksum-tracked migration deployment.

Next increments:

- Live database/RDS drift detection using controlled `pg_dump` execution.
- PostgreSQL syntax validation against an ephemeral database in CI.
- Migration coverage checks that compare a restored baseline plus migrations with the expected repository.
- Reviewed migration scaffolding from object diffs; automatic destructive DDL remains opt-in.
