# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running on Windows (WSL2)

**Quickstart — double-click `start.bat`** from Windows Explorer, or run from cmd:
```bat
start.bat
```
This kills any previous instances, opens two WSL terminal windows (API + frontend), waits for them to start, then opens the app in your browser automatically.

| Service | URL |
|---|---|
| Frontend | http://localhost:5174 |
| API | http://localhost:4201 |

**Manual start (two WSL terminals):**
```bash
# Terminal 1 — API server
npm run api

# Terminal 2 — Frontend dev server
npm run dev
```

**Background script (WSL only):**
```bash
scripts/start-dev.sh
```

## Other Commands

```bash
# Production build
npm run build

# Preview production build (serves built dist/ with live API)
npm run preview
```

The frontend proxies `/api/*` to the API server. Both must be running for the app to work.

To rename the platform (default: "Pegasus"), set `VITE_PLATFORM_NAME` for the frontend and `PLATFORM_NAME` or `VITE_PLATFORM_NAME` for the mock API.

## Architecture

This is a **single-page React app** (Vite + React 19) paired with a **Node.js mock API server** that simulates a real backend.

### Frontend (`src/`)

| File | Role |
|---|---|
| `src/App.jsx` | The entire frontend — all views, state, and UI logic live here |
| `src/main.jsx` | React entry point |
| `src/app.js` | Shared constants / helpers (if any) |

All UI is in one file. The platform name, project catalog, and agent type constants are defined at the top of `App.jsx` and read from `VITE_PLATFORM_NAME` at build time.

### Mock API (`scripts/static-server.cjs`)

A plain Node.js `http` server that:
- Serves `/api/*` routes (agent registry, approvals, validations, audit)
- Serves static files from `dist/` (production) or the repo root (dev)
- Persists state to `backend/control-plane/data/agent-registry.json`

Key API routes:
- `GET /api/agents` — list agents (filterable by `?projectId=`)
- `POST /api/agents` — register agent via form payload
- `POST /api/agents/spec-upload` — register agent via raw YAML
- `GET /api/approvals` — list approval tasks
- `POST /api/approvals/:id/decision` — approve or reject
- `GET /api/agents/:id/validations` — fetch validation results

### Backend Skeleton (`backend/`)

Three planned service boundaries (not yet implemented as live services):
- **`control-plane/`** — agent registry, projects, approvals, tools, KB catalog, secrets, deployments, audit
- **`execution-plane/`** — runtime guard, policy snapshots, AgentCore integration, telemetry
- **`business-user-plane/`** — project workspace, runnable agent catalog, run history

`backend/control-plane/openapi.yaml` and `backend/control-plane/schemas/` define the intended API contracts. `backend/execution-plane/runtime-guard.md` and `backend/business-user-plane/workspace-api.md` are design docs.

### Agent Lifecycle

Agents follow this lifecycle driven by validation results and approval decisions:

`submitted → draft | business_owner_review → platform_admin_review → approved | rejected`

Approval tasks are auto-created based on tool risk tier and validation findings. The `validateAgentSpec` function in `static-server.cjs` is the canonical source of validation logic.

### Agent Spec Schema

Agents are described in a YAML schema versioned as `<platform-slug>.agent/v1` (e.g. `pegasus.agent/v1`). The spec normalizes into a canonical form via `specFromPayload()` before storage.
