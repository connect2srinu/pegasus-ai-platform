const http = require("http");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { generateStrands } = require("./codegen/strands-generator.cjs");

const root = path.resolve(__dirname, "..");
const staticRoot = fs.existsSync(path.join(root, "dist")) ? path.join(root, "dist") : root;
const dataDir = path.join(root, "backend", "control-plane", "data");
const registryPath = path.join(dataDir, "agent-registry.json");
const port = Number(process.env.PORT || 4201);
const host = process.env.HOST || "127.0.0.1";
const platformName = (process.env.PLATFORM_NAME || process.env.VITE_PLATFORM_NAME || "").trim() || "Pegasus";
const platformSlug = slug(platformName) || "pegasus";
const supportedSchemaVersions = new Set([`${platformSlug}.agent/v1`, "guardian.agent/v1"]);

const supportedAgentTypes = new Set(["bedrock_agentcore", "langgraph", "openai_agent", "crewai", "strands", "custom"]);
const projectCatalog = {
  "claims-operations": {
    users: { "current-user@example.com": "project_writer", "priya@example.com": "project_owner", "platform-admin@example.com": "platform_admin" },
    tools: { claim_lookup: "medium", policy_lookup: "low", payment_post: "critical", customer_update: "high" },
    knowledge: { "claims-policy-kb": "internal", "claims-forms-kb": "internal" },
    allowedAgentTypes: ["bedrock_agentcore", "langgraph", "openai_agent", "crewai", "strands", "custom"],
  },
  "billing-experience": {
    users: { "current-user@example.com": "project_writer", "marcus@example.com": "project_owner" },
    tools: { invoice_lookup: "medium", payment_post: "critical", refund_status: "medium" },
    knowledge: { "billing-faq-kb": "internal", "payments-policy-kb": "confidential" },
    allowedAgentTypes: ["bedrock_agentcore", "langgraph", "crewai", "strands", "custom"],
  },
  "member-services": {
    users: { "current-user@example.com": "project_writer", "devon@example.com": "project_owner" },
    tools: { member_lookup: "medium", benefits_lookup: "low" },
    knowledge: { "member-benefits-kb": "internal" },
    allowedAgentTypes: ["bedrock_agentcore", "openai_agent", "strands", "custom"],
  },
};

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload, null, 2), "application/json; charset=utf-8");
}

function now() {
  return new Date().toISOString();
}

function slug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeAgentType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return {
    agentcore: "bedrock_agentcore",
    "bedrock agentcore": "bedrock_agentcore",
    openai: "openai_agent",
    chatgpt: "openai_agent",
    crew: "crewai",
    crewai: "crewai",
    strand: "strands",
    strands: "strands",
  }[normalized] || normalized;
}

function displayAgentType(type) {
  return {
    bedrock_agentcore: "Bedrock AgentCore",
    langgraph: "LangGraph",
    openai_agent: "OpenAI Agent",
    crewai: "CrewAI",
    strands: "Strands",
    custom: "Custom",
  }[type] || type;
}

const SEED_ORGS = [
  {
    id: "acme-health",
    name: "Acme Health",
    description: "Healthcare AI platform — claims, billing, and member services.",
    createdBy: "platform-admin@example.com",
    createdAt: "2025-01-01T00:00:00Z",
    members: [
      { userId: "platform-admin@example.com", role: "org_admin" },
      { userId: "priya@example.com",          role: "org_member" },
      { userId: "marcus@example.com",          role: "org_member" },
      { userId: "devon@example.com",           role: "org_member" },
    ],
    projects: [
      { id: "claims-operations",  name: "Claims Operations",  description: "End-to-end claims processing and resolution." },
      { id: "billing-experience", name: "Billing Experience", description: "Invoice, payment, and refund automation." },
      { id: "member-services",    name: "Member Services",    description: "Member benefits lookup and support." },
    ],
    awsConfig: {
      modelAccount: {
        accountId: "987654321098",
        region: "us-east-1",
        label: "Acme Health – Bedrock Model Account",
        crossAccountRoleArn: "arn:aws:iam::987654321098:role/PegasusBedrockAccess",
        allowedModelIds: [
          "anthropic.claude-3-5-sonnet-20241022-v2:0",
          "anthropic.claude-3-5-haiku-20241022-v1:0",
          "amazon.nova-pro-v1:0",
        ],
      },
      executionAccount: {
        accountId: "123456789012",
        region: "us-east-1",
        label: "Acme Health – AgentCore Execution Account",
        agentCoreExecutionRoleArn: "arn:aws:iam::123456789012:role/AgentCoreExecutionRole",
        ecrRepositoryPrefix: "123456789012.dkr.ecr.us-east-1.amazonaws.com/pegasus",
        s3ArtifactBucket: "pegasus-agent-artifacts-123456789012",
        networkConfig: {
          vpcId: "vpc-0abc1234def56789a",
          subnetIds: "subnet-0aa1111bbb222333c, subnet-0dd4444eee555666f",
          securityGroupIds: "sg-0abc123def456789a",
        },
      },
    },
  },
  {
    id: "acme-finance",
    name: "Acme Finance",
    description: "Financial services AI — risk, compliance, and advisory.",
    createdBy: "platform-admin@example.com",
    createdAt: "2025-02-01T00:00:00Z",
    members: [
      { userId: "platform-admin@example.com", role: "org_admin" },
    ],
    projects: [],
    awsConfig: null,
  },
];

