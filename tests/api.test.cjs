"use strict";

/**
 * Comprehensive HTTP API tests for scripts/server.cjs.
 * Boots the server as a child process on port 4300 with in-memory SQLite.
 * Covers every route added/fixed in this session.
 *
 *   node tests/api.test.cjs          # on demand
 *   npm test                          # runs all test files
 */

process.env.APP_MODE = "mock";
process.env.DB_TYPE  = "sqlite";
process.env.DB_PATH  = ":memory:";
process.env.PORT     = "4300";

const { test, before, after } = require("node:test");
const assert  = require("node:assert/strict");
const http    = require("http");
const { spawn } = require("child_process");
const path    = require("path");

// ── Server lifecycle ──────────────────────────────────────────────────────────

const PORT = 4300;
let serverProc;

before(async () => {
  await new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, [path.join(__dirname, "../scripts/server.cjs")], {
      env: { ...process.env, APP_MODE: "mock", DB_TYPE: "sqlite", DB_PATH: ":memory:", PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProc.stdout.on("data", (d) => {
      if (d.toString().includes("Listening")) resolve();
    });
    serverProc.stderr.on("data", (d) => process.stderr.write(d));
    serverProc.on("error", reject);
    // Fallback: poll until ready if "Listening" log never fires
    setTimeout(() => pollUntilReady(resolve, reject), 2000);
  });
});

function pollUntilReady(resolve, reject) {
  let attempts = 0;
  const iv = setInterval(() => {
    attempts++;
    const req = http.get(`http://localhost:${PORT}/health`, (r) => {
      if (r.statusCode < 500) { clearInterval(iv); resolve(); }
    });
    req.on("error", () => {});
    if (attempts > 20) { clearInterval(iv); reject(new Error("Server didn't start in time")); }
  }, 250);
}

