export const PROJECTS = ["Claims Operations", "Billing Experience", "Member Services"];

export const PROJECT_IDS = {
  "Claims Operations": "claims-operations",
  "Billing Experience": "billing-experience",
  "Member Services": "member-services",
};

// Organization roles: platform_admin > org_admin > org_member
export const ORG_ROLES = {
  platform_admin: "Platform Admin",
  org_admin:      "Org Admin",
  org_member:     "Org Member",
};

// Project roles (unchanged, now scoped under an org)
export const PROJECT_ROLES = {
  project_owner:  "Project Owner",
  project_writer: "Project Writer",
  business_user:  "Business User",
};

// Seed organizations — the API returns live data; this is the in-memory fallback
export const FALLBACK_ORGS = [
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
    awsConfig: null,  // not yet configured
  },
];

// Which projects belong to which org (for filtering the project picker)
export const ORG_PROJECTS = {
  "acme-health":   ["Claims Operations", "Billing Experience", "Member Services"],
  "acme-finance":  [],
};

export const AGENT_TYPES = {
  bedrock_agentcore: "Bedrock AgentCore",
  langgraph: "LangGraph",
  openai_agent: "OpenAI Agent",
  crewai: "CrewAI",
  strands: "Strands",
  custom: "Custom",
};

export const TOOL_TYPES = {
  rest: "REST API",
  graphql: "GraphQL",
  lambda: "Lambda Function",
  apigee: "Apigee Proxy",
  mcp: "MCP Tool",
};

export const KB_TYPES = {
  bedrock_kb: "Bedrock Knowledge Base",
  s3: "S3 Data Source",
  opensearch: "OpenSearch",
  custom: "Custom",
};

export const RISK_TIERS = ["low", "medium", "high", "critical"];
export const CLASSIFICATIONS = ["internal", "confidential", "restricted"];

export const BEDROCK_MODELS = [
  { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet v2" },
  { id: "anthropic.claude-3-5-haiku-20241022-v1:0", label: "Claude 3.5 Haiku" },
  { id: "anthropic.claude-3-opus-20240229-v1:0", label: "Claude 3 Opus" },
  { id: "amazon.nova-pro-v1:0", label: "Amazon Nova Pro" },
  { id: "amazon.nova-lite-v1:0", label: "Amazon Nova Lite" },
];

export const FRAMEWORKS = [
  { id: "strands", label: "Strands (AWS native, recommended)" },
  { id: "langgraph", label: "LangGraph (complex orchestration)" },
];

// CrewAI external package onboarding
export const PACKAGE_SOURCE_TYPES = {
  upload:    { label: "Upload package (zip)",       hint: "Upload a .zip of your CrewAI project" },
  s3:        { label: "S3 location",                hint: "s3://bucket/path/to/package.zip" },
  git:       { label: "Git repository",             hint: "https://github.com/org/repo.git" },
  artifact:  { label: "Artifact repository",        hint: "e.g. Artifactory or CodeArtifact URI" },
  container: { label: "Container image (ECR URI)",  hint: "123456789012.dkr.ecr.us-east-1.amazonaws.com/my-crew:latest" },
};

export const CREWAI_PYTHON_VERSIONS = ["3.10", "3.11", "3.12"];

export const VALIDATION_TYPES = {
  structure:  "Package Structure",
  dependency: "Dependencies",
  security:   "Security",
  governance: "Governance",
  agentcore:  "AgentCore Readiness",
};

export const VALIDATION_SEVERITY = {
  blocking: { label: "Blocking", cls: "fail" },
  warning:  { label: "Warning",  cls: "warn" },
  info:     { label: "Info",     cls: "pass" },
};

export const AGENTCORE_RUNTIME_DEFAULTS = {
  memoryMb: 2048,
  timeoutSeconds: 300,
  reservedEnvVars: ["AWS_REGION", "AWS_DEFAULT_REGION", "AWS_EXECUTION_ENV", "LAMBDA_TASK_ROOT"],
};

export const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME || "").trim() || "Pegasus";
export const PLATFORM_MARK = PLATFORM_NAME.trim().charAt(0).toUpperCase() || "P";
export const PLATFORM_SLUG = PLATFORM_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pegasus";

