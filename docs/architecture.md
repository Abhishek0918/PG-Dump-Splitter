# Architecture

PGSplit Enterprise is currently a local-first PostgreSQL dump analyzer with a Python backend package and a React frontend. The next target architecture is a microservice-based PG Dump Analyzer platform that can process very large dumps on AWS.

## Current Local Architecture

```text
React UI
  -> FastAPI API
      -> SplitterService
          -> DumpSplitterEngine
              -> Streaming parser
              -> Object detector
              -> Metadata extractors
              -> Dependency graph builder
              -> File/manifest/restore writers
          -> SQLite job metadata
          -> Local var/runtime and var/output artifacts
```

### Current Backend Packages

- `api`: FastAPI routes and API response schemas.
- `cli`: Typer commands for `split`, `validate`, `graph`, `restore`, and `serve`.
- `core`: orchestration, config, splitter engine, service layer, output tree, validation, and catalog helpers.
- `parser`: streaming SQL parser and PostgreSQL object detection.
- `extractor`: schema, table, function, trigger, sequence, enum, extension, and dependency extraction.
- `dependency`: graph construction, foreign-key mapping, restore order, and topological sorting.
- `writers`: split SQL files, output folders, manifests, restore assets.
- `storage`: local SQLite persistence for jobs, events, object metadata, progress, and search facets.
- `restore`: restore script generation from split output.
- `visualization`: ERD and dependency graph payloads.

## Product Direction

The application should become a PG Dump Analyzer, not only a splitter. A completed dump job should support:

- Object-level browsing and SQL preview.
- Dependency graph and ERD views.
- Restore order planning and restore script generation.
- Dump health analysis: unsupported objects, warnings, broken COPY blocks, missing references, cyclic dependencies.
- Dump inventory: object counts, schemas, largest sections, COPY volume, hot dependency objects, high-risk restore areas.
- Search and filtering across objects, dependencies, SQL, schemas, and generated artifacts.
- Exportable analysis reports and split output archives.

## Target Microservice Architecture

```text
Browser / React UI
  -> API Gateway / BFF Service
      -> Auth Service
      -> Job Service
      -> Upload Service
      -> Metadata Query Service
      -> Artifact Service
      -> Notification Service

Object Storage
  <- Upload Service stores original dumps
  <- Parser workers stream dump chunks/objects
  <- Artifact workers write split output, reports, and ZIPs

Orchestrator
  -> Parse Worker Service
  -> Analyzer Worker Service
  -> Visualization Worker Service
  -> Restore Planner Worker Service
  -> Artifact Packaging Worker Service

Metadata Stores
  -> Operational job store
  -> Object/dependency catalog store
  -> Search index
  -> Event/progress stream
```

### Service Boundaries

- **Frontend/BFF Service**: serves UI, authenticates users, exposes stable `/api` endpoints, aggregates job views.
- **Upload Service**: receives local uploads or presigned upload completion events, validates file type/size, writes dump metadata.
- **Job Orchestrator**: owns job state machine, stage transitions, retries, cancellation, and worker dispatch.
- **Parser Worker Service**: streams dump files, detects statements/COPY blocks, emits normalized object metadata and split artifacts.
- **Analyzer Worker Service**: computes dependency hotspots, object statistics, restore risks, validation warnings, and report summaries.
- **Visualization Service**: builds ERD/dependency payloads optimized for UI rendering.
- **Restore Planner Service**: creates ordered restore scripts and validates restore phases.
- **Artifact Service**: packages split outputs, reports, manifests, and downloadable archives.
- **Search Service**: indexes object names, SQL snippets, dependencies, paths, and schemas.
- **Notification/Event Service**: pushes job progress, warnings, and completion notifications.

## AWS Hosting Plan

See `docs/aws-microservices-plan.md` for the detailed AWS plan. The recommended first AWS deployment should be a pragmatic container-based system:

- S3 for original dumps, split artifacts, manifests, reports, and downloads.
- ECS on Fargate for API and worker containers.
- SQS for job queues between API/orchestrator/workers.
- Step Functions for long-running job orchestration once workflows become multi-stage and retry-heavy.
- DynamoDB for job state and object metadata in the early SaaS phase.
- OpenSearch for full-text SQL/object search when dumps become large.
- CloudWatch for logs, metrics, dashboards, and alarms.
- Cognito or enterprise OIDC/SAML for authentication.

## Migration Strategy From Monolith To Services

1. **Modularize inside current repo**: extract parser, analyzer, artifact, and visualization boundaries as Python interfaces.
2. **Introduce object storage abstraction**: local filesystem first, S3 implementation later.
3. **Introduce job queue abstraction**: in-process executor first, SQS implementation later.
4. **Move parser to worker process**: API submits jobs; worker consumes queue and writes artifacts.
5. **Move metadata to managed store**: replace local SQLite with DynamoDB/RDS-backed repositories behind interfaces.
6. **Add search index**: index completed job metadata and SQL snippets.
7. **Split deployables**: separate API container, parser worker container, analyzer worker container, artifact worker container.
8. **Add orchestration**: Step Functions for long-running enterprise workflows.

## Runtime Data

Generated data is intentionally isolated under `var/` for local development:

- `var/runtime` for SQLite, uploads, and job working directories.
- `var/output` for explicit CLI split output.
- `var/logs` for future operational logs.

These folders are ignored by Git.
