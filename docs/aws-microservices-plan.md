# AWS Microservices Plan For PG Dump Analyzer

This document describes the target AWS architecture for hosting PGSplit as an enterprise PG Dump Analyzer.

## Architecture Goals

- Process PostgreSQL dump files from MB to hundreds of GB.
- Avoid loading full dumps into memory.
- Keep original dumps and generated artifacts durable and private.
- Scale parser/analyzer workers independently from the UI/API.
- Support long-running jobs with progress, retries, cancellation, and resumability.
- Provide enterprise security, auditability, retention, and observability.

## Recommended AWS Services

| Need | AWS Service | Reason |
| --- | --- | --- |
| Static UI | S3 + CloudFront or API container | Low-latency web delivery |
| API/BFF | ECS Fargate service behind ALB/API Gateway | Containerized FastAPI with independent scaling |
| Original dumps | S3 | Durable object storage for large files |
| Generated artifacts | S3 | Split SQL, manifests, restore scripts, reports, ZIPs |
| Job queue | SQS | Decouples API from workers and absorbs load spikes |
| Workflow orchestration | Step Functions | Multi-stage long-running parse/analyze/package workflows |
| Parser workers | ECS Fargate tasks | CPU/memory-tuned streaming workers without EC2 management |
| Job metadata | DynamoDB initially, Aurora PostgreSQL later if relational queries dominate | Job state, progress, artifacts, event pointers |
| Search | OpenSearch | Object, SQL, schema, dependency, and warning search |
| Auth | Cognito or enterprise OIDC/SAML | User identity and token validation |
| Secrets | Secrets Manager | Database/API secrets and private integration settings |
| Logs/metrics | CloudWatch | Worker logs, progress metrics, alarms, dashboards |
| Container images | ECR | API and worker image registry |
| Networking | VPC, private subnets, VPC endpoints | Private S3/SQS/DynamoDB access and controlled egress |

## High-Level Data Flow

```text
User Browser
  -> React UI
  -> API/BFF Service
  -> Presigned S3 upload or API upload
  -> S3 original dump bucket
  -> Job Orchestrator writes job metadata
  -> SQS parse queue
  -> Parser Worker reads S3 dump stream
  -> Split artifacts + raw metadata to S3
  -> Analyzer Worker builds stats, warnings, dependencies
  -> Visualization Worker builds ERD/dependency payloads
  -> Restore Planner Worker builds restore scripts
  -> Artifact Worker packages ZIP/report
  -> Job complete event
  -> UI polls or receives websocket/SSE progress
```

## Target Services

### 1. Frontend / BFF Service

Responsibilities:

- Serve UI or return CloudFront-hosted UI config.
- Validate auth token.
- Create jobs.
- Issue presigned upload/download URLs.
- Aggregate job, object, event, tree, restore, and visualization responses.

Suggested implementation:

- FastAPI container on ECS Fargate.
- ALB or API Gateway in front.
- Short request timeouts; no heavy parsing inside API container.

### 2. Upload Service

Responsibilities:

- Validate `.sql`, `.sql.gz`, `.dump`, `.tar`, or future formats.
- Store original dump in S3.
- Record size, checksum, source type, and upload metadata.
- Emit job-created event.

Suggested implementation:

- API endpoint for small uploads.
- Presigned multipart S3 upload for large dumps.

### 3. Job Orchestrator

Responsibilities:

- Own job state machine.
- Dispatch parse/analyze/visualize/package stages.
- Retry transient failures.
- Mark terminal success/failure.
- Support cancellation.

Suggested implementation:

- Start with SQS + worker state transitions.
- Move to Step Functions when workflows require durable branching, retries, and audit history.

### 4. Parser Worker Service

Responsibilities:

- Stream dump from S3.
- Detect statements and COPY blocks.
- Classify schemas, tables, views, functions, procedures, policies, grants, triggers, constraints, indexes, partitions, comments, and data.
- Write object files and parse manifests to S3.
- Emit progress by byte offset and object count.

Suggested implementation:

- ECS Fargate task with tuned CPU/memory.
- One dump per worker task.
- Optional EFS scratch only if local temporary disk becomes insufficient.

### 5. Analyzer Worker Service

Responsibilities:

- Build dependency graph.
- Detect cycles, missing references, duplicate objects, orphan sequences, restore risks, and broken COPY blocks.
- Compute statistics and risk scores.
- Generate JSON and HTML reports.

### 6. Visualization Service

Responsibilities:

- Build ERD graph payloads.
- Build FK parent-child dependency maps.
- Cap graph payloads for UI performance.
- Prepare schema/object summaries.

### 7. Restore Planner Service

Responsibilities:

- Generate restore order.
- Generate restore scripts.
- Validate restore phases.
- Build selective restore previews.

### 8. Artifact Service

Responsibilities:

- Package split output ZIPs.
- Package reports.
- Generate temporary download URLs.
- Enforce retention and cleanup.

### 9. Search Service

Responsibilities:

- Index object names, paths, schemas, SQL snippets, comments, warnings, and dependencies.
- Support global search in enterprise-size dumps.

Suggested implementation:

- OpenSearch for full-text search.
- Store source-of-truth metadata in DynamoDB or Aurora.

## Storage Model

### S3 Buckets

```text
pgsplit-dumps-{env}/
  tenant/{tenant_id}/job/{job_id}/input/original.sql

pgsplit-artifacts-{env}/
  tenant/{tenant_id}/job/{job_id}/split/...
  tenant/{tenant_id}/job/{job_id}/manifest/...
  tenant/{tenant_id}/job/{job_id}/restore/...
  tenant/{tenant_id}/job/{job_id}/reports/...
  tenant/{tenant_id}/job/{job_id}/downloads/output.zip
```

Recommended controls:

- Block public access.
- Server-side encryption.
- Lifecycle policies for retention.
- Object tags for tenant, job, environment, and retention.
- VPC endpoints for private access from workers.

### Job Metadata

Suggested initial DynamoDB tables:

```text
Jobs
  pk: tenant_id
  sk: job_id
  status, stage, progress_percent, input_s3_key, artifact_prefix, created_at, started_at, finished_at

JobEvents
  pk: job_id
  sk: created_at#event_id
  level, stage, message, metadata

Objects
  pk: job_id
  sk: object_type#schema#name#object_id
  path, dependencies, attributes, line_start, line_end
```

Use Aurora PostgreSQL instead if complex relational querying becomes more important than serverless scale and simple access patterns.

## Security Model

- Authentication: Cognito or enterprise OIDC/SAML.
- Authorization: tenant/workspace/job-level access checks in API.
- IAM: one role per service with least-privilege S3/SQS/DynamoDB/OpenSearch permissions.
- Network: private subnets for workers, VPC endpoints for S3/SQS/DynamoDB, restricted outbound access.
- Secrets: Secrets Manager for external integration credentials.
- Encryption: S3 SSE-KMS, encrypted queues, encrypted metadata stores, TLS everywhere.
- Audit: CloudTrail, application audit events, job event history.

## Scaling Strategy

- API scales by HTTP request count/CPU.
- Parser workers scale by SQS queue depth and job size.
- Analyzer/visualization/package workers scale separately.
- Use Fargate task sizes by dump size class:
  - Small: 1-2 vCPU, 2-4 GB RAM.
  - Medium: 4 vCPU, 8-16 GB RAM.
  - Large: 8-16 vCPU, 32-64 GB RAM.
- Use backpressure: limit concurrent large jobs per tenant.
- Use retention cleanup to control S3 cost.

## Observability

Metrics:

- Jobs queued/running/completed/failed.
- Parse throughput MB/s.
- Objects parsed per second.
- Worker memory/CPU.
- Queue depth and job age.
- Artifact size and compression ratio.
- Error count by parser stage.

Logs:

- Structured JSON logs with tenant_id, job_id, stage, object_id where applicable.
- CloudWatch log groups per service.

Tracing:

- Add OpenTelemetry later for end-to-end job traceability.

## Migration Plan From Current App

### Phase A: Prepare Monolith For Extraction

- Add interfaces for storage, object storage, queues, and events.
- Keep local filesystem/SQLite implementations.
- Keep current UI and API behavior stable.

### Phase B: Worker Process Locally

- Run parser as a separate local worker process.
- API writes jobs to queue abstraction.
- Worker updates job store and artifacts.

### Phase C: AWS Storage And Queue

- Add S3 object storage implementation.
- Add SQS queue implementation.
- Keep API and worker containers deployed together first.

### Phase D: Split Services

- API/BFF container.
- Parser worker container.
- Analyzer worker container.
- Artifact worker container.
- Optional visualization worker container.

### Phase E: Enterprise Platform

- Cognito/OIDC auth.
- Multi-tenant metadata model.
- OpenSearch indexing.
- Step Functions orchestration.
- CloudWatch dashboards and alarms.
- Infrastructure as code with Terraform or AWS CDK.

## Immediate Next Engineering Work

1. Add `ObjectStorage` interface with local filesystem implementation.
2. Add `JobQueue` interface with in-process implementation.
3. Add `JobRepository` interface over current SQLite store.
4. Move parser execution behind a worker contract.
5. Add analyzer reports: dump inventory, dependency hotspots, restore risk, warnings.
6. Add UI Analytics tab.
