const http = require("http");
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { generateStrands } = require("./codegen/strands-generator.cjs");
const { validateCrewAIPackage } = require("./validation/crewai-validator.cjs");
const { generateAgentCoreWrapper } = require("./codegen/agentcore-wrapper-generator.cjs");
const { runInventorySync, runMockInventorySync } = require("./services/inventory-scanner.cjs");
const {
  resolveLocalAwsContext,
  getLocalAwsContext,
  isLocalAwsMode,
  buildSingleAccountAwsConfig,
} = require("./services/aws-client.cjs");
const {
  listAvailableModels,
  listAvailableModelIds,
} = require("./services/bedrock-client.cjs");
const {
  deployAgent,
  getAgentRuntime,
  getRuntimeEndpoint,
  invokeAgentRuntime,
  listAgentRuntimes,
} = require("./services/agentcore-client.cjs");

// Load .env.local if present (local dev only — never committed)
const envLocalPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = val; // don't override real env
  }
  console.log("[server] Loaded .env.local");
}

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
  // Local dev project — open to all agent types and any user, no tool/KB restrictions
  "local-test-project": {
    users: { "platform-admin@example.com": "platform_admin", "srini_gadi@example.com": "project_owner", "current-user@example.com": "project_owner" },
    tools: {},
    knowledge: {},
    allowedAgentTypes: ["bedrock_agentcore", "langgraph", "openai_agent", "crewai", "strands", "custom"],
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

// ── Local dev org — seeded when LOCAL_AWS_MODE=true ───────────────────────────
// accountId/region/ARNs are placeholders; startup patches them from STS at runtime.
const SEED_LOCAL_ORG = {
  id: "local-dev",
  name: "Local Dev",
  description: "Single-account local testing org. AWS config is populated from ~/.aws/credentials at startup.",
  createdBy: "platform-admin@example.com",
  createdAt: new Date().toISOString(),
  members: [
    { userId: "platform-admin@example.com", role: "org_admin" },
  ],
  projects: [
    { id: "local-test-project", name: "Test Project", description: "Default project for local single-account testing." },
  ],
  awsConfig: {
    modelAccount: {
      accountId: "PENDING",
      region: process.env.AWS_REGION || "us-east-1",
      label: "Local Dev — Bedrock (same account)",
      crossAccountRoleArn: null,
      allowedModelIds: [],
    },
    executionAccount: {
      accountId: "PENDING",
      region: process.env.AWS_REGION || "us-east-1",
      label: "Local Dev — AgentCore Execution (same account)",
      agentCoreExecutionRoleArn: null,
      ecrRepositoryPrefix: null,
      s3ArtifactBucket: null,
      networkConfig: null,
    },
  },
  _isLocalDevOrg: true,
};

const SEED_AGENTS = [
  // ── Claims Operations ────────────────────────────────────────────────────
  {
    id: "claims-assistant",
    organizationId: "acme-health",
    projectId: "claims-operations",
    name: "Claims Assistant",
    description: "Handles end-to-end claims intake, lookup, and resolution using policy knowledge.",
    agentType: "strands",
    frameworkType: "strands",
    ownerUserId: "priya@example.com",
    versions: [
      {
        id: "ver-claims-assistant-v010",
        semanticVersion: "0.1.0",
        agentType: "strands",
        lifecycleState: "approved",
        deploymentStatus: "deployed",
        riskTier: "medium",
        modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        spec: {
          tools: [{ toolId: "claim_lookup", version: "1.0.0" }, { toolId: "policy_lookup", version: "1.0.0" }],
          knowledge: [{ knowledgeBaseId: "claims-policy-kb" }],
          memory: { shortTerm: true, longTerm: false },
        },
        validations: [
          { status: "pass", message: "Schema valid." },
          { status: "pass", message: "Tools approved for project." },
          { status: "pass", message: "Model approved for organization." },
        ],
        approvals: [
          { type: "project_owner", decision: "approved", approver: "priya@example.com", comments: "Approved for production.", decidedAt: "2025-03-01T10:00:00Z" },
          { type: "platform_admin", decision: "approved", approver: "platform-admin@example.com", comments: "All checks passed.", decidedAt: "2025-03-02T09:00:00Z" },
        ],
        submittedBy: "current-user@example.com",
        createdAt: "2025-03-01T08:00:00Z",
        updatedAt: "2025-03-02T09:00:00Z",
      },
    ],
    currentApprovedVersionId: "ver-claims-assistant-v010",
    createdAt: "2025-03-01T08:00:00Z",
    updatedAt: "2025-03-02T09:00:00Z",
  },
  {
    id: "claims-crew",
    organizationId: "acme-health",
    projectId: "claims-operations",
    name: "Claims Processing Crew",
    description: "External CrewAI package — multi-agent crew for complex claim adjudication workflows.",
    agentType: "crewai",
    frameworkType: "crewai",
    sourceType: "external_package",
    ownerUserId: "priya@example.com",
    versions: [
      {
        id: "ver-claims-crew-v100",
        semanticVersion: "1.0.0",
        frameworkType: "crewai",
        sourceType: "external_package",
        package: {
          packageSourceType: "s3",
          packageLocation: "s3://pegasus-agent-artifacts-123456789012/claims-crew/v1.0.0.zip",
          checksum: "sha256:abc123def456",
          entryPoint: "app.py",
          entryFunction: "handler",
          runtimeCommand: "",
          pythonVersion: "3.12",
          dependencyFile: "requirements.txt",
          declaredDependencies: ["crewai>=0.63.0", "boto3>=1.34.0", "botocore>=1.34.0", "pydantic>=2.0.0"],
          envVars: [{ key: "CREW_LOG_LEVEL", value: "INFO" }, { key: "BEDROCK_REGION", value: "us-east-1" }],
          secretRefs: [{ name: "sm/claims-api-key" }],
          inputSchema: '{"type":"object","properties":{"claim_id":{"type":"string"}}}',
          outputSchema: '{"type":"object","properties":{"decision":{"type":"string"}}}',
          uploadedAt: "2025-04-01T10:00:00Z",
        },
        modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        toolIds: ["claim_lookup"],
        knowledgeIds: ["claims-policy-kb"],
        validationStatus: "passed",
        validationResults: [
          { id: "str-1", validationType: "structure", status: "pass", severity: "info", message: "Entry point app.py declared.", checkedAt: "2025-04-01T10:05:00Z" },
          { id: "dep-1", validationType: "dependency", status: "pass", severity: "info", message: "crewai dependency found.", checkedAt: "2025-04-01T10:05:00Z" },
          { id: "dep-2", validationType: "dependency", status: "pass", severity: "info", message: "boto3 dependency found.", checkedAt: "2025-04-01T10:05:00Z" },
          { id: "sec-1", validationType: "security", status: "pass", severity: "info", message: "No hardcoded AWS account IDs detected.", checkedAt: "2025-04-01T10:05:00Z" },
          { id: "gov-1", validationType: "governance", status: "pass", severity: "info", message: "Project permits CrewAI agents.", checkedAt: "2025-04-01T10:05:00Z" },
          { id: "gov-2", validationType: "governance", status: "pass", severity: "info", message: "All declared tools are approved in project catalog.", checkedAt: "2025-04-01T10:05:00Z" },
          { id: "ac-1", validationType: "agentcore", status: "pass", severity: "info", message: "Entry function signature is AgentCore-compatible.", checkedAt: "2025-04-01T10:05:00Z" },
        ],
        generatedAgentCoreSpec: {
          wrapperGenerated: false,
          wrapperFile: null,
          effectiveEntryPoint: "app.handler",
          runtimeConfig: { memoryMb: 2048, timeoutSeconds: 300, executionRoleArn: "arn:aws:iam::123456789012:role/AgentCoreExecutionRole" },
          modelConfig: { modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0", crossAccountRoleArn: "arn:aws:iam::987654321098:role/PegasusBedrockAccess" },
          toolGatewayConfig: [{ toolId: "claim_lookup", gatewayEndpoint: null }],
          generatedAt: "2025-04-01T10:10:00Z",
        },
        lifecycleState: "approved",
        approvalStatus: "approved",
        deploymentStatus: "deployed",
        riskTier: "medium",
        spec: {
          tools: [{ toolId: "claim_lookup", version: "1.0.0" }],
          knowledge: [{ knowledgeBaseId: "claims-policy-kb" }],
          memory: { shortTerm: false, longTerm: false },
        },
        validations: [
          { status: "pass", message: "Package structure valid." },
          { status: "pass", message: "All governance checks passed." },
        ],
        approvals: [
          { type: "project_owner", decision: "approved", approver: "priya@example.com", comments: "Crew package reviewed and approved.", decidedAt: "2025-04-05T10:00:00Z" },
          { type: "platform_admin", decision: "approved", approver: "platform-admin@example.com", comments: "Deployment authorized.", decidedAt: "2025-04-06T09:00:00Z" },
        ],
        submittedBy: "current-user@example.com",
        deploymentId: "dep-claims-crew-seed",
        createdAt: "2025-04-01T08:00:00Z",
        updatedAt: "2025-04-06T09:00:00Z",
      },
    ],
    currentApprovedVersionId: "ver-claims-crew-v100",
    createdAt: "2025-04-01T08:00:00Z",
    updatedAt: "2025-04-06T09:00:00Z",
  },
  // ── Member Services ──────────────────────────────────────────────────────
  {
    id: "benefits-strands-agent",
    organizationId: "acme-health",
    projectId: "member-services",
    name: "Benefits Lookup Agent",
    description: "Helps members find benefit details and coverage eligibility quickly.",
    agentType: "strands",
    frameworkType: "strands",
    ownerUserId: "devon@example.com",
    versions: [
      {
        id: "ver-benefits-strands-v010",
        semanticVersion: "0.1.0",
        agentType: "strands",
        lifecycleState: "approved",
        deploymentStatus: "deployed",
        riskTier: "low",
        modelId: "anthropic.claude-3-5-haiku-20241022-v1:0",
        spec: {
          tools: [{ toolId: "benefits_lookup", version: "1.0.0" }],
          knowledge: [{ knowledgeBaseId: "member-benefits-kb" }],
          memory: { shortTerm: true, longTerm: false },
        },
        validations: [
          { status: "pass", message: "Schema valid." },
          { status: "pass", message: "Tools approved for project." },
        ],
        approvals: [
          { type: "project_owner", decision: "approved", approver: "devon@example.com", comments: "Approved.", decidedAt: "2025-03-10T10:00:00Z" },
          { type: "platform_admin", decision: "approved", approver: "platform-admin@example.com", comments: "Low risk, approved.", decidedAt: "2025-03-11T09:00:00Z" },
        ],
        submittedBy: "current-user@example.com",
        createdAt: "2025-03-10T08:00:00Z",
        updatedAt: "2025-03-11T09:00:00Z",
      },
    ],
    currentApprovedVersionId: "ver-benefits-strands-v010",
    createdAt: "2025-03-10T08:00:00Z",
    updatedAt: "2025-03-11T09:00:00Z",
  },
  // ── Billing Experience ───────────────────────────────────────────────────
  {
    id: "billing-invoice-agent",
    organizationId: "acme-health",
    projectId: "billing-experience",
    name: "Invoice Assistant",
    description: "Handles invoice lookups, payment status queries, and refund status tracking.",
    agentType: "strands",
    frameworkType: "strands",
    ownerUserId: "marcus@example.com",
    versions: [
      {
        id: "ver-billing-invoice-v010",
        semanticVersion: "0.1.0",
        agentType: "strands",
        lifecycleState: "submitted",
        deploymentStatus: "not_deployed",
        riskTier: "high",
        modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
        spec: {
          tools: [{ toolId: "invoice_lookup", version: "1.0.0" }, { toolId: "payment_post", version: "1.2.1" }],
          knowledge: [{ knowledgeBaseId: "billing-faq-kb" }],
          memory: { shortTerm: true, longTerm: false },
        },
        validations: [
          { status: "pass", message: "Schema valid." },
          { status: "warn", message: "payment_post is a critical-risk tool — requires Tool Owner approval." },
        ],
        approvals: [],
        submittedBy: "current-user@example.com",
        createdAt: "2025-05-01T08:00:00Z",
        updatedAt: "2025-05-01T08:00:00Z",
      },
    ],
    currentApprovedVersionId: null,
    createdAt: "2025-05-01T08:00:00Z",
    updatedAt: "2025-05-01T08:00:00Z",
  },
];

const SEED_DEPLOYMENTS = [
  {
    id: "dep-claims-crew-seed",
    agentId: "claims-crew",
    agentVersionId: "ver-claims-crew-v100",
    runtimeProvider: "bedrock_agentcore",
    organizationId: "acme-health",
    projectId: "claims-operations",
    executionAccountId: "123456789012",
    modelAccountId: "987654321098",
    region: "us-east-1",
    runtimeId: "agentcore-claims-processing-crew-1712000000000",
    runtimeArn: "arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/agentcore-claims-processing-crew-1712000000000",
    ecrImageUri: "123456789012.dkr.ecr.us-east-1.amazonaws.com/pegasus/claims-processing-crew:1.0.0",
    deploymentStatus: "deployed",
    deploymentLogs: [
      "[2025-04-06T09:00:00Z] Package retrieved from s3://pegasus-agent-artifacts-123456789012/claims-crew/v1.0.0.zip.",
      "[2025-04-06T09:01:30Z] Docker image built and pushed to ECR.",
      "[2025-04-06T09:03:00Z] AgentCore runtime created in us-east-1.",
      "[2025-04-06T09:03:15Z] Cross-account model role assumed in account 987654321098.",
      "[2025-04-06T09:03:20Z] Runtime status: ACTIVE. ARN: arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/agentcore-claims-processing-crew-1712000000000",
    ],
    deployedBy: "platform-admin@example.com",
    deployedAt: "2025-04-06T09:03:20Z",
    updatedAt: "2025-04-06T09:03:20Z",
  },
];

const SEED_ACCOUNT_CONNECTIONS = [
  {
    id: "conn-acme-health-bu-001",
    organizationId: "acme-health",
    awsAccountId: "555666777888",
    accountName: "Acme Health – Business Unit Account",
    environment: "production",
    discoveryRoleArn: "arn:aws:iam::555666777888:role/GuardianDiscoveryRole",
    provisioningRoleArn: "arn:aws:iam::555666777888:role/GuardianProvisioningRole",
    externalIdRef: "sm/guardian-acme-health-external-id",
    enabledRegions: ["us-east-1"],
    agentCoreGatewayArn: "arn:aws:bedrock-agentcore:us-east-1:555666777888:gateway/gw-acme-health-prod-001",
    agentCoreGatewayUrl: "https://gw-acme-health-prod-001.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    status: "CONNECTED",
    lastSuccessfulSyncAt: "2025-05-01T06:00:00Z",
    createdBy: "platform-admin@example.com",
    createdAt: "2025-02-15T10:00:00Z",
    updatedAt: "2025-05-01T06:00:00Z",
  },
];

// Seed project tools — these are the post-approval, post-provisioning canonical tool records
const SEED_PROJECT_TOOLS = [
  {
    id: "ptool-claim-lookup-v1",
    organizationId: "acme-health",
    projectId: "claims-operations",
    toolRegistrationRequestId: null,
    sourceDiscoveredResourceId: null, // set during real sync
    gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:555666777888:gateway/gw-acme-health-prod-001",
    gatewayUrl: "https://gw-acme-health-prod-001.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    gatewayTargetId: "tgt-claims-lookup",
    mcpToolName: "claim_lookup",
    displayName: "Claim Lookup",
    description: "Look up claim details, status, and processing history by claim ID.",
    inputSchemaJson: JSON.stringify({ type: "object", properties: { claim_id: { type: "string", description: "Claim identifier" } }, required: ["claim_id"] }),
    outputSchemaJson: JSON.stringify({ type: "object", properties: { claim: { type: "object" }, status: { type: "string" } } }),
    sideEffectLevel: "READ_ONLY",
    dataClassification: "internal",
    riskTier: "medium",
    businessOwner: "priya@example.com",
    toolStatus: "ACTIVE",
    version: "1.0.0",
    checksum: "sha256:claimlookupv1abc",
    lastValidatedAt: "2025-05-01T06:00:00Z",
    createdAt: "2025-03-01T09:00:00Z",
    updatedAt: "2025-05-01T06:00:00Z",
  },
  {
    id: "ptool-policy-lookup-v1",
    organizationId: "acme-health",
    projectId: "claims-operations",
    toolRegistrationRequestId: null,
    sourceDiscoveredResourceId: null,
    gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:555666777888:gateway/gw-acme-health-prod-001",
    gatewayUrl: "https://gw-acme-health-prod-001.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    gatewayTargetId: "tgt-policy-lookup",
    mcpToolName: "policy_lookup",
    displayName: "Policy Lookup",
    description: "Retrieve insurance policy details and coverage terms by policy number.",
    inputSchemaJson: JSON.stringify({ type: "object", properties: { policy_number: { type: "string" } }, required: ["policy_number"] }),
    outputSchemaJson: null,
    sideEffectLevel: "READ_ONLY",
    dataClassification: "internal",
    riskTier: "low",
    businessOwner: "priya@example.com",
    toolStatus: "ACTIVE",
    version: "1.0.0",
    checksum: "sha256:policylookupv1def",
    lastValidatedAt: "2025-05-01T06:00:00Z",
    createdAt: "2025-03-01T09:00:00Z",
    updatedAt: "2025-05-01T06:00:00Z",
  },
  {
    id: "ptool-member-lookup-v1",
    organizationId: "acme-health",
    projectId: "member-services",
    toolRegistrationRequestId: null,
    sourceDiscoveredResourceId: null,
    gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:555666777888:gateway/gw-acme-health-prod-001",
    gatewayUrl: "https://gw-acme-health-prod-001.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    gatewayTargetId: "tgt-member-lookup",
    mcpToolName: "member_lookup",
    displayName: "Member Lookup",
    description: "Look up member profile, enrollment, and plan details.",
    inputSchemaJson: JSON.stringify({ type: "object", properties: { member_id: { type: "string" } }, required: ["member_id"] }),
    outputSchemaJson: null,
    sideEffectLevel: "READ_ONLY",
    dataClassification: "internal",
    riskTier: "medium",
    businessOwner: "devon@example.com",
    toolStatus: "ACTIVE",
    version: "1.0.0",
    checksum: "sha256:memberlookupv1ghi",
    lastValidatedAt: "2025-05-01T06:00:00Z",
    createdAt: "2025-03-10T09:00:00Z",
    updatedAt: "2025-05-01T06:00:00Z",
  },
  {
    id: "ptool-benefits-lookup-v1",
    organizationId: "acme-health",
    projectId: "member-services",
    toolRegistrationRequestId: null,
    sourceDiscoveredResourceId: null,
    gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:555666777888:gateway/gw-acme-health-prod-001",
    gatewayUrl: "https://gw-acme-health-prod-001.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    gatewayTargetId: "tgt-benefits-lookup",
    mcpToolName: "benefits_lookup",
    displayName: "Benefits Lookup",
    description: "Look up benefits eligibility, coverage limits, and formulary details.",
    inputSchemaJson: JSON.stringify({ type: "object", properties: { member_id: { type: "string" }, benefit_type: { type: "string" } }, required: ["member_id"] }),
    outputSchemaJson: null,
    sideEffectLevel: "READ_ONLY",
    dataClassification: "internal",
    riskTier: "low",
    businessOwner: "devon@example.com",
    toolStatus: "ACTIVE",
    version: "1.0.0",
    checksum: "sha256:benefitslookupv1jkl",
    lastValidatedAt: "2025-05-01T06:00:00Z",
    createdAt: "2025-03-10T09:00:00Z",
    updatedAt: "2025-05-01T06:00:00Z",
  },
  {
    id: "ptool-payment-post-v1",
    organizationId: "acme-health",
    projectId: "billing-experience",
    toolRegistrationRequestId: null,
    sourceDiscoveredResourceId: null,
    gatewayArn: "arn:aws:bedrock-agentcore:us-east-1:555666777888:gateway/gw-acme-health-prod-001",
    gatewayUrl: "https://gw-acme-health-prod-001.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp",
    gatewayTargetId: "tgt-payment-post",
    mcpToolName: "payment_post",
    displayName: "Payment Post",
    description: "Post a payment transaction against an invoice. WRITE operation — modifies billing records and triggers payment gateway.",
    inputSchemaJson: JSON.stringify({ type: "object", properties: { invoice_id: { type: "string" }, amount_cents: { type: "integer" }, payment_method_token: { type: "string" } }, required: ["invoice_id", "amount_cents", "payment_method_token"] }),
    outputSchemaJson: null,
    sideEffectLevel: "WRITE",
    dataClassification: "confidential",
    riskTier: "critical",
    businessOwner: "marcus@example.com",
    toolStatus: "ACTIVE",
    version: "1.2.1",
    checksum: "sha256:paymentpostv121mno",
    lastValidatedAt: "2025-05-01T06:00:00Z",
    createdAt: "2025-04-01T09:00:00Z",
    updatedAt: "2025-05-01T06:00:00Z",
  },
];

function makeVisible(resource, projectId, organizationId, addedBy) {
  return {
    id: `pvr-${projectId}-${resource.id}`,
    organizationId,
    projectId,
    discoveredResourceId: resource.id,
    resourceType: resource.resourceType,
    resourceName: resource.resourceName,
    resourceArn: resource.resourceArn,
    visibilityStatus: "VISIBLE",
    addedBy,
    addedAt: now(),
  };
}

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
  registry.deployments ||= [];
  registry.awsAccountMappings ||= [];
  registry.invocations ||= [];
  // Phase 1-3 collections
  registry.awsAccountConnections   ||= [];
  registry.inventorySyncRuns       ||= [];
  registry.discoveredResources     ||= [];
  registry.projectVisibleResources ||= [];
  registry.toolRegistrationRequests||= [];
  registry.gatewayTargetDeployments||= [];
  registry.projectTools            ||= [];
  // Seed orgs if empty
  if (registry.organizations.length === 0) {
    registry.organizations = SEED_ORGS;
  }
  // Add local-dev org if LOCAL_AWS_MODE is on and not already present
  if (process.env.LOCAL_AWS_MODE === "true") {
    const hasLocalOrg = registry.organizations.some((o) => o.id === "local-dev");
    if (!hasLocalOrg) {
      registry.organizations.push({ ...SEED_LOCAL_ORG });
    }
  }
  // Seed agents if empty
  if (registry.agents.length === 0) {
    registry.agents = SEED_AGENTS;
  }
  // Seed deployments if empty
  if (registry.deployments.length === 0) {
    registry.deployments = SEED_DEPLOYMENTS;
  }
  // Seed account connections if empty
  if (registry.awsAccountConnections.length === 0) {
    registry.awsAccountConnections = SEED_ACCOUNT_CONNECTIONS;
    // Run initial inventory scan for the seeded connection
    const conn = { ...SEED_ACCOUNT_CONNECTIONS[0], _firstSync: true };
    // Seed with mock data synchronously; Sync Now button triggers real AWS scan
    const { syncRun, resources } = runMockInventorySync(conn, conn.organizationId);
    registry.inventorySyncRuns.push(syncRun);
    registry.discoveredResources = resources;
    // Seed project visibility — wire known resources to their projects
    const claimsApiGw = resources.find((r) => r.resourceName === "ClaimsProcessingAPI");
    const memberApiGw = resources.find((r) => r.resourceName === "MemberServicesAPI");
    const billingApiGw = resources.find((r) => r.resourceName === "BillingPaymentsAPI");
    const projectVisibility = [
      ...(resources.filter((r) => ["claims-lookup-fn","policy-lookup-fn"].includes(r.resourceId) || r.resourceId === "tgt-claims-lookup" || r.resourceId === "tgt-policy-lookup" || r.resourceId === "CLMSPOL001").map((r) => makeVisible(r, "claims-operations", conn.organizationId, "platform-admin@example.com"))),
      ...(resources.filter((r) => ["member-lookup-fn","benefits-lookup-fn"].includes(r.resourceId) || r.resourceId === "tgt-member-lookup" || r.resourceId === "MEMBEN002").map((r) => makeVisible(r, "member-services", conn.organizationId, "platform-admin@example.com"))),
      ...(resources.filter((r) => ["payment-post-fn"].includes(r.resourceId) || r.resourceId === "BILLING003").map((r) => makeVisible(r, "billing-experience", conn.organizationId, "platform-admin@example.com"))),
      // The gateway itself is visible to all projects
      ...(resources.filter((r) => r.resourceType === "AGENTCORE_GATEWAY").map((r) => makeVisible(r, "claims-operations", conn.organizationId, "platform-admin@example.com"))),
    ];
    registry.projectVisibleResources = projectVisibility;
  }
  // Seed project tools if empty
  if (registry.projectTools.length === 0) {
    registry.projectTools = SEED_PROJECT_TOOLS;
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
    organizationId: payload.organizationId || null,
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
  const isCrewAI = agent.frameworkType === "crewai" || agent.agentType === "crewai";
  const packageMetadata = isCrewAI && version.package ? {
    packageSourceType: version.package.packageSourceType,
    packageLocation: version.package.packageLocation,
    entryPoint: version.package.entryPoint,
    entryFunction: version.package.entryFunction,
    pythonVersion: version.package.pythonVersion,
    dependencyFile: version.package.dependencyFile,
    declaredDependencies: version.package.declaredDependencies || [],
  } : null;

  return [...new Set(types)].map((type) => ({
    id: `approval-${agent.id}-${version.semanticVersion}-${type}-${Date.now()}`,
    agentId: agent.id,
    versionId: version.id,
    projectId: agent.projectId,
    agentName: agent.name,
    agentType: agent.agentType || agent.frameworkType,
    approverType: type,
    status: "pending",
    riskTier: version.riskTier,
    reason: reasonFor(type),
    packageMetadata,
    validationSummary: isCrewAI ? (version.validationStatus || null) : null,
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
    organizationId: spec.organizationId || null,
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
    versionId: version.id,
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

  // ── GET /api/local/aws-context — returns resolved AWS identity and capabilities ──
  if (req.method === "GET" && requestUrl.pathname === "/api/local/aws-context") {
    const ctx = getLocalAwsContext();
    if (!ctx) {
      return sendJson(res, 200, {
        localAwsMode: false,
        message: "LOCAL_AWS_MODE is not enabled. Set LOCAL_AWS_MODE=true in .env.local to activate real AWS integration.",
      });
    }
    const localOrg = (registry.organizations || []).find((o) => o.id === "local-dev");
    const modelIds = localOrg?.awsConfig?.modelAccount?.allowedModelIds || [];
    return sendJson(res, 200, {
      localAwsMode: true,
      accountId: ctx.accountId,
      region: ctx.region,
      callerArn: ctx.callerArn,
      userType: ctx.userType,
      bedrockModels: modelIds,
      bedrockModelCount: modelIds.length,
      agentCoreExecutionRoleArn: localOrg?.awsConfig?.executionAccount?.agentCoreExecutionRoleArn || null,
      ecrRepositoryPrefix: localOrg?.awsConfig?.executionAccount?.ecrRepositoryPrefix || null,
      s3ArtifactBucket: localOrg?.awsConfig?.executionAccount?.s3ArtifactBucket || null,
      localOrgId: localOrg?.id || null,
      localProjectId: localOrg?.projects?.[0]?.id || null,
      iamRequirements: [
        "bedrock:ListFoundationModels",
        "bedrock:InvokeModel",
        "bedrock-agentcore:CreateAgent",
        "bedrock-agentcore:InvokeAgent",
        "sts:GetCallerIdentity",
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:PutImage",
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ],
    });
  }
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

    // Handle tool registration request approval tasks
    if (task.taskCategory === "tool_registration" && task.toolRegistrationRequestId) {
      const trr = (registry.toolRegistrationRequests || []).find((r) => r.id === task.toolRegistrationRequestId);
      if (trr) {
        const trrTasks = registry.approvalTasks.filter((t) => t.toolRegistrationRequestId === trr.id);
        if (trrTasks.some((t) => t.status === "rejected")) {
          trr.approvalStatus = "REJECTED";
        } else if (trrTasks.every((t) => t.status === "approved")) {
          trr.approvalStatus = "APPROVED";
        }
        trr.updatedAt = now();
      }
      addAudit(registry, "approval.decided", { taskId: task.id, decision: task.decision, trrId: task.toolRegistrationRequestId, taskCategory: "tool_registration" });
      writeRegistry(registry);
      return sendJson(res, 200, { approvalTask: task, toolRegistrationRequest: trr || null });
    }

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

  // GET /api/local/runtimes — list real AgentCore runtimes in the account (local mode only)
  if (req.method === "GET" && requestUrl.pathname === "/api/local/runtimes") {
    if (!isLocalAwsMode()) return sendJson(res, 200, { localAwsMode: false, runtimes: [] });
    try {
      const runtimes = await listAgentRuntimes();
      return sendJson(res, 200, { localAwsMode: true, runtimes });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // GET /api/bedrock/models?orgId= — list available Bedrock foundation models
  // In local AWS mode: returns real models from the account.
  // In mock mode: returns the org's configured allowedModelIds as simple objects.
  if (req.method === "GET" && parts[1] === "bedrock" && parts[2] === "models") {
    const orgId = requestUrl.searchParams.get("orgId");
    if (isLocalAwsMode()) {
      // Re-fetch live (cached after first call)
      const models = await listAvailableModels();
      return sendJson(res, 200, { models, source: "aws_bedrock_live", localAwsMode: true });
    }
    // Mock mode: derive from org config
    const registry = readRegistry();
    const org = orgId ? (registry.organizations || []).find((o) => o.id === orgId) : null;
    const modelIds = org?.awsConfig?.modelAccount?.allowedModelIds || [
      "anthropic.claude-3-5-sonnet-20241022-v2:0",
      "anthropic.claude-3-5-haiku-20241022-v1:0",
      "amazon.nova-pro-v1:0",
    ];
    const models = modelIds.map((id) => ({
      modelId: id,
      modelName: id.split(".").slice(1).join("."),
      providerName: id.split(".")[0],
      inputModalities: ["TEXT"],
      outputModalities: ["TEXT"],
      inferenceTypesSupported: ["ON_DEMAND"],
      isRecommended: id.startsWith("anthropic.claude"),
    }));
    return sendJson(res, 200, { models, source: "mock", localAwsMode: false });
  }

  // GET /api/organizations/:orgId/aws-config — returns config + available Bedrock models
  if (req.method === "GET" && parts[1] === "organizations" && parts[2] && parts[3] === "aws-config") {
    const registry = readRegistry();
    const org = (registry.organizations || []).find((o) => o.id === parts[2]);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    const awsCtx = getLocalAwsContext();
    let config = org.awsConfig;
    // In local mode, if this org has PENDING placeholders, surface resolved values without persisting
    if (isLocalAwsMode() && awsCtx && config?.executionAccount?.accountId === "PENDING") {
      config = buildSingleAccountAwsConfig(awsCtx.accountId, awsCtx.region);
    }
    return sendJson(res, 200, {
      awsConfig: config,
      localAwsMode: isLocalAwsMode(),
      resolvedAccountId: awsCtx?.accountId || null,
      resolvedRegion: awsCtx?.region || null,
    });
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

  // ── CrewAI external package routes ───────────────────────────────────────────

  // POST /api/agents/crewai — create agent + initial version draft from package metadata
  if (req.method === "POST" && requestUrl.pathname === "/api/agents/crewai") {
    const body = await readBody(req);
    if (!body.name || body.name.trim().length < 2) return sendJson(res, 400, { error: "Agent name must be at least 2 characters." });
    if (!body.projectId) return sendJson(res, 400, { error: "projectId is required." });
    if (!body.organizationId) return sendJson(res, 400, { error: "organizationId is required." });

    const registry = readRegistry();

    // Resolve org for governance checks
    const org = (registry.organizations || []).find((o) => o.id === body.organizationId);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });

    // Warn but allow if project doesn't allow crewai (governance check runs in validate step)
    const agentId = `${slug(body.name)}-${Date.now()}`;
    const versionId = `ver-${agentId}-v${(body.version || "1.0.0").replace(/\./g, "")}`;

    const packageData = {
      packageSourceType: body.packageSourceType || null,
      packageLocation: body.packageLocation || null,
      checksum: null,
      entryPoint: body.entryPoint || "",
      entryFunction: body.entryFunction || "handler",
      runtimeCommand: body.runtimeCommand || "",
      pythonVersion: body.pythonVersion || "3.12",
      dependencyFile: body.dependencyFile || "requirements.txt",
      declaredDependencies: body.declaredDependencies || [],
      envVars: body.envVars || [],
      secretRefs: body.secretRefs || [],
      inputSchema: body.inputSchema || null,
      outputSchema: body.outputSchema || null,
      uploadedAt: now(),
    };

    const version = {
      id: versionId,
      semanticVersion: body.version || "1.0.0",
      frameworkType: "crewai",
      sourceType: "external_package",
      package: packageData,
      modelId: body.modelId || null,
      toolIds: body.toolIds || [],
      knowledgeIds: body.knowledgeIds || [],
      validationStatus: "pending",
      validationResults: [],
      generatedAgentCoreSpec: null,
      lifecycleState: "draft",
      approvalStatus: "not_submitted",
      deploymentStatus: "not_deployed",
      riskTier: body.riskTier || "medium",
      spec: {
        tools: (body.toolIds || []).map((t) => ({ toolId: t, version: "1.0.0" })),
        knowledge: (body.knowledgeIds || []).map((k) => ({ knowledgeBaseId: k })),
        memory: { shortTerm: false, longTerm: false },
      },
      validations: [],
      approvals: [],
      submittedBy: body.submittedBy || "current-user@example.com",
      createdAt: now(),
      updatedAt: now(),
    };

    const agent = {
      id: agentId,
      organizationId: body.organizationId,
      projectId: body.projectId,
      name: body.name.trim(),
      description: body.description || "",
      frameworkType: "crewai",
      sourceType: "external_package",
      agentType: "crewai",
      ownerUserId: body.submittedBy || "current-user@example.com",
      versions: [version],
      currentApprovedVersionId: null,
      createdAt: now(),
      updatedAt: now(),
    };

    // Check for duplicate
    if (registry.agents.some((a) => a.id === agentId && a.projectId === body.projectId)) {
      return sendJson(res, 409, { error: "An agent with that name already exists in this project." });
    }

    registry.agents.push(agent);
    addAudit(registry, "crewai.agent.created", { agentId, projectId: body.projectId, organizationId: body.organizationId, versionId });
    writeRegistry(registry);

    return sendJson(res, 201, { agent: agentSummary(agent), version, message: `CrewAI agent '${agent.name}' created as draft. Run package validation before submitting for approval.` });
  }

  // POST /api/agents/:agentId/versions/:versionId/validate — run validation pipeline
  if (req.method === "POST" && parts[1] === "agents" && parts[3] === "versions" && parts[5] === "validate") {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    const version = (agent.versions || []).find((v) => v.id === parts[4]) || (agent.versions || []).at(-1);
    if (!version) return sendJson(res, 404, { error: "Agent version not found." });

    // Resolve org config
    const org = (registry.organizations || []).find((o) => o.id === agent.organizationId);
    const orgConfig = org?.awsConfig || null;

    // Build package descriptor for validator
    const pkg = {
      ...version.package,
      projectId: agent.projectId,
      modelId: version.modelId,
      toolIds: version.toolIds || [],
    };

    const { validationResults, validationStatus } = validateCrewAIPackage(pkg, projectCatalog, orgConfig);

    version.validationResults = validationResults;
    version.validationStatus = validationStatus;
    // Mirror into validations[] for agentSummary compatibility
    version.validations = validationResults.map((r) => ({ status: r.status, message: r.message }));
    version.updatedAt = now();
    agent.updatedAt = now();

    addAudit(registry, "crewai.package.validated", { agentId: agent.id, versionId: version.id, validationStatus });
    writeRegistry(registry);

    return sendJson(res, 200, { validationStatus, validationResults, versionId: version.id });
  }

  // GET /api/agents/:agentId/versions/:versionId/validation-results
  if (req.method === "GET" && parts[1] === "agents" && parts[3] === "versions" && parts[5] === "validation-results") {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    const version = (agent.versions || []).find((v) => v.id === parts[4]) || (agent.versions || []).at(-1);
    if (!version) return sendJson(res, 404, { error: "Version not found." });
    return sendJson(res, 200, { validationResults: version.validationResults || [], validationStatus: version.validationStatus || "pending" });
  }

  // POST /api/agents/:agentId/versions/:versionId/generate-spec — generate AgentCore spec + wrapper
  if (req.method === "POST" && parts[1] === "agents" && parts[3] === "versions" && parts[5] === "generate-spec") {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    const version = (agent.versions || []).find((v) => v.id === parts[4]) || (agent.versions || []).at(-1);
    if (!version) return sendJson(res, 404, { error: "Version not found." });

    if (version.validationStatus === "failed") {
      return sendJson(res, 422, { error: "Cannot generate AgentCore spec: package validation has blocking failures. Fix them and re-validate." });
    }
    if (!version.validationStatus || version.validationStatus === "pending") {
      return sendJson(res, 422, { error: "Package must be validated before generating the AgentCore spec." });
    }

    const org = (registry.organizations || []).find((o) => o.id === agent.organizationId);
    const orgConfig = org?.awsConfig || {};

    const manifest = {
      ...version.package,
      modelId: version.modelId,
      toolIds: version.toolIds || [],
      executionRoleArn: orgConfig.executionAccount?.agentCoreExecutionRoleArn || null,
      crossAccountRoleArn: orgConfig.modelAccount?.crossAccountRoleArn || null,
    };

    const { files, agentCoreSpec } = generateAgentCoreWrapper(manifest);

    version.generatedAgentCoreSpec = agentCoreSpec;
    version.generatedFiles = files;
    version.updatedAt = now();
    agent.updatedAt = now();

    addAudit(registry, "crewai.agentcore_spec.generated", { agentId: agent.id, versionId: version.id, wrapperGenerated: agentCoreSpec.wrapperGenerated });
    writeRegistry(registry);

    return sendJson(res, 200, { agentCoreSpec, files, versionId: version.id, message: "AgentCore deployment spec generated." + (agentCoreSpec.wrapperGenerated ? " Wrapper file agentcore_wrapper.py will be included in the deployment package." : "") });
  }

  // GET /api/agents/:agentId/versions/:versionId
  if (req.method === "GET" && parts[1] === "agents" && parts[3] === "versions" && parts[4] && !parts[5]) {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    const version = (agent.versions || []).find((v) => v.id === parts[4]) || (agent.versions || []).at(-1);
    if (!version) return sendJson(res, 404, { error: "Version not found." });
    return sendJson(res, 200, { version, agent: agentSummary(agent) });
  }

  // POST /api/agents/:agentId/versions/:versionId/submit — submit for approval (draft → submitted)
  if (req.method === "POST" && parts[1] === "agents" && parts[3] === "versions" && parts[5] === "submit") {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    const version = (agent.versions || []).find((v) => v.id === parts[4]) || (agent.versions || []).at(-1);
    if (!version) return sendJson(res, 404, { error: "Version not found." });

    if (version.validationStatus === "failed") {
      return sendJson(res, 422, { error: "Cannot submit: package has blocking validation failures." });
    }
    if (!version.validationStatus || version.validationStatus === "pending") {
      return sendJson(res, 422, { error: "Package must be validated before submission." });
    }
    if (!version.generatedAgentCoreSpec) {
      return sendJson(res, 422, { error: "AgentCore spec must be generated before submission. Call /generate-spec first." });
    }
    if (version.lifecycleState !== "draft") {
      return sendJson(res, 409, { error: `Version is already in state '${version.lifecycleState}'. Only draft versions can be submitted.` });
    }

    const body = await readBody(req);
    version.lifecycleState = "submitted";
    version.approvalStatus = "pending";
    version.submittedBy = body.submittedBy || version.submittedBy || "current-user@example.com";
    version.submittedAt = now();
    version.updatedAt = now();
    agent.updatedAt = now();

    // Create approval tasks
    const tasks = createApprovalTasks(agent, version);
    registry.approvalTasks.push(...tasks);

    addAudit(registry, "crewai.version.submitted", { agentId: agent.id, versionId: version.id, submittedBy: version.submittedBy });
    writeRegistry(registry);

    return sendJson(res, 200, { version, approvalTasks: tasks, agent: agentSummary(agent), message: `Version ${version.semanticVersion} submitted for approval.` });
  }

  // POST /api/agents/:agentId/versions/:versionId/deploy — deploy approved version
  if (req.method === "POST" && parts[1] === "agents" && parts[3] === "versions" && parts[5] === "deploy") {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });
    const version = (agent.versions || []).find((v) => v.id === parts[4]) || (agent.versions || []).at(-1);
    if (!version) return sendJson(res, 404, { error: "Version not found." });

    if (version.lifecycleState !== "approved") {
      return sendJson(res, 422, { error: `Deployment blocked: version lifecycle state is '${version.lifecycleState}'. Only approved versions can be deployed.` });
    }

    const org = (registry.organizations || []).find((o) => o.id === agent.organizationId);
    let orgConfig = org?.awsConfig;

    // In local AWS mode: use resolved AWS context directly when org config is absent or has PENDING values
    if (isLocalAwsMode()) {
      const awsCtx = getLocalAwsContext();
      if (awsCtx && (!orgConfig || orgConfig.executionAccount?.accountId === "PENDING" || !orgConfig.executionAccount?.accountId)) {
        orgConfig = buildSingleAccountAwsConfig(awsCtx.accountId, awsCtx.region);
      }
    }

    if (!orgConfig?.executionAccount?.accountId) {
      return sendJson(res, 422, {
        error: isLocalAwsMode()
          ? "Deployment blocked: local AWS context not resolved. Check ~/.aws/credentials and AWS_REGION."
          : "Deployment blocked: organization AWS accounts are not configured.",
      });
    }

    const body = await readBody(req);
    const deploymentId = `dep-${agent.id}-${Date.now()}`;
    const deployedBy = body.deployedBy || "platform-admin@example.com";
    const awsCtx = getLocalAwsContext();
    const bucket = orgConfig.executionAccount.s3ArtifactBucket || `pegasus-agent-artifacts-${orgConfig.executionAccount.accountId}`;
    const roleArn = orgConfig.executionAccount.agentCoreExecutionRoleArn;

    if (isLocalAwsMode()) {
      // ── REAL AgentCore deployment ────────────────────────────────────────────
      const deploymentLogs = [];
      const onLog = (msg) => deploymentLogs.push(msg);

      // Build a safe runtime name: alphanum + underscore, start with letter, max 48 chars
      const runtimeName = `peg${slug(agent.name).replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 44)}`;
      const s3Prefix = `agents/${agent.id}/${version.semanticVersion}/`;

      // Use generated Strands code if available, otherwise a minimal stub
      const agentCode = version.generatedCode?.strandsPy
        || version.generatedCode?.agentPy
        || `# Auto-generated stub for ${agent.name} v${version.semanticVersion}\nimport json\n\ndef handler(event, context):\n    return {"output": "Agent ${agent.name} invoked", "input": event}\n`;

      // Create a provisional deployment record immediately so the UI shows "deploying"
      const provisionalDeployment = {
        id: deploymentId,
        agentId: agent.id,
        agentVersionId: version.id,
        runtimeProvider: "bedrock_agentcore",
        organizationId: agent.organizationId,
        projectId: agent.projectId,
        executionAccountId: orgConfig.executionAccount.accountId,
        modelAccountId: orgConfig.modelAccount.accountId,
        region: orgConfig.executionAccount.region,
        deploymentStatus: "deploying",
        localAwsMode: true,
        deploymentLogs: [`[${now()}] Deploy started. Account: ${awsCtx.accountId}, Region: ${awsCtx.region}`],
        deployedBy,
        deployedAt: now(),
        updatedAt: now(),
      };
      registry.deployments = registry.deployments || [];
      registry.deployments.push(provisionalDeployment);
      version.deploymentStatus = "deploying";
      version.deploymentId = deploymentId;
      writeRegistry(registry);

      // Run the real deploy asynchronously — client gets immediate 202, polls for status
      (async () => {
        try {
          const result = await deployAgent({
            runtimeName,
            roleArn,
            bucket,
            s3Prefix,
            agentCode,
            entryFileName: "agent.py",
            entryPoint: ["python", "agent.py"],
            pythonRuntime: "PYTHON_3_12",
            description: `${agent.name} v${version.semanticVersion} — deployed by ${platformName}`,
            environmentVariables: {
              AGENT_NAME: agent.name,
              AGENT_VERSION: version.semanticVersion,
              MODEL_ID: version.modelId || "anthropic.claude-3-5-haiku-20241022-v1:0",
              PLATFORM: platformSlug,
            },
            onLog,
          });

          // Update registry with real ARN + endpoint
          const reg = readRegistry();
          const dep = (reg.deployments || []).find((d) => d.id === deploymentId);
          const ag = reg.agents.find((a) => a.id === agent.id);
          const ver = (ag?.versions || []).find((v) => v.id === version.id);
          if (dep) {
            dep.deploymentStatus = "deployed";
            dep.runtimeId = result.agentRuntimeId;
            dep.runtimeArn = result.agentRuntimeArn;
            dep.agentRuntimeEndpointId = result.agentRuntimeEndpointId;
            dep.s3CodeLocation = result.s3CodeLocation;
            dep.deploymentLogs = deploymentLogs;
            dep.updatedAt = now();
          }
          if (ver) {
            ver.deploymentStatus = "deployed";
            ver.lifecycleState = "deployed";
            ver.updatedAt = now();
          }
          if (ag) {
            ag.currentApprovedVersionId = version.id;
            ag.updatedAt = now();
          }
          addAudit(reg, "agent.deployed.real", { agentId: agent.id, versionId: version.id, deploymentId, runtimeArn: result.agentRuntimeArn });
          writeRegistry(reg);
          console.log(`[deploy] ${agent.name} deployed successfully. Runtime: ${result.agentRuntimeArn}`);
        } catch (err) {
          console.error(`[deploy] FAILED for ${agent.name}: ${err.message}`);
          const reg = readRegistry();
          const dep = (reg.deployments || []).find((d) => d.id === deploymentId);
          const ver = ((reg.agents.find((a) => a.id === agent.id))?.versions || []).find((v) => v.id === version.id);
          if (dep) { dep.deploymentStatus = "failed"; dep.deploymentError = err.message; dep.deploymentLogs = [...deploymentLogs, `[${now()}] ERROR: ${err.message}`]; dep.updatedAt = now(); }
          if (ver) { ver.deploymentStatus = "failed"; ver.updatedAt = now(); }
          addAudit(reg, "agent.deployed.failed", { agentId: agent.id, versionId: version.id, deploymentId, error: err.message });
          writeRegistry(reg);
        }
      })();

      return sendJson(res, 202, {
        deployment: provisionalDeployment,
        agent: agentSummary(agent),
        message: `Deployment started for '${agent.name}'. Poll GET /api/agents/${agent.id}/deployments/${deploymentId} for status.`,
        deploymentId,
        localAwsMode: true,
      });

    } else {
      // ── MOCK deployment (non-local mode) ────────────────────────────────────
      const runtimeId = `agentcore-${slug(agent.name)}-${Date.now()}`;
      const runtimeArn = `arn:aws:bedrock-agentcore:${orgConfig.executionAccount.region}:${orgConfig.executionAccount.accountId}:runtime/${runtimeId}`;
      const ecrPrefix = orgConfig.executionAccount.ecrRepositoryPrefix || `${orgConfig.executionAccount.accountId}.dkr.ecr.${orgConfig.executionAccount.region}.amazonaws.com/pegasus`;

      const deployment = {
        id: deploymentId,
        agentId: agent.id,
        agentVersionId: version.id,
        runtimeProvider: "bedrock_agentcore",
        organizationId: agent.organizationId,
        projectId: agent.projectId,
        executionAccountId: orgConfig.executionAccount.accountId,
        modelAccountId: orgConfig.modelAccount.accountId,
        region: orgConfig.executionAccount.region,
        runtimeId,
        runtimeArn,
        ecrImageUri: `${ecrPrefix}/${slug(agent.name)}:${version.semanticVersion}`,
        deploymentStatus: "deployed",
        localAwsMode: false,
        deploymentLogs: [
          `[${now()}] Package retrieved from ${version.package?.packageLocation || "upload"}.`,
          `[${now()}] Docker image built and pushed to ECR.`,
          `[${now()}] AgentCore runtime created in ${orgConfig.executionAccount.region}.`,
          `[${now()}] Cross-account model role assumed in account ${orgConfig.modelAccount.accountId}.`,
          `[${now()}] Runtime status: ACTIVE. ARN: ${runtimeArn}`,
        ],
        deployedBy,
        deployedAt: now(),
        updatedAt: now(),
      };

      registry.deployments = registry.deployments || [];
      registry.deployments.push(deployment);
      version.deploymentStatus = "deployed";
      version.lifecycleState = "deployed";
      version.deploymentId = deploymentId;
      version.updatedAt = now();
      agent.currentApprovedVersionId = version.id;
      agent.updatedAt = now();

      addAudit(registry, "crewai.version.deployed", { agentId: agent.id, versionId: version.id, deploymentId, runtimeArn });
      writeRegistry(registry);

      return sendJson(res, 200, { deployment, agent: agentSummary(agent), message: `Agent '${agent.name}' deployed successfully to AgentCore Runtime.` });
    }
  }

  // GET /api/agents/:agentId/deployments
  if (req.method === "GET" && parts[1] === "agents" && parts[3] === "deployments" && !parts[4]) {
    const registry = readRegistry();
    const deployments = (registry.deployments || []).filter((d) => d.agentId === parts[2]);
    return sendJson(res, 200, { deployments });
  }

  // GET /api/agents/:agentId/deployments/:deploymentId — polling endpoint
  if (req.method === "GET" && parts[1] === "agents" && parts[3] === "deployments" && parts[4]) {
    const registry = readRegistry();
    const deployment = (registry.deployments || []).find((d) => d.id === parts[4] && d.agentId === parts[2]);
    if (!deployment) return sendJson(res, 404, { error: "Deployment not found." });

    // In local AWS mode, also fetch live status from AgentCore if we have a runtimeId
    if (isLocalAwsMode() && deployment.runtimeId && deployment.deploymentStatus !== "failed") {
      try {
        const runtimeStatus = await getAgentRuntime(deployment.runtimeId);
        deployment.liveRuntimeStatus = runtimeStatus.status || runtimeStatus.agentRuntimeStatus;
        if (deployment.agentRuntimeEndpointId) {
          const epStatus = await getRuntimeEndpoint(deployment.runtimeId, deployment.agentRuntimeEndpointId);
          deployment.liveEndpointStatus = epStatus.status || epStatus.endpointStatus;
        }
      } catch (err) {
        deployment.liveStatusError = err.message;
      }
    }
    return sendJson(res, 200, { deployment });
  }

  // GET /api/deployments/:deploymentId
  if (req.method === "GET" && parts[1] === "deployments" && parts[2] && !parts[3]) {
    const registry = readRegistry();
    const deployment = (registry.deployments || []).find((d) => d.id === parts[2]);
    if (!deployment) return sendJson(res, 404, { error: "Deployment not found." });
    return sendJson(res, 200, { deployment });
  }

  // ── POST /api/agents/:agentId/invoke — invoke deployed CrewAI agent via AgentCore ARN ──
  if (req.method === "POST" && parts[1] === "agents" && parts[3] === "invoke" && !parts[4]) {
    const registry = readRegistry();
    const agent = registry.agents.find((a) => a.id === parts[2]);
    if (!agent) return sendJson(res, 404, { error: "Agent not found." });

    // Find the active deployment
    const deployment = (registry.deployments || [])
      .filter((d) => d.agentId === agent.id && d.deploymentStatus === "deployed")
      .sort((a, b) => new Date(b.deployedAt) - new Date(a.deployedAt))[0];

    if (!deployment) {
      return sendJson(res, 422, { error: "No active deployment found for this agent. Deploy the approved version first." });
    }

    const body = await readBody(req);
    const inputPayload = body.inputs || body.input || body.payload || {};
    const invokedBy = body.invokedBy || "current-user@example.com";
    const runId = `run-${agent.id}-${Date.now()}`;
    const startedAt = now();

    let output, invokeStatus, durationMs;

    if (isLocalAwsMode() && deployment.runtimeId && deployment.agentRuntimeEndpointId) {
      // ── REAL invocation via AgentCore ──────────────────────────────────────
      const t0 = Date.now();
      try {
        const result = await invokeAgentRuntime(
          deployment.runtimeId,
          deployment.agentRuntimeEndpointId,
          inputPayload
        );
        durationMs = Date.now() - t0;
        output = {
          result: result.output,
          rawOutput: result.rawOutput,
          sessionId: result.sessionId,
          runtimeArn: deployment.runtimeArn,
          localAwsMode: true,
        };
        invokeStatus = "Success";
      } catch (err) {
        durationMs = Date.now() - t0;
        output = { error: err.message, runtimeArn: deployment.runtimeArn, localAwsMode: true };
        invokeStatus = "Failed";
      }
    } else {
      // ── MOCK invocation ────────────────────────────────────────────────────
      durationMs = Math.floor(Math.random() * 8000) + 2000;
      output = {
        result: `[Simulated AgentCore response] Agent processed: ${JSON.stringify(inputPayload).slice(0, 120)}`,
        agentUsed: agent.name,
        runtimeArn: deployment.runtimeArn,
        localAwsMode: false,
      };
      invokeStatus = "Success";
    }

    const invocationRecord = {
      id: runId,
      agentId: agent.id,
      agentName: agent.name,
      deploymentId: deployment.id,
      runtimeArn: deployment.runtimeArn,
      invokedBy,
      inputs: inputPayload,
      output,
      status: invokeStatus,
      durationMs,
      model: agent.model || "anthropic.claude-3-5-sonnet-20241022-v2:0",
      localAwsMode: isLocalAwsMode(),
      startedAt,
      completedAt: now(),
    };

    registry.invocations = registry.invocations || [];
    registry.invocations.unshift(invocationRecord);
    addAudit(registry, "agent.invoked", { runId, agentId: agent.id, runtimeArn: deployment.runtimeArn, invokedBy, localAwsMode: isLocalAwsMode() });
    writeRegistry(registry);

    return sendJson(res, 200, { runId, output, invocation: invocationRecord, runtimeArn: deployment.runtimeArn });
  }

  // GET /api/agents/:agentId/invocations — list invocation history
  if (req.method === "GET" && parts[1] === "agents" && parts[3] === "invocations" && !parts[4]) {
    const registry = readRegistry();
    const invocations = (registry.invocations || []).filter((i) => i.agentId === parts[2]);
    return sendJson(res, 200, { invocations });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 1 — AWS Account Connections & Inventory Discovery
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/organizations/:orgId/account-connections
  if (req.method === "GET" && parts[1] === "organizations" && parts[3] === "account-connections" && !parts[4]) {
    const registry = readRegistry();
    const connections = (registry.awsAccountConnections || []).filter((c) => c.organizationId === parts[2]);
    return sendJson(res, 200, { connections });
  }

  // POST /api/organizations/:orgId/account-connections — add a new BU account
  if (req.method === "POST" && parts[1] === "organizations" && parts[3] === "account-connections" && !parts[4]) {
    const registry = readRegistry();
    const org = (registry.organizations || []).find((o) => o.id === parts[2]);
    if (!org) return sendJson(res, 404, { error: "Organization not found." });
    const body = await readBody(req);
    if (!body.awsAccountId) return sendJson(res, 400, { error: "awsAccountId is required." });
    if (!body.discoveryRoleArn) return sendJson(res, 400, { error: "discoveryRoleArn is required." });
    if (!body.provisioningRoleArn) return sendJson(res, 400, { error: "provisioningRoleArn is required." });
    if (/AKIA|BEGIN|password|token[-_]?value/i.test(body.externalIdRef || "")) {
      return sendJson(res, 400, { error: "externalIdRef must be a secret reference name, never a raw secret value." });
    }
    const connId = `conn-${slug(org.id)}-${Date.now()}`;
    const connection = {
      id: connId,
      organizationId: parts[2],
      awsAccountId: body.awsAccountId.trim(),
      accountName: (body.accountName || "").trim(),
      environment: body.environment || "production",
      discoveryRoleArn: body.discoveryRoleArn.trim(),
      provisioningRoleArn: body.provisioningRoleArn.trim(),
      externalIdRef: body.externalIdRef || null,
      enabledRegions: body.enabledRegions || ["us-east-1"],
      agentCoreGatewayArn: body.agentCoreGatewayArn || null,
      agentCoreGatewayUrl: body.agentCoreGatewayUrl || null,
      status: "PENDING_SYNC",
      lastSuccessfulSyncAt: null,
      createdBy: body.createdBy || "platform-admin@example.com",
      createdAt: now(),
      updatedAt: now(),
    };
    registry.awsAccountConnections.push(connection);
    addAudit(registry, "aws.account.connected", { connId, awsAccountId: connection.awsAccountId, orgId: parts[2], createdBy: connection.createdBy });
    writeRegistry(registry);
    return sendJson(res, 201, { connection });
  }

  // GET /api/organizations/:orgId/account-connections/:connId
  if (req.method === "GET" && parts[1] === "organizations" && parts[3] === "account-connections" && parts[4] && !parts[5]) {
    const registry = readRegistry();
    const connection = (registry.awsAccountConnections || []).find((c) => c.id === parts[4] && c.organizationId === parts[2]);
    if (!connection) return sendJson(res, 404, { error: "Account connection not found." });
    return sendJson(res, 200, { connection });
  }

  // PUT /api/organizations/:orgId/account-connections/:connId — update connection settings
  if (req.method === "PUT" && parts[1] === "organizations" && parts[3] === "account-connections" && parts[4] && !parts[5]) {
    const registry = readRegistry();
    const connection = (registry.awsAccountConnections || []).find((c) => c.id === parts[4] && c.organizationId === parts[2]);
    if (!connection) return sendJson(res, 404, { error: "Account connection not found." });
    const body = await readBody(req);
    if (body.accountName !== undefined) connection.accountName = body.accountName;
    if (body.environment !== undefined) connection.environment = body.environment;
    if (body.discoveryRoleArn !== undefined) connection.discoveryRoleArn = body.discoveryRoleArn;
    if (body.provisioningRoleArn !== undefined) connection.provisioningRoleArn = body.provisioningRoleArn;
    if (body.enabledRegions !== undefined) connection.enabledRegions = body.enabledRegions;
    if (body.agentCoreGatewayArn !== undefined) connection.agentCoreGatewayArn = body.agentCoreGatewayArn;
    if (body.agentCoreGatewayUrl !== undefined) connection.agentCoreGatewayUrl = body.agentCoreGatewayUrl;
    connection.updatedAt = now();
    addAudit(registry, "aws.account.updated", { connId: connection.id, orgId: parts[2] });
    writeRegistry(registry);
    return sendJson(res, 200, { connection });
  }

  // POST /api/organizations/:orgId/account-connections/:connId/sync — trigger inventory scan
  if (req.method === "POST" && parts[1] === "organizations" && parts[3] === "account-connections" && parts[4] && parts[5] === "sync") {
    const registry = readRegistry();
    const connection = (registry.awsAccountConnections || []).find((c) => c.id === parts[4] && c.organizationId === parts[2]);
    if (!connection) return sendJson(res, 404, { error: "Account connection not found." });

    addAudit(registry, "aws.inventory.sync.started", { connId: connection.id, orgId: parts[2] });
    const { syncRun, resources } = await runInventorySync(connection, parts[2]);

    // Merge discovered resources — update existing by ARN, add new ones
    registry.discoveredResources = registry.discoveredResources || [];
    for (const res2 of resources) {
      const existing = registry.discoveredResources.find((r) => r.resourceArn === res2.resourceArn && r.organizationId === parts[2]);
      if (existing) {
        const changed = existing.checksum !== res2.checksum;
        existing.checksum = res2.checksum;
        existing.metadataJson = res2.metadataJson;
        existing.lastSeenAt = res2.lastSeenAt;
        existing.updatedAt = res2.updatedAt;
        existing.discoveryStatus = changed ? "CHANGED" : "ACTIVE";
        syncRun.resourcesUpdated = (syncRun.resourcesUpdated || 0) + (changed ? 1 : 0);
      } else {
        registry.discoveredResources.push(res2);
      }
    }

    // Mark resources no longer seen as STALE
    const seenArns = new Set(resources.map((r) => r.resourceArn));
    for (const dr of registry.discoveredResources.filter((r) => r.awsAccountConnectionId === connection.id)) {
      if (!seenArns.has(dr.resourceArn)) {
        dr.discoveryStatus = "STALE";
        syncRun.resourcesRemoved = (syncRun.resourcesRemoved || 0) + 1;
      }
    }

    connection.status = "CONNECTED";
    connection.lastSuccessfulSyncAt = syncRun.completedAt;
    connection.updatedAt = now();
    registry.inventorySyncRuns = registry.inventorySyncRuns || [];
    registry.inventorySyncRuns.unshift(syncRun);
    addAudit(registry, "aws.inventory.sync.completed", { connId: connection.id, orgId: parts[2], runId: syncRun.id, resourcesDiscovered: syncRun.resourcesDiscovered });
    writeRegistry(registry);
    return sendJson(res, 200, { syncRun, resourcesDiscovered: syncRun.resourcesDiscovered });
  }

  // GET /api/organizations/:orgId/account-connections/:connId/sync-runs
  if (req.method === "GET" && parts[1] === "organizations" && parts[3] === "account-connections" && parts[4] && parts[5] === "sync-runs") {
    const registry = readRegistry();
    const runs = (registry.inventorySyncRuns || []).filter((r) => r.awsAccountConnectionId === parts[4] && r.organizationId === parts[2]);
    return sendJson(res, 200, { syncRuns: runs });
  }

  // GET /api/organizations/:orgId/discovered-resources
  if (req.method === "GET" && parts[1] === "organizations" && parts[3] === "discovered-resources" && !parts[4]) {
    const registry = readRegistry();
    let resources = (registry.discoveredResources || []).filter((r) => r.organizationId === parts[2]);
    const { type, region, status: dStatus } = Object.fromEntries(requestUrl.searchParams);
    if (type) resources = resources.filter((r) => r.resourceType === type);
    if (region) resources = resources.filter((r) => r.region === region);
    if (dStatus) resources = resources.filter((r) => r.discoveryStatus === dStatus);
    return sendJson(res, 200, { resources });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 2 — Project Visible Resources
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/projects/:pid/visible-resources
  if (req.method === "GET" && parts[1] === "projects" && parts[3] === "visible-resources" && !parts[4]) {
    const registry = readRegistry();
    const visible = (registry.projectVisibleResources || []).filter((v) => v.projectId === parts[2] && v.visibilityStatus === "VISIBLE");
    // Enrich each record with the full discovered resource
    const enriched = visible.map((v) => {
      const dr = (registry.discoveredResources || []).find((r) => r.id === v.discoveredResourceId);
      return { ...v, discoveredResource: dr || null };
    });
    return sendJson(res, 200, { visibleResources: enriched });
  }

  // POST /api/projects/:pid/visible-resources — add a resource to project visibility
  if (req.method === "POST" && parts[1] === "projects" && parts[3] === "visible-resources" && !parts[4]) {
    const registry = readRegistry();
    const body = await readBody(req);
    if (!body.discoveredResourceId) return sendJson(res, 400, { error: "discoveredResourceId is required." });
    const dr = (registry.discoveredResources || []).find((r) => r.id === body.discoveredResourceId);
    if (!dr) return sendJson(res, 404, { error: "Discovered resource not found." });
    // Check org membership (resource must belong to org that owns this project)
    const org = (registry.organizations || []).find((o) => o.projects?.some((p) => p.id === parts[2]));
    if (!org || dr.organizationId !== org.id) return sendJson(res, 422, { error: "Resource does not belong to the same organization as this project." });
    // Idempotent — update if exists
    const existing = (registry.projectVisibleResources || []).find((v) => v.projectId === parts[2] && v.discoveredResourceId === body.discoveredResourceId);
    if (existing) {
      existing.visibilityStatus = body.visibilityStatus || "VISIBLE";
      existing.addedAt = now();
      writeRegistry(registry);
      return sendJson(res, 200, { visibleResource: existing });
    }
    const record = makeVisible(dr, parts[2], org.id, body.addedBy || "current-user@example.com");
    record.visibilityStatus = body.visibilityStatus || "VISIBLE";
    registry.projectVisibleResources = registry.projectVisibleResources || [];
    registry.projectVisibleResources.push(record);
    addAudit(registry, "project.resource.visibility.added", { projectId: parts[2], resourceId: body.discoveredResourceId, resourceType: dr.resourceType });
    writeRegistry(registry);
    return sendJson(res, 201, { visibleResource: record });
  }

  // PATCH /api/projects/:pid/visible-resources/:pvrid — hide/show
  if (req.method === "PATCH" && parts[1] === "projects" && parts[3] === "visible-resources" && parts[4]) {
    const registry = readRegistry();
    const record = (registry.projectVisibleResources || []).find((v) => v.id === parts[4] && v.projectId === parts[2]);
    if (!record) return sendJson(res, 404, { error: "Visible resource record not found." });
    const body = await readBody(req);
    if (body.visibilityStatus) record.visibilityStatus = body.visibilityStatus;
    addAudit(registry, "project.resource.visibility.changed", { projectId: parts[2], recordId: parts[4], visibilityStatus: record.visibilityStatus });
    writeRegistry(registry);
    return sendJson(res, 200, { visibleResource: record });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PHASE 3 — Tool Registration Requests
  // ══════════════════════════════════════════════════════════════════════════════

  // GET /api/projects/:pid/tool-registration-requests
  if (req.method === "GET" && parts[1] === "projects" && parts[3] === "tool-registration-requests" && !parts[4]) {
    const registry = readRegistry();
    const { approvalStatus } = Object.fromEntries(requestUrl.searchParams);
    let trrs = (registry.toolRegistrationRequests || []).filter((r) => r.projectId === parts[2]);
    if (approvalStatus) trrs = trrs.filter((r) => r.approvalStatus === approvalStatus);
    return sendJson(res, 200, { toolRegistrationRequests: trrs });
  }

  // POST /api/projects/:pid/tool-registration-requests — submit new tool registration
  if (req.method === "POST" && parts[1] === "projects" && parts[3] === "tool-registration-requests" && !parts[4]) {
    const registry = readRegistry();
    const body = await readBody(req);
    // Validations
    if (!body.requestedToolName || body.requestedToolName.trim().length < 2) return sendJson(res, 400, { error: "requestedToolName must be at least 2 characters." });
    if (!body.sourceDiscoveredResourceId) return sendJson(res, 400, { error: "sourceDiscoveredResourceId is required." });
    if (!body.sideEffectLevel || !["READ_ONLY","WRITE","DESTRUCTIVE"].includes(body.sideEffectLevel)) return sendJson(res, 400, { error: "sideEffectLevel must be READ_ONLY, WRITE, or DESTRUCTIVE." });
    if (!body.businessOwner) return sendJson(res, 400, { error: "businessOwner is required." });
    if (!body.toolType || !["API_GATEWAY","LAMBDA","BEDROCK_KB","EXISTING_GATEWAY_TOOL"].includes(body.toolType)) return sendJson(res, 400, { error: "toolType must be API_GATEWAY, LAMBDA, BEDROCK_KB, or EXISTING_GATEWAY_TOOL." });
    // Source must be in project visibility
    const pvr = (registry.projectVisibleResources || []).find((v) => v.discoveredResourceId === body.sourceDiscoveredResourceId && v.projectId === parts[2] && v.visibilityStatus === "VISIBLE");
    if (!pvr) return sendJson(res, 422, { error: "Source resource is not visible to this project. Add it to Project Resource Visibility first." });
    // Source resource must be ACTIVE
    const dr = (registry.discoveredResources || []).find((r) => r.id === body.sourceDiscoveredResourceId);
    if (!dr) return sendJson(res, 404, { error: "Discovered resource not found." });
    if (dr.discoveryStatus === "REMOVED") return sendJson(res, 422, { error: "Source resource has been removed from the AWS account. Cannot register a tool from a removed resource." });
    if (dr.discoveryStatus === "STALE") return sendJson(res, 422, { error: "Source resource is stale (not seen in last sync). Run an inventory sync before registering." });
    // No raw secrets in auth
    if (/AKIA|BEGIN|password|token[-_]?value/i.test(body.authConfigRef || "")) return sendJson(res, 400, { error: "authConfigRef must be a secret reference name, never a raw secret value." });
    // Validate JSON schemas if provided
    if (body.inputSchemaJson) {
      try { JSON.parse(body.inputSchemaJson); } catch { return sendJson(res, 400, { error: "inputSchemaJson is not valid JSON." }); }
    }
    const org = (registry.organizations || []).find((o) => o.projects?.some((p) => p.id === parts[2]));
    const trrId = `trr-${slug(body.requestedToolName)}-${Date.now()}`;
    const trr = {
      id: trrId,
      organizationId: org?.id || "",
      projectId: parts[2],
      sourceDiscoveredResourceId: body.sourceDiscoveredResourceId,
      sourceResourceArn: dr.resourceArn,
      sourceResourceType: dr.resourceType,
      requestedToolName: body.requestedToolName.trim(),
      requestedDescription: (body.requestedDescription || "").trim(),
      toolType: body.toolType,
      inputSchemaJson: body.inputSchemaJson || null,
      outputSchemaJson: body.outputSchemaJson || null,
      sampleRequestJson: body.sampleRequestJson || null,
      sampleResponseJson: body.sampleResponseJson || null,
      authConfigRef: body.authConfigRef || null,
      dataClassification: body.dataClassification || "internal",
      sideEffectLevel: body.sideEffectLevel,
      rateLimitRpm: body.rateLimitRpm || null,
      timeoutSeconds: body.timeoutSeconds || 30,
      businessOwner: body.businessOwner.trim(),
      allowedUseCases: body.allowedUseCases || [],
      tags: body.tags || {},
      approvalStatus: "PENDING_APPROVAL",
      validationStatus: "passed",
      validationResultsJson: JSON.stringify([
        { check: "source_resource_exists", status: "pass", message: "Source resource found in organization catalog." },
        { check: "project_visibility", status: "pass", message: "Resource is visible to this project." },
        { check: "no_raw_secrets", status: "pass", message: "No raw credential values detected." },
        { check: "side_effect_declared", status: "pass", message: `Side effect level declared: ${body.sideEffectLevel}.` },
        { check: "business_owner", status: "pass", message: `Business owner set: ${body.businessOwner}.` },
        ...(body.sideEffectLevel !== "READ_ONLY" ? [{ check: "write_risk", status: "warn", message: `${body.sideEffectLevel} operation requires elevated approval (security review).` }] : []),
      ]),
      requestedBy: body.requestedBy || "current-user@example.com",
      createdAt: now(),
      updatedAt: now(),
    };
    registry.toolRegistrationRequests = registry.toolRegistrationRequests || [];
    registry.toolRegistrationRequests.push(trr);
    // Create approval tasks
    const approverTypes = ["business_owner", "project_owner", "platform_admin"];
    if (body.sideEffectLevel === "WRITE" || body.sideEffectLevel === "DESTRUCTIVE") approverTypes.push("security");
    const trrTasks = [...new Set(approverTypes)].map((type) => ({
      id: `approval-trr-${trrId}-${type}-${Date.now()}`,
      taskCategory: "tool_registration",
      toolRegistrationRequestId: trrId,
      projectId: parts[2],
      organizationId: trr.organizationId,
      resourceName: trr.requestedToolName,
      sourceResourceType: dr.resourceType,
      sideEffectLevel: trr.sideEffectLevel,
      approverType: type,
      status: "pending",
      riskTier: body.sideEffectLevel === "DESTRUCTIVE" ? "critical" : body.sideEffectLevel === "WRITE" ? "high" : "medium",
      reason: reasonFor(type),
      createdAt: now(),
      decidedAt: null,
      decision: null,
      comments: "",
      approver: null,
    }));
    registry.approvalTasks.push(...trrTasks);
    addAudit(registry, "tool.registration.requested", { trrId, projectId: parts[2], toolName: trr.requestedToolName, sideEffectLevel: trr.sideEffectLevel });
    writeRegistry(registry);
    return sendJson(res, 201, { toolRegistrationRequest: trr, approvalTasks: trrTasks });
  }

  // GET /api/tool-registration-requests/:trrId
  if (req.method === "GET" && parts[1] === "tool-registration-requests" && parts[2] && !parts[3]) {
    const registry = readRegistry();
    const trr = (registry.toolRegistrationRequests || []).find((r) => r.id === parts[2]);
    if (!trr) return sendJson(res, 404, { error: "Tool registration request not found." });
    const tasks = registry.approvalTasks.filter((t) => t.toolRegistrationRequestId === parts[2]);
    return sendJson(res, 200, { toolRegistrationRequest: trr, approvalTasks: tasks });
  }

  // POST /api/tool-registration-requests/:trrId/provision — trigger Gateway provisioning after approval
  if (req.method === "POST" && parts[1] === "tool-registration-requests" && parts[2] && parts[3] === "provision") {
    const registry = readRegistry();
    const trr = (registry.toolRegistrationRequests || []).find((r) => r.id === parts[2]);
    if (!trr) return sendJson(res, 404, { error: "Tool registration request not found." });
    if (trr.approvalStatus !== "APPROVED") return sendJson(res, 422, { error: "Tool registration request must be fully approved before provisioning." });
    const body = await readBody(req);
    const conn = (registry.awsAccountConnections || []).find((c) => c.organizationId === trr.organizationId);
    if (!conn) return sendJson(res, 422, { error: "No AWS account connection found for this organization." });
    // Simulate provisioning
    const gtdId = `gtd-${trr.id}-${Date.now()}`;
    const targetId = `tgt-${slug(trr.requestedToolName)}-${Date.now()}`;
    const gatewayArn = conn.agentCoreGatewayArn || `arn:aws:bedrock-agentcore:us-east-1:${conn.awsAccountId}:gateway/gw-auto`;
    const gtd = {
      id: gtdId,
      organizationId: trr.organizationId,
      projectId: trr.projectId,
      toolRegistrationRequestId: trr.id,
      awsAccountConnectionId: conn.id,
      gatewayArn,
      gatewayId: gatewayArn.split("/").pop(),
      targetId,
      targetType: trr.toolType,
      deploymentStatus: "SUCCEEDED",
      deploymentLogsJson: JSON.stringify([
        `[${now()}] Assuming provisioning role ${conn.provisioningRoleArn}…`,
        `[${now()}] STS AssumeRole succeeded. Session: guardian-provision-${trr.projectId}`,
        `[${now()}] Creating AgentCore Gateway target for ${trr.requestedToolName} (type: ${trr.toolType})…`,
        `[${now()}] Gateway target created: ${targetId}`,
        `[${now()}] Calling MCP tools/list to confirm tool registration…`,
        `[${now()}] MCP tools/list confirmed: tool name = "${trr.requestedToolName}", schema validated.`,
        `[${now()}] ProjectTool record created. Provisioning complete.`,
      ]),
      createdAt: now(),
      completedAt: now(),
    };
    registry.gatewayTargetDeployments = registry.gatewayTargetDeployments || [];
    registry.gatewayTargetDeployments.push(gtd);
    // Create ProjectTool
    const ptId = `ptool-${slug(trr.requestedToolName)}-${Date.now()}`;
    const projectTool = {
      id: ptId,
      organizationId: trr.organizationId,
      projectId: trr.projectId,
      toolRegistrationRequestId: trr.id,
      sourceDiscoveredResourceId: trr.sourceDiscoveredResourceId,
      gatewayArn,
      gatewayUrl: conn.agentCoreGatewayUrl || "",
      gatewayTargetId: targetId,
      mcpToolName: trr.requestedToolName,
      displayName: trr.requestedToolName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      description: trr.requestedDescription,
      inputSchemaJson: trr.inputSchemaJson,
      outputSchemaJson: trr.outputSchemaJson,
      sideEffectLevel: trr.sideEffectLevel,
      dataClassification: trr.dataClassification,
      riskTier: gtd.targetType === "BEDROCK_KB" ? "low" : trr.sideEffectLevel === "READ_ONLY" ? "medium" : "high",
      businessOwner: trr.businessOwner,
      toolStatus: "ACTIVE",
      version: "1.0.0",
      checksum: `sha256:${Buffer.from(`${trr.id}:${now()}`).toString("hex").slice(0, 32)}`,
      lastValidatedAt: now(),
      createdAt: now(),
      updatedAt: now(),
    };
    registry.projectTools = registry.projectTools || [];
    registry.projectTools.push(projectTool);
    trr.approvalStatus = "PROVISIONED";
    trr.updatedAt = now();
    addAudit(registry, "tool.gateway.provisioned", { trrId: trr.id, projectId: trr.projectId, targetId, mcpToolName: trr.requestedToolName });
    writeRegistry(registry);
    return sendJson(res, 200, { gatewayTargetDeployment: gtd, projectTool });
  }

  // GET /api/tool-registration-requests/:trrId/provisioning-status
  if (req.method === "GET" && parts[1] === "tool-registration-requests" && parts[2] && parts[3] === "provisioning-status") {
    const registry = readRegistry();
    const gtd = (registry.gatewayTargetDeployments || []).find((g) => g.toolRegistrationRequestId === parts[2]);
    return sendJson(res, 200, { gatewayTargetDeployment: gtd || null });
  }

  // ── Project Tools (approved, gateway-backed) ────────────────────────────────

  // GET /api/projects/:pid/project-tools
  if (req.method === "GET" && parts[1] === "projects" && parts[3] === "project-tools" && !parts[4]) {
    const registry = readRegistry();
    const { status: toolStatus } = Object.fromEntries(requestUrl.searchParams);
    let tools2 = (registry.projectTools || []).filter((t) => t.projectId === parts[2]);
    if (toolStatus) tools2 = tools2.filter((t) => t.toolStatus === toolStatus);
    return sendJson(res, 200, { projectTools: tools2 });
  }

  // GET /api/project-tools/:toolId
  if (req.method === "GET" && parts[1] === "project-tools" && parts[2] && !parts[3]) {
    const registry = readRegistry();
    const tool = (registry.projectTools || []).find((t) => t.id === parts[2]);
    if (!tool) return sendJson(res, 404, { error: "Project tool not found." });
    return sendJson(res, 200, { projectTool: tool });
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

server.listen(port, host, async () => {
  // 1. Resolve real AWS credentials if LOCAL_AWS_MODE=true
  await resolveLocalAwsContext();

  // 2. If local mode resolved, fetch Bedrock models and patch local org's awsConfig
  if (isLocalAwsMode()) {
    const ctx = getLocalAwsContext();
    try {
      const modelIds = await listAvailableModelIds();
      // Patch the registry's local-dev org with real account info + model list
      const registry = readRegistry();
      const localOrg = (registry.organizations || []).find((o) => o.id === "local-dev");
      if (localOrg && localOrg.awsConfig) {
        localOrg.awsConfig.modelAccount.accountId = ctx.accountId;
        localOrg.awsConfig.modelAccount.region = ctx.region;
        localOrg.awsConfig.executionAccount.accountId = ctx.accountId;
        localOrg.awsConfig.executionAccount.region = ctx.region;
        localOrg.awsConfig.executionAccount.agentCoreExecutionRoleArn =
          `arn:aws:iam::${ctx.accountId}:role/AgentCoreExecutionRole`;
        localOrg.awsConfig.executionAccount.ecrRepositoryPrefix =
          `${ctx.accountId}.dkr.ecr.${ctx.region}.amazonaws.com/pegasus`;
        localOrg.awsConfig.executionAccount.s3ArtifactBucket =
          `pegasus-agent-artifacts-${ctx.accountId}`;
        if (modelIds.length > 0) {
          localOrg.awsConfig.modelAccount.allowedModelIds = modelIds;
          console.log(`[server] Patched local-dev org with ${modelIds.length} Bedrock models.`);
        } else {
          console.warn("[server] No Bedrock models returned — check IAM permissions (bedrock:ListFoundationModels).");
        }
        writeRegistry(registry);
      }
    } catch (err) {
      console.error(`[server] Could not patch local org from Bedrock: ${err.message}`);
    }
  }

  // 3. Ensure registry is seeded
  ensureRegistry();

  console.log(`\n${platformName} UI and Control Plane API running at http://${host}:${port}`);
  if (isLocalAwsMode()) {
    const ctx = getLocalAwsContext();
    console.log(`Local AWS mode  : ACTIVE  (account ${ctx.accountId}, ${ctx.region})`);
    console.log(`Caller ARN      : ${ctx.callerArn}`);
  } else {
    console.log(`Local AWS mode  : OFF  (all AWS calls are mocked)`);
  }
});
