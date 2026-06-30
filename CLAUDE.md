# Guardian AI Platform — CLAUDE.md

## Project Overview

Guardian AI Platform (codename: Pegasus) is an AI agent governance and deployment platform built on AWS Bedrock AgentCore.

- Organization → Project → Agent hierarchy with RBAC
- Full agent lifecycle: Author → Submit → Approve → Deploy → Invoke
- AWS resource discovery (Lambda, API Gateway, AgentCore Gateway) with inventory scanning
- Tool registration workflow with governance controls
- Real AWS Bedrock AgentCore Runtime deployment

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite SPA |
| Backend | Node.js http server (`scripts/server.cjs`, CommonJS, provider-aware) |
| Execution | AWS Bedrock AgentCore Runtime |
| Agent framework | Strands SDK (Python), CrewAI |
| Storage | SQLite (mock/test) or Postgres (local/dev) via `backend/runtime/db/` |

## Running Locally

```bash
# Start dev server (Vite frontend + Node control plane on port 4201)
npm run dev

# Run all tests
npm test

# Run only API integration tests
npm run test:api

# Run only unit tests
npm run test:unit
```

Server runs at **http://localhost:4201** (both UI and API on the same port).

### APP_MODE

| Mode | DB | AWS |
|---|---|---|
| `mock` | SQLite in-memory | All mock |
| `local` | Local Postgres | Mock cloud |
| `dev` | Remote Postgres | Real AWS |

Set in environment: `APP_MODE=mock node scripts/server.cjs`

### Local AWS Mode

Set in `.env.local`:

```
APP_MODE=local
LOCAL_AWS_MODE=true
AWS_REGION=us-east-1
DB_URL=postgres://...
```

Reads `~/.aws/credentials` via the default credential provider chain.
At startup resolves account ID via STS and lists available Bedrock models.

## Architecture

### Frontend (`src/`)
- `src/App.jsx` — root layout, sidebar nav, org switcher; `refreshTools` calls `/api/projects/:id/project-tools`
- `src/components/control-plane/` — agent registry, approvals, deploy, tools, AddToolWizard
- `src/components/org/` — OrgDetail with tabs (Projects, Members, Connected Accounts, Platform AWS Config), InventoryCatalog, AwsAccountConnectionForm
- `src/components/author/` — 6-step agent authoring wizard (Template → Prompt → Tools → Config → Deploy → Review)
- `src/constants.js` — shared enums (resource types, discovery status, Bedrock models, RBAC roles)

### Backend (`scripts/`)
- `scripts/server.cjs` — **primary** provider-aware API server (replaces static-server.cjs)
- `scripts/static-server.cjs` — legacy monolithic server (kept for reference, not used in dev)
- `scripts/services/aws-client.cjs` — STS identity resolution, single-account AWS config builder
- `scripts/services/bedrock-client.cjs` — Bedrock model listing with caching
- `scripts/services/agentcore-client.cjs` — full AgentCore deploy pipeline (S3 upload → CreateRuntime → CreateEndpoint → Invoke)
- `scripts/services/gateway-deployer.cjs` — AgentCore Gateway deployment pipeline for tools
- `scripts/services/inventory-scanner.cjs` — AWS resource discovery; real AWS APIs in local mode, mock data in demo mode
- `scripts/codegen/strands-generator.cjs` — generates Strands Python agent code from spec
- `scripts/codegen/agentcore-wrapper-generator.cjs` — generates AgentCore harness wrapper
- `scripts/setup/create-sample-lambdas.cjs` — creates 5 real Lambda functions in AWS for inventory testing

### Database (`backend/runtime/db/`)
- `schema.sql` — SQLite schema (used in mock/test mode)
- `schema-postgres.sql` — Postgres schema (used in local/dev mode); includes `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migration statements so schema updates apply to existing DBs automatically
- `sqlite-adapter.cjs` — catches both `"already exists"` and `"duplicate column name"` errors so `ALTER TABLE` migrations are idempotent
- `seed.cjs` — idempotent seed data (org, environments, projects, sample tools)

### Key API Routes

```
GET    /health                                             server health check
GET    /api/local/aws-context                             resolved account/region/models
GET    /api/local/runtimes                                list real AgentCore runtimes

