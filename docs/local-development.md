# Local Development Guide

This guide explains how to run the Guardian AI Platform locally with zero cloud connectivity requirements.

---

## Quick Start (Mock Mode — Fully Offline)

No AWS account, no Postgres, no Docker required.

```bash
# 1. Install dependencies
npm install

# 2. Start API + UI
APP_MODE=mock npm run dev:mock
```

The API boots with SQLite as the database and all cloud integrations replaced by mock providers.
A starter organization, environments, projects, tools, and a sample agent are seeded automatically on first boot.

Open http://localhost:5174 — the app is fully functional.

---

## Runtime Modes

| Mode | Database | AWS | AgentCore | LLM | Identity |
|------|----------|-----|-----------|-----|----------|
| `mock` | SQLite (local file) | mock | mock | mock | mock |
| `local` | Postgres (Docker) | mock | mock | mock | mock |
| `dev` | Postgres (real) | real | real | real | real |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `APP_MODE` | `mock` | `mock`, `local`, or `dev` |
| `DB_TYPE` | `sqlite` (mock), `postgres` (local/dev) | Override the DB type |
| `DB_PATH` | `.guardian-dev.db` | SQLite file path |
| `DB_URL` | `postgres://guardian:guardian@localhost:5432/guardian_dev` | Postgres connection string |
| `USE_REAL_AWS` | `false` | Set `true` to call real AWS APIs |
| `USE_REAL_AGENTCORE` | `false` | Set `true` to register real AgentCore Gateway targets |
| `USE_REAL_LLM` | `false` | Set `true` to call Bedrock for LLM completions |
| `USE_MOCK_IDENTITY` | `true` | Set `false` to use real identity (Cognito/OIDC — not yet wired) |
| `PORT` | `4201` | API server port |
| `HOST` | `0.0.0.0` | Bind address |
| `SEED_ORG_NAME` | `Demo Org` | Name of the org created on first boot |
| `SEED_ORG_EMAIL` | `admin@example.com` | Owner email for the seeded org |

Copy the relevant env file and adjust as needed:

```bash
cp .env.mock .env       # mock mode (default)
cp .env.local .env      # local Postgres
cp .env.dev .env        # connected dev
```

---

## Mode 1: Mock Mode (Default)

```bash
APP_MODE=mock npm run dev:mock
```

- **Database:** SQLite file at `.guardian-dev.db` (auto-created)
- **AWS discovery:** returns resources from the SQLite `discovered_resources` table (seeded)
- **AgentCore Gateway:** simulates registration; returns mock target IDs
- **LLM:** returns canned responses for all `tools/call` requests
- **Identity:** fixed dev user `mock-user-001` / `admin@example.com` with `ORG_ADMIN` and `PROJECT_ADMIN` roles on all orgs

The SQLite file persists between restarts. Delete it to reset to seed state:

```bash
rm .guardian-dev.db && APP_MODE=mock npm run dev:mock
```

---

## Mode 2: Local DB Mode (Postgres via Docker)

Useful when you want to test against a real relational schema.

```bash
# 1. Start Postgres
docker compose up -d postgres

# 2. Wait for healthy (takes ~5s)
docker compose ps

# 3. Start the app
APP_MODE=local npm run dev:local
```

Postgres runs on `localhost:5432` with credentials `guardian / guardian / guardian_dev`.
The schema is applied automatically at startup. The same seed script runs on first boot.

To reset:

```bash
docker compose down -v && docker compose up -d postgres
```

---

## Mode 3: Connected Dev Mode

```bash
# Export real credentials
export AWS_PROFILE=myprofile
export AWS_REGION=us-east-1

# Copy and edit the env file
cp .env.dev .env
# Edit DB_URL to point to your real Postgres instance

npm run dev:connected
```

In connected dev mode, `USE_REAL_AWS=true` means the app will call real AWS APIs for resource discovery. `USE_REAL_AGENTCORE=true` means Gateway targets are registered in real Bedrock AgentCore.

Required IAM permissions on the deployment role are documented in `scripts/setup/`.

---

## Seed Data

The seed script runs automatically on server boot when the database is empty. To customize the seeded org:

```bash
SEED_ORG_NAME="Acme Corp" SEED_ORG_EMAIL="admin@acme.com" APP_MODE=mock npm run dev:mock
```

To re-seed after deleting data:

```bash
# SQLite
rm .guardian-dev.db

# Postgres
docker compose down -v && docker compose up -d postgres
```

You can also seed manually:

```bash
APP_MODE=mock node backend/runtime/db/seed.cjs
```

---

## Running Tests

```bash
# Unit + integration tests against in-memory SQLite (no server required)
npm test

# Or run directly
node tests/mock-mode.test.cjs
```