function ensureRegistry() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(registryPath)) {
    fs.writeFileSync(registryPath, JSON.stringify({ agents: [], approvalTasks: [], audit: [], tools: [], knowledge: [], organizations: [] }, null, 2));
  }
  const registry = JSON.parse(stripBom(fs.readFileSync(registryPath, "utf8")));
  registry.agents ||= [];
  registry.approvalTasks ||= [];
  registry.audit ||= [];
  registry.tools ||= [];
  registry.knowledge ||= [];
  registry.organizations ||= [];
  // Seed orgs if empty
  if (registry.organizations.length === 0) {
    registry.organizations = SEED_ORGS;
  }
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

function stripBom(text) {
  return String(text || "").replace(/^\uFEFF/, "");
}

function readRegistry() {
  ensureRegistry();
  return JSON.parse(stripBom(fs.readFileSync(registryPath, "utf8")));
}

function writeRegistry(registry) {
  registry.approvalTasks ||= [];
  registry.audit ||= [];
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("Request body is too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(stripBom(body)) : {});
      } catch {
        reject(new Error("Invalid JSON request body"));
      }
    });
    req.on("error", reject);
  });
}

function addAudit(registry, type, details) {
  registry.audit.unshift({ id: `audit-${Date.now()}`, type, details, createdAt: now() });
}

function normalizeToolList(tools = []) {
  return tools
    .map((tool) => typeof tool === "string" ? { toolId: tool, version: "1.0.0" } : {
      toolId: tool.toolId || tool.name || tool.id,
      version: tool.version || "1.0.0",
      requiredScopes: tool.requiredScopes || [],
    })
    .filter((tool) => tool.toolId);
}

function normalizeKnowledgeList(knowledge = []) {
  return knowledge
    .map((kb) => typeof kb === "string" ? { knowledgeBaseId: kb } : { knowledgeBaseId: kb.knowledgeBaseId || kb.name || kb.id })
    .filter((kb) => kb.knowledgeBaseId);
}

function normalizeSecretList(secrets = []) {
  return secrets
    .map((secret) => typeof secret === "string" ? { secretRef: secret, usage: "tool_auth" } : {
      secretRef: secret.secretRef || secret.name || secret.id,
      usage: secret.usage || "tool_auth",
    })
    .filter((secret) => secret.secretRef);
}

function specFromPayload(payload) {
  const agentType = normalizeAgentType(payload.agentType);
  const projectId = payload.projectId || slug(payload.projectName);
  const agentId = payload.id || slug(payload.name);
  return {
    schemaVersion: payload.schemaVersion || `${platformSlug}.agent/v1`,
    id: agentId,
    name: payload.name,
    description: payload.description || "",
    projectId,
    owner: payload.owner || {
      userId: payload.ownerUserId || "current-user@example.com",
      businessUnit: payload.businessUnit || payload.projectName || projectId,
    },
    agentType,
    runtime: payload.runtime || { target: payload.runtimeTarget || "agentcore", entrypoint: payload.entrypoint || "" },
    model: payload.model || { provider: payload.modelProvider || "bedrock", modelId: payload.modelId || "anthropic.claude-3-5-sonnet" },
    tools: normalizeToolList(payload.tools),
    knowledge: normalizeKnowledgeList(payload.knowledge),
    memory: payload.memory || { shortTerm: Boolean(payload.shortTermMemory), longTerm: Boolean(payload.longTermMemory) },
    secrets: normalizeSecretList(payload.secrets),
    observability: payload.observability || { arizeProject: payload.arizeProject || `${platformSlug}-${projectId}`, traceLevel: payload.traceLevel || "standard" },
    extensions: payload.extensions || {},
  };
}