GET    /api/organizations
POST   /api/organizations
GET    /api/organizations/:orgId/environments
GET    /api/organizations/:orgId/members
GET    /api/organizations/:orgId/account-connections
POST   /api/organizations/:orgId/account-connections
POST   /api/organizations/:orgId/account-connections/:connId/sync
GET    /api/organizations/:orgId/account-connections/:connId/sync-runs
GET    /api/organizations/:orgId/discovered-resources
GET    /api/organizations/:orgId/aws-config
GET    /api/organizations/:orgId/logical-tools
POST   /api/organizations/:orgId/logical-tools            register tool (auto-creates approval task)
POST   /api/organizations/:orgId/logical-tools/:ltdId/request-approval
POST   /api/organizations/:orgId/logical-tools/:ltdId/approve
POST   /api/organizations/:orgId/logical-tools/:ltdId/reject
POST   /api/organizations/:orgId/logical-tools/:ltdId/deploy-to-gateway
POST   /api/organizations/:orgId/logical-tools/:ltdId/grants   grant approved org tool to project

GET    /api/approvals                                     lists tool AND agent approval tasks
POST   /api/approvals/:taskId/decision                    approve or reject (tools or agents)

GET    /api/projects/:projectId/agents
POST   /api/projects/:projectId/agents
GET    /api/projects/:projectId/agents/:agentId
PATCH  /api/projects/:projectId/agents/:agentId
POST   /api/projects/:projectId/agents/:agentId/deploy
GET    /api/projects/:projectId/tools                     always returns [] (legacy stub)
GET    /api/projects/:projectId/knowledge                 always returns [] (stub)
GET    /api/projects/:projectId/project-tools             granted org tools for this project (ACTIVE grants)
GET    /api/projects/:projectId/available-org-tools       approved org tools not yet granted
GET    /api/projects/:projectId/tool-grants
DELETE /api/projects/:projectId/tool-grants/:grantId

POST   /api/agents/generate                               generate Strands Python code from manifest YAML
POST   /api/agents/publish                                register authored agent + create 2 approval tasks

