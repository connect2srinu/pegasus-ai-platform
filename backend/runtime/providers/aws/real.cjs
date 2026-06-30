"use strict";

/**
 * Real AWS provider — delegates to the existing scripts/services/ layer.
 * Used when USE_REAL_AWS=true (APP_MODE=dev).
 */

const path = require("path");
const SERVICES = path.join(__dirname, "../../../../scripts/services");

async function discoverResources(orgId, connId, conn) {
  const { runInventorySync } = require(path.join(SERVICES, "inventory-scanner.cjs"));
  const connection = { id: connId, ...(conn || {}), enabledRegions: conn?.enabledRegions || [conn?.region || "us-east-1"] };
  const { resources } = await runInventorySync(connection, orgId);
  return resources;
}

async function deployToGateway({ ltd, etd, conn, discoveredResources }) {
  const { deployTool } = require(path.join(SERVICES, "gateway-deployer.cjs"));
  return deployTool({ ltd, etd, conn, discoveredResources });
}

module.exports = { discoverResources, deployToGateway };