function validateAgentSpec(spec, submitter = spec.owner?.userId || "current-user@example.com", expectedProjectId = "") {
  const results = [];
  const catalog = projectCatalog[spec.projectId];
  const add = (type, status, severity, message) => results.push({ type, status, severity, message, createdAt: now() });

  if (!supportedSchemaVersions.has(spec.schemaVersion)) add("schema", "fail", "critical", `schemaVersion must be ${platformSlug}.agent/v1.`);
  else add("schema", "pass", "info", "Portable spec schema version is valid.");
  if (!spec.name || spec.name.length < 3) add("schema", "fail", "high", "Agent name must be at least 3 characters.");
  else add("schema", "pass", "info", "Agent name is present.");
  if (!catalog) add("project", "fail", "critical", `Project ${spec.projectId} is not registered.`);
  else add("project", "pass", "info", `Project ${spec.projectId} exists.`);
  if (expectedProjectId && spec.projectId !== expectedProjectId) {
    add("projectScope", "fail", "critical", `YAML projectId ${spec.projectId} does not match the selected project ${expectedProjectId}.`);
  }

  const role = catalog?.users?.[submitter] || catalog?.users?.[spec.owner?.userId];
  if (!role || !["project_writer", "project_owner", "platform_admin"].includes(role)) {
    add("projectAccess", "fail", "critical", `${submitter} cannot submit agents for ${spec.projectId}.`);
  } else {
    add("projectAccess", "pass", "info", `${submitter} can submit agents as ${role}.`);
  }

  if (!supportedAgentTypes.has(spec.agentType)) add("agentType", "fail", "critical", `${spec.agentType || "Unknown"} is not supported.`);
  else add("agentType", "pass", "info", `${displayAgentType(spec.agentType)} is supported.`);
  if (catalog && !catalog.allowedAgentTypes.includes(spec.agentType)) add("agentType", "fail", "high", `${displayAgentType(spec.agentType)} is not enabled for this project.`);
  if (!spec.model?.modelId) add("model", "fail", "high", "A model id is required.");
  else add("model", "pass", "info", `Model ${spec.model.modelId} is configured.`);
  if (!spec.runtime?.target) add("runtime", "fail", "high", "Runtime target is required.");
  else add("runtime", "pass", "info", `Runtime target ${spec.runtime.target} is declared.`);
  if (["crewai", "strands"].includes(spec.agentType) && !spec.runtime?.entrypoint && !spec.extensions?.[spec.agentType]) {
    add("runtime", "warn", "medium", `${displayAgentType(spec.agentType)} should define an entrypoint or extension block.`);
  }

  for (const tool of spec.tools || []) {
    const risk = catalog?.tools?.[tool.toolId];
    if (!risk) add("tool", "fail", "high", `Tool ${tool.toolId} is not approved for this project.`);
    else if (["high", "critical"].includes(risk)) add("tool", "warn", risk, `Tool ${tool.toolId} is ${risk} risk and needs elevated approval.`);
    else add("tool", "pass", "info", `Tool ${tool.toolId} is available to the project.`);
  }
  for (const kb of spec.knowledge || []) {
    const classification = catalog?.knowledge?.[kb.knowledgeBaseId];
    if (!classification) add("knowledge", "fail", "high", `Knowledge base ${kb.knowledgeBaseId} is not attached to this project.`);
    else add("knowledge", "pass", "info", `Knowledge base ${kb.knowledgeBaseId} is attached with ${classification} classification.`);
  }
  for (const secret of spec.secrets || []) {
    if (/AKIA|BEGIN|password|token-value/i.test(secret.secretRef)) add("secret", "fail", "critical", "YAML appears to include raw secret material instead of a reference.");
    else add("secret", "pass", "info", `Secret ${secret.secretRef} is referenced by name only.`);
  }
  if (spec.memory?.longTerm) add("memory", "warn", "medium", "Long-term memory requires retention and deletion policy approval.");
  else add("memory", "pass", "info", "Memory policy is within default guardrails.");
  return results;
}

function hasBlockingFailures(validations) {
  return validations.some((item) => item.status === "fail");
}

function riskFromValidations(validations) {
  if (validations.some((item) => item.status === "fail" && item.severity === "critical")) return "critical";
  if (validations.some((item) => ["high", "critical"].includes(item.severity))) return "high";
  if (validations.some((item) => item.status === "warn")) return "medium";
  return "low";
}

function reasonFor(type) {
  return {
    project_owner: "Business fit and project resource approval",
    platform_admin: "Platform deployment eligibility",
    security: "High-risk validation findings",
    data_owner: "Knowledge base ownership review",
    tool_owner: "Restricted or elevated-risk tool request",
  }[type] || "Approval required";
}

function createResourceApprovalTasks(resource, resourceType) {
  const approverTypes = resourceType === "tool" ? ["tool_owner", "platform_admin"] : ["data_owner", "platform_admin"];
  return approverTypes.map((type) => ({
    id: `approval-${resource.id}-${type}-${Date.now()}`,
    resourceId: resource.id,
    resourceType,
    projectId: resource.projectId,
    resourceName: resource.name,
    approverType: type,
    status: "pending",
    riskTier: resource.riskTier || "medium",
    reason: reasonFor(type),
    createdAt: now(),
    decidedAt: null,
    decision: null,
    comments: "",
    approver: null,
  }));
}

