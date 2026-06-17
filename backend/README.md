# Guardian Backend Skeleton

This backend skeleton captures the high-level service boundaries for Guardian AI Platform. It is intentionally framework-light until implementation choices are finalized.

## Services

- `control-plane`: agent registry, projects, approvals, tools, knowledge-base catalog, secret policy catalog, deployments, audit.
- `execution-plane`: runtime guard, policy snapshot loading, AgentCore Runtime integration, AgentCore Gateway integration, telemetry emission.
- `business-user-plane`: project workspace API, runnable agent catalog, run history, trace lookup.

## Suggested Implementation

- Python FastAPI for control-plane APIs.
- Aurora PostgreSQL for normalized registry data.
- AWS Step Functions for approval and deployment workflows.
- Amazon Verified Permissions/Cedar for authorization decisions.
- AWS Secrets Manager, KMS, and SSM Parameter Store for secret/config references.
- Amazon Bedrock AgentCore Runtime, Identity, Gateway, and Memory for execution.
- Arize AI plus OpenTelemetry/CloudWatch/X-Ray for observability.

## API Groups

| Group | Purpose |
| --- | --- |
| `/projects` | Project lifecycle, users, roles, policy defaults |
| `/agents` | Agent registry and version lifecycle |
| `/validations` | Schema, policy, tool, KB, memory, secret, runtime validation results |
| `/approvals` | Project-owner and platform-admin decisions |
| `/deployments` | AgentCore deployment workflows and policy snapshots |
| `/tools` | AgentCore Gateway tool catalog and Apigee mappings |
| `/knowledge-bases` | BU-owned KB catalog and project attachments |
| `/secrets` | Secret references and access policy |
| `/runs` | Runtime invocation history and trace lookup |
| `/audit` | Lifecycle and runtime audit events |