after(() => { if (serverProc) serverProc.kill(); });

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function api(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      { hostname: "localhost", port: PORT, path: urlPath, method,
        headers: { "Content-Type": "application/json" } },
      (res) => {
        const chunks = [];
        res.on("data", c => chunks.push(c));
        res.on("end", () => {
          let parsed;
          try { parsed = JSON.parse(Buffer.concat(chunks).toString()); }
          catch { parsed = {}; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const GET    = (p)    => api("GET",    p);
const POST   = (p, b) => api("POST",   p, b);
const PUT    = (p, b) => api("PUT",    p, b);
const PATCH  = (p, b) => api("PATCH",  p, b);
const DELETE = (p)    => api("DELETE", p);

// ── Shared state — populated as tests run ─────────────────────────────────────

let orgId;           // seeded org id
let devEnvId;        // DEV environment id
let seededProjId;    // seeded "Demo Project" id
let calcLtdId;       // demo_calculator (APPROVED, seeded)
let claimsLtdId;     // demo_claims_api (PENDING, seeded)

let newConnId;       // account connection created in tests
let newProjId;       // project created in tests
let newLtdId;        // tool registered in tests
let newTarId;        // approval task for registered tool
let newEtdId;        // ETD created in tests
let newGrantId;      // project_tool_grant created in tests
let publishedAgentId;  // agent created via /api/agents/publish
let agentAarId;        // agent_approval_request id from publish

// ── 1. Health ─────────────────────────────────────────────────────────────────

test("GET /health returns ok", async () => {
  const r = await GET("/health");
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "ok");
  assert.equal(r.body.mode, "mock");
});

// ── 2. Identity ───────────────────────────────────────────────────────────────

test("GET /api/identity/me returns mock user", async () => {
  const r = await GET("/api/identity/me");
  assert.equal(r.status, 200);
  assert.ok(r.body.userId);
  assert.ok(Array.isArray(r.body.roles));
});

// ── 3. Organizations ──────────────────────────────────────────────────────────

test("GET /api/organizations returns seeded org", async () => {
  const r = await GET("/api/organizations");
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.organizations));
  assert.ok(r.body.organizations.length >= 1);
  orgId = r.body.organizations[0].id;
  assert.ok(orgId);
});

test("GET /api/organizations/:orgId returns org wrapped in 'organization' key with projects", async () => {
  const r = await GET(`/api/organizations/${orgId}`);
  assert.equal(r.status, 200);
  assert.ok(r.body.organization, "must have 'organization' wrapper key");
  assert.equal(r.body.organization.id, orgId);
  assert.ok(Array.isArray(r.body.organization.projects), "org must embed projects array");
});

test("POST /api/organizations creates new org", async () => {
  const r = await POST("/api/organizations", { name: "Test Suite Org", description: "api test" });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  assert.equal(r.body.name, "Test Suite Org");
});

test("PATCH /api/organizations/:orgId updates org", async () => {
  const r = await PATCH(`/api/organizations/${orgId}`, { description: "updated by api test" });
  assert.equal(r.status, 200);
  assert.equal(r.body.description, "updated by api test");
});

// ── 4. Environments ───────────────────────────────────────────────────────────

test("GET /api/organizations/:orgId/environments returns DEV STAGING PROD", async () => {
  const r = await GET(`/api/organizations/${orgId}/environments`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.environments));
  const types = r.body.environments.map(e => e.environmentType);
  assert.ok(types.includes("DEV"),     "must have DEV");
  assert.ok(types.includes("STAGING"), "must have STAGING");
  assert.ok(types.includes("PROD"),    "must have PROD");
  devEnvId = r.body.environments.find(e => e.environmentType === "DEV").id;
});

// ── 5. Account Connections ────────────────────────────────────────────────────

test("POST /api/organizations/:orgId/account-connections creates connection", async () => {
  const r = await POST(`/api/organizations/${orgId}/account-connections`, {
    awsAccountId: "111122223333",
    accountName: "Test Account",
    discoveryRoleArn: "arn:aws:iam::111122223333:role/DiscoveryRole",
    provisioningRoleArn: "arn:aws:iam::111122223333:role/ProvisioningRole",
    region: "us-east-1",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.connection?.id);
  newConnId = r.body.connection.id;
  assert.equal(r.body.connection.awsAccountId, "111122223333");
  assert.equal(r.body.connection.status, "PENDING_SYNC");
});

test("POST account-connections rejects secret-looking externalIdRef", async () => {
  const r = await POST(`/api/organizations/${orgId}/account-connections`, {
    awsAccountId: "999999999999",
    discoveryRoleArn: "arn:aws:iam::999::role/R",
    externalIdRef: "AKIAIOSFODNN7EXAMPLE",
  });
  assert.equal(r.status, 400);
  assert.ok(r.body.error, "must return error message");
});

test("GET /api/organizations/:orgId/account-connections lists connections", async () => {
  const r = await GET(`/api/organizations/${orgId}/account-connections`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.connections));
  assert.ok(r.body.connections.find(c => c.id === newConnId), "newly created connection must appear");
});

test("GET /api/organizations/:orgId/account-connections/:connId returns single", async () => {
  const r = await GET(`/api/organizations/${orgId}/account-connections/${newConnId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.id, newConnId);
});

test("GET /api/organizations/:orgId/account-connections/:connId with unknown id returns 404", async () => {
  const r = await GET(`/api/organizations/${orgId}/account-connections/no-such-conn`);
  assert.equal(r.status, 404);
});

test("PUT /api/organizations/:orgId/account-connections/:connId updates connection", async () => {
  const r = await PUT(`/api/organizations/${orgId}/account-connections/${newConnId}`, {
    accountName: "Updated Name",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.connection.accountName, "Updated Name");
});

test("POST /api/.../account-connections/:connId/sync runs discovery", async () => {
  const r = await POST(`/api/organizations/${orgId}/account-connections/${newConnId}/sync`);
  assert.equal(r.status, 200);
  assert.ok(r.body.syncRun?.id);
  assert.ok(typeof r.body.resourcesDiscovered === "number");
});

test("GET /api/.../account-connections/:connId/sync-runs returns list after sync", async () => {
  const r = await GET(`/api/organizations/${orgId}/account-connections/${newConnId}/sync-runs`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.syncRuns));
  assert.ok(r.body.syncRuns.length >= 1, "should have at least one sync run");
});

// ── 6. Discovered Resources ───────────────────────────────────────────────────

test("GET /api/organizations/:orgId/discovered-resources returns seeded resources", async () => {
  const r = await GET(`/api/organizations/${orgId}/discovered-resources`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.resources));
  assert.ok(r.body.resources.length >= 1);
});

// ── 7. Projects ───────────────────────────────────────────────────────────────

test("GET /api/organizations/:orgId/projects lists seeded Demo Project", async () => {
  const r = await GET(`/api/organizations/${orgId}/projects`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.projects));
  assert.ok(r.body.projects.length >= 1);
  seededProjId = r.body.projects[0].id;
});

test("POST /api/organizations/:orgId/projects creates project", async () => {
  const r = await POST(`/api/organizations/${orgId}/projects`, {
    name: "API Test Project",
    description: "created by api test suite",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  assert.equal(r.body.name, "API Test Project");
  assert.equal(r.body.organizationId, orgId);
  newProjId = r.body.id;
});

test("GET /api/organizations/:orgId shows new project in embedded projects list", async () => {
  const r = await GET(`/api/organizations/${orgId}`);
  assert.equal(r.status, 200);
  const found = r.body.organization.projects.find(p => p.id === newProjId);
  assert.ok(found, "newly created project must appear in org.projects");
});

test("GET /api/organizations/:orgId/projects/:projectId returns single project", async () => {
  const r = await GET(`/api/organizations/${orgId}/projects/${seededProjId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, seededProjId);
});

// ── 8. Logical Tools — read seeded data ──────────────────────────────────────

test("GET /api/organizations/:orgId/logical-tools returns tools with environmentDeployments", async () => {
  const r = await GET(`/api/organizations/${orgId}/logical-tools`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.logicalToolDefinitions), "must return 'logicalToolDefinitions' key");
  assert.ok(r.body.logicalToolDefinitions.length >= 2, "should have at least 2 seeded tools");

  const calc = r.body.logicalToolDefinitions.find(t => t.toolKey === "demo_calculator");
  assert.ok(calc, "demo_calculator must be present");
  assert.equal(calc.approvalStatus, "APPROVED");
  assert.ok(Array.isArray(calc.environmentDeployments), "must embed environmentDeployments");
  calcLtdId = calc.id;

  const claims = r.body.logicalToolDefinitions.find(t => t.toolKey === "demo_claims_api");
  assert.ok(claims, "demo_claims_api must be present");
  assert.ok(
    ["PENDING", "PENDING_APPROVAL"].includes(claims.approvalStatus),
    `claims approvalStatus should be pending-like, got: ${claims.approvalStatus}`
  );
  claimsLtdId = claims.id;
});

test("GET /api/organizations/:orgId/logical-tools/:ltdId returns single tool", async () => {
  const r = await GET(`/api/organizations/${orgId}/logical-tools/${calcLtdId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.id, calcLtdId);
  assert.equal(r.body.toolKey, "demo_calculator");
  assert.ok(Array.isArray(r.body.environmentDeployments));
});

test("GET /api/organizations/:orgId/logical-tools/:ltdId with unknown id returns 404", async () => {
  const r = await GET(`/api/organizations/${orgId}/logical-tools/no-such-ltd`);
  assert.equal(r.status, 404);
});

// ── 9. Tool Registration + Approval Flow ─────────────────────────────────────

test("POST /api/organizations/:orgId/logical-tools registers tool + creates approval task", async () => {
  const r = await POST(`/api/organizations/${orgId}/logical-tools`, {
    toolKey: "api_test_payment_tool",
    displayName: "API Test Payment Tool",
    sourceType: "LAMBDA",
    sourceResourceArn: "arn:aws:lambda:us-east-1:111122223333:function:payment-api",
    description: "Payment tool registered by API tests",
    dataClassification: "internal",
    sideEffectLevel: "WRITE",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  assert.ok(Array.isArray(r.body.approvalTasks), "response must include approvalTasks array");
  assert.equal(r.body.approvalTasks.length, 1);
  newLtdId = r.body.id;
  newTarId = r.body.approvalTasks[0].id;
  assert.equal(r.body.approvalTasks[0].status, "pending");
});

test("GET /api/approvals returns pending tasks including new registration", async () => {
  const r = await GET(`/api/approvals?organizationId=${orgId}&scope=org`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.approvalTasks));

  const task = r.body.approvalTasks.find(t => t.id === newTarId);
  assert.ok(task, "newly registered tool's TAR must appear in approvals");
  assert.equal(task.status, "pending");
  assert.ok(task._ltd, "task must include _ltd enrichment");
  assert.ok(task._trr, "task must include _trr enrichment");
  assert.equal(task.taskCategory, "tool_registration");
  assert.equal(task.approverType, "org_admin");
});

test("GET /api/approvals?status=pending filters to pending only", async () => {
  const r = await GET(`/api/approvals?organizationId=${orgId}&status=pending`);
  assert.equal(r.status, 200);
  assert.ok(r.body.approvalTasks.every(t => t.status === "pending"),
    "all returned tasks must have status=pending");
});

test("POST /api/approvals/:taskId/decision approves the tool", async () => {
  const r = await POST(`/api/approvals/${newTarId}/decision`, {
    decision: "approved",
    comments: "Approved by automated test suite",
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.approvalTask);
  assert.equal(r.body.approvalTask.status, "approved");
});

test("tool approvalStatus is APPROVED after decision", async () => {
  const r = await GET(`/api/organizations/${orgId}/logical-tools/${newLtdId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.approvalStatus, "APPROVED");
});

test("approved task no longer appears in pending filter", async () => {
  const r = await GET(`/api/approvals?organizationId=${orgId}&status=pending`);
  assert.equal(r.status, 200);
  const stillPending = r.body.approvalTasks.find(t => t.id === newTarId);
  assert.ok(!stillPending, "approved task must not appear in pending filter");
});

test("rejection flow: register → reject → REJECTED status", async () => {
  const reg = await POST(`/api/organizations/${orgId}/logical-tools`, {
    toolKey: "reject_test_xyz_abc",
    displayName: "Reject Test Tool",
    sourceType: "LAMBDA",
  });
  assert.equal(reg.status, 201);
  const rejTarId = reg.body.approvalTasks[0].id;
  const rejLtdId = reg.body.id;

  const rej = await POST(`/api/approvals/${rejTarId}/decision`, {
    decision: "rejected",
    comments: "Does not meet requirements",
  });
  assert.equal(rej.status, 200);
  assert.equal(rej.body.approvalTask.status, "rejected");

  const tool = await GET(`/api/organizations/${orgId}/logical-tools/${rejLtdId}`);
  assert.equal(tool.status, 200);
  assert.equal(tool.body.approvalStatus, "REJECTED");
});

// ── 10. Environment Deployments ───────────────────────────────────────────────

test("GET /api/.../logical-tools/:ltdId/env-deployments returns seeded ETDs", async () => {
  const r = await GET(`/api/organizations/${orgId}/logical-tools/${calcLtdId}/env-deployments`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.environmentDeployments));
  assert.ok(r.body.environmentDeployments.length >= 1, "calculator should have a seeded DEV ETD");
});

test("POST /api/.../logical-tools/:ltdId/env-deployments creates ETD", async () => {
  const r = await POST(`/api/organizations/${orgId}/logical-tools/${newLtdId}/env-deployments`, {
    environmentId: devEnvId,
    awsAccountConnectionId: newConnId,
    sourceResourceArn: "arn:aws:lambda:us-east-1:111122223333:function:payment-api",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.environmentToolDeployment?.id);
  newEtdId = r.body.environmentToolDeployment.id;
  assert.equal(r.body.environmentToolDeployment.environmentId, devEnvId);
});

// ── 11. Deploy to Gateway ─────────────────────────────────────────────────────

test("POST deploy-to-gateway deploys approved tool (mock returns ACTIVE)", async () => {
  const r = await POST(`/api/organizations/${orgId}/logical-tools/${newLtdId}/deploy-to-gateway`, {
    environmentId: devEnvId,
    sourceResourceArn: "arn:aws:lambda:us-east-1:111122223333:function:payment-api",
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.targetId, "must return targetId");
  assert.ok(r.body.etd, "must return updated etd");
  assert.equal(r.body.etd.deploymentStatus, "ACTIVE");
});

// ── 12. Project Tool Routes ───────────────────────────────────────────────────

test("GET /api/projects/:projectId/tools returns list", async () => {
  const r = await GET(`/api/projects/${seededProjId}/tools`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.tools));
});

test("GET /api/projects/:projectId/knowledge returns list", async () => {
  const r = await GET(`/api/projects/${seededProjId}/knowledge`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.knowledge));
});

test("GET /api/projects/:projectId/project-tools includes seeded calculator grant", async () => {
  const r = await GET(`/api/projects/${seededProjId}/project-tools`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.projectTools));
  const calc = r.body.projectTools.find(t => t.logicalToolDefinitionId === calcLtdId);
  assert.ok(calc, "seeded calculator grant must appear in project-tools");
  assert.equal(calc.sourceType, "ORG_TOOL_GRANT");
});

