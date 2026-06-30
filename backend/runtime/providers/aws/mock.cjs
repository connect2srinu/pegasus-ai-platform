"use strict";

/**
 * Mock AWS provider.
 * discoverResources returns synthetic data stored in the DB (seeded or previously saved).
 * No real AWS calls are made — safe for fully offline development.
 */

const { getDb } = require("../../db/index.cjs");

async function discoverResources(orgId, connId) {
  const db = await getDb();
  const { rows } = await db.query(
    "SELECT * FROM discovered_resources WHERE organization_id = ? AND discovery_status = 'ACTIVE'",
    [orgId]
  );
  return rows;
}

async function deployToGateway({ ltd, etd }) {
  // Mock: simulate Gateway target creation
  const mockTargetId = `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  return {
    targetId:    mockTargetId,
    gatewayId:   "mock-gateway-id",
    gatewayArn:  "arn:aws:bedrock-agentcore:us-east-1:000000000000:gateway/mock-gateway",
    gatewayUrl:  "http://localhost:4201/mock-mcp",
    mcpToolName: ltd.tool_key || ltd.toolKey,
    status:      "ACTIVE",
  };
}

module.exports = { discoverResources, deployToGateway };
