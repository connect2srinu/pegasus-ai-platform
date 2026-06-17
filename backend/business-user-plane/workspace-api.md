# Business User Plane API Sketch

The business-user plane exposes project-scoped workspace capabilities.

## Screens Supported

- Project dashboard.
- Runnable agent catalog.
- Agent run launcher.
- Run history.
- Run trace detail.
- Project settings according to role.

## API Sketch

```http
GET /workspace/projects
GET /workspace/projects/{projectId}/summary
GET /workspace/projects/{projectId}/agents/runnable
POST /workspace/projects/{projectId}/agents/{agentId}/invoke
GET /workspace/projects/{projectId}/runs
GET /workspace/projects/{projectId}/runs/{runId}
```

All requests require Entra JWT validation and project membership authorization.