test("GET /api/projects/:projectId/available-org-tools returns approved + deployed ungranted tools", async () => {
  const r = await GET(`/api/projects/${newProjId}/available-org-tools`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.availableTools));
  // calculator is APPROVED+ACTIVE, not yet granted to newProjId
  const calc = r.body.availableTools.find(t => t.id === calcLtdId);
  assert.ok(calc, "approved + deployed calculator must be available to new project");
  // our new test tool is also approved + deployed after earlier tests
  const newTool = r.body.availableTools.find(t => t.id === newLtdId);
  assert.ok(newTool, "test tool (approved + deployed) must be available");
});

test("POST /api/projects/:projectId/enable-org-tool grants approved tool to project", async () => {
  const r = await POST(`/api/projects/${newProjId}/enable-org-tool`, {
    logicalToolDefinitionId: newLtdId,
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.projectToolGrant?.id);
  newGrantId = r.body.projectToolGrant.id;
  assert.equal(r.body.projectToolGrant.status, "ACTIVE");
});

test("POST enable-org-tool returns 409 on duplicate grant", async () => {
  const r = await POST(`/api/projects/${newProjId}/enable-org-tool`, {
    logicalToolDefinitionId: newLtdId,
  });
  assert.equal(r.status, 409);
});

test("POST enable-org-tool blocks unapproved tool (PENDING)", async () => {
  const r = await POST(`/api/projects/${newProjId}/enable-org-tool`, {
    logicalToolDefinitionId: claimsLtdId,
  });
  assert.equal(r.status, 409);
  assert.ok(r.body.error, "must return error explaining why");
});

test("GET /api/projects/:projectId/project-tools shows newly granted tool", async () => {
  const r = await GET(`/api/projects/${newProjId}/project-tools`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.projectTools));
  const found = r.body.projectTools.find(t => t.logicalToolDefinitionId === newLtdId);
  assert.ok(found, "enabled tool must appear in project-tools");
  assert.equal(found.sourceType, "ORG_TOOL_GRANT");
});

