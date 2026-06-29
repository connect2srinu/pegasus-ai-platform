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
| Backend | Node.js http server (`scripts/static-server.cjs`, CommonJS) |
| Execution | AWS Bedrock AgentCore Runtime |
| Agent framework | Strands SDK (Python), CrewAI |
| Storage | JSON file registry (`backend/control-plane/data/agent-registry.json`) |

## Running Locally

```bash
# Start dev server (Vite frontend + Node control plane on port 4201)
npm run dev

# OR start just the control plane API
node scripts/static-server.cjs
```

Server runs at **http://localhost:4201** (both UI and API on the same port).

### Local AWS Mode

Set `LOCAL_AWS_MODE=true` in `.env.local`:

```
LOCAL_AWS_MODE=true
AWS_REGION=us-east-1
```

Reads `~/.aws/credentials` via the default credential provider chain.
At startup resolves account ID via STS and lists available Bedrock models.

## Architecture

### Frontend (`src/`)
- `src/App.jsx` — root layout, sidebar nav, org switcher
- `src/components/control-plane/` — agent registry, approvals, deploy, tools, AddToolWizard
- `src/components/org/` — OrgDetail with tabs (Projects, Members, Connected Accounts, Platform AWS Config), InventoryCatalog, AwsAccountConnectionForm
- `src/components/author/` — 5-step agent authoring wizard (generates Strands Python code)
- `src/constants.js` — shared enums (resource types, discovery status, Bedrock models, RBAC roles)

### Backend (`scripts/`)
- `scripts/static-server.cjs` — monolithic Node.js control plane API + static file server
- `scripts/services/aws-client.cjs` — STS identity resolution, single-account AWS config builder
- `scripts/services/bedrock-client.cjs` — Bedrock model listing with caching
- `scripts/services/agentcore-client.cjs` — full AgentCore deploy pipeline (S3 upload → CreateRuntime → CreateEndpoint → Invoke)
- `scripts/services/inventory-scanner.cjs` — AWS resource discovery; real AWS APIs in local mode, mock data in demo mode
- `scripts/codegen/strands-generator.cjs` — generates Strands Python agent code from spec
- `scripts/codegen/agentcore-wrapper-generator.cjs` — generates AgentCore harness wrapper

### Key API Routes

```
GET  /api/organizations/:id/aws-config
POST /api/agents                                  create agent, triggers approval tasks
POST /api/approvals/:taskId/decision              approve or reject
POST /api/agents/:id/versions/:vid/deploy         async deploy to AgentCore (returns 202)
GET  /api/agents/:id/deployments/:depId           poll deployment status (live from AgentCore)
POST /api/agents/:id/invoke                       invoke deployed agent
GET  /api/local/aws-context                       resolved account/region/models
GET  /api/local/runtimes                          list real AgentCore runtimes in account
POST /api/organizations/:orgId/account-connections/:connId/sync   run real AWS inventory scan
GET  /api/organizations/:orgId/discovered-resources
```

## Agent Lifecycle

```
submitted → business_owner_review → platform_admin_review → approved → deploying → deployed
```

Deploy is **blocked** until `lifecycleState === "approved"`. The deploy route returns 202 immediately;
a background async job runs the real AgentCore SDK calls and updates the registry on completion.
Poll `GET /api/agents/:id/deployments/:depId` for live status.

## AWS Resources (Account 657349741196, us-east-1)

| Resource | Name/ARN |
|---|---|
| AgentCore execution role | `arn:aws:iam::657349741196:role/AgentCoreExecutionRole` |
| S3 artifact bucket | `pegasus-agent-artifacts-657349741196` |
| CloudWatch log group | `/aws/bedrock-agentcore/runtimes` |

## AgentCore Deploy Flow (`codeConfiguration` — no Docker needed)

1. Generate Strands Python code from agent spec
2. Upload `agent.py` to S3 at `agents/{id}/{version}/agent.py`
3. `CreateAgentRuntime` with `codeConfiguration.s3`
4. Poll `GetAgentRuntime` until `status = READY` (up to ~3 min)
5. `CreateAgentRuntimeEndpoint` with `networkMode = PUBLIC`
6. Poll `GetAgentRuntimeEndpoint` until `status = READY`
7. Invoke via `InvokeAgentRuntimeCommand`

## Pending Admin Actions

These scripts need admin IAM credentials (`srini_gadi` lacks `iam:CreateRole` and `lambda:CreateFunction`):

```bash
# 1. Grant srini_gadi dev permissions (Lambda create, API GW read, S3 write on artifact bucket)
bash scripts/grant-srini-dev-permissions.sh

# 2. Create sample Lambda + API Gateway resources for inventory testing
bash scripts/setup-aws-sample-resources.sh
```

After that, click **Sync Now** in Connected Accounts to pull real AWS resource inventory.

## Security Constraints

- Secret references must be **names only**, never raw values
- UI validates against `/AKIA|BEGIN|password|token-value/i`
- No hardcoded AWS account IDs, model IDs, or role ARNs — resolved at runtime via STS
- Deployment blocked until `approvalStatus = approved`
- All AWS calls use platform credential chain, not user credentials

## Development Notes

- Reset registry: delete `backend/control-plane/data/agent-registry.json`
- `local-test-project` is pre-registered in `projectCatalog` (open permissions, all agent types)
- `local-dev` org auto-seeded at startup when `LOCAL_AWS_MODE=true`
- `agentSummary()` response includes `versionId` field needed for deploy/approval routes
- `organizationId` propagated: `specFromPayload` → `buildAgentFromSpec` → stored on agent record
- `versionId` format: `"{agentId}:{semanticVersion}"` e.g. `"local-test-agent:0.1.0"`
- Inventory scanner returns `PARTIAL` sync status on permission errors; mock Bedrock KB data always included
- Approval route endpoint: `POST /api/approvals/:taskId/decision` (not `/decide`)