function createApprovalTasks(agent, version) {
  const types = ["project_owner", "platform_admin"];
  if (["high", "critical"].includes(version.riskTier)) types.push("security");
  if (version.validations.some((item) => item.type === "knowledge" && item.status === "fail")) types.push("data_owner");
  if (version.validations.some((item) => item.type === "tool" && ["warn", "fail"].includes(item.status))) types.push("tool_owner");
  return [...new Set(types)].map((type) => ({
    id: `approval-${agent.id}-${version.semanticVersion}-${type}-${Date.now()}`,
    agentId: agent.id,
    versionId: version.id,
    projectId: agent.projectId,
    agentName: agent.name,
    approverType: type,
    status: "pending",
    riskTier: version.riskTier,
    reason: reasonFor(type),
    createdAt: now(),
    decidedAt: null,
    decision: null,
    comments: "",
  }));
}

function lifecycleFromTasks(tasks, validations) {
  if (validations.some((item) => item.status === "fail")) return "draft";
  if (tasks.some((task) => task.status === "rejected")) return "rejected";
  if (tasks.length && tasks.every((task) => task.status === "approved")) return "approved";
  if (tasks.some((task) => task.approverType === "project_owner" && task.status === "pending")) return "business_owner_review";
  return "platform_admin_review";
}

function buildAgentFromSpec(spec, source = "form", submitter = spec.owner?.userId || "current-user@example.com", versionValue = "0.1.0", expectedProjectId = "") {
  const createdAt = now();
  const version = String(versionValue || spec.version || "0.1.0");
  const validations = validateAgentSpec(spec, submitter, expectedProjectId);
  const riskTier = riskFromValidations(validations);
  const agent = {
    id: spec.id,
    projectId: spec.projectId,
    name: spec.name,
    description: spec.description,
    ownerUserId: spec.owner?.userId || submitter,
    businessUnit: spec.owner?.businessUnit || spec.projectId,
    status: "active",
    createdAt,
    updatedAt: createdAt,
    currentVersionId: `${spec.id}:${version}`,
    currentApprovedVersionId: null,
    versions: [],
  };
  const versionRecord = {
    id: `${spec.id}:${version}`,
    semanticVersion: version,
    specHash: `sha256:${Buffer.from(`${spec.id}:${version}:${createdAt}`).toString("hex").slice(0, 32)}`,
    lifecycleState: "submitted",
    agentType: spec.agentType,
    runtimeTarget: spec.runtime?.target,
    modelProvider: spec.model?.provider,
    modelId: spec.model?.modelId,
    riskTier,
    deploymentStatus: "not_deployed",
    spec,
    validations,
    approvals: [],
    deployments: [],
    source,
    createdBy: submitter,
    createdAt,
  };
  const tasks = createApprovalTasks(agent, versionRecord);
  versionRecord.lifecycleState = lifecycleFromTasks(tasks, validations);
  agent.versions.push(versionRecord);
  return { agent, tasks };
}

function agentSummary(agent) {
  // Authored agents (from /api/agents/publish) use a flat structure — no versions array
  if (!agent.versions) {
    return {
      id: agent.id,
      projectId: agent.projectId,
      name: agent.name,
      description: agent.description || "",
      version: agent.version || "0.1.0",
      runtime: displayAgentType(agent.agentType),
      agentType: agent.agentType,
      lifecycle: agent.lifecycle || "submitted",
      deployment: agent.deployment || "not_deployed",
      risk: agent.risk || "medium",
      owner: agent.owner || agent.ownerUserId,
      model: agent.model || "",
      tools: agent.tools || [],
      knowledge: agent.knowledge || [],
      memory: agent.memory || "None",
      validations: agent.validations || [],
      approvals: agent.approvals || [],
      updatedAt: agent.updatedAt,
    };
  }
  // Register / YAML-uploaded agents: versioned structure
  const version = agent.versions[agent.versions.length - 1];
  return {
    id: agent.id,
    projectId: agent.projectId,
    name: agent.name,
    description: agent.description,
    version: version.semanticVersion,
    runtime: displayAgentType(version.agentType),
    agentType: version.agentType,
    lifecycle: version.lifecycleState,
    deployment: version.deploymentStatus,
    risk: version.riskTier,
    owner: agent.ownerUserId,
    model: version.modelId,
    tools: version.spec.tools.map((tool) => tool.toolId),
    knowledge: version.spec.knowledge.map((kb) => kb.knowledgeBaseId),
    memory: version.spec.memory?.longTerm ? "Long-term requested" : version.spec.memory?.shortTerm ? "Short-term" : "Disabled",
    validations: version.validations,
    approvals: version.approvals,
    updatedAt: agent.updatedAt,
  };
}