test("GET /api/projects/:projectId/available-org-tools excludes already-granted tool", async () => {
  const r = await GET(`/api/projects/${newProjId}/available-org-tools`);
  assert.equal(r.status, 200);
  const found = r.body.availableTools.find(t => t.id === newLtdId);
  assert.ok(!found, "already-granted tool must not appear in available-org-tools");
});

// ── 13. Tool Grant CRUD ───────────────────────────────────────────────────────

test("GET /api/projects/:projectId/tool-grants lists grants", async () => {
  const r = await GET(`/api/projects/${newProjId}/tool-grants`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.grants));
  assert.ok(r.body.grants.find(g => g.id === newGrantId));
});

test("DELETE /api/projects/:projectId/tool-grants/:grantId revokes grant", async () => {
  const r = await DELETE(`/api/projects/${newProjId}/tool-grants/${newGrantId}`);
  assert.equal(r.status, 200);
});

test("revoked tool no longer in project-tools", async () => {
  const r = await GET(`/api/projects/${newProjId}/project-tools`);
  assert.equal(r.status, 200);
  const found = r.body.projectTools.find(t => t.logicalToolDefinitionId === newLtdId);
  assert.ok(!found, "revoked tool must not appear in project-tools");
});

// ── 14. Agents ────────────────────────────────────────────────────────────────