export const LIFECYCLE_STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "business_owner_review", label: "Business Owner" },
  { key: "platform_admin_review", label: "Platform Admin" },
  { key: "approved", label: "Approved" },
];

export const LIFECYCLE_STEP = {
  "Submitted": 0,
  "Draft": 0,
  "Business Owner Review": 1,
  "Platform Admin Review": 2,
  "Approved": 3,
  "Rejected": 3,
};

export const fallback = {
  "Claims Operations": {
    summary: { approvedAgents: 12, reviewAgents: 2, runs24h: 184, failedRuns: 6, policyPass: "98.1%", approvals: 3, blocked: 1 },
    tools: ["claim_lookup", "policy_lookup", "payment_post", "customer_update"],
    knowledge: ["claims-policy-kb", "claims-forms-kb"],
    users: [["priya@example.com", "Project owner", "Today"], ["alex@example.com", "Business user", "Today"], ["devon@example.com", "Project writer", "Yesterday"]],
  },
  "Billing Experience": {
    summary: { approvedAgents: 7, reviewAgents: 4, runs24h: 91, failedRuns: 9, policyPass: "93.2%", approvals: 5, blocked: 2 },
    tools: ["invoice_lookup", "payment_post", "refund_status"],
    knowledge: ["billing-faq-kb", "payments-policy-kb"],
    users: [["marcus@example.com", "Project owner", "Today"], ["jules@example.com", "Project writer", "Today"]],
  },
  "Member Services": {
    summary: { approvedAgents: 9, reviewAgents: 1, runs24h: 138, failedRuns: 3, policyPass: "99.0%", approvals: 1, blocked: 0 },
    tools: ["member_lookup", "benefits_lookup"],
    knowledge: ["member-benefits-kb"],
    users: [["devon@example.com", "Project owner", "Today"], ["taylor@example.com", "Business user", "Today"]],
  },
};

export const mockRuns = {
  "claims-assistant": [
    { id: "run-claims-001", user: "alex@example.com", status: "Success", started: "8 minutes ago", duration: "12.4s", inputTokens: 8200, outputTokens: 1900, model: "Claude 3.5 Sonnet", tools: ["claim_lookup", "policy_lookup"] },
    { id: "run-claims-002", user: "sam@example.com", status: "Success", started: "24 minutes ago", duration: "8.7s", inputTokens: 6100, outputTokens: 1200, model: "Claude 3.5 Sonnet", tools: ["claim_lookup"] },
    { id: "run-claims-003", user: "lee@example.com", status: "Tool denied", started: "42 minutes ago", duration: "3.1s", inputTokens: 2900, outputTokens: 420, model: "Claude 3.5 Sonnet", tools: ["payment_post"] },
  ],
  "claims-crew": [
    { id: "run-crew-001", user: "anika@example.com", status: "Success", started: "18 minutes ago", duration: "16.9s", inputTokens: 10400, outputTokens: 2600, model: "Claude 3.5 Sonnet", tools: ["claim_lookup"] },
  ],
  "benefits-strands-agent": [
    { id: "run-strands-001", user: "taylor@example.com", status: "Success", started: "5 minutes ago", duration: "7.6s", inputTokens: 4300, outputTokens: 980, model: "Claude 3.5 Haiku", tools: ["benefits_lookup"] },
  ],
};

