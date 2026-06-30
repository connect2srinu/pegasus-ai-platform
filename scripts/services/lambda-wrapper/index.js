"use strict";

/**
 * AgentCore Gateway → API Gateway MCP proxy wrapper.
 *
 * This Lambda implements the MCP server protocol over Lambda invocation.
 * AgentCore Gateway calls this Lambda with MCP JSON-RPC messages; the handler
 * translates `tools/call` into HTTP requests to the configured API Gateway endpoint.
 *
 * Required environment variables (set at deploy time by wrapper-deployer):
 *   TOOL_KEY          snake_case tool identifier (e.g. "pegasusclaimsapi")
 *   TOOL_NAME         Human-readable name
 *   TOOL_DESCRIPTION  Tool description surfaced to agents
 *   API_GATEWAY_URL   Base invoke URL (e.g. "https://abc123.execute-api.us-east-1.amazonaws.com")
 *   API_STAGE         Stage name (e.g. "prod", "v1") — prepended to all paths
 *
 * Optional environment variables:
 *   DEFAULT_PATH      Default resource path when not provided in arguments (default: "/")
 *   DEFAULT_METHOD    Default HTTP method (default: "POST")
 *   API_KEY           x-api-key header value for API Gateway API keys
 *   INPUT_SCHEMA_JSON JSON string of the MCP inputSchema for this tool
 */

const https = require("https");
const http  = require("http");

// ── MCP protocol constants ────────────────────────────────────────────────────

const MCP_VERSION = "2024-11-05";

// ── Config ────────────────────────────────────────────────────────────────────

function config() {
  return {
    toolKey:         process.env.TOOL_KEY          || "api_gateway_tool",
    toolName:        process.env.TOOL_NAME         || "API Gateway Tool",
    toolDescription: process.env.TOOL_DESCRIPTION  || "Proxies requests to an API Gateway REST endpoint.",
    baseUrl:         process.env.API_GATEWAY_URL,
    stage:           process.env.API_STAGE         || "",
    defaultPath:     process.env.DEFAULT_PATH      || "/",
    defaultMethod:   process.env.DEFAULT_METHOD    || "POST",
    apiKey:          process.env.API_KEY            || null,
    inputSchema:     parseInputSchema(),
  };
}

function parseInputSchema() {
  const raw = process.env.INPUT_SCHEMA_JSON;
  if (!raw) {
    return {
      type: "object",
      properties: {
        path:    { type: "string",  description: "Resource path relative to the API stage (e.g. /claims/123)" },
        method:  { type: "string",  description: "HTTP method: GET, POST, PUT, DELETE, PATCH", enum: ["GET","POST","PUT","DELETE","PATCH"] },
        body:    { type: "object",  description: "Request body (for POST/PUT/PATCH)" },
        headers: { type: "object",  description: "Additional HTTP headers to pass through" },
        query:   { type: "object",  description: "Query string parameters" },
      },
    };
  }
  try { return JSON.parse(raw); } catch { return { type: "object" }; }
}

// ── MCP handler ───────────────────────────────────────────────────────────────

exports.handler = async (event) => {
  const cfg = config();

  // ── initialize ──
  if (event.method === "initialize") {
    return mcpOk(event.id, {
      protocolVersion: MCP_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: cfg.toolKey, version: "1.0.0" },
    });
  }

  // ── tools/list ──
  if (event.method === "tools/list") {
    return mcpOk(event.id, {
      tools: [{
        name:        cfg.toolKey,
        description: cfg.toolDescription,
        inputSchema: cfg.inputSchema,
      }],
    });
  }

  // ── tools/call ──
  if (event.method === "tools/call") {
    if (!cfg.baseUrl) {
      return mcpError(event.id, -32603, "API_GATEWAY_URL environment variable is not configured.");
    }

    const args    = event.params?.arguments || {};
    const path    = args.path    || cfg.defaultPath;
    const method  = (args.method || cfg.defaultMethod).toUpperCase();
    const body    = args.body;
    const query   = args.query   || {};
    const headers = args.headers || {};

    try {
      const result = await callApiGateway({ cfg, path, method, body, query, headers });
      const text   = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      return mcpOk(event.id, {
        content: [{ type: "text", text }],
      });
    } catch (err) {
      return mcpError(event.id, -32603, err.message);
    }
  }

  // ── notifications/initialized (fire-and-forget, no response needed) ──
  if (event.method?.startsWith("notifications/")) {
    return null;
  }

  return mcpError(event.id, -32601, `Method not found: ${event.method}`);
};

// ── API Gateway HTTP call ─────────────────────────────────────────────────────

async function callApiGateway({ cfg, path, method, body, query, headers }) {
  const stagePart  = cfg.stage ? `/${cfg.stage}` : "";
  const queryStr   = Object.keys(query).length
    ? "?" + new URLSearchParams(query).toString()
    : "";
  const fullUrl    = `${cfg.baseUrl}${stagePart}${path}${queryStr}`;
  const url        = new URL(fullUrl);
  const bodyStr    = body !== undefined ? JSON.stringify(body) : null;

  const reqHeaders = {
    "Content-Type": "application/json",
    "Accept":       "application/json",
    ...headers,
  };
  if (bodyStr) reqHeaders["Content-Length"] = Buffer.byteLength(bodyStr).toString();
  if (cfg.apiKey) reqHeaders["x-api-key"] = cfg.apiKey;

  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  reqHeaders,
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (res.statusCode >= 400) {
          reject(new Error(`API Gateway ${method} ${path} → HTTP ${res.statusCode}: ${raw.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── MCP response helpers ──────────────────────────────────────────────────────

function mcpOk(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function mcpError(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}
