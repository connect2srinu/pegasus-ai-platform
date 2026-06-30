-- Guardian AI Platform — SQLite schema
-- Used in APP_MODE=mock (default) and APP_MODE=local when DB_TYPE=sqlite.
-- All timestamps stored as ISO-8601 text.

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS organizations (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT,
  owner_email  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS environments (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  environment_type TEXT NOT NULL,  -- DEV | STAGING | PROD
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aws_account_connections (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  environment_id           TEXT REFERENCES environments(id),
  environment_type         TEXT,
  aws_account_id           TEXT,
  account_name             TEXT,
  region                   TEXT NOT NULL DEFAULT 'us-east-1',
  discovery_role_arn       TEXT,
  deployment_role_arn      TEXT,
  provisioning_role_arn    TEXT,
  agent_core_gateway_id    TEXT,
  agent_core_gateway_arn   TEXT,
  agent_core_gateway_url   TEXT,
  status                   TEXT NOT NULL DEFAULT 'CONNECTED',
  last_successful_sync_at  TEXT,
  created_by               TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS org_members (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id       TEXT,
  user_id          TEXT NOT NULL,
  user_email       TEXT NOT NULL,
  role             TEXT NOT NULL DEFAULT 'MEMBER',
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logical_tool_definitions (
  id                   TEXT PRIMARY KEY,
  organization_id      TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tool_key             TEXT NOT NULL,
  display_name         TEXT NOT NULL,
  description          TEXT,
  source_type          TEXT NOT NULL DEFAULT 'LAMBDA',
  source_resource_arn  TEXT,
  input_schema_json    TEXT,
  output_schema_json   TEXT,
  business_owner       TEXT,
  data_classification  TEXT DEFAULT 'internal',
  side_effect_level    TEXT DEFAULT 'READ_ONLY',
  version              TEXT DEFAULT 'v1',
  status               TEXT NOT NULL DEFAULT 'ACTIVE',
  approval_status      TEXT NOT NULL DEFAULT 'PENDING',
  checksum             TEXT,
  created_by           TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ltd_org_key ON logical_tool_definitions(organization_id, tool_key);

CREATE TABLE IF NOT EXISTS tool_approval_requests (
  id                           TEXT PRIMARY KEY,
  organization_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logical_tool_definition_id   TEXT NOT NULL REFERENCES logical_tool_definitions(id) ON DELETE CASCADE,
  requested_by                 TEXT NOT NULL,
  reviewed_by                  TEXT,
  status                       TEXT NOT NULL DEFAULT 'PENDING',
  comments                     TEXT,
  created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS environment_tool_deployments (
  id                           TEXT PRIMARY KEY,
  organization_id              TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  logical_tool_definition_id   TEXT NOT NULL REFERENCES logical_tool_definitions(id) ON DELETE CASCADE,
  environment_id               TEXT NOT NULL REFERENCES environments(id),
  aws_account_connection_id    TEXT REFERENCES aws_account_connections(id),
  source_resource_arn          TEXT,
  gateway_arn                  TEXT,
  gateway_target_id            TEXT,
  mcp_tool_name                TEXT,
  deployment_status            TEXT NOT NULL DEFAULT 'NOT_DEPLOYED',
  wrapper_lambda_arn           TEXT,
  api_gateway_url              TEXT,
  api_stage                    TEXT,
  auto_provisioned             INTEGER NOT NULL DEFAULT 0,
  credential_provider_ref      TEXT,
  created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_etd_ltd_env ON environment_tool_deployments(logical_tool_definition_id, environment_id);

CREATE TABLE IF NOT EXISTS project_tool_grants (
  id                           TEXT PRIMARY KEY,
  project_id                   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id              TEXT NOT NULL REFERENCES organizations(id),
  logical_tool_definition_id   TEXT NOT NULL REFERENCES logical_tool_definitions(id) ON DELETE CASCADE,
  granted_by                   TEXT,
  status                       TEXT NOT NULL DEFAULT 'ACTIVE',
  granted_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ptg_project_tool ON project_tool_grants(project_id, logical_tool_definition_id);

CREATE TABLE IF NOT EXISTS discovered_resources (
  id                       TEXT PRIMARY KEY,
  organization_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  aws_account_connection_id TEXT,
  aws_account_id           TEXT,
  region                   TEXT,
  resource_type            TEXT NOT NULL,
  resource_arn             TEXT,
  resource_id              TEXT,
  resource_name            TEXT,
  parent_resource_id       TEXT,
  discovery_status         TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata_json            TEXT,
  tags_json                TEXT,
  checksum                 TEXT,
  last_seen_at             TEXT,
  created_at               TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agents (
  id               TEXT PRIMARY KEY,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id  TEXT NOT NULL REFERENCES organizations(id),
  name             TEXT NOT NULL,
  description      TEXT,
  system_prompt    TEXT,
  model_id         TEXT,
  status           TEXT NOT NULL DEFAULT 'DRAFT',
  authored_via     TEXT,
  risk_tier        TEXT NOT NULL DEFAULT 'medium',
  created_by       TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE agents ADD COLUMN authored_via TEXT;
ALTER TABLE agents ADD COLUMN risk_tier TEXT NOT NULL DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS agent_approval_requests (
  id               TEXT PRIMARY KEY,
  organization_id  TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id         TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  approver_type    TEXT NOT NULL,
  risk_tier        TEXT NOT NULL DEFAULT 'medium',
  reason           TEXT,
  requested_by     TEXT NOT NULL,
  reviewed_by      TEXT,
  status           TEXT NOT NULL DEFAULT 'pending',
  comments         TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_environment_deployments (
  id                           TEXT PRIMARY KEY,
  agent_id                     TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  project_id                   TEXT NOT NULL REFERENCES projects(id),
  organization_id              TEXT NOT NULL REFERENCES organizations(id),
  environment_id               TEXT NOT NULL REFERENCES environments(id),
  deployment_status            TEXT NOT NULL DEFAULT 'NOT_DEPLOYED',
  agent_core_agent_id          TEXT,
  agent_core_agent_arn         TEXT,
  agent_core_endpoint_id       TEXT,
  agent_core_endpoint_arn      TEXT,
  runtime_name                 TEXT,
  s3_code_location             TEXT,
  deployment_logs              TEXT,
  error_message                TEXT,
  promoted_from_environment_id TEXT,
  deployed_at                  TEXT,
  created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE agent_environment_deployments ADD COLUMN agent_core_endpoint_id  TEXT;
ALTER TABLE agent_environment_deployments ADD COLUMN agent_core_endpoint_arn TEXT;
ALTER TABLE agent_environment_deployments ADD COLUMN runtime_name            TEXT;
ALTER TABLE agent_environment_deployments ADD COLUMN s3_code_location        TEXT;
ALTER TABLE agent_environment_deployments ADD COLUMN deployment_logs         TEXT;
ALTER TABLE agent_environment_deployments ADD COLUMN error_message           TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_aed_agent_env ON agent_environment_deployments(agent_id, environment_id);