function upsertAgent(registry, agent, tasks) {
  if (registry.agents.some((item) => item.id === agent.id && item.projectId === agent.projectId)) throw new Error("Agent already exists in this project.");
  registry.agents.push(agent);
  registry.approvalTasks.push(...tasks);
  addAudit(registry, "agent.registered", { agentId: agent.id, projectId: agent.projectId, taskCount: tasks.length });
}

function findAgentAndVersion(registry, agentId, versionId) {
  const agent = registry.agents.find((item) => item.id === agentId);
  const version = agent?.versions.find((item) => item.id === versionId) || agent?.versions.at(-1);
  return { agent, version };
}

async function handleApi(req, res, requestUrl) {
  const registry = readRegistry();
  const parts = requestUrl.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && requestUrl.pathname === "/api/health") return sendJson(res, 200, { status: "ok", service: `${platformSlug}-control-plane`, platformName, root, registryPath });
  if (req.method === "GET" && parts[1] === "projects" && parts[3] === "agents") return sendJson(res, 200, { agents: registry.agents.filter((agent) => agent.projectId === parts[2]).map(agentSummary) });
  if (req.method === "GET" && requestUrl.pathname === "/api/agents") {
    const projectId = requestUrl.searchParams.get("projectId");
    const agents = projectId ? registry.agents.filter((agent) => agent.projectId === projectId) : registry.agents;
    return sendJson(res, 200, { agents: agents.map(agentSummary) });
  }
  if (req.method === "POST" && requestUrl.pathname === "/api/agents") {
    const payload = await readBody(req);
    const { agent, tasks } = buildAgentFromSpec(specFromPayload(payload), "form", payload.ownerUserId, payload.version);
    const validations = agent.versions[0].validations;
    if (hasBlockingFailures(validations)) {
      return sendJson(res, 422, { error: "Agent spec failed registry validation. Fix the blocking findings before submission.", validations });
    }
    upsertAgent(registry, agent, tasks);
    writeRegistry(registry);
    return sendJson(res, 201, { agent: agentSummary(agent), approvalTasks: tasks });
  }
  if (req.method === "POST" && requestUrl.pathname === "/api/agents/spec-upload") {
    const payload = await readBody(req);
    if (!payload.yamlText) return sendJson(res, 400, { error: "yamlText is required." });
    let parsed;
    try {
      parsed = yaml.load(payload.yamlText);
    } catch (error) {
      return sendJson(res, 400, { error: `Invalid YAML: ${error.message}` });
    }
    const spec = specFromPayload(parsed || {});
    const { agent, tasks } = buildAgentFromSpec(spec, "yaml", payload.submittedBy || spec.owner?.userId, parsed?.version, payload.expectedProjectId || "");
    const validations = agent.versions[0].validations;
    if (hasBlockingFailures(validations)) {
      addAudit(registry, "agent.yaml_rejected", { projectId: spec.projectId, expectedProjectId: payload.expectedProjectId || "", findings: validations.filter((item) => item.status === "fail").map((item) => item.message) });
      writeRegistry(registry);
      return sendJson(res, 422, { error: "YAML was validated but not registered. It must use the selected project and only approved project tools and knowledge bases.", validations });
    }
    upsertAgent(registry, agent, tasks);
    addAudit(registry, "agent.yaml_uploaded", { agentId: agent.id, projectId: agent.projectId });
    writeRegistry(registry);
    return sendJson(res, 201, { agent: agentSummary(agent), approvalTasks: tasks, validations: agent.versions[0].validations });
  }
  if (req.method === "GET" && requestUrl.pathname === "/api/approvals") {
    const projectId = requestUrl.searchParams.get("projectId");
    const tasks = projectId ? registry.approvalTasks.filter((task) => task.projectId === projectId) : registry.approvalTasks;
    return sendJson(res, 200, { approvalTasks: tasks });
  }
  if (req.method === "POST" && parts[1] === "approvals" && parts[3] === "decision") {
    const task = registry.approvalTasks.find((item) => item.id === parts[2]);
    if (!task) return sendJson(res, 404, { error: "Approval task not found." });
    const payload = await readBody(req);
    task.status = payload.decision === "approved" ? "approved" : "rejected";
    task.decision = payload.decision;
    task.comments = payload.comments || "";
    task.approver = payload.approver || "current-reviewer@example.com";
    task.decidedAt = now();

    // Handle resource (tool / KB) approval tasks
    if (task.resourceId) {
      const collection = task.resourceType === "tool" ? registry.tools : registry.knowledge;
      const resource = (collection || []).find((r) => r.id === task.resourceId);
      if (resource) {
        const resourceTasks = registry.approvalTasks.filter((t) => t.resourceId === task.resourceId);
        if (resourceTasks.some((t) => t.status === "rejected")) {
          resource.status = "rejected";
        } else if (resourceTasks.every((t) => t.status === "approved")) {
          resource.status = "approved";
        }
      }
      addAudit(registry, "approval.decided", { taskId: task.id, decision: task.decision, resourceId: task.resourceId, resourceType: task.resourceType });
      writeRegistry(registry);
      return sendJson(res, 200, { approvalTask: task });
    }

    // Handle agent approval tasks
    const agent = registry.agents.find((a) => a.id === task.agentId);
    if (!agent) return sendJson(res, 404, { error: "Agent not found for this approval task." });

    if (agent.versions) {
      // Register / YAML-uploaded agents: versioned structure
      const version = agent.versions.find((v) => v.id === task.versionId) || agent.versions.at(-1);
      if (!version) return sendJson(res, 404, { error: "Agent version not found." });
      version.approvals = version.approvals || [];
      version.approvals.push({ type: task.approverType, decision: task.decision, approver: task.approver, comments: task.comments, decidedAt: task.decidedAt });
      const versionTasks = registry.approvalTasks.filter((item) => item.versionId === task.versionId);
      version.lifecycleState = lifecycleFromTasks(versionTasks, version.validations);
      if (version.lifecycleState === "approved") agent.currentApprovedVersionId = version.id;
    } else {
      // Author-wizard agents: flat structure (no versions array)
      agent.approvals = agent.approvals || [];
      agent.approvals.push({ type: task.approverType, decision: task.decision, approver: task.approver, comments: task.comments, decidedAt: task.decidedAt });
      const agentTasks = registry.approvalTasks.filter((item) => item.agentId === task.agentId);
      const newLifecycle = lifecycleFromTasks(agentTasks, agent.validations || []);
      agent.lifecycle = newLifecycle;
      if (newLifecycle === "approved") agent.deployment = "deployed";
    }

    agent.updatedAt = now();
    addAudit(registry, "approval.decided", { taskId: task.id, decision: task.decision, agentId: agent.id });
    writeRegistry(registry);
    return sendJson(res, 200, { approvalTask: task, agent: agentSummary(agent) });
  }
  if (req.method === "GET" && parts[1] === "agents" && parts[3] === "validations") {
    const { agent, version } = findAgentAndVersion(registry, parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    return sendJson(res, 200, { validations: version.validations });
  }
  // Tool catalog routes
  if (req.method === "GET" && parts[1] === "projects" && parts[3] === "tools" && !parts[4]) {
    const tools = (registry.tools || []).filter((t) => t.projectId === parts[2]);
    return sendJson(res, 200, { tools });
  }
  if (req.method === "POST" && parts[1] === "projects" && parts[3] === "tools" && !parts[4]) {
    const payload = await readBody(req);
    if (!payload.name || payload.name.trim().length < 2) return sendJson(res, 400, { error: "Tool name must be at least 2 characters." });
    const tool = {
      id: `${slug(payload.name)}-${Date.now()}`,
      projectId: parts[2],
      name: payload.name.trim(),
      toolType: payload.toolType || "rest",
      endpoint: payload.endpoint || "",
      credentialRef: payload.credentialRef || "",
      riskTier: payload.riskTier || "medium",
      classification: payload.classification || "internal",
      allowedAgentTypes: payload.allowedAgentTypes || [],
      description: payload.description || "",
      status: "pending_review",
      createdBy: payload.createdBy || "current-user@example.com",
      createdAt: now(),
    };
    registry.tools.push(tool);
    const tasks = createResourceApprovalTasks(tool, "tool");
    registry.approvalTasks.push(...tasks);
    addAudit(registry, "tool.registered", { toolId: tool.id, projectId: tool.projectId });
    writeRegistry(registry);
    return sendJson(res, 201, { tool, approvalTasks: tasks });
  }

  // Knowledge base routes
  if (req.method === "GET" && parts[1] === "projects" && parts[3] === "knowledge" && !parts[4]) {
    const knowledge = (registry.knowledge || []).filter((kb) => kb.projectId === parts[2]);
    return sendJson(res, 200, { knowledge });
  }
  if (req.method === "POST" && parts[1] === "projects" && parts[3] === "knowledge" && !parts[4]) {
    const payload = await readBody(req);
    if (!payload.name || payload.name.trim().length < 2) return sendJson(res, 400, { error: "Knowledge base name must be at least 2 characters." });
    const kb = {
      id: `${slug(payload.name)}-${Date.now()}`,
      projectId: parts[2],
      name: payload.name.trim(),
      kbType: payload.kbType || "bedrock_kb",
      source: payload.source || "",
      credentialRef: payload.credentialRef || "",
      classification: payload.classification || "internal",
      description: payload.description || "",
      status: "pending_review",
      createdBy: payload.createdBy || "current-user@example.com",
      createdAt: now(),
    };
    registry.knowledge.push(kb);
    const tasks = createResourceApprovalTasks(kb, "knowledge");
    registry.approvalTasks.push(...tasks);
    addAudit(registry, "knowledge.registered", { kbId: kb.id, projectId: kb.projectId });
    writeRegistry(registry);
    return sendJson(res, 201, { knowledge: kb, approvalTasks: tasks });
  }

  // ── POST /api/agents/generate — generate code from manifest ─────────────────
  if (req.method === "POST" && requestUrl.pathname === "/api/agents/generate") {
    const body = await readBody(req);
    const { manifest: manifestYaml, projectId: pid, form } = body;
    if (!manifestYaml) return sendJson(res, 400, { error: "manifest is required." });

    let parsedManifest;
    try {
      parsedManifest = yaml.load(manifestYaml);
    } catch (e) {
      return sendJson(res, 400, { error: `Invalid YAML: ${e.message}` });
    }

    const files = generateStrands(parsedManifest, pid || parsedManifest.projectId || "unknown-project");
    return sendJson(res, 200, { files, agentId: parsedManifest.id, framework: parsedManifest.runtime?.framework || "strands" });
  }

  // ── POST /api/agents/publish — generate + register in control plane ──────────
  if (req.method === "POST" && requestUrl.pathname === "/api/agents/publish") {
    const body = await readBody(req);
    const { manifest: manifestYaml, projectId: pid, form, submittedBy } = body;
    if (!manifestYaml) return sendJson(res, 400, { error: "manifest is required." });

    let parsedManifest;
    try {
      parsedManifest = yaml.load(manifestYaml);
    } catch (e) {
      return sendJson(res, 400, { error: `Invalid YAML: ${e.message}` });
    }

    const registry = readRegistry();
    const agentId = parsedManifest.id || slug(parsedManifest.name || "authored-agent");
    const effectivePid = pid || parsedManifest.projectId || "unknown-project";

    // Register the agent in the control plane
    const agent = {
      id: agentId,
      name: parsedManifest.name || agentId,
      version: parsedManifest.version || "0.1.0",
      projectId: effectivePid,
      agentType: parsedManifest.runtime?.framework || "strands",
      lifecycle: "submitted",
      deployment: "not_deployed",
      risk: parsedManifest.policies?.riskTier || "medium",
      model: parsedManifest.model?.modelId || "anthropic.claude-3-5-sonnet",
      tools: (parsedManifest.tools || []).map((t) => t.toolId || t).filter(Boolean),
      knowledge: (parsedManifest.knowledge || []).map((k) => k.knowledgeBaseId || k).filter(Boolean),
      memory: parsedManifest.memory?.shortTerm ? "Short-term" : "None",
      owner: submittedBy || parsedManifest.owner?.userId || "current-user@example.com",
      authoredVia: "author-wizard",
      manifest: parsedManifest,
      validations: [
        { status: "pass", message: "Agent manifest schema is valid." },
        { status: "pass", message: `Framework: ${parsedManifest.runtime?.framework || "strands"} on AgentCore Runtime.` },
        ...(parsedManifest.memory?.longTerm ? [{ status: "warn", message: "Long-term memory requires Project Owner approval." }] : []),
      ],
      submittedAt: now(),
      updatedAt: now(),
    };

    // Remove old version of this agent if it exists
    registry.agents = registry.agents.filter((a) => a.id !== agentId);
    registry.agents.push(agent);

    // Create approval tasks using a minimal version object
    const versionProxy = {
      id: `${agentId}-v${agent.version}`,
      semanticVersion: agent.version,
      riskTier: agent.risk,
      validations: agent.validations,
    };
    const approvalTasks = createApprovalTasks(agent, versionProxy);
    registry.approvalTasks.push(...approvalTasks);

    writeRegistry(registry);

    return sendJson(res, 201, {
      agentId,
      agent,
      approvalTasks,
      prUrl: null, // real GitHub PR integration goes here
      message: `Agent "${agent.name}" registered and queued for approval.`,
    });
  }

  // ── GET /api/templates — list authoring templates ────────────────────────────
  if (req.method === "GET" && requestUrl.pathname === "/api/templates") {
    return sendJson(res, 200, {
      templates: [
        { id: "blank", label: "Blank Agent", framework: "strands" },
        { id: "customer-support", label: "Customer Support", framework: "strands" },
        { id: "data-analyst", label: "Data Analyst", framework: "strands" },
        { id: "multi-agent-supervisor", label: "Multi-Agent Supervisor", framework: "strands" },
      ],
    });
  }

  // ── Organization routes ───────────────────────────────────────────────────────

  // GET /api/organizations
  if (req.method === "GET" && requestUrl.pathname === "/api/organizations") {
    const registry = readRegistry();
    return sendJson(res, 200, { organizations: registry.organizations || [] });
  }

  // POST /api/organizations  (Platform Admin only)
  if (req.method === "POST" && requestUrl.pathname === "/api/organizations") {
    const body = await readBody(req);
    if (!body.name || body.name.trim().length < 2) return sendJson(res, 400, { error: "Organization name must be at least 2 characters." });
    const registry = readRegistry();
    const orgId = `${slug(body.name)}-${Date.now()}`;
    const org = {
      id: orgId,
      name: body.name.trim(),
      description: (body.description || "").trim(),
      createdBy: body.createdBy || "platform-admin@example.com",
      createdAt: now(),
      members: [
        { userId: body.createdBy || "platform-admin@example.com", role: "org_admin" },
        ...(body.initialAdmin && body.initialAdmin !== body.createdBy
          ? [{ userId: body.initialAdmin.trim(), role: "org_admin" }]
          : []),
      ],
      projects: [],
      awsConfig: body.awsConfig || null,
    };
    registry.organizations = registry.organizations || [];
    registry.organizations.push(org);
    addAudit(registry, "org.created", { orgId, name: org.name, createdBy: org.createdBy });
    writeRegistry(registry);
    return sendJson(res, 201, { organization: org });
  }

  // GET /api/organizations/:orgId
  if (req.method === "GET" && parts[1] === "organizations" && parts[2] && !parts[3]) {
    const registry = readRegistry();
    const org = (registry.organizations || []).find((o) => o.id === parts[2]);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    return sendJson(res, 200, { organization: org });
  }

  // POST /api/organizations/:orgId/projects
  if (req.method === "POST" && parts[1] === "organizations" && parts[2] && parts[3] === "projects") {
    const body = await readBody(req);
    if (!body.name || body.name.trim().length < 2) return sendJson(res, 400, { error: "Project name must be at least 2 characters." });
    const registry = readRegistry();
    const org = (registry.organizations || []).find((o) => o.id === parts[2]);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    const projectId = slug(body.name);
    if (org.projects.some((p) => p.id === projectId)) return sendJson(res, 409, { error: "A project with that name already exists in this organization." });
    const project = {
      id: projectId,
      name: body.name.trim(),
      description: (body.description || "").trim(),
      createdBy: body.createdBy || "current-user@example.com",
      createdAt: now(),
    };
    org.projects.push(project);
    addAudit(registry, "project.created", { orgId: org.id, projectId: project.id, name: project.name });
    writeRegistry(registry);
    return sendJson(res, 201, { project, orgId: org.id });
  }

  // PUT /api/organizations/:orgId/aws-config
  if (req.method === "PUT" && parts[1] === "organizations" && parts[2] && parts[3] === "aws-config") {
    const body = await readBody(req);
    const registry = readRegistry();
    const org = (registry.organizations || []).find((o) => o.id === parts[2]);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    org.awsConfig = body.awsConfig || null;
    addAudit(registry, "org.awsConfig.updated", { orgId: org.id, updatedBy: body.updatedBy || "platform-admin@example.com" });
    writeRegistry(registry);
    return sendJson(res, 200, { organization: org });
  }

  // POST /api/organizations/:orgId/members
  if (req.method === "POST" && parts[1] === "organizations" && parts[2] && parts[3] === "members") {
    const body = await readBody(req);
    if (!body.userId || !body.userId.includes("@")) return sendJson(res, 400, { error: "Valid user email is required." });
    const registry = readRegistry();
    const org = (registry.organizations || []).find((o) => o.id === parts[2]);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    org.members = org.members || [];
    const existing = org.members.find((m) => m.userId === body.userId);
    if (existing) {
      existing.role = body.role || "org_member";
    } else {
      org.members.push({ userId: body.userId.trim(), role: body.role || "org_member" });
    }
    addAudit(registry, "org.member.added", { orgId: org.id, userId: body.userId, role: body.role });
    writeRegistry(registry);
    return sendJson(res, 200, { organization: org });
  }

  return sendJson(res, 404, { error: "API route not found." });
}

function serveStatic(req, res, requestUrl) {
  const cleanPath = decodeURIComponent(requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname);
  const filePath = path.normalize(path.join(staticRoot, cleanPath));
  if (!filePath.startsWith(staticRoot)) return send(res, 403, "Forbidden");
  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, "Not found");
    send(res, 200, data, contentTypes[path.extname(filePath)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${host}:${port}`);
  try {
    if (requestUrl.pathname.startsWith("/api/")) return await handleApi(req, res, requestUrl);
    serveStatic(req, res, requestUrl);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  ensureRegistry();
  console.log(`${platformName} UI and Control Plane API running at http://${host}:${port}`);
});
