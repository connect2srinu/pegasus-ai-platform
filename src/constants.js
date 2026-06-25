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
id: claims-yaml-crew
name: Claims YAML Crew
version: 0.1.0
projectId: claims-operations
owner:
  userId: current-user@example.com
  businessUnit: Claims Operations
agentType: crewai
runtime:
  target: agentcore
  entrypoint: s3://${PLATFORM_SLUG}-artifacts/claims-yaml-crew/package.zip
model:
  provider: bedrock
  modelId: anthropic.claude-3-5-sonnet
tools:
  - toolId: claim_lookup
    version: 1.0.0
  - toolId: payment_post
    version: 1.2.1
knowledge:
  - knowledgeBaseId: claims-policy-kb
memory:
  shortTerm: true
  longTerm: true
observability:
  arizeProject: ${PLATFORM_SLUG}-claims-operations
  traceLevel: standard
extensions:
  crewai:
    crewName: claims_yaml_crew
    agents:
      - intake_researcher
      - claim_writer`;