export const SAMPLE_YAML = `schemaVersion: ${PLATFORM_SLUG}.agent/v1
id: claims-strands-agent
name: Claims Strands Agent
version: 0.1.0
projectId: claims-operations
owner:
  userId: current-user@example.com
  businessUnit: Claims Operations
agentType: strands
runtime:
  target: agentcore
  framework: strands
model:
  provider: bedrock
  modelId: anthropic.claude-3-5-sonnet-20241022-v2:0
tools:
  - toolId: claim_lookup
    version: 1.0.0
  - toolId: policy_lookup
    version: 1.0.0
knowledge:
  - knowledgeBaseId: claims-policy-kb
memory:
  shortTerm: true
  longTerm: false
policies:
  riskTier: medium
  dataClassification: internal
observability:
  arizeProject: ${PLATFORM_SLUG}-claims-operations
  traceLevel: standard`;

// Projects that explicitly exclude CrewAI agents (mirrors server-side projectCatalog)
export const CREWAI_EXCLUDED_PROJECTS = ["member-services", "Member Services"];

// ── AWS Discovery & Tool Registration constants ──────────────────────────────

export const DISCOVERED_RESOURCE_TYPES = {
  API_GATEWAY_REST:       { label: "API Gateway REST",       icon: "Globe",    color: "blue"   },
  API_GATEWAY_HTTP:       { label: "API Gateway HTTP",       icon: "Globe",    color: "blue"   },
  LAMBDA:                 { label: "Lambda Function",        icon: "Zap",      color: "amber"  },
  AGENTCORE_GATEWAY:      { label: "AgentCore Gateway",      icon: "Server",   color: "violet" },
  AGENTCORE_GATEWAY_TARGET:{ label: "Gateway Target",        icon: "Target",   color: "violet" },
  AGENTCORE_GATEWAY_TOOL: { label: "Gateway Tool (MCP)",     icon: "Wrench",   color: "green"  },
  BEDROCK_KB:             { label: "Bedrock Knowledge Base", icon: "Database", color: "teal"   },
  BEDROCK_KB_DATA_SOURCE: { label: "KB Data Source",         icon: "FileText", color: "teal"   },
};

export const DISCOVERY_STATUS = {
  ACTIVE:   { label: "Active",   cls: "pass" },
  CHANGED:  { label: "Changed",  cls: "warn" },
  STALE:    { label: "Stale",    cls: "warn" },
  REMOVED:  { label: "Removed",  cls: "fail" },
  ERROR:    { label: "Error",    cls: "fail" },
};

export const TOOL_REGISTRATION_TYPES = {
  API_GATEWAY:          "API Gateway Endpoint",
  LAMBDA:               "Lambda Function",
  BEDROCK_KB:           "Bedrock Knowledge Base",
  EXISTING_GATEWAY_TOOL:"Existing AgentCore Gateway Tool",
};

export const SIDE_EFFECT_LEVELS = {
  READ_ONLY:   { label: "Read Only",   cls: "pass",    description: "No data modification. Safe for broad agent use." },
  WRITE:       { label: "Write",       cls: "warn",    description: "Modifies data. Requires explicit approval and audit." },
  DESTRUCTIVE: { label: "Destructive", cls: "fail",    description: "Deletes or irreversibly modifies data. High scrutiny required." },
};

export const PROJECT_TOOL_STATUS = {
  ACTIVE:          { label: "Active",            cls: "pass" },
  DISABLED:        { label: "Disabled",          cls: "fail" },
  STALE:           { label: "Stale",             cls: "warn" },
  REVIEW_REQUIRED: { label: "Review Required",   cls: "warn" },
  REMOVED:         { label: "Removed",           cls: "fail" },
  PENDING_GATEWAY: { label: "Pending Deployment",cls: "warn" },
  NOT_DEPLOYED:    { label: "Not Deployed",      cls: "warn" },
  DRIFT_DETECTED:  { label: "Drift Detected",    cls: "warn" },
};

export const AWS_REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-central-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1",
];

export const TOOL_REGISTRATION_APPROVAL_STATUS = {
  DRAFT:             "Draft",
  PENDING_APPROVAL:  "Pending Approval",
  APPROVED:          "Approved",
  REJECTED:          "Rejected",
  PROVISIONED:       "Provisioned",
  CANCELLED:         "Cancelled",
};
