import { PROJECT_IDS, mockRuns, AGENT_TYPES } from "./constants.js";

export function projectId(project) {
  return PROJECT_IDS[project] || project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function titleCase(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function statusClass(value) {
  const lower = String(value).toLowerCase();
  if (lower.includes("success") || lower.includes("approved") || lower.includes("active") || lower.includes("deployed")) return "green";
  if (lower.includes("review") || lower.includes("submitted") || lower.includes("request") || lower.includes("pending")) return "blue";
  if (lower.includes("denied") || lower.includes("failed") || lower.includes("suspend") || lower.includes("restricted") || lower.includes("rejected")) return "red";
  return "gray";
}

export function riskClass(value) {
  return String(value || "medium").toLowerCase();
}

export function number(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

export function normalizeAgent(agent) {
  const runs = mockRuns[agent.id] || [];
  const totalTokens = runs.reduce((sum, run) => sum + run.inputTokens + run.outputTokens, 0);
  return {
    ...agent,
    runtime: agent.runtime || AGENT_TYPES[agent.agentType] || agent.agentType,
    lifecycle: titleCase(agent.lifecycle),
    deployment: titleCase(agent.deployment || "not_deployed"),
    risk: titleCase(agent.risk || "medium"),
    runs,
    tokens24h: totalTokens,
    cost24h: totalTokens ? `$${(totalTokens / 1000 * 0.018).toFixed(2)}` : "$0.00",
    successRate: runs.length ? `${Math.round((runs.filter((run) => run.status === "Success").length / runs.length) * 100)}%` : "No runs",
    lastRun: runs[0]?.started || "No runs yet",
  };
}

export async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
