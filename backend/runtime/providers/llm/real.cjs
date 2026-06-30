"use strict";

/**
 * Real LLM provider via AWS Bedrock.
 * Used when USE_REAL_LLM=true (APP_MODE=dev).
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const DEFAULT_MODEL = process.env.LLM_MODEL_ID || "anthropic.claude-haiku-4-5-20251001";

let _client = null;
function client() {
  if (!_client) _client = new BedrockRuntimeClient({ region: process.env.AWS_REGION || "us-east-1" });
  return _client;
}

async function complete({ task, context = {}, prompt: rawPrompt }) {
  const prompt = rawPrompt || buildPrompt(task, context);
  const body = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  };
  const resp = await client().send(new InvokeModelCommand({
    modelId:     DEFAULT_MODEL,
    body:        JSON.stringify(body),
    contentType: "application/json",
    accept:      "application/json",
  }));
  const parsed = JSON.parse(Buffer.from(resp.body).toString("utf8"));
  const text   = parsed.content?.[0]?.text || "";
  return { text, usage: parsed.usage || {}, isMock: false };
}

function buildPrompt(task, ctx) {
  if (task === "generate-system-prompt")
    return `Write a concise system prompt for an AI agent named "${ctx.agentName}" that: ${ctx.description}. Output only the system prompt text.`;
  if (task === "suggest-tool-schema")
    return `Generate a JSON Schema (draft-07) for a tool named "${ctx.toolKey}" described as: ${ctx.description}. Output only valid JSON.`;
  return ctx.prompt || JSON.stringify(ctx);
}

async function streamComplete({ task, context = {}, onChunk }) {
  const { text } = await complete({ task, context });
  onChunk(text);
  return { text, isMock: false };
}

module.exports = { complete, streamComplete };
