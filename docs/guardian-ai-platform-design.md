# Guardian AI Platform Design

## Product Shape

Guardian is both a governance console and a business-user workspace. Users enter through projects, and projects determine which agents, tools, knowledge bases, secrets, roles, and memory policies they can use.

Primary audiences:

- Platform admin: governs runtimes, policies, approvals, tool onboarding, and deployments.
- Project owner: manages project users, approves agents for the project, attaches knowledge bases, and controls project settings.
- Agent developer: submits and versions agents.
- Business user: runs approved agents and reviews execution results.
- Auditor/security reviewer: reviews lifecycle, policy, and runtime activity.

## Navigation Model

Top-level navigation should be dense and operational:

- Projects
- Agents
- Tools
- Knowledge
- Secrets
- Approvals
- Runs
- Observability
- Audit
- Settings

Users should always have a project switcher in the header. Switching projects changes visible agents, tools, knowledge bases, secrets, runs, and role capabilities.

## Project Roles (As Implemented)

| Role (stored in `org_members.role`) | Capabilities |
| --- | --- |
| `ORG_ADMIN` | Manage org, approve tools, deploy to gateway, grant tools to projects, manage members |
| `PROJECT_ADMIN` | Manage project members, grant tools, publish and deploy agents within project |
| `MEMBER` | Author agents, view project tools and agents |
| `VIEWER` | Read-only access to project resources |

> Aspirational roles from design docs (Project owner / Project writer / Business user / Auditor) map onto this four-tier model. The `approver_type` field on `agent_approval_requests` (`business_owner` | `platform_admin`) is independent of the org membership role.

## Core Workflows

### Create Project

1. Platform admin or authorized user creates a project.
2. Project owner is assigned.
3. Users and roles are added.
4. Default policy template is selected.
5. Allowed runtimes, tools, memory modes, and KB attachment rules are configured.

### Register Agent (As Implemented)

1. Agent author opens the **Author Wizard** (6 steps):
   - Step 1 — Template: choose agent template
   - Step 2 — Prompt: enter name and system prompt (both required before Next is enabled)
   - Step 3 — Tools: select from tools with active project grants (`GET /api/projects/:id/project-tools`)
   - Step 4 — Config: choose model, set `risk_tier` (low / medium / high / critical)
   - Step 5 — Deploy: generate Strands Python code preview + manifest YAML
   - Step 6 — Review: health check against `/health`, then Submit
2. Submit calls `POST /api/agents/publish` → agent created with `status = SUBMITTED`.
3. Two `agent_approval_requests` rows auto-created: `approver_type = business_owner` and `approver_type = platform_admin`.
4. Approvers act via `POST /api/approvals/:taskId/decision` with `{ decision: "approve" | "reject", comments }`.
5. When **both** rows are approved → agent transitions to `status = APPROVED`.
6. If **either** is rejected → agent transitions to `status = REJECTED` immediately.
7. Agent is now eligible for deployment.

> Note: there is no automated schema validation step in the current implementation. Validation is via the form UI only.

### Deploy Agent (As Implemented)

1. Authorized user clicks Deploy on an `APPROVED` agent (deploy blocked otherwise).
2. `POST /api/projects/:projectId/agents/:agentId/deploy` called.
3. Server generates Strands Python `agent.py` via `strands-generator.cjs`.
4. `agent.py` uploaded to S3 at `agents/{id}/{version}/agent.py`.
5. `CreateAgentRuntime` called with `codeConfiguration.s3`; server polls until `status = READY` (≈3 min).
6. `CreateAgentRuntimeEndpoint` called with `networkMode = PUBLIC`; server polls until `status = READY`.
7. `agent_environment_deployments` row updated: `deployment_status = DEPLOYED`, `agent_core_endpoint_id`, `agent_core_endpoint_arn`, `s3_code_location`.
8. Agent can now be invoked via `InvokeAgentRuntimeCommand`.

### Run Agent

1. Business user selects project and approved agent.
2. Guardian validates user role and agent status.
3. Runtime receives user JWT and project context.
4. Agent invokes Bedrock, memory, knowledge bases, and tools as allowed.
5. Gateway and Apigee each enforce authorization.
6. Results, traces, and audit records are stored.

## Validation Strategy

Validation should start with deterministic metadata and configuration checks. Sandbox execution can be added later as a separate evaluation service.

MVP validations:

- Portable spec schema validation.
- Project membership and owner validation.
- Runtime compatibility validation.
- Model/provider allowlist validation.
- Tool catalog reference validation.
- Tool risk and approval validation.
- Knowledge base attachment validation.
- Secret reference and access policy validation.
- Memory mode and retention validation.
- Prompt/system instruction review flags.
- Network route and environment validation.
- Observability and audit configuration validation.

Future validations:

- Dry-run execution using mocked tools.
- Prompt injection and tool misuse test suite.
- Sandbox execution against non-production APIs.
- Regression evaluation per agent version.
- LLM-as-judge quality and safety checks.
- Human review package with validation evidence.

## Secret Design

Guardian should not store secret values. It should store secret metadata and references.

Recommended storage:

- AWS Secrets Manager: API credentials, OAuth secrets, third-party tokens, rotated credentials.
- AWS KMS: customer-managed keys for environment, project, or BU encryption boundaries.
- SSM Parameter Store: non-sensitive config, feature flags, endpoint names, low-risk encrypted parameters.

Secret policy dimensions:

- Project scope.
- Agent scope.
- Tool/API scope.
- Environment scope.
- User role allowed to reference or rotate.
- Runtime allowed to retrieve.
- Rotation and expiration.
- Break-glass handling.

## Deployment Environments

Recommended initial environments:

- dev: platform team experimentation.
- test: validation and integration.
- preprod: business-owner and platform-admin acceptance.
- prod: approved runtime.

Agent approval should be version-specific and environment-specific. A version approved for test should not automatically be approved for prod.

## Data Boundaries

Projects should be treated as hard boundaries for:

- Agent visibility.
- Agent execution.
- Secret references.
- Knowledge-base attachment.
- Long-term memory.
- Run history.
- Approval ownership.

Cross-project sharing should require explicit platform-admin support and should not be part of the default MVP.

## Design Decisions To Carry Forward

| Decision | Recommendation |
| --- | --- |
| Agent model | Normalized portable spec with runtime-specific extensions |
| Registry scope | Full lifecycle and version history |
| Approval | Project owner plus platform admin |
| Identity | Delegated user execution by default |
| Authorization | Enforced independently at every layer |
| Secrets | Secrets Manager plus KMS, references only in Guardian |
| Tools | AgentCore Gateway for runtime, Guardian Tool Catalog as source of truth |
| Knowledge | BU owned, project attached |
| Memory | Agent-selected, policy-approved, scoped by user/project/agent |
| Observability | Arize AI plus CloudWatch/X-Ray/OpenTelemetry |