test("GET /api/projects/:projectId/agents returns seeded agent", async () => {
  const r = await GET(`/api/projects/${seededProjId}/agents`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.agents));
  assert.ok(r.body.agents.length >= 1, "seeded Demo Assistant should be present");
});

test("POST /api/projects/:projectId/agents creates agent", async () => {
  const r = await POST(`/api/projects/${newProjId}/agents`, {
    name: "Test API Agent",
    description: "created by api test",
    modelId: "anthropic.claude-haiku-4-5-20251001",
    systemPrompt: "You are a helpful test assistant.",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.id);
  assert.equal(r.body.name, "Test API Agent");
});

// ── 15. Members ───────────────────────────────────────────────────────────────

test("GET /api/organizations/:orgId/members returns members", async () => {
  const r = await GET(`/api/organizations/${orgId}/members`);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.members));
  assert.ok(r.body.members.length >= 1, "seeded org admin must be a member");
});

// ── 16. LLM Completions ───────────────────────────────────────────────────────

test("POST /api/llm/complete returns mock text", async () => {
  const r = await POST("/api/llm/complete", {
    task: "generate-system-prompt",
    context: { agentName: "TestBot", description: "test assistant" },
  });
  assert.equal(r.status, 200);
  assert.ok(typeof r.body.text === "string" && r.body.text.length > 0);
  assert.equal(r.body.isMock, true);
});

// ── 17. Org-level grants (OrgToolRegistry flow) ───────────────────────────────

