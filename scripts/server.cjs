"use strict";

/**
 * Guardian AI Platform — provider-aware API server.
 *
 * Replaces static-server.cjs with a DB-backed implementation that switches
 * providers based on environment variables (APP_MODE, DB_TYPE, USE_REAL_AWS, …).
 *
 * Start:
 *   APP_MODE=mock node scripts/server.cjs          # SQLite, all mock
 *   APP_MODE=local node scripts/server.cjs         # local Postgres, mock cloud
 *   APP_MODE=dev node scripts/server.cjs           # real Postgres + AWS
 */

const http    = require("http");
const { URL } = require("url");
const path    = require("path");
const crypto  = require("crypto");

const config    = require("../backend/runtime/config.cjs");
const { getDb } = require("../backend/runtime/db/index.cjs");
const { seed }  = require("../backend/runtime/db/seed.cjs");
const providers = require("../backend/runtime/providers.cjs");

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(prefix = "id") {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function now() { return new Date().toISOString(); }

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

// camelCase ↔ snake_case coercion for DB rows
function toCamel(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

function toSnake(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snake = k.replace(/([A-Z])/g, c => `_${c.toLowerCase()}`);
    out[snake] = v;
  }
  return out;
}

function rows(result) {
  // sqlite: result.rows; postgres: result.rows
  return (result?.rows || []).map(toCamel);
}

// ── Router ────────────────────────────────────────────────────────────────────

class Router {
  constructor() { this._routes = []; }

  _add(method, pattern, handler) {
    // Convert :param segments to named capture groups
    const regex = new RegExp(
      "^" + pattern.replace(/:([a-zA-Z]+)/g, "(?<$1>[^/]+)") + "$"
    );
    this._routes.push({ method, regex, handler });
  }

  get(p, h)    { this._add("GET",    p, h); }
  post(p, h)   { this._add("POST",   p, h); }
  put(p, h)    { this._add("PUT",    p, h); }
  patch(p, h)  { this._add("PATCH",  p, h); }
  delete(p, h) { this._add("DELETE", p, h); }

  async handle(req, res) {
    const url      = new URL(req.url, `http://localhost`);
    const pathname = url.pathname;
    const method   = req.method.toUpperCase();

    if (method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" });
      return res.end();
    }

    for (const route of this._routes) {
      if (route.method !== method) continue;
      const m = pathname.match(route.regex);
      if (!m) continue;
      const params = m.groups || {};
      const query  = Object.fromEntries(url.searchParams);
      try {
        await route.handler(req, res, params, query, url);
      } catch (e) {
        console.error(`[server] ${method} ${pathname} →`, e.message);
        sendError(res, 500, e.message);
      }
      return;
    }

    sendError(res, 404, `Not found: ${method} ${pathname}`);
  }
}

// ── Route definitions ─────────────────────────────────────────────────────────

async function registerRoutes(router) {
  const db = await getDb();

  // ── Identity ────────────────────────────────────────────────────────────────
  router.get("/api/identity/me", (req, res) => {
    const user = providers.identity.getUser(req);
    sendJson(res, 200, user);
  });

  // ── Organizations ───────────────────────────────────────────────────────────
  async function orgWithProjects(org) {
    const { rows: projs } = await db.query("SELECT * FROM projects WHERE organization_id = ? ORDER BY created_at DESC", [org.id]);
    return { ...toCamel(org), projects: projs.map(toCamel) };
  }

  router.get("/api/organizations", async (req, res) => {
    const { rows: r } = await db.query("SELECT * FROM organizations ORDER BY created_at DESC");
    const organizations = await Promise.all(r.map(orgWithProjects));
    sendJson(res, 200, { organizations });
  });

  router.post("/api/organizations", async (req, res) => {
    const body = await readBody(req);
    if (!body.name) return sendError(res, 400, "name is required");
    const user = providers.identity.getUser(req);
    const slug = (body.slug || body.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const id   = uid("org");
    const org  = { id, name: body.name, slug, description: body.description || null, owner_email: user.email, created_at: now(), updated_at: now() };
    await db.upsert("organizations", org);
    // Auto-create DEV environment
    const envId = uid("env");
    await db.upsert("environments", { id: envId, organization_id: id, name: "Development", environment_type: "DEV", created_at: now() });
    sendJson(res, 201, toCamel(org));
  });

  router.get("/api/organizations/:orgId", async (req, res, { orgId }) => {
    const org = await db.queryOne("SELECT * FROM organizations WHERE id = ?", [orgId]);
    if (!org) return sendError(res, 404, "Organization not found");
    sendJson(res, 200, { organization: await orgWithProjects(org) });
  });

  router.patch("/api/organizations/:orgId", async (req, res, { orgId }) => {
    const body   = await readBody(req);
    const fields = Object.entries(body).filter(([k]) => ["name","description","owner_email"].includes(k));
    if (!fields.length) return sendError(res, 400, "No updatable fields");
    for (const [k, v] of fields)
      await db.run(`UPDATE organizations SET ${k} = ?, updated_at = ? WHERE id = ?`, [v, now(), orgId]);
    const org = await db.queryOne("SELECT * FROM organizations WHERE id = ?", [orgId]);
    sendJson(res, 200, toCamel(org));
  });

  // ── Environments ────────────────────────────────────────────────────────────
  router.get("/api/organizations/:orgId/environments", async (req, res, { orgId }) => {
    const { rows: r } = await db.query("SELECT * FROM environments WHERE organization_id = ? ORDER BY environment_type", [orgId]);
    sendJson(res, 200, { environments: r.map(toCamel) });
  });

  // ── AWS Account Connections (/account-connections is the canonical frontend path) ──
  function connFromBody(body, orgId, userId) {
    return {
      id: uid("conn"), organization_id: orgId,
      environment_id: body.environmentId || null,
      environment_type: body.environmentType || body.environment || "DEV",
      aws_account_id: (body.awsAccountId || "").trim(),
      account_name: (body.accountName || "").trim(),
      region: body.region || "us-east-1",
      discovery_role_arn: (body.discoveryRoleArn || "").trim(),
      deployment_role_arn: (body.deploymentRoleArn || body.provisioningRoleArn || "").trim(),
      provisioning_role_arn: (body.provisioningRoleArn || "").trim(),
      agent_core_gateway_arn: body.agentCoreGatewayArn || null,
      agent_core_gateway_url: body.agentCoreGatewayUrl || null,
      status: "PENDING_SYNC", created_by: userId, created_at: now(), updated_at: now(),
    };
  }

  router.get("/api/organizations/:orgId/account-connections", async (req, res, { orgId }) => {
    const { rows: r } = await db.query("SELECT * FROM aws_account_connections WHERE organization_id = ? ORDER BY created_at DESC", [orgId]);
    sendJson(res, 200, { connections: r.map(toCamel) });
  });

  router.post("/api/organizations/:orgId/account-connections", async (req, res, { orgId }) => {
    const body = await readBody(req);
    if (!body.awsAccountId) return sendError(res, 400, "awsAccountId is required");
    if (!body.discoveryRoleArn) return sendError(res, 400, "discoveryRoleArn is required");
    if (/AKIA|BEGIN|password|token[-_]?value/i.test(body.externalIdRef || ""))
      return sendError(res, 400, "externalIdRef must be a secret reference name, never a raw value");
    const user = providers.identity.getUser(req);
    const conn = connFromBody(body, orgId, user.email);
    await db.upsert("aws_account_connections", conn);
    sendJson(res, 201, { connection: toCamel(conn) });
  });

  router.get("/api/organizations/:orgId/account-connections/:connId", async (req, res, { orgId, connId }) => {
    const row = await db.queryOne("SELECT * FROM aws_account_connections WHERE id = ? AND organization_id = ?", [connId, orgId]);
    if (!row) return sendError(res, 404, "Account connection not found");
    sendJson(res, 200, { connection: toCamel(row) });
  });

  router.put("/api/organizations/:orgId/account-connections/:connId", async (req, res, { orgId, connId }) => {
    const row = await db.queryOne("SELECT * FROM aws_account_connections WHERE id = ? AND organization_id = ?", [connId, orgId]);
    if (!row) return sendError(res, 404, "Account connection not found");
    const body = await readBody(req);
    const updates = {};
    if (body.accountName       !== undefined) updates.account_name        = body.accountName;
    if (body.region            !== undefined) updates.region               = body.region;
    if (body.discoveryRoleArn  !== undefined) updates.discovery_role_arn   = body.discoveryRoleArn;
    if (body.deploymentRoleArn !== undefined) updates.deployment_role_arn  = body.deploymentRoleArn;
    if (body.provisioningRoleArn !== undefined) updates.provisioning_role_arn = body.provisioningRoleArn;
    if (body.agentCoreGatewayArn !== undefined) updates.agent_core_gateway_arn = body.agentCoreGatewayArn;
    if (body.agentCoreGatewayUrl !== undefined) updates.agent_core_gateway_url = body.agentCoreGatewayUrl;
    updates.updated_at = now();
    const sets = Object.keys(updates).map(k => `${k} = ?`).join(", ");
    await db.run(`UPDATE aws_account_connections SET ${sets} WHERE id = ?`, [...Object.values(updates), connId]);
    const updated = await db.queryOne("SELECT * FROM aws_account_connections WHERE id = ?", [connId]);
    sendJson(res, 200, { connection: toCamel(updated) });
  });

  router.post("/api/organizations/:orgId/account-connections/:connId/sync", async (req, res, { orgId, connId }) => {
    const row = await db.queryOne("SELECT * FROM aws_account_connections WHERE id = ? AND organization_id = ?", [connId, orgId]);
    if (!row) return sendError(res, 404, "Account connection not found");
    try {
      const resources = await providers.aws.discoverResources(orgId, connId, toCamel(row));
      // Upsert discovered resources by ARN
      for (const r of resources) {
        await db.run(
          `INSERT INTO discovered_resources (id, organization_id, aws_account_connection_id, resource_type, resource_name, resource_arn, region, discovery_status, last_seen_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at, discovery_status='ACTIVE', updated_at=excluded.updated_at`,
          [r.id || uid("dr"), orgId, connId, r.resource_type || r.resourceType, r.resource_name || r.resourceName, r.resource_arn || r.resourceArn, r.region || row.region, now(), now(), now()]
        );
      }
      await db.run("UPDATE aws_account_connections SET status='CONNECTED', last_successful_sync_at=?, updated_at=? WHERE id=?", [now(), now(), connId]);
      sendJson(res, 200, { syncRun: { id: uid("run"), completedAt: now(), resourcesDiscovered: resources.length }, resourcesDiscovered: resources.length });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  router.get("/api/organizations/:orgId/account-connections/:connId/sync-runs", async (req, res, { orgId, connId }) => {
    const row = await db.queryOne("SELECT * FROM aws_account_connections WHERE id = ? AND organization_id = ?", [connId, orgId]);
    if (!row) return sendError(res, 404, "Account connection not found");
    const syncRuns = row.last_successful_sync_at
      ? [{ id: `run-${connId}`, status: "COMPLETED", completedAt: row.last_successful_sync_at, connectionId: connId }]
      : [];
    sendJson(res, 200, { syncRuns });
  });

  // Keep legacy /aws-connections alias
  router.get("/api/organizations/:orgId/aws-connections", async (req, res, { orgId }) => {
    const { rows: r } = await db.query("SELECT * FROM aws_account_connections WHERE organization_id = ? ORDER BY created_at DESC", [orgId]);
    sendJson(res, 200, { connections: r.map(toCamel) });
  });

  router.post("/api/organizations/:orgId/aws-connections", async (req, res, { orgId }) => {
    const body = await readBody(req);
    const user = providers.identity.getUser(req);
    const conn = connFromBody(body, orgId, user.email);
    await db.upsert("aws_account_connections", conn);
    sendJson(res, 201, toCamel(conn));
  });

  // ── Discovered Resources ────────────────────────────────────────────────────
  router.get("/api/organizations/:orgId/discovered-resources", async (req, res, { orgId }, query) => {
    let sql = "SELECT * FROM discovered_resources WHERE organization_id = ?";
    const params = [orgId];
    if (query.type)   { sql += " AND resource_type = ?"; params.push(query.type); }
    if (query.region) { sql += " AND region = ?"; params.push(query.region); }
    if (query.status) { sql += " AND discovery_status = ?"; params.push(query.status); }
    sql += " ORDER BY resource_name";
    const { rows: r } = await db.query(sql, params);
    sendJson(res, 200, { resources: r.map(toCamel) });
  });

  router.post("/api/organizations/:orgId/discover", async (req, res, { orgId }) => {
    const { rows: conns } = await db.query("SELECT * FROM aws_account_connections WHERE organization_id = ?", [orgId]);
    if (!conns.length) return sendError(res, 400, "No AWS connection found for this org");
    const conn = toCamel(conns[0]);
    try {
      const resources = await providers.aws.discoverResources(orgId, conn.id);
      sendJson(res, 200, { resources, count: resources.length, mock: !config.useRealAws });
    } catch (e) {
      sendError(res, 500, e.message);
    }
  });

  // ── Projects ────────────────────────────────────────────────────────────────
  router.get("/api/organizations/:orgId/projects", async (req, res, { orgId }) => {
    const { rows: r } = await db.query("SELECT * FROM projects WHERE organization_id = ? ORDER BY created_at DESC", [orgId]);
    sendJson(res, 200, { projects: r.map(toCamel) });
  });

  router.post("/api/organizations/:orgId/projects", async (req, res, { orgId }) => {
    const body = await readBody(req);
    if (!body.name) return sendError(res, 400, "name is required");
    const user = providers.identity.getUser(req);
    const proj = { id: uid("proj"), organization_id: orgId, name: body.name, description: body.description || null, created_by: user.email, created_at: now(), updated_at: now() };
    await db.upsert("projects", proj);
    sendJson(res, 201, toCamel(proj));
  });

  router.get("/api/organizations/:orgId/projects/:projectId", async (req, res, { orgId, projectId }) => {
    const proj = await db.queryOne("SELECT * FROM projects WHERE id = ? AND organization_id = ?", [projectId, orgId]);
    if (!proj) return sendError(res, 404, "Project not found");
    sendJson(res, 200, toCamel(proj));
  });

  // ── Org Members ─────────────────────────────────────────────────────────────
  router.get("/api/organizations/:orgId/members", async (req, res, { orgId }) => {
    const { rows: r } = await db.query("SELECT * FROM org_members WHERE organization_id = ?", [orgId]);
    sendJson(res, 200, { members: r.map(toCamel) });
  });

  router.post("/api/organizations/:orgId/members", async (req, res, { orgId }) => {
    const body = await readBody(req);
    if (!body.userEmail) return sendError(res, 400, "userEmail is required");
    const member = { id: uid("mem"), organization_id: orgId, project_id: body.projectId || null, user_id: body.userId || uid("user"), user_email: body.userEmail, role: body.role || "MEMBER", created_at: now() };
    await db.upsert("org_members", member);
    sendJson(res, 201, toCamel(member));
  });

  // ── Logical Tool Definitions ────────────────────────────────────────────────
  router.get("/api/organizations/:orgId/logical-tools", async (req, res, { orgId }, query) => {
    let sql = "SELECT * FROM logical_tool_definitions WHERE organization_id = ?";
    const params = [orgId];
    if (query.approvalStatus) { sql += " AND UPPER(approval_status) = UPPER(?)"; params.push(query.approvalStatus); }
    if (query.sourceType)     { sql += " AND source_type = ?"; params.push(query.sourceType); }
    sql += " ORDER BY created_at DESC";
    const { rows: r } = await db.query(sql, params);
    // Normalize approval_status to match frontend expectations
    const normalizeApproval = (s) => {
      const u = (s || "").toUpperCase();
      if (u === "PENDING") return "PENDING_APPROVAL";
      return u; // APPROVED, REJECTED, PENDING_APPROVAL stay as-is
    };
    // Embed environmentDeployments in each tool (used by OrgToolRegistry for status badges)
    const tools = await Promise.all(r.map(async (row) => {
      const { rows: etds } = await db.query(
        "SELECT * FROM environment_tool_deployments WHERE logical_tool_definition_id = ?", [row.id]
      );
      return { ...toCamel(row), approvalStatus: normalizeApproval(row.approval_status), environmentDeployments: etds.map(toCamel) };
    }));
    sendJson(res, 200, { logicalToolDefinitions: tools, tools });
  });

  router.post("/api/organizations/:orgId/logical-tools", async (req, res, { orgId }) => {
    const body = await readBody(req);
    if (!body.toolKey || !body.displayName) return sendError(res, 400, "toolKey and displayName are required");
    const user = providers.identity.getUser(req);
    const ltd = {
      id: uid("ltd"), organization_id: orgId,
      tool_key: body.toolKey, display_name: body.displayName,
      description: body.description || null, source_type: body.sourceType || "LAMBDA",
      source_resource_arn: body.sourceResourceArn || null,
      input_schema_json: body.inputSchemaJson ? (typeof body.inputSchemaJson === "string" ? body.inputSchemaJson : JSON.stringify(body.inputSchemaJson)) : null,
      business_owner: body.businessOwner || user.email,
      data_classification: body.dataClassification || "internal",
      side_effect_level: body.sideEffectLevel || "READ_ONLY",
      version: body.version || "v1", status: "ACTIVE", approval_status: "pending",
      created_by: user.email, created_at: now(), updated_at: now(),
    };
    await db.upsert("logical_tool_definitions", ltd);

    // Auto-provision ETD for each environment
    const { rows: envs } = await db.query("SELECT * FROM environments WHERE organization_id = ?", [orgId]);
    const { rows: conns } = await db.query("SELECT * FROM aws_account_connections WHERE organization_id = ?", [orgId]);
    for (const env of envs) {
      // Prefer connections with a real deployment role; fall back to any match, then first available
      const envConns = conns.filter(c => c.environment_id === env.id);
      const conn = envConns.find(c => c.deployment_role_arn || c.provisioning_role_arn)
        || envConns[0]
        || conns.find(c => c.deployment_role_arn || c.provisioning_role_arn)
        || conns[0]
        || null;
      const etd = {
        id: uid("etd"), organization_id: orgId,
        logical_tool_definition_id: ltd.id, environment_id: env.id,
        aws_account_connection_id: conn?.id || null,
        source_resource_arn: ltd.source_resource_arn,
        deployment_status: "NOT_DEPLOYED", mcp_tool_name: ltd.tool_key,
        auto_provisioned: 1, created_at: now(), updated_at: now(),
      };
      await db.upsert("environment_tool_deployments", etd).catch(() => {});
    }

    // Auto-create approval task so it appears in the org approvals tab
    const tar = {
      id: uid("tar"), organization_id: orgId, logical_tool_definition_id: ltd.id,
      requested_by: user.email, status: "pending", comments: null,
      created_at: now(), updated_at: now(),
    };
    await db.upsert("tool_approval_requests", tar);

    const approvalTask = enrichTask(tar, ltd);
    sendJson(res, 201, { ...toCamel(ltd), approvalTasks: [approvalTask] });
  });

  router.get("/api/organizations/:orgId/logical-tools/:ltdId", async (req, res, { orgId, ltdId }) => {
    const ltd = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ? AND organization_id = ?", [ltdId, orgId]);
    if (!ltd) return sendError(res, 404, "Tool not found");
    const { rows: etds } = await db.query("SELECT * FROM environment_tool_deployments WHERE logical_tool_definition_id = ?", [ltdId]);
    sendJson(res, 200, { ...toCamel(ltd), environmentDeployments: etds.map(toCamel) });
  });

  // GET /api/organizations/:orgId/logical-tools/:ltdId/env-deployments
  router.get("/api/organizations/:orgId/logical-tools/:ltdId/env-deployments", async (req, res, { orgId, ltdId }) => {
    const { rows: etds } = await db.query(
      "SELECT * FROM environment_tool_deployments WHERE logical_tool_definition_id = ? AND organization_id = ? ORDER BY created_at",
      [ltdId, orgId]
    );
    sendJson(res, 200, { environmentDeployments: etds.map(toCamel) });
  });

  // POST /api/organizations/:orgId/logical-tools/:ltdId/env-deployments — register ETD for an environment
  router.post("/api/organizations/:orgId/logical-tools/:ltdId/env-deployments", async (req, res, { orgId, ltdId }) => {
    const body = await readBody(req);
    if (!body.environmentId) return sendError(res, 400, "environmentId is required");
    if (!body.awsAccountConnectionId) return sendError(res, 400, "awsAccountConnectionId is required");

    const ltd = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ? AND organization_id = ?", [ltdId, orgId]);
    if (!ltd) return sendError(res, 404, "Tool not found");

    const existing = await db.queryOne(
      "SELECT * FROM environment_tool_deployments WHERE logical_tool_definition_id = ? AND environment_id = ?",
      [ltdId, body.environmentId]
    );

    const etd = {
      id: existing?.id || uid("etd"),
      organization_id: orgId,
      logical_tool_definition_id: ltdId,
      environment_id: body.environmentId,
      aws_account_connection_id: body.awsAccountConnectionId,
      source_resource_arn: body.sourceResourceArn || ltd.source_resource_arn || null,
      gateway_target_id: body.gatewayTargetId || null,
      mcp_tool_name: ltd.tool_key,
      deployment_status: existing?.deployment_status || "NOT_DEPLOYED",
      credential_provider_ref: body.credentialProviderRef || null,
      auto_provisioned: 0,
      created_at: existing?.created_at || now(),
      updated_at: now(),
    };
    await db.upsert("environment_tool_deployments", etd);
    sendJson(res, 201, { environmentToolDeployment: toCamel(etd) });
  });

  router.patch("/api/organizations/:orgId/logical-tools/:ltdId", async (req, res, { orgId, ltdId }) => {
    const body = await readBody(req);
    const allowed = ["display_name","description","source_resource_arn","input_schema_json","business_owner","data_classification","side_effect_level"];
    const snake = toSnake(body);
    const fields = Object.entries(snake).filter(([k]) => allowed.includes(k));
    if (!fields.length) return sendError(res, 400, "No updatable fields");
    for (const [k, v] of fields)
      await db.run(`UPDATE logical_tool_definitions SET ${k} = ?, updated_at = ? WHERE id = ? AND organization_id = ?`, [v, now(), ltdId, orgId]);
    const ltd = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ?", [ltdId]);
    sendJson(res, 200, toCamel(ltd));
  });

  // ── Tool Approval ───────────────────────────────────────────────────────────

  // Enrich a tool_approval_requests row with _trr and _ltd fields the frontend expects
  function enrichTask(tar, ltd) {
    const t = toCamel(tar);
    t.status = (t.status || "pending").toLowerCase();
    t.toolRegistrationRequestId = t.id;
    t._trr = { id: t.id, logicalToolDefinitionId: t.logicalToolDefinitionId || ltd?.id };
    t._ltd = ltd ? { id: ltd.id, ...toCamel(ltd) } : null;
    t.approverType = "org_admin";
    t.taskCategory = "tool_registration";
    t.resourceType = "tool";
    t.resourceName = ltd?.display_name || ltd?.tool_key || t.id;
    return t;
  }

  // Enrich an agent_approval_requests row into the shape Approvals.jsx expects
  function enrichAgentTask(aar, agent) {
    const t = toCamel(aar);
    t.status = (t.status || "pending").toLowerCase();
    t.taskCategory = "agent_approval";
    t.resourceType = "agent";
    t.agentName = agent?.name || aar.agent_id;
    t.resourceName = agent?.name || aar.agent_id;
    t.approverType = aar.approver_type || t.approverType;
    t.riskTier = aar.risk_tier || t.riskTier || "medium";
    return t;
  }

  // GET /api/approvals — used by OrgApprovals tab and OrgDetail pending count
  router.get("/api/approvals", async (req, res, _, query) => {
    const { organizationId, scope, status } = query;

    // Tool approval requests
    let toolSql = `SELECT tar.*, ltd.id as ltd_id, ltd.display_name, ltd.tool_key, ltd.source_type, ltd.description, ltd.approval_status
               FROM tool_approval_requests tar
               JOIN logical_tool_definitions ltd ON tar.logical_tool_definition_id = ltd.id
               WHERE 1=1`;
    const toolParams = [];
    if (organizationId) { toolSql += " AND tar.organization_id = ?"; toolParams.push(organizationId); }
    if (status)         { toolSql += " AND tar.status = ?"; toolParams.push(status); }
    toolSql += " ORDER BY tar.created_at DESC";
    const { rows: toolRows } = await db.query(toolSql, toolParams);
    const toolTasks = toolRows.map((row) => {
      const ltd = { id: row.ltd_id, display_name: row.display_name, tool_key: row.tool_key, source_type: row.source_type, description: row.description, approval_status: row.approval_status };
      return enrichTask(row, ltd);
    });

    // Agent approval requests
    let agentSql = `SELECT aar.*, a.name as agent_name, a.risk_tier as agent_risk_tier
                    FROM agent_approval_requests aar
                    JOIN agents a ON aar.agent_id = a.id
                    WHERE 1=1`;
    const agentParams = [];
    if (organizationId) { agentSql += " AND aar.organization_id = ?"; agentParams.push(organizationId); }
    if (status)         { agentSql += " AND aar.status = ?"; agentParams.push(status); }
    agentSql += " ORDER BY aar.created_at DESC";
    const { rows: agentRows } = await db.query(agentSql, agentParams);
    const agentTasks = agentRows.map((row) =>
      enrichAgentTask(row, { name: row.agent_name, risk_tier: row.agent_risk_tier })
    );

    sendJson(res, 200, { approvalTasks: [...toolTasks, ...agentTasks] });
  });

  // POST /api/approvals/:taskId/decision — approve or reject (tools or agents)
  router.post("/api/approvals/:taskId/decision", async (req, res, { taskId }) => {
    const body = await readBody(req);
    const decision = body.decision; // "approved" | "rejected"
    const status = decision === "approved" ? "approved" : "rejected";
    const reviewer = body.approver || providers.identity.getUser(req).email;

    // Try agent approval request first
    const aar = await db.queryOne("SELECT * FROM agent_approval_requests WHERE id = ?", [taskId]);
    if (aar) {
      await db.run(
        "UPDATE agent_approval_requests SET status = ?, reviewed_by = ?, comments = ?, updated_at = ? WHERE id = ?",
        [status, reviewer, body.comments || null, now(), taskId]
      );
      // Check if all tasks for this agent are approved → mark agent APPROVED
      const { rows: allTasks } = await db.query(
        "SELECT status FROM agent_approval_requests WHERE agent_id = ?", [aar.agent_id]
      );
      if (decision === "approved" && allTasks.every((t) => t.status === "approved")) {
        await db.run("UPDATE agents SET status = 'APPROVED', updated_at = ? WHERE id = ?", [now(), aar.agent_id]);
      } else if (decision === "rejected") {
        await db.run("UPDATE agents SET status = 'REJECTED', updated_at = ? WHERE id = ?", [now(), aar.agent_id]);
      }
      const updated = await db.queryOne("SELECT * FROM agent_approval_requests WHERE id = ?", [taskId]);
      const agent = await db.queryOne("SELECT * FROM agents WHERE id = ?", [aar.agent_id]);
      return sendJson(res, 200, { approvalTask: enrichAgentTask(updated, agent) });
    }

    // Fall back to tool approval request
    const tar = await db.queryOne("SELECT * FROM tool_approval_requests WHERE id = ?", [taskId]);
    if (!tar) return sendError(res, 404, "Approval task not found");
    await db.run("UPDATE tool_approval_requests SET status = ?, reviewed_by = ?, comments = ?, updated_at = ? WHERE id = ?",
      [status, reviewer, body.comments || null, now(), taskId]);
    const ltdStatus = decision === "approved" ? "APPROVED" : "REJECTED";
    await db.run("UPDATE logical_tool_definitions SET approval_status = ?, updated_at = ? WHERE id = ?",
      [ltdStatus, now(), tar.logical_tool_definition_id]);
    if (decision === "approved") {
      await db.run("UPDATE environment_tool_deployments SET deployment_status = 'PENDING_GATEWAY', updated_at = ? WHERE logical_tool_definition_id = ? AND deployment_status = 'NOT_DEPLOYED'",
        [now(), tar.logical_tool_definition_id]);
    }
    const updated = await db.queryOne("SELECT * FROM tool_approval_requests WHERE id = ?", [taskId]);
    const ltd = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ?", [tar.logical_tool_definition_id]);
    sendJson(res, 200, { approvalTask: enrichTask(updated, ltd) });
  });

  router.post("/api/organizations/:orgId/logical-tools/:ltdId/request-approval", async (req, res, { orgId, ltdId }) => {
    const user = providers.identity.getUser(req);
    const body = await readBody(req);
    const tar = { id: uid("tar"), organization_id: orgId, logical_tool_definition_id: ltdId, requested_by: user.email, status: "pending", comments: body.comments || null, created_at: now(), updated_at: now() };
    await db.upsert("tool_approval_requests", tar);
    await db.run("UPDATE logical_tool_definitions SET approval_status = 'PENDING', updated_at = ? WHERE id = ?", [now(), ltdId]);
    sendJson(res, 201, toCamel(tar));
  });

  router.post("/api/organizations/:orgId/logical-tools/:ltdId/approve", async (req, res, { orgId, ltdId }) => {
    const user = providers.identity.getUser(req);
    const body = await readBody(req);
    await db.run("UPDATE logical_tool_definitions SET approval_status = 'APPROVED', updated_at = ? WHERE id = ? AND organization_id = ?", [now(), ltdId, orgId]);
    await db.run("UPDATE tool_approval_requests SET status = 'APPROVED', reviewed_by = ?, comments = ?, updated_at = ? WHERE logical_tool_definition_id = ? AND status = 'PENDING'", [user.email, body.comments || null, now(), ltdId]);
    // Move ETDs to PENDING_GATEWAY
    await db.run("UPDATE environment_tool_deployments SET deployment_status = 'PENDING_GATEWAY', updated_at = ? WHERE logical_tool_definition_id = ? AND deployment_status = 'NOT_DEPLOYED'", [now(), ltdId]);
    const ltd = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ?", [ltdId]);
    sendJson(res, 200, toCamel(ltd));
  });

  router.post("/api/organizations/:orgId/logical-tools/:ltdId/reject", async (req, res, { orgId, ltdId }) => {
    const user = providers.identity.getUser(req);
    const body = await readBody(req);
    await db.run("UPDATE logical_tool_definitions SET approval_status = 'REJECTED', updated_at = ? WHERE id = ? AND organization_id = ?", [now(), ltdId, orgId]);
    await db.run("UPDATE tool_approval_requests SET status = 'REJECTED', reviewed_by = ?, comments = ?, updated_at = ? WHERE logical_tool_definition_id = ? AND status = 'PENDING'", [user.email, body.comments || null, now(), ltdId]);
    const ltd = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ?", [ltdId]);
    sendJson(res, 200, toCamel(ltd));
  });

  // POST /api/organizations/:orgId/logical-tools/:ltdId/grants — grant tool to a project (org-tool-registry flow)
  router.post("/api/organizations/:orgId/logical-tools/:ltdId/grants", async (req, res, { orgId, ltdId }) => {
    const body = await readBody(req);
    const user = providers.identity.getUser(req);
    if (!body.projectId) return sendError(res, 400, "projectId is required");

    const ltd = await db.queryOne(
      "SELECT * FROM logical_tool_definitions WHERE id = ? AND organization_id = ?", [ltdId, orgId]
    );
    if (!ltd) return sendError(res, 404, "Tool not found in this organization");
    if (ltd.approval_status !== "APPROVED") return sendError(res, 409, "Tool is not yet approved");

    const proj = await db.queryOne("SELECT * FROM projects WHERE id = ? AND organization_id = ?", [body.projectId, orgId]);
    if (!proj) return sendError(res, 404, "Project not found in this organization");

    const existing = await db.queryOne(
      "SELECT id FROM project_tool_grants WHERE project_id = ? AND logical_tool_definition_id = ? AND status = 'ACTIVE'",
      [body.projectId, ltdId]
    );
    if (existing) return sendError(res, 409, "Tool already granted to this project");

    const grant = {
      id: uid("ptg"), project_id: body.projectId, organization_id: orgId,
      logical_tool_definition_id: ltdId,
      granted_by: user.email, status: "ACTIVE", granted_at: now(),
    };
    await db.upsert("project_tool_grants", grant);
    sendJson(res, 201, { projectToolGrant: toCamel(grant), grant: toCamel(grant) });
  });

  // ── Environment Tool Deployments ────────────────────────────────────────────
  router.get("/api/organizations/:orgId/environment-deployments", async (req, res, { orgId }, query) => {
    let sql = "SELECT * FROM environment_tool_deployments WHERE organization_id = ?";
    const params = [orgId];
    if (query.environmentId) { sql += " AND environment_id = ?"; params.push(query.environmentId); }
    if (query.ltdId) { sql += " AND logical_tool_definition_id = ?"; params.push(query.ltdId); }
    const { rows: r } = await db.query(sql, params);
    sendJson(res, 200, { deployments: r.map(toCamel) });
  });

  router.post("/api/organizations/:orgId/logical-tools/:ltdId/deploy-to-gateway", async (req, res, { orgId, ltdId }) => {
    const body = await readBody(req);
    const ltd  = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ? AND organization_id = ?", [ltdId, orgId]);
    if (!ltd) return sendError(res, 404, "Tool not found");
    if (ltd.approval_status !== "APPROVED") return sendError(res, 400, "Tool must be approved before deployment");

    const envId = body.environmentId;
    if (!envId) return sendError(res, 400, "environmentId is required");
    const etd = await db.queryOne("SELECT * FROM environment_tool_deployments WHERE logical_tool_definition_id = ? AND environment_id = ?", [ltdId, envId]);
    if (!etd) return sendError(res, 404, "No ETD found for this environment");

    const conn = etd.aws_account_connection_id
      ? await db.queryOne("SELECT * FROM aws_account_connections WHERE id = ?", [etd.aws_account_connection_id])
      : null;

    // Apply overrides from body
    if (body.sourceResourceArn) etd.source_resource_arn = body.sourceResourceArn;
    if (body.apiStage)          etd.api_stage = body.apiStage;

    const discoveredResources = (await db.query("SELECT * FROM discovered_resources WHERE organization_id = ?", [orgId])).rows;

    const connCamel = conn ? toCamel(conn) : {};
    const hasRealConn = !!(connCamel.deploymentRoleArn || connCamel.provisioningRoleArn);

    let result;
    if (config.useRealAgentCore && hasRealConn) {
      const { deployTool } = require(path.join(__dirname, "services/gateway-deployer.cjs"));
      result = await deployTool({ ltd: toCamel(ltd), etd: toCamel(etd), conn: connCamel, discoveredResources: discoveredResources.map(toCamel) });
    } else {
      if (config.useRealAgentCore && !hasRealConn) {
        console.warn(`[deploy-to-gateway] Connection ${conn?.id || "none"} has no deploymentRoleArn — using mock deployer`);
      }
      result = await providers.agentcore.registerTarget({ ltd: toCamel(ltd), etd: toCamel(etd) });
    }

    // Persist result
    await db.run(
      `UPDATE environment_tool_deployments
       SET deployment_status = 'ACTIVE', gateway_target_id = ?, gateway_arn = ?,
           mcp_tool_name = ?, source_resource_arn = COALESCE(?, source_resource_arn),
           api_stage = COALESCE(?, api_stage), updated_at = ?
       WHERE logical_tool_definition_id = ? AND environment_id = ?`,
      [result.targetId, result.gatewayArn || null, result.mcpToolName, body.sourceResourceArn || null, body.apiStage || null, now(), ltdId, envId]
    );

    // Persist gateway info on connection if returned
    if (conn && result.gatewayId && result.gatewayId !== "mock-gateway-local") {
      await db.run("UPDATE aws_account_connections SET agent_core_gateway_id = ?, agent_core_gateway_arn = ?, agent_core_gateway_url = ?, updated_at = ? WHERE id = ?",
        [result.gatewayId, result.gatewayArn, result.gatewayUrl, now(), conn.id]);
    }

    const updated = await db.queryOne("SELECT * FROM environment_tool_deployments WHERE logical_tool_definition_id = ? AND environment_id = ?", [ltdId, envId]);
    sendJson(res, 200, { ...result, etd: toCamel(updated) });
  });

  // ── Project legacy tools & knowledge (project-scoped, not org tools) ────────
  router.get("/api/projects/:projectId/tools", async (req, res, { projectId }) => {
    sendJson(res, 200, { tools: [] });
  });

  router.get("/api/projects/:projectId/knowledge", async (req, res, { projectId }) => {
    sendJson(res, 200, { knowledge: [] });
  });

  // GET /api/projects/:projectId/project-tools — granted org tools merged view
  router.get("/api/projects/:projectId/project-tools", async (req, res, { projectId }) => {
    const proj = await db.queryOne("SELECT organization_id FROM projects WHERE id = ?", [projectId]);
    if (!proj) return sendError(res, 404, "Project not found");

    // Find DEV env to join ETDs
    const devEnv = await db.queryOne(
      "SELECT id FROM environments WHERE organization_id = ? AND environment_type = 'DEV' LIMIT 1", [proj.organization_id]
    );

    const { rows: grants } = await db.query(
      `SELECT ptg.*, ltd.id as ltd_id, ltd.display_name, ltd.tool_key, ltd.source_type,
              ltd.description, ltd.input_schema_json, ltd.side_effect_level, ltd.data_classification,
              ltd.business_owner, ltd.version,
              etd.id as etd_id, etd.deployment_status, etd.mcp_tool_name,
              etd.gateway_arn, etd.api_gateway_url, etd.environment_id as etd_env_id
       FROM project_tool_grants ptg
       JOIN logical_tool_definitions ltd ON ptg.logical_tool_definition_id = ltd.id
       LEFT JOIN environment_tool_deployments etd
         ON etd.logical_tool_definition_id = ltd.id AND etd.environment_id = ?
       WHERE ptg.project_id = ? AND ptg.status = 'ACTIVE'`, [devEnv?.id || '', projectId]
    );
    const projectTools = grants.map((g) => ({
      id: `grant:${g.id}`,
      projectId,
      organizationId: g.organization_id,
      logicalToolDefinitionId: g.ltd_id,
      grantId: g.id,
      environmentId: g.etd_env_id || devEnv?.id,
      sourceType: "ORG_TOOL_GRANT",
      ltdSourceType: g.source_type,
      displayName: g.display_name,
      toolKey: g.tool_key,
      description: g.description,
      mcpToolName: g.mcp_tool_name,
      gatewayArn: g.gateway_arn,
      gatewayUrl: g.api_gateway_url,
      sideEffectLevel: g.side_effect_level,
      dataClassification: g.data_classification,
      businessOwner: g.business_owner,
      version: g.version,
      toolStatus: g.deployment_status || "NOT_DEPLOYED",
      createdAt: g.created_at,
      updatedAt: g.updated_at,
      _etdId: g.etd_id,
    }));
    sendJson(res, 200, { projectTools, orgToolGrants: projectTools });
  });

  // GET /api/projects/:projectId/available-org-tools — approved org tools not yet granted to this project
  router.get("/api/projects/:projectId/available-org-tools", async (req, res, { projectId }) => {
    const proj = await db.queryOne("SELECT organization_id FROM projects WHERE id = ?", [projectId]);
    if (!proj) return sendError(res, 404, "Project not found");
    const orgId = proj.organization_id;

    const devEnv = await db.queryOne(
      "SELECT * FROM environments WHERE organization_id = ? AND environment_type = 'DEV' LIMIT 1", [orgId]
    );
    if (!devEnv) return sendJson(res, 200, { availableTools: [] });

    // Approved LTDs with an ETD in DEV
    const { rows: ltds } = await db.query(
      `SELECT ltd.*, etd.id as etd_id, etd.deployment_status, etd.mcp_tool_name,
              etd.gateway_arn, etd.api_gateway_url
       FROM logical_tool_definitions ltd
       JOIN environment_tool_deployments etd ON etd.logical_tool_definition_id = ltd.id AND etd.environment_id = ?
       WHERE ltd.organization_id = ? AND ltd.approval_status = 'APPROVED'`, [devEnv.id, orgId]
    );

    // Filter out already-granted ones
    const { rows: existing } = await db.query(
      "SELECT logical_tool_definition_id FROM project_tool_grants WHERE project_id = ? AND status = 'ACTIVE'", [projectId]
    );
    const grantedIds = new Set(existing.map(r => r.logical_tool_definition_id));

    const available = ltds
      .filter(l => !grantedIds.has(l.id))
      .map(l => ({ ...toCamel(l), devEtd: { id: l.etd_id, deploymentStatus: l.deployment_status, mcpToolName: l.mcp_tool_name, gatewayArn: l.gateway_arn, gatewayUrl: l.api_gateway_url } }));

    sendJson(res, 200, { availableTools: available, devEnvironmentId: devEnv.id });
  });

  // POST /api/projects/:projectId/enable-org-tool — grant an approved org tool to this project
  router.post("/api/projects/:projectId/enable-org-tool", async (req, res, { projectId }) => {
    const body = await readBody(req);
    if (!body.logicalToolDefinitionId) return sendError(res, 400, "logicalToolDefinitionId is required");
    const user = providers.identity.getUser(req);

    const proj = await db.queryOne("SELECT organization_id FROM projects WHERE id = ?", [projectId]);
    if (!proj) return sendError(res, 404, "Project not found");
    const orgId = proj.organization_id;

    const ltd = await db.queryOne(
      "SELECT * FROM logical_tool_definitions WHERE id = ? AND organization_id = ?",
      [body.logicalToolDefinitionId, orgId]
    );
    if (!ltd) return sendError(res, 404, "Tool not found in this organization");
    if (ltd.approval_status !== "APPROVED") return sendError(res, 409, "Tool is not yet approved");

    const devEnv = await db.queryOne(
      "SELECT * FROM environments WHERE organization_id = ? AND environment_type = 'DEV' LIMIT 1", [orgId]
    );
    if (!devEnv) return sendError(res, 422, "No DEV environment configured for this organization");

    const existing = await db.queryOne(
      "SELECT id FROM project_tool_grants WHERE project_id = ? AND logical_tool_definition_id = ? AND status = 'ACTIVE'",
      [projectId, body.logicalToolDefinitionId]
    );
    if (existing) return sendError(res, 409, "Tool is already enabled for this project");

    const grant = {
      id: uid("ptg"), project_id: projectId, organization_id: orgId,
      logical_tool_definition_id: body.logicalToolDefinitionId,
      granted_by: user.email, status: "ACTIVE", granted_at: now(),
    };
    await db.upsert("project_tool_grants", grant);
    sendJson(res, 201, { projectToolGrant: toCamel(grant), logicalToolDefinition: toCamel(ltd) });
  });

  // ── Project Tool Grants ─────────────────────────────────────────────────────
  router.get("/api/projects/:projectId/tool-grants", async (req, res, { projectId }) => {
    const { rows: r } = await db.query(
      `SELECT ptg.*, ltd.display_name, ltd.tool_key, ltd.source_type, ltd.description, ltd.approval_status
       FROM project_tool_grants ptg
       JOIN logical_tool_definitions ltd ON ptg.logical_tool_definition_id = ltd.id
       WHERE ptg.project_id = ? AND ptg.status = 'ACTIVE'
       ORDER BY ptg.granted_at DESC`, [projectId]
    );
    sendJson(res, 200, { grants: r.map(toCamel) });
  });

  router.post("/api/projects/:projectId/tool-grants", async (req, res, { projectId }) => {
    const body = await readBody(req);
    if (!body.logicalToolDefinitionId) return sendError(res, 400, "logicalToolDefinitionId is required");
    const user = providers.identity.getUser(req);
    const ltd  = await db.queryOne("SELECT * FROM logical_tool_definitions WHERE id = ?", [body.logicalToolDefinitionId]);
    if (!ltd) return sendError(res, 404, "Tool not found");
    if (ltd.approval_status !== "APPROVED") return sendError(res, 400, "Tool must be approved before it can be granted");
    const proj = await db.queryOne("SELECT organization_id FROM projects WHERE id = ?", [projectId]);
    const grant = { id: uid("ptg"), project_id: projectId, organization_id: proj.organization_id, logical_tool_definition_id: body.logicalToolDefinitionId, granted_by: user.email, status: "ACTIVE", granted_at: now() };
    await db.upsert("project_tool_grants", grant);
    sendJson(res, 201, toCamel(grant));
  });

  router.delete("/api/projects/:projectId/tool-grants/:grantId", async (req, res, { projectId, grantId }) => {
    await db.run("UPDATE project_tool_grants SET status = 'REVOKED' WHERE id = ? AND project_id = ?", [grantId, projectId]);
    sendJson(res, 200, { revoked: true });
  });

  // ── Agents ──────────────────────────────────────────────────────────────────
  router.get("/api/projects/:projectId/agents", async (req, res, { projectId }) => {
    const { rows: r } = await db.query("SELECT * FROM agents WHERE project_id = ? ORDER BY created_at DESC", [projectId]);
    sendJson(res, 200, { agents: r.map(toCamel) });
  });

  router.post("/api/projects/:projectId/agents", async (req, res, { projectId }) => {
    const body = await readBody(req);
    if (!body.name) return sendError(res, 400, "name is required");
    const user = providers.identity.getUser(req);
    const proj = await db.queryOne("SELECT organization_id FROM projects WHERE id = ?", [projectId]);
    if (!proj) return sendError(res, 404, "Project not found");
    const agent = { id: uid("agent"), project_id: projectId, organization_id: proj.organization_id, name: body.name, description: body.description || null, system_prompt: body.systemPrompt || null, model_id: body.modelId || "anthropic.claude-haiku-4-5-20251001", status: "DRAFT", created_by: user.email, created_at: now(), updated_at: now() };
    await db.upsert("agents", agent);
    sendJson(res, 201, toCamel(agent));
  });

  router.get("/api/projects/:projectId/agents/:agentId", async (req, res, { projectId, agentId }) => {
    const agent = await db.queryOne("SELECT * FROM agents WHERE id = ? AND project_id = ?", [agentId, projectId]);
    if (!agent) return sendError(res, 404, "Agent not found");
    const { rows: envDeps } = await db.query("SELECT * FROM agent_environment_deployments WHERE agent_id = ?", [agentId]);
    const { rows: grants }  = await db.query("SELECT ptg.*, ltd.display_name, ltd.tool_key FROM project_tool_grants ptg JOIN logical_tool_definitions ltd ON ptg.logical_tool_definition_id = ltd.id WHERE ptg.project_id = ? AND ptg.status = 'ACTIVE'", [projectId]);
    sendJson(res, 200, { ...toCamel(agent), environmentDeployments: envDeps.map(toCamel), toolGrants: grants.map(toCamel) });
  });

  router.patch("/api/projects/:projectId/agents/:agentId", async (req, res, { projectId, agentId }) => {
    const body = await readBody(req);
    const allowed = { name: "name", description: "description", systemPrompt: "system_prompt", modelId: "model_id", status: "status" };
    const updates = Object.entries(allowed).filter(([camel]) => body[camel] !== undefined);
    for (const [camel, snake] of updates)
      await db.run(`UPDATE agents SET ${snake} = ?, updated_at = ? WHERE id = ? AND project_id = ?`, [body[camel], now(), agentId, projectId]);
    const agent = await db.queryOne("SELECT * FROM agents WHERE id = ?", [agentId]);
    sendJson(res, 200, toCamel(agent));
  });

  // ── Agent Deployment — async, returns 202 immediately, background pipeline ────
  router.post("/api/projects/:projectId/agents/:agentId/deploy", async (req, res, { projectId, agentId }) => {
    const body  = await readBody(req);
    const agent = await db.queryOne("SELECT * FROM agents WHERE id = ? AND project_id = ?", [agentId, projectId]);
    if (!agent) return sendError(res, 404, "Agent not found");
    if (!["APPROVED", "SUBMITTED", "ACTIVE", "DEPLOY_FAILED", "DEPLOYING"].includes(agent.status))
      return sendError(res, 409, `Agent must be APPROVED before deployment (status: ${agent.status})`);

    // Resolve environment — use provided envId or pick DEV automatically
    let envId = body.environmentId;
    if (!envId) {
      const devEnv = await db.queryOne(
        "SELECT id FROM environments WHERE organization_id = ? AND environment_type = 'DEV' LIMIT 1",
        [agent.organization_id]
      );
      envId = devEnv?.id;
    }
    if (!envId) return sendError(res, 422, "No DEV environment found for this organization");

    const existing = await db.queryOne(
      "SELECT * FROM agent_environment_deployments WHERE agent_id = ? AND environment_id = ?",
      [agentId, envId]
    );
    const aedId = existing?.id || uid("aed");

    // Create / reset the AED record in DEPLOYING state immediately
    const aed = {
      id: aedId, agent_id: agentId, project_id: projectId,
      organization_id: agent.organization_id, environment_id: envId,
      deployment_status: "DEPLOYING",
      agent_core_agent_id: null, agent_core_agent_arn: null,
      agent_core_endpoint_id: null, agent_core_endpoint_arn: null,
      runtime_name: null, s3_code_location: null,
      deployment_logs: JSON.stringify([`[${new Date().toISOString()}] Deploy initiated`]),
      error_message: null,
      deployed_at: null,
      created_at: existing?.created_at || now(), updated_at: now(),
    };
    await db.upsert("agent_environment_deployments", aed);
    await db.run("UPDATE agents SET status = 'DEPLOYING', updated_at = ? WHERE id = ?", [now(), agentId]);

    // Return 202 immediately — client polls GET .../deployments/:depId
    sendJson(res, 202, { deploymentId: aedId, status: "DEPLOYING", message: "Deployment started — poll /api/agents/:id/deployments for status" });

    // Run the real AgentCore pipeline asynchronously
    if (config.useRealAgentCore) {
      const { deployAgentToAgentCore } = require(path.join(__dirname, "services/agent-deployer.cjs"));
      deployAgentToAgentCore({ db, agent, aedId, now }).catch((err) => {
        console.error(`[server] AgentCore deploy failed for ${agentId}:`, err.message);
      });
    } else {
      // Mock mode: simulate a 3-second deploy then set ACTIVE
      setTimeout(async () => {
        const mockId = `mock-runtime-${agentId.slice(-8)}`;
        const mockLogs = [
          `[${new Date().toISOString()}] [mock] Uploading agent code to S3…`,
          `[${new Date().toISOString()}] [mock] Creating AgentCore Runtime…`,
          `[${new Date().toISOString()}] [mock] Runtime READY.`,
          `[${new Date().toISOString()}] [mock] Creating endpoint…`,
          `[${new Date().toISOString()}] [mock] Endpoint READY. Deployment complete.`,
        ];
        await db.run(
          `UPDATE agent_environment_deployments SET
             deployment_status = 'ACTIVE', agent_core_agent_id = ?, agent_core_agent_arn = ?,
             agent_core_endpoint_id = 'DEFAULT', runtime_name = ?,
             deployment_logs = ?, deployed_at = ?, updated_at = ?
           WHERE id = ?`,
          [mockId, `arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/${mockId}`,
           `guardian_${agentId}`, JSON.stringify(mockLogs), now(), now(), aedId]
        );
        await db.run("UPDATE agents SET status = 'ACTIVE', updated_at = ? WHERE id = ?", [now(), agentId]);
      }, 3000);
    }
  });

  // ── Agent deployment list (by agentId, cross-project) ───────────────────────
  router.get("/api/agents/:agentId/deployments", async (req, res, { agentId }) => {
    const { rows } = await db.query(
      "SELECT * FROM agent_environment_deployments WHERE agent_id = ? ORDER BY created_at DESC",
      [agentId]
    );
    const mapped = rows.map((r) => {
      const c = toCamel(r);
      if (c.deploymentLogs) try { c.deploymentLogs = JSON.parse(c.deploymentLogs); } catch (_) { c.deploymentLogs = [c.deploymentLogs]; }
      return c;
    });
    sendJson(res, 200, { deployments: mapped });
  });

  // ── Single deployment poll ────────────────────────────────────────────────────
  router.get("/api/agents/:agentId/deployments/:depId", async (req, res, { agentId, depId }) => {
    const row = await db.queryOne(
      "SELECT * FROM agent_environment_deployments WHERE id = ? AND agent_id = ?",
      [depId, agentId]
    );
    if (!row) return sendError(res, 404, "Deployment not found");
    const c = toCamel(row);
    if (c.deploymentLogs) try { c.deploymentLogs = JSON.parse(c.deploymentLogs); } catch (_) { c.deploymentLogs = [c.deploymentLogs]; }
    sendJson(res, 200, { deployment: c });
  });

  // ── Agent invoke ─────────────────────────────────────────────────────────────
  router.post("/api/agents/:agentId/invoke", async (req, res, { agentId }) => {
    const body  = await readBody(req);
    const agent = await db.queryOne("SELECT * FROM agents WHERE id = ?", [agentId]);
    if (!agent) return sendError(res, 404, "Agent not found");
    if (agent.status !== "ACTIVE") return sendError(res, 409, `Agent is not yet deployed (status: ${agent.status})`);

    const input = body.message || body.input || "Hello";
    const t0    = Date.now();

    // Try real AgentCore invoke if we have deployment details
    const aed = await db.queryOne(
      "SELECT * FROM agent_environment_deployments WHERE agent_id = ? AND deployment_status = 'ACTIVE' ORDER BY deployed_at DESC LIMIT 1",
      [agentId]
    );

    // InvokeAgentRuntimeCommand needs the ARN (not the ID) and the endpoint name
    if (config.useRealAgentCore && aed?.agent_core_agent_arn && aed?.agent_core_endpoint_id) {
      const { invokeAgentRuntime } = require(path.join(__dirname, "services/agentcore-client.cjs"));
      const result = await invokeAgentRuntime(
        aed.agent_core_agent_arn,
        aed.agent_core_endpoint_id,   // stored as the endpoint name (e.g. "guardian_claim_6Ep")
        { input, sessionId: body.sessionId }
      );
      return sendJson(res, 200, {
        agentId,
        runtimeArn:  aed.agent_core_agent_arn,
        endpointName: aed.agent_core_endpoint_id,
        input,
        output:     typeof result.output === "string" ? result.output : JSON.stringify(result.output),
        rawOutput:  result.rawOutput,
        sessionId:  result.sessionId,
        model:      agent.model_id,
        latencyMs:  Date.now() - t0,
        source:     "agentcore",
      });
    }

    // Fallback: mock LLM invoke
    const result = await providers.llm.complete({
      task: input,
      context: { agentId, agentName: agent.name, systemPrompt: agent.system_prompt },
    });
    sendJson(res, 200, {
      agentId,
      input,
      output:   result.text,
      model:    agent.model_id,
      latencyMs: Date.now() - t0,
      source:   "mock",
    });
  });

  // ── LLM assist ──────────────────────────────────────────────────────────────
  router.post("/api/llm/complete", async (req, res) => {
    const body = await readBody(req);
    const result = await providers.llm.complete({ task: body.task, context: body.context || {} });
    sendJson(res, 200, result);
  });

  // ── Agent authoring — generate code from manifest YAML ─────────────────────
  router.post("/api/agents/generate", async (req, res) => {
    const body = await readBody(req);
    const { manifest: manifestYaml, projectId: pid } = body;
    if (!manifestYaml) return sendError(res, 400, "manifest is required");
    let parsed;
    try {
      const yaml = require("js-yaml");
      parsed = yaml.load(manifestYaml);
    } catch (e) { return sendError(res, 400, `Invalid YAML: ${e.message}`); }
    const { generateStrands } = require(path.join(__dirname, "codegen/strands-generator.cjs"));
    const files = generateStrands(parsed, pid || parsed.projectId || "unknown-project");
    sendJson(res, 200, { files, agentId: parsed.id, framework: parsed.runtime?.framework || "strands" });
  });

  // ── Agent authoring — publish (register agent + create approval tasks) ───────
  router.post("/api/agents/publish", async (req, res) => {
    const body = await readBody(req);
    const { manifest: manifestYaml, projectId: pid, form, submittedBy } = body;
    if (!manifestYaml) return sendError(res, 400, "manifest is required");
    let parsed;
    try {
      const yaml = require("js-yaml");
      parsed = yaml.load(manifestYaml);
    } catch (e) { return sendError(res, 400, `Invalid YAML: ${e.message}`); }

    const user = providers.identity.getUser(req);
    const effectivePid = pid || parsed.projectId;
    if (!effectivePid) return sendError(res, 400, "projectId is required");

    const proj = await db.queryOne("SELECT * FROM projects WHERE id = ?", [effectivePid]);
    if (!proj) return sendError(res, 404, `Project '${effectivePid}' not found`);

    const agentId = parsed.id || uid("agent");
    const agent = {
      id: agentId, project_id: effectivePid, organization_id: proj.organization_id,
      name: parsed.name || agentId,
      description: parsed.description || form?.description || null,
      system_prompt: parsed.systemPrompt || form?.systemPrompt || null,
      model_id: parsed.model?.modelId || form?.modelId || "anthropic.claude-haiku-4-5-20251001",
      status: "SUBMITTED",
      authored_via: "author-wizard",
      risk_tier: parsed.policies?.riskTier || form?.riskTier || "medium",
      created_by: submittedBy || user.email, created_at: now(), updated_at: now(),
    };
    await db.upsert("agents", agent);

    const riskTier = agent.risk_tier;
    const requester = submittedBy || user.email;
    const approvalTasks = [
      { approver_type: "business_owner", reason: "New agent submission — business owner review required" },
      { approver_type: "platform_admin", reason: `Platform policy sign-off for ${riskTier} risk tier agent` },
    ].map((t) => ({
      id: uid("aar"),
      organization_id: proj.organization_id,
      project_id: effectivePid,
      agent_id: agentId,
      approver_type: t.approver_type,
      risk_tier: riskTier,
      reason: t.reason,
      requested_by: requester,
      status: "pending",
      created_at: now(), updated_at: now(),
    }));
    for (const t of approvalTasks) await db.upsert("agent_approval_requests", t);

    sendJson(res, 201, {
      agentId, agent: toCamel(agent),
      approvalTasks: approvalTasks.map((t) => enrichAgentTask(t, agent)),
    });
  });

  // ── Mock MCP endpoint (mock mode) ──────────────────────────────────────────
  router.post("/mock-mcp", async (req, res, _params, _query) => {
    const body = await readBody(req);
    const { rows: tools } = await db.query("SELECT tool_key, display_name, description FROM logical_tool_definitions WHERE status = 'ACTIVE' AND approval_status = 'APPROVED'");
    const mcpTools = tools.map(t => ({ name: t.tool_key, description: t.display_name || t.tool_key, inputSchema: { type: "object" } }));
    const response = await providers.agentcore.handleMcpRequest(body, mcpTools);
    sendJson(res, 200, response);
  });

  // ── Health ──────────────────────────────────────────────────────────────────
  router.get("/health", (req, res) => {
    sendJson(res, 200, { status: "ok", mode: config.appMode, db: config.dbType, ts: now() });
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  await getDb();                   // init + migrate schema
  await seed();                    // idempotent seed

  // Resolve real AWS identity when real AWS or AgentCore is enabled
  if (config.useRealAws || config.useRealAgentCore) {
    const { resolveLocalAwsContext } = require("./services/aws-client.cjs");
    await resolveLocalAwsContext();
  }

  const router = new Router();
  await registerRoutes(router);

  const server = http.createServer((req, res) => router.handle(req, res));
  server.listen(config.port, config.host, () => {
    console.log(`[server] Listening on http://${config.host}:${config.port} (${config.appMode} mode)`);
  });
}

main().catch(e => { console.error("[server] Fatal:", e); process.exit(1); });