Tests use Node's built-in test runner (`node:test`) — no Jest or Mocha required.

---

## Project Structure

```
backend/
  runtime/
    config.cjs               ← reads env vars, exports typed config
    providers.cjs            ← provider factory (identity, aws, agentcore, llm)
    db/
      index.cjs              ← DB factory (returns sqlite or postgres adapter)
      sqlite-adapter.cjs     ← better-sqlite3 adapter
      postgres-adapter.cjs   ← pg pool adapter
      schema.sql             ← SQLite DDL
      schema-postgres.sql    ← Postgres DDL
      seed.cjs               ← idempotent seed script
    providers/
      identity/mock.cjs      ← fixed dev user
      aws/mock.cjs           ← mock resource discovery
      aws/real.cjs           ← delegates to scripts/services/
      agentcore/mock.cjs     ← in-process MCP simulation
      llm/mock.cjs           ← canned LLM responses
      llm/real.cjs           ← AWS Bedrock

scripts/
  server.cjs                 ← provider-aware API server (all modes)
  static-server.cjs          ← legacy JSON-file server (still works; used by start-dev.sh)
  start-dev.sh               ← starts legacy server + Vite

docs/
  local-development.md       ← this file

tests/
  mock-mode.test.cjs         ← unit + flow tests (all in-process, no HTTP)

docker-compose.yml           ← Postgres for local mode
.env.mock                    ← mock mode env template
.env.local                   ← local Postgres env template
.env.dev                     ← connected dev env template
```

---

## API Contracts

The API surface is identical across all modes. The UI does not know which mode the backend is running in. Key endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check + mode info |
| GET | `/api/organizations` | List orgs (enriched with projects) |
| POST | `/api/organizations` | Create org |
| GET | `/api/organizations/:orgId/environments` | Environments for org |
| GET | `/api/organizations/:orgId/members` | Org members |
| GET | `/api/organizations/:orgId/account-connections` | AWS account connections |
| POST | `/api/organizations/:orgId/account-connections` | Add AWS account connection |
| POST | `/api/organizations/:orgId/account-connections/:connId/sync` | Trigger inventory sync |
| GET | `/api/organizations/:orgId/discovered-resources` | Discovered AWS resources |
| GET | `/api/organizations/:orgId/logical-tools` | Org tool registry |
| POST | `/api/organizations/:orgId/logical-tools` | Register tool (auto-creates approval task) |
| POST | `/api/organizations/:orgId/logical-tools/:ltdId/approve` | Direct-approve tool (legacy) |
| POST | `/api/organizations/:orgId/logical-tools/:ltdId/reject` | Direct-reject tool (legacy) |
| POST | `/api/organizations/:orgId/logical-tools/:ltdId/deploy-to-gateway` | Deploy tool to AgentCore Gateway |
| POST | `/api/organizations/:orgId/logical-tools/:ltdId/grants` | Grant approved tool to project |
| GET | `/api/approvals` | List all pending approval tasks (tool + agent; `taskCategory` field distinguishes) |
| POST | `/api/approvals/:taskId/decision` | Approve or reject any task: `{ decision, comments }` |
| GET | `/api/projects/:projectId/agents` | List agents in project |
| POST | `/api/projects/:projectId/agents` | Create agent (DRAFT) |
| GET | `/api/projects/:projectId/agents/:agentId` | Get agent detail |
| PATCH | `/api/projects/:projectId/agents/:agentId` | Update agent |
| POST | `/api/projects/:projectId/agents/:agentId/deploy` | Deploy APPROVED agent to AgentCore |
| GET | `/api/projects/:projectId/project-tools` | Tools with ACTIVE grants for this project |
| GET | `/api/projects/:projectId/available-org-tools` | Approved org tools not yet granted to project |
| GET | `/api/projects/:projectId/tool-grants` | All grants for project |
| DELETE | `/api/projects/:projectId/tool-grants/:grantId` | Revoke grant |
| POST | `/api/agents/publish` | Publish agent from Author Wizard (creates SUBMITTED + 2 approval tasks) |
| POST | `/api/agents/generate` | Generate Strands Python code from manifest YAML |
| POST | `/api/llm/complete` | LLM completion (canned mock or real Bedrock) |
| POST | `/mock-mcp` | MCP JSON-RPC 2.0 endpoint (mock AgentCore — `initialize`, `tools/list`, `tools/call`) |

---

## Switching Modes Without Restarting

The mode is read at startup. To switch, restart the server with a different `APP_MODE`:

```bash
# from mock to local
docker compose up -d postgres
APP_MODE=local node scripts/server.cjs
```

Data is **not** migrated between SQLite and Postgres automatically. Re-run the seed or import manually if needed.
