# Roadmap

## Current Direction: Enterprise PG Dump Analyzer

The project is now focused on becoming an enterprise PostgreSQL dump analyzer. Splitting remains a core capability, but the larger goal is to let users do almost anything useful with a dump file: inspect, search, analyze, validate, visualize, restore-plan, report, and export.

## Removed Direction

The Git-ready database repository creation module has been removed. Database CI/CD may return later as a separate product area, but it is not part of the current PG Dump Analyzer scope.

## Phase 1: Analyzer Foundation

- Strengthen statement parsing around functions, procedures, comments, grants, policies, partitions, COPY blocks, and extension-owned objects.
- Improve object identity and file naming stability for long PostgreSQL signatures.
- Add richer statistics: object counts, schema counts, COPY row estimates, SQL size by object type, warning counts.
- Improve validation: broken COPY blocks, duplicate objects, unresolved references, cycles, unsafe restore order.

## Phase 2: Enterprise Analysis UI

- Add a dedicated Analytics dashboard.
- Add dependency hotspot cards and risk scoring.
- Add searchable SQL/object/dependency views.
- Add exportable HTML/JSON analysis reports.
- Add restore readiness and migration readiness panels.

## Phase 3: Worker-Based Backend

- Introduce storage and queue interfaces.
- Move parsing to worker processes.
- Persist job state/events outside process memory.
- Add cancellation, retry, resumability, and backpressure controls.

## Phase 4: AWS Microservices

- Store dumps and artifacts in S3.
- Run API and workers on ECS/Fargate.
- Use SQS for queues and Step Functions for multi-stage orchestration.
- Use DynamoDB or RDS for job metadata.
- Use OpenSearch for full-text object/SQL search.
- Add Cognito/OIDC auth, CloudWatch observability, and IAM least privilege.

## Phase 5: Enterprise Platform

- Team workspaces and role-based access.
- Project-level retention policies.
- Audit logs.
- Multi-tenant isolation.
- Large-dump resumability.
- Cost controls and worker autoscaling.