POST   /api/llm/complete
POST   /mock-mcp
```

## Agent Lifecycle

```
SUBMITTED → (business_owner approval) → (platform_admin approval) → APPROVED → deploying → deployed
```

- Agent is created with `status = SUBMITTED` by `POST /api/agents/publish`
- Two `agent_approval_requests` rows are created automatically (business_owner + platform_admin)
- Both must be approved via `POST /api/approvals/:taskId/decision` before agent flips to `APPROVED`
- Rejecting any task sets agent to `REJECTED` immediately
- Deploy is blocked until `status = APPROVED`

## Tool Lifecycle

```
PENDING → (org admin approval) → APPROVED → deploy-to-gateway → ACTIVE → grant to project
```

- Register tool → `tool_approval_requests` row created automatically
- Approve via `POST /api/approvals/:taskId/decision` → `approval_status = APPROVED` on `logical_tool_definitions`
- Deploy to AgentCore Gateway via `POST /api/organizations/:orgId/logical-tools/:ltdId/deploy-to-gateway`
- Grant to project via `POST /api/organizations/:orgId/logical-tools/:ltdId/grants`
- Only ACTIVE grants appear in `GET /api/projects/:projectId/project-tools` (used by Author wizard)

## Database Schema — Key Tables

| Table | Purpose |
|---|---|
| `organizations` | Top-level orgs |
| `environments` | DEV / PROD per org |
| `aws_account_connections` | Connected AWS accounts with role ARNs |
| `projects` | Projects within an org |
| `logical_tool_definitions` | Org-level tool registry; `approval_status` column |
| `tool_approval_requests` | Approval tasks for tools |
| `environment_tool_deployments` (ETD) | Links tool → environment → AWS; tracks `deployment_status` |
| `project_tool_grants` | Links approved tools to projects; `status = ACTIVE` when granted |
| `discovered_resources` | AWS resource inventory from sync scans |
| `agents` | Agent records; columns: `status`, `authored_via`, `risk_tier` |
| `agent_approval_requests` | Approval tasks for agents; `approver_type` = business_owner or platform_admin |
| `agent_environment_deployments` | Agent deployments per environment |

## AgentCore Gateway Deploy Flow (`gateway-deployer.cjs`)

1. Normalize Lambda ARN: `function/name` (slash, from discovery) → `function:name` (colon, required by SDK)
2. `ensureGateway` — list existing gateways or create new one named `guardian-{orgId}-{env}`
3. Construct gateway ARN manually: `arn:aws:bedrock-agentcore:{region}:{account}:gateway/{gatewayId}` (AWS SDK does not return `gatewayArn` in Create/Get responses)
4. `CreateGatewayTargetCommand` — registers Lambda as a target
5. `addLambdaInvokePermission` — grants `bedrock-agentcore.amazonaws.com` invoke access; `SourceArn` is optional (set when gateway ARN is available)
6. Auto-provisioning prefers connections with `deploymentRoleArn` or `provisioningRoleArn`; falls back to mock deployer if no real role ARN exists

## AgentCore Runtime Deploy Flow (`codeConfiguration` — no Docker needed)

1. Generate Strands Python code from agent spec
2. Upload `agent.py` to S3 at `agents/{id}/{version}/agent.py`
3. `CreateAgentRuntime` with `codeConfiguration.s3`
4. Poll `GetAgentRuntime` until `status = READY` (up to ~3 min)
5. `CreateAgentRuntimeEndpoint` with `networkMode = PUBLIC`
6. Poll `GetAgentRuntimeEndpoint` until `status = READY`
7. Invoke via `InvokeAgentRuntimeCommand`

## Author Agent Wizard (`src/components/author/`)

6 steps: Template → Prompt → Tools → Config → Deploy → Review

- **Step 1 (Prompt)**: Next is disabled until both `name` AND `systemPrompt` are filled; a hint message explains what's missing
- **Step 2 (Tools)**: Shows only tools with active project grants (`/api/projects/:id/project-tools`); no mock fallback
- **Step 5 (Review)**: Health check hits `/health` (not `/api/health`); generates manifest YAML + Strands Python code; Submit calls `POST /api/agents/publish`
- On publish: agent → `SUBMITTED`, two approval tasks created, UI redirects to Approvals queue after 1.2s

## Testing

```bash
npm test                  # unit + API integration (runs as part of build too)
npm run test:api          # API integration only (boots server.cjs on port 4300)
npm run test:unit         # unit tests only
```

- `tests/mock-mode.test.cjs` — unit tests for DB adapters, seed, config (9 tests)
- `tests/api.test.cjs` — full HTTP API integration tests; spawns `server.cjs` as child process with `APP_MODE=mock DB_TYPE=sqlite DB_PATH=:memory:` (68 tests)
- Covers: health, identity, org CRUD, environments, account-connections, sync, discovered resources, projects, logical tools, full tool approval flow, rejection, ETD, deploy-to-gateway, project tools, grants, agents, members, LLM, org-level grants, agent publish → approval queue → decision flow, 404 guards

## AWS Resources (Account 657349741196, us-east-1)

| Resource | Name/ARN |
|---|---|
| AgentCore execution role | `arn:aws:iam::657349741196:role/AgentCoreExecutionRole` |
| S3 artifact bucket | `pegasus-agent-artifacts-657349741196` |
| CloudWatch log group | `/aws/bedrock-agentcore/runtimes` |
| Sample Lambda functions | `payment-post-fn`, `claims-lookup-fn`, `policy-lookup-fn`, `member-lookup-fn`, `benefits-lookup-fn` |

To recreate the sample Lambdas (e.g. after account reset):

```bash
AWS_PROFILE=root-admin node scripts/setup/create-sample-lambdas.cjs
```

## Security Constraints

- Secret references must be **names only**, never raw values
- UI validates against `/AKIA|BEGIN|password|token-value/i`
- No hardcoded AWS account IDs, model IDs, or role ARNs — resolved at runtime via STS
- Deployment blocked until agent `status = APPROVED`
- All AWS calls use platform credential chain, not user credentials

## Development Notes

- Reset DB (local Postgres): truncate tables or drop/recreate the schema
- Reset DB (mock/test): schema is in-memory, recreated on each server start
- `local-dev` org is auto-seeded at startup when `APP_MODE=local`
- Approval route endpoint: `POST /api/approvals/:taskId/decision` (not `/decide`)
- `GET /api/approvals` returns both tool tasks and agent tasks; `taskCategory` field distinguishes them (`"tool_registration"` vs `"agent_approval"`)
- `versionId` format (legacy static-server): `"{agentId}:{semanticVersion}"` e.g. `"local-test-agent:0.1.0"`
- Inventory scanner returns `PARTIAL` sync status on permission errors; mock Bedrock KB data always included
- Lambda ARN format: discovery stores `function/name` (slash); gateway deployer normalizes to `function:name` (colon) before SDK calls
