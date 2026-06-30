"use strict";

/**
 * Mock AgentCore provider.
 * Simulates gateway registration in-memory + DB.
 * No AWS calls — fully offline.
 */

function mockTargetId() {
  return `MOCK${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

async function ensureGateway(conn) {
  return {
    gatewayId:  "mock-gateway-local",
    gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:000000000000:gateway/mock-gateway-local",
    gatewayUrl: "http://localhost:4201/mock-mcp",
  };
}

async function registerTarget({ ltd, etd }) {
  return {
    targetId:    mockTargetId(),
    gatewayId:   "mock-gateway-local",
    gatewayArn:  "arn:aws:bedrock-agentcore:us-east-1:000000000000:gateway/mock-gateway-local",
    gatewayUrl:  "http://localhost:4201/mock-mcp",
    mcpToolName: ltd.tool_key || ltd.toolKey,
    status:      "ACTIVE",
  };
}

// Mock MCP endpoint — handles initialize / tools/list / tools/call
async function handleMcpRequest(body, tools) {
  const { method, id } = body;
  if (method === "initialize") {
    return { jsonrpc: "2.0", id, result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "mock-gateway", version: "1.0.0" },
    }};
  }
  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools } };
  }
  if (method === "tools/call") {
    const toolName = body.params?.name;
    const args     = body.params?.arguments || {};
    return { jsonrpc: "2.0", id, result: {
      content: [{ type: "text", text: `[mock] Called ${toolName} with args: ${JSON.stringify(args)}` }],
    }};
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` }};
}

module.exports = { ensureGateway, registerTarget, handleMcpRequest };
