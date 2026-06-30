"use strict";

/**
 * Seeds the database with a starter organization, environments, projects,
 * tools, and a sample agent so developers can use the app immediately after
 * `npm run dev:mock`.
 *
 * Seed data is org-agnostic — no "Acme Health" or other hardcoded names.
 * The org name comes from the SEED_ORG_NAME env var (default: "Demo Org").
 *
 * Idempotent: skips rows that already exist by checking for the seed org slug.
 */

const { getDb } = require("./index.cjs");

const ORG_NAME  = process.env.SEED_ORG_NAME  || "Demo Org";
const ORG_EMAIL = process.env.SEED_ORG_EMAIL || "admin@example.com";

function slug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function seed() {
  const db = await getDb();

  // ── Already seeded? ───────────────────────────────────────────────────────
  const orgSlug = slug(ORG_NAME);
  const existing = await db.queryOne("SELECT id FROM organizations WHERE slug = ?", [orgSlug]);
  if (existing) {
    console.log(`[seed] Organization '${ORG_NAME}' (slug: ${orgSlug}) already exists — skipping.`);
    return;
  }

  const now = new Date().toISOString();

  // ── Organization ──────────────────────────────────────────────────────────
  const orgId = id("org");
  await db.upsert("organizations", {
    id: orgId, name: ORG_NAME, slug: orgSlug,
    description: `${ORG_NAME} — seeded for local development`,
    owner_email: ORG_EMAIL, created_at: now, updated_at: now,
  });

  // ── Environments ──────────────────────────────────────────────────────────
  const envDevId     = id("env");
  const envStagingId = id("env");
  const envProdId    = id("env");

  for (const [envId, envType, envName] of [
    [envDevId, "DEV", "Development"],
    [envStagingId, "STAGING", "Staging"],
    [envProdId, "PROD", "Production"],
  ]) {
    await db.upsert("environments", {
      id: envId, organization_id: orgId,
      name: envName, environment_type: envType, created_at: now,
    });
  }

  // ── Mock AWS connection (DEV only — no real ARNs) ─────────────────────────
  const connId = id("conn");
  await db.upsert("aws_account_connections", {
    id: connId, organization_id: orgId, environment_id: envDevId,
    environment_type: "DEV", aws_account_id: "000000000000",
    account_name: "mock-account", region: "us-east-1",
    discovery_role_arn: null, deployment_role_arn: null,
    status: "CONNECTED", created_by: ORG_EMAIL, created_at: now, updated_at: now,
  });

  // ── Mock discovered resources ─────────────────────────────────────────────
  const mockResources = [
    {
      id: id("dr"), organization_id: orgId, aws_account_connection_id: connId,
      aws_account_id: "000000000000", region: "us-east-1",
      resource_type: "LAMBDA", resource_arn: "arn:aws:lambda:us-east-1:000000000000:function:demo-calculator",
      resource_id: "demo-calculator", resource_name: "DemoCalculator",
      discovery_status: "ACTIVE",
      metadata_json: JSON.stringify({ runtime: "nodejs18.x", handler: "index.handler" }),
      tags_json: JSON.stringify({ Environment: "dev" }),
      last_seen_at: now, created_at: now, updated_at: now,
    },
    {
      id: id("dr"), organization_id: orgId, aws_account_connection_id: connId,
      aws_account_id: "000000000000", region: "us-east-1",
      resource_type: "API_GATEWAY_REST",
      resource_arn: "arn:aws:apigateway:us-east-1::/restapis/mock0api1",
      resource_id: "mock0api1", resource_name: "DemoClaimsAPI",
      discovery_status: "ACTIVE",
      metadata_json: JSON.stringify({ stageName: "dev", stages: ["dev"], endpointType: "REGIONAL" }),
      tags_json: JSON.stringify({ Environment: "dev" }),
      last_seen_at: now, created_at: now, updated_at: now,
    },
  ];
  for (const r of mockResources) await db.upsert("discovered_resources", r);

  // ── Projects ──────────────────────────────────────────────────────────────
  const projectId = id("proj");
  await db.upsert("projects", {
    id: projectId, organization_id: orgId,
    name: "Demo Project", description: "Starter project for local development",
    created_by: ORG_EMAIL, created_at: now, updated_at: now,
  });

  // ── Org member (seed admin) ───────────────────────────────────────────────
  await db.upsert("org_members", {
    id: id("mem"), organization_id: orgId, project_id: null,
    user_id: "mock-user-001", user_email: ORG_EMAIL,
    role: "ORG_ADMIN", created_at: now,
  });

  // ── Logical tool definitions ──────────────────────────────────────────────
  const calcLtdId  = id("ltd");
  const claimsLtdId = id("ltd");

  const tools = [
    {
      id: calcLtdId, organization_id: orgId,
      tool_key: "demo_calculator", display_name: "Demo Calculator",
      description: "Performs basic arithmetic operations — seeded for demo",
      source_type: "LAMBDA",
      source_resource_arn: "arn:aws:lambda:us-east-1:000000000000:function:demo-calculator",
      input_schema_json: JSON.stringify({
        type: "object",
        properties: {
          operation: { type: "string", enum: ["add","subtract","multiply","divide"] },
          a: { type: "number" }, b: { type: "number" },
        },
        required: ["operation","a","b"],
      }),
      business_owner: ORG_EMAIL, data_classification: "public",
      side_effect_level: "READ_ONLY", version: "v1",
      status: "ACTIVE", approval_status: "APPROVED",
      created_by: ORG_EMAIL, created_at: now, updated_at: now,
    },
    {
      id: claimsLtdId, organization_id: orgId,
      tool_key: "demo_claims_api", display_name: "Demo Claims API",
      description: "GET/POST claims — seeded for demo",
      source_type: "API_GATEWAY",
      source_resource_arn: "arn:aws:apigateway:us-east-1::/restapis/mock0api1",
      input_schema_json: null,
      business_owner: ORG_EMAIL, data_classification: "internal",
      side_effect_level: "READ_WRITE", version: "v1",
      status: "ACTIVE", approval_status: "PENDING",
      created_by: ORG_EMAIL, created_at: now, updated_at: now,
    },
  ];
  for (const t of tools) await db.upsert("logical_tool_definitions", t);

  // ── Approval request for claims tool ─────────────────────────────────────
  await db.upsert("tool_approval_requests", {
    id: id("tar"), organization_id: orgId,
    logical_tool_definition_id: claimsLtdId,
    requested_by: ORG_EMAIL, status: "PENDING",
    created_at: now, updated_at: now,
  });

  // ── Environment tool deployments ──────────────────────────────────────────
  await db.upsert("environment_tool_deployments", {
    id: id("etd"), organization_id: orgId,
    logical_tool_definition_id: calcLtdId,
    environment_id: envDevId,
    aws_account_connection_id: connId,
    source_resource_arn: "arn:aws:lambda:us-east-1:000000000000:function:demo-calculator",
    deployment_status: "ACTIVE",
    mcp_tool_name: "demo_calculator",
    auto_provisioned: 1,
    created_at: now, updated_at: now,
  });
  await db.upsert("environment_tool_deployments", {
    id: id("etd"), organization_id: orgId,
    logical_tool_definition_id: claimsLtdId,
    environment_id: envDevId,
    aws_account_connection_id: connId,
    deployment_status: "PENDING_GATEWAY",
    mcp_tool_name: "demo_claims_api",
    auto_provisioned: 1,
    created_at: now, updated_at: now,
  });

  // ── Project tool grant (calculator → demo project) ────────────────────────
  await db.upsert("project_tool_grants", {
    id: id("ptg"), project_id: projectId, organization_id: orgId,
    logical_tool_definition_id: calcLtdId,
    granted_by: ORG_EMAIL, status: "ACTIVE", granted_at: now,
  });

  // ── Sample agent ──────────────────────────────────────────────────────────
  const agentId = id("agent");
  await db.upsert("agents", {
    id: agentId, project_id: projectId, organization_id: orgId,
    name: "Demo Assistant", description: "Starter agent with calculator tool access",
    system_prompt: "You are a helpful assistant. Use the demo_calculator tool for arithmetic.",
    model_id: "anthropic.claude-haiku-4-5-20251001",
    status: "DRAFT", created_by: ORG_EMAIL, created_at: now, updated_at: now,
  });

  await db.upsert("agent_environment_deployments", {
    id: id("aed"), agent_id: agentId, project_id: projectId,
    organization_id: orgId, environment_id: envDevId,
    deployment_status: "NOT_DEPLOYED",
    created_at: now, updated_at: now,
  });

  console.log(`[seed] Seeded org='${ORG_NAME}' (${orgId}) with 2 tools, 1 project, 1 agent.`);
}

module.exports = { seed };

// Allow running directly: node backend/runtime/db/seed.cjs
if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