test("POST /api/organizations/:orgId/logical-tools/:ltdId/grants grants tool to project", async () => {
  // Re-grant the revoked tool via the org-level grants endpoint
  const r = await POST(`/api/organizations/${orgId}/logical-tools/${newLtdId}/grants`, {
    projectId: newProjId,
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.projectToolGrant?.id || r.body.grant?.id);
  // Re-capture grantId for cleanup check
  newGrantId = (r.body.projectToolGrant || r.body.grant).id;
});

test("org grants endpoint returns 409 on duplicate", async () => {
  const r = await POST(`/api/organizations/${orgId}/logical-tools/${newLtdId}/grants`, {
    projectId: newProjId,
  });
  assert.equal(r.status, 409);
});

test("org grants endpoint returns 409 for unapproved tool", async () => {
  const r = await POST(`/api/organizations/${orgId}/logical-tools/${claimsLtdId}/grants`, {
    projectId: newProjId,
  });
  assert.equal(r.status, 409);
});

test("org grants endpoint returns 404 for unknown project", async () => {
  const r = await POST(`/api/organizations/${orgId}/logical-tools/${calcLtdId}/grants`, {
    projectId: "no-such-project",
  });
  assert.equal(r.status, 404);
});

// ── 18. Agent authoring — publish + approval queue ───────────────────────────

// MANIFEST_YAML is built inside tests that need seededProjId (set at runtime)
function buildManifest(pid) { return `schemaVersion: guardian.agent/v1
id: test-claim-agent
name: Claim Test Agent
version: 0.1.0
projectId: ${pid}
runtime:
  target: agentcore
  framework: strands
  entrypoint: agent.py
model:
  provider: bedrock
  modelId: anthropic.claude-haiku-4-5-20251001
systemPrompt: |
  You handle claims.
tools: []
knowledge: []
memory:
  shortTerm: true
  longTerm: false
policies:
  riskTier: medium
  humanApprovalRequired: false
  dataClassification: internal`; }

test("POST /api/agents/publish creates agent + 2 approval tasks", async () => {
  const r = await POST("/api/agents/publish", {
    manifest: buildManifest(seededProjId),
    projectId: seededProjId,
    submittedBy: "author@example.com",
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.agentId, "agentId returned");
  assert.equal(r.body.agent.status, "SUBMITTED");
  assert.equal(r.body.approvalTasks.length, 2, "two approval tasks created");
  const types = r.body.approvalTasks.map((t) => t.approverType).sort();
  assert.deepEqual(types, ["business_owner", "platform_admin"]);
  publishedAgentId = r.body.agentId;
  agentAarId = r.body.approvalTasks[0].id;
});

test("GET /api/approvals includes published agent tasks", async () => {
  const r = await GET(`/api/approvals?organizationId=${orgId}`);
  assert.equal(r.status, 200);
  const agentTasks = r.body.approvalTasks.filter((t) => t.agentId === publishedAgentId);
  assert.equal(agentTasks.length, 2, "both agent tasks appear in queue");
  assert.ok(agentTasks.every((t) => t.status === "pending"));
});

test("POST /api/approvals/:aarId/decision approves first agent task", async () => {
  const r = await POST(`/api/approvals/${agentAarId}/decision`, {
    decision: "approved",
    approver: "boss@example.com",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.approvalTask.status, "approved");
});

test("agent stays SUBMITTED until all tasks approved", async () => {
  const r = await GET(`/api/projects/${seededProjId}/agents/${publishedAgentId}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.status, "SUBMITTED", "still SUBMITTED with one task pending");
});

test("approving second task promotes agent to APPROVED", async () => {
  const allR = await GET(`/api/approvals?organizationId=${orgId}`);
  const second = allR.body.approvalTasks.find(
    (t) => t.agentId === publishedAgentId && t.status === "pending"
  );
  assert.ok(second, "second task is still pending");
  const r = await POST(`/api/approvals/${second.id}/decision`, {
    decision: "approved",
    approver: "admin@example.com",
  });
  assert.equal(r.status, 200);
  const agentR = await GET(`/api/projects/${seededProjId}/agents/${publishedAgentId}`);
  assert.equal(agentR.body.status, "APPROVED");
});

// ── 19. 404 Guards ────────────────────────────────────────────────────────────

test("unknown route returns 404", async () => {
  const r = await GET("/api/this-does-not-exist");
  assert.equal(r.status, 404);
});
