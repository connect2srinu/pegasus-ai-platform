"use strict";

/**
 * Mock LLM provider.
 * Returns canned responses for agent authoring flows without calling Bedrock.
 */

const CANNED = {
  "generate-system-prompt": (ctx) =>
    `You are a helpful AI assistant for ${ctx.agentName || "this application"}. ` +
    `${ctx.description ? ctx.description + " " : ""}` +
    `Always be concise, accurate, and professional.`,

  "suggest-tool-schema": (ctx) =>
    JSON.stringify({
      type: "object",
      properties: {
        input: { type: "string", description: `Input for ${ctx.toolKey || "this tool"}` },
      },
      required: ["input"],
    }, null, 2),

  "summarize-agent": (ctx) =>
    `Agent '${ctx.agentName || "unnamed"}' — ${ctx.description || "no description provided"}.`,

  default: (ctx) =>
    `[mock LLM response for: ${ctx.prompt || JSON.stringify(ctx).slice(0, 80)}]`,
};

async function complete({ task, context = {} }) {
  const fn = CANNED[task] || CANNED.default;
  const text = fn(context);
  return { text, usage: { inputTokens: 0, outputTokens: 0 }, isMock: true };
}

async function streamComplete({ task, context = {}, onChunk }) {
  const { text } = await complete({ task, context });
  for (const word of text.split(" ")) {
    onChunk(word + " ");
    await new Promise(r => setTimeout(r, 20));
  }
  return { text, isMock: true };
}

module.exports = { complete, streamComplete };
