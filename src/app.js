const state = {
  project: "Claims Operations",
  plane: "control",
  screen: "workspace",
  selectedAgentId: "claims-assistant",
  selectedRunId: "run-claims-001",
  apiStatus: "loading",
  apiMessage: "Connecting to Control Plane API",
};

const agentTypeLabels = {
  bedrock_agentcore: "Bedrock AgentCore",
  langgraph: "LangGraph",
  openai_agent: "OpenAI Agent",
  crewai: "CrewAI",
  strands: "Strands",
  custom: "Custom",
};

const projectIds = {
  "Claims Operations": "claims-operations",
  "Billing Experience": "billing-experience",
  "Member Services": "member-services",
};

const projects = {
  "Claims Operations": {
    summary: {
      approvedAgents: 12,
      reviewAgents: 2,
      runs24h: 184,
      failedRuns: 6,
      policyPass: "98.1%",
      approvals: 3,
      blocked: 1,
    },
    users: [
      ["priya@example.com", "Project owner", "Today"],
      ["alex@example.com", "Business user", "Today"],
      ["devon@example.com", "Project writer", "Yesterday"],
      ["mira@example.com", "Project reader", "3 days ago"],
    ],
    agents: [
      {
        id: "claims-assistant",
        name: "Claims Assistant",
        version: "1.0.0",
        runtime: "AgentCore",
        lifecycle: "Approved",
        deployment: "Prod deployed",
        risk: "Medium",
        owner: "Priya N.",
        lastRun: "8 minutes ago",
        model: "Claude 3.5 Sonnet",
        tools: ["claim_lookup", "policy_lookup"],
        knowledge: ["Claims Policy KB"],
        memory: "Short-term",
        tokens24h: 428700,
        cost24h: "$18.42",
        successRate: "98.3%",
        runs: [
          {
            id: "run-claims-001",
            user: "alex@example.com",
            status: "Success",
            started: "8 minutes ago",
            duration: "12.4s",
            inputTokens: 8200,
            outputTokens: 1900,
            totalTokens: 10100,
            model: "Claude 3.5 Sonnet",
            tools: ["claim_lookup", "policy_lookup"],
            trace: [
              ["00.0s", "Runtime authorization", "User, project, agent, and deployment status verified"],
              ["01.2s", "Model invocation", "Claude 3.5 Sonnet invoked through Amazon Bedrock"],
              ["03.4s", "Tool call", "claim_lookup called through AgentCore Gateway"],
              ["04.1s", "Apigee authorization", "JWT and claims.read scope accepted"],
              ["06.8s", "Knowledge retrieval", "Claims Policy KB returned 4 context chunks"],
              ["12.4s", "Final response", "Trace exported to Arize AI"],
            ],
          },
          {
            id: "run-claims-002",
            user: "sam@example.com",
            status: "Success",
            started: "24 minutes ago",
            duration: "8.7s",
            inputTokens: 6100,
            outputTokens: 1200,
            totalTokens: 7300,
            model: "Claude 3.5 Sonnet",
            tools: ["claim_lookup"],
            trace: [
              ["00.0s", "Runtime authorization", "Delegated identity accepted"],
              ["01.0s", "Model invocation", "Claim status question routed to tool use"],
              ["02.8s", "Tool call", "claim_lookup returned active claim status"],
              ["08.7s", "Final response", "Answer returned with audit event"],
            ],
          },
          {
            id: "run-claims-003",
            user: "lee@example.com",
            status: "Tool denied",
            started: "42 minutes ago",
            duration: "3.1s",
            inputTokens: 2900,
            outputTokens: 420,
            totalTokens: 3320,
            model: "Claude 3.5 Sonnet",
            tools: ["payment_post"],
            trace: [
              ["00.0s", "Runtime authorization", "Agent and user authorization passed"],
              ["01.9s", "Tool request", "Agent requested payment_post"],
              ["02.2s", "Gateway deny", "payment_post is not in the deployment policy snapshot"],
              ["03.1s", "Safe response", "Denied tool use explained to user"],
            ],
          },
        ],
      },
      {
        id: "policy-guide",
        name: "Policy Guide",
        version: "0.9.4",
        runtime: "AgentCore",
        lifecycle: "Submitted",
        deployment: "Not deployed",
        risk: "Low",
        owner: "Anika S.",
        lastRun: "Not deployed",
        model: "Amazon Nova Pro",
        tools: ["policy_lookup"],
        knowledge: ["Claims Policy KB", "Claims Forms KB"],
        memory: "Disabled",
        tokens24h: 0,
        cost24h: "$0.00",
        successRate: "No runs",
        runs: [],
      },
      {
        id: "fraud-triage",
        name: "Fraud Triage",
        version: "0.8.1",
        runtime: "LangGraph",
        lifecycle: "Approved",
        deployment: "Preprod deployed",
        risk: "High",
        owner: "Nora G.",
        lastRun: "1 hour ago",
        model: "Claude 3.5 Haiku",
        tools: ["claim_lookup", "customer_update"],
        knowledge: ["Claims Forms KB"],
        memory: "Short-term",
        tokens24h: 98200,
        cost24h: "$4.16",
        successRate: "94.8%",
        runs: [
          {
            id: "run-fraud-001",
            user: "nora@example.com",
            status: "Success",
            started: "1 hour ago",
            duration: "18.2s",
            inputTokens: 12400,
            outputTokens: 2500,
            totalTokens: 14900,
            model: "Claude 3.5 Haiku",
            tools: ["claim_lookup", "customer_update"],
            trace: [
              ["00.0s", "Runtime authorization", "Preprod policy snapshot loaded"],
              ["02.1s", "Model invocation", "Fraud triage graph selected investigation path"],
              ["05.7s", "Tool call", "claim_lookup returned claim history"],
              ["11.6s", "Tool call", "customer_update wrote preprod note"],
              ["18.2s", "Final response", "Triage recommendation returned"],
            ],
          },
        ],
      },
    ],
    approvals: [
      ["Billing Helper", "0.3.0", "Platform admin", "High", "2 days", "Policy failure"],
      ["Claims Assistant", "1.1.0", "Project owner", "Medium", "4 hours", "New KB request"],
      ["Member Summary", "1.4.3", "Security review", "Medium", "1 day", "Long-term memory"],
    ],
    tools: [
      ["claim_lookup", "1.0.0", "Medium", "Delegated user", "Apigee /claims/lookup", "Approved"],
      ["policy_lookup", "2.1.0", "Low", "Delegated user", "Apigee /policies/search", "Approved"],
      ["payment_post", "1.2.1", "Critical", "Delegated user", "Apigee /payments", "Restricted"],
      ["customer_update", "0.8.0", "High", "Mixed", "Private API", "Review"],
    ],
    knowledgeBases: [
      ["Claims Policy KB", "Claims", "Bedrock KB", "Attached", "Project owner"],
      ["Claims Forms KB", "Claims", "OpenSearch", "Attached", "Project owner"],
      ["Billing FAQ KB", "Billing", "Bedrock KB", "Requestable", "BU owner required"],
    ],
    secrets: [
      ["apigee-claims-client", "Secrets Manager", "Project", "30 days", "Active"],
      ["claims-kb-reader", "Secrets Manager", "Agent", "60 days", "Active"],
      ["legacy-policy-endpoint", "SSM Parameter", "Tool", "Manual", "Review"],
    ],
  },
  "Billing Experience": {
    summary: {
      approvedAgents: 7,
      reviewAgents: 4,
      runs24h: 91,
      failedRuns: 9,
      policyPass: "93.2%",
      approvals: 5,
      blocked: 2,
    },
    users: [
      ["marcus@example.com", "Project owner", "Today"],
      ["jules@example.com", "Project writer", "Today"],
      ["ravi@example.com", "Business user", "Yesterday"],
    ],
    agents: [
      {
        id: "billing-helper",
        name: "Billing Helper",
        version: "0.3.0",
        runtime: "LangGraph",
        lifecycle: "Platform admin review",
        deployment: "Not deployed",
        risk: "High",
        owner: "Marcus R.",
        lastRun: "Never",
        model: "Claude 3.5 Sonnet",
        tools: ["invoice_lookup", "payment_post"],
        knowledge: ["Billing FAQ KB"],
        memory: "Long-term requested",
        tokens24h: 0,
        cost24h: "$0.00",
        successRate: "No runs",
        runs: [],
      },
      {
        id: "invoice-explainer",
        name: "Invoice Explainer",
        version: "1.2.0",
        runtime: "AgentCore",
        lifecycle: "Approved",
        deployment: "Prod deployed",
        risk: "Medium",
        owner: "Jules P.",
        lastRun: "12 minutes ago",
        model: "Amazon Nova Pro",
        tools: ["invoice_lookup", "policy_lookup"],
        knowledge: ["Billing FAQ KB"],
        memory: "Short-term",
        tokens24h: 201400,
        cost24h: "$7.38",
        successRate: "96.4%",
        runs: [
          {
            id: "run-invoice-001",
            user: "ravi@example.com",
            status: "Success",
            started: "12 minutes ago",
            duration: "9.8s",
            inputTokens: 5400,
            outputTokens: 1100,
            totalTokens: 6500,
            model: "Amazon Nova Pro",
            tools: ["invoice_lookup"],
            trace: [
              ["00.0s", "Runtime authorization", "Billing Experience role verified"],
              ["02.0s", "Tool call", "invoice_lookup returned invoice line items"],
              ["07.2s", "Model response", "Explanation drafted with billing context"],
              ["09.8s", "Final response", "Trace linked to Arize AI"],
            ],
          },
        ],
      },
    ],
    approvals: [
      ["Billing Helper", "0.3.0", "Platform admin", "High", "2 days", "Payment tool requested"],
      ["Refund Advisor", "0.7.2", "Project owner", "Medium", "6 hours", "New prompt version"],
    ],
    tools: [
      ["invoice_lookup", "1.1.0", "Medium", "Delegated user", "Apigee /billing/invoices", "Approved"],
      ["payment_post", "1.2.1", "Critical", "Delegated user", "Apigee /payments", "Restricted"],
      ["refund_status", "0.9.0", "Medium", "Delegated user", "Apigee /refunds/status", "Review"],
    ],
    knowledgeBases: [
      ["Billing FAQ KB", "Billing", "Bedrock KB", "Attached", "Project owner"],
      ["Payments Policy KB", "Finance", "OpenSearch", "Requestable", "BU owner required"],
    ],
    secrets: [
      ["apigee-billing-client", "Secrets Manager", "Project", "30 days", "Active"],
      ["refund-api-token", "Secrets Manager", "Tool", "15 days", "Review"],
    ],
  },
  "Member Services": {
    summary: {
      approvedAgents: 9,
      reviewAgents: 1,
      runs24h: 138,
      failedRuns: 3,
      policyPass: "99.0%",
      approvals: 1,
      blocked: 0,
    },
    users: [
      ["devon@example.com", "Project owner", "Today"],
      ["taylor@example.com", "Business user", "Today"],
      ["mira@example.com", "Project reader", "Yesterday"],
    ],
    agents: [
      {
        id: "member-summary",
        name: "Member Summary",
        version: "1.4.2",
        runtime: "OpenAI Agent",
        lifecycle: "Suspended",
        deployment: "Preprod suspended",
        risk: "Medium",
        owner: "Devon K.",
        lastRun: "2 days ago",
        model: "GPT-4.1",
        tools: ["member_lookup", "benefits_lookup"],
        knowledge: ["Member Benefits KB"],
        memory: "Short-term",
        tokens24h: 0,
        cost24h: "$0.00",
        successRate: "Suspended",
        runs: [
          {
            id: "run-member-001",
            user: "taylor@example.com",
            status: "Suspended",
            started: "2 days ago",
            duration: "4.2s",
            inputTokens: 2400,
            outputTokens: 320,
            totalTokens: 2720,
            model: "GPT-4.1",
            tools: ["member_lookup"],
            trace: [
              ["00.0s", "Runtime authorization", "Preprod invocation accepted"],
              ["01.4s", "Tool call", "member_lookup returned masked profile"],
              ["04.2s", "Policy event", "Deployment suspended after review"],
            ],
          },
        ],
      },
      {
        id: "benefits-guide",
        name: "Benefits Guide",
        version: "2.0.0",
        runtime: "AgentCore",
        lifecycle: "Approved",
        deployment: "Prod deployed",
        risk: "Low",
        owner: "Mira C.",
        lastRun: "5 minutes ago",
        model: "Claude 3.5 Haiku",
        tools: ["benefits_lookup"],
        knowledge: ["Member Benefits KB"],
        memory: "Disabled",
        tokens24h: 306900,
        cost24h: "$9.11",
        successRate: "99.4%",
        runs: [
          {
            id: "run-benefits-001",
            user: "taylor@example.com",
            status: "Success",
            started: "5 minutes ago",
            duration: "7.6s",
            inputTokens: 4300,
            outputTokens: 980,
            totalTokens: 5280,
            model: "Claude 3.5 Haiku",
            tools: ["benefits_lookup"],
            trace: [
              ["00.0s", "Runtime authorization", "Project membership verified"],
              ["01.7s", "Knowledge retrieval", "Member Benefits KB returned 3 chunks"],
              ["03.2s", "Tool call", "benefits_lookup returned plan summary"],
              ["07.6s", "Final response", "Benefits answer returned"],
            ],
          },
        ],
      },
    ],
    approvals: [
      ["Member Summary", "1.4.3", "Security review", "Medium", "1 day", "Suspension remediation"],
    ],
    tools: [
      ["member_lookup", "1.0.0", "Medium", "Delegated user", "Apigee /members/lookup", "Approved"],
      ["benefits_lookup", "2.0.0", "Low", "Delegated user", "Apigee /benefits/search", "Approved"],
    ],
    knowledgeBases: [
      ["Member Benefits KB", "Member Services", "S3 Vector", "Attached", "Project owner"],
      ["Claims Policy KB", "Claims", "Bedrock KB", "Requestable", "BU owner required"],
    ],
    secrets: [
      ["apigee-members-client", "Secrets Manager", "Project", "30 days", "Active"],
    ],
  },
};

const screenTitles = {
  workspace: "Project Workspace",
  agents: "Agent Registry",
  register: "Register Agent",
  approvals: "Approval Queue",
  tools: "Tool Catalog",
  knowledge: "Knowledge Bases",
  secrets: "Secret Policies",
  runs: "Run Trace",
  settings: "Project Settings",
};

const planeLabels = {
  control: "Control Plane",
  execution: "Execution Plane",
  business: "Business User Plane",
};

function currentProject() {
  return projects[state.project];
}

function currentAgents() {
  return currentProject().agents;
}

function currentProjectId() {
  return projectIds[state.project] || state.project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function lifecycleLabel(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function apiAgentToUiAgent(agent) {
  const existing = currentProject().agents.find((item) => item.id === agent.id);
  return {
    ...(existing || {}),
    id: agent.id,
    name: agent.name,
    version: agent.version,
    runtime: agent.runtime || agentTypeLabels[agent.agentType] || agent.agentType,
    lifecycle: lifecycleLabel(agent.lifecycle),
    deployment: lifecycleLabel(agent.deployment || "not_deployed"),
    risk: lifecycleLabel(agent.risk || "medium"),
    owner: agent.owner || "current-user",
    lastRun: existing?.lastRun || "No runs yet",
    model: agent.model,
    tools: agent.tools || [],
    knowledge: agent.knowledge || [],
    memory: agent.memory || "Disabled",
    tokens24h: existing?.tokens24h || 0,
    cost24h: existing?.cost24h || "$0.00",
    successRate: existing?.successRate || "No runs",
    runs: existing?.runs || [],
    validations: agent.validations || [],
  };
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

async function loadProjectAgents() {
  try {
    const payload = await apiRequest(`/api/projects/${currentProjectId()}/agents`);
    const apiAgents = payload.agents.map(apiAgentToUiAgent);
    if (apiAgents.length) {
      const fallbackRuns = new Map(currentProject().agents.map((agent) => [agent.id, agent]));
      currentProject().agents = apiAgents.map((agent) => ({
        ...agent,
        runs: agent.runs.length ? agent.runs : fallbackRuns.get(agent.id)?.runs || [],
        tokens24h: agent.tokens24h || fallbackRuns.get(agent.id)?.tokens24h || 0,
        cost24h: agent.cost24h || fallbackRuns.get(agent.id)?.cost24h || "$0.00",
        successRate: agent.successRate || fallbackRuns.get(agent.id)?.successRate || "No runs",
        lastRun: agent.lastRun || fallbackRuns.get(agent.id)?.lastRun || "No runs yet",
      }));
    }
    state.apiStatus = "connected";
    state.apiMessage = "Control Plane API connected";
  } catch (error) {
    state.apiStatus = "offline";
    state.apiMessage = `Using mock data: ${error.message}`;
  }
}

function currentAgent() {
  return currentAgents().find((agent) => agent.id === state.selectedAgentId) || currentAgents()[0];
}

function currentRun() {
  const agent = currentAgent();
  return agent.runs.find((run) => run.id === state.selectedRunId) || agent.runs[0];
}

function statusClass(value) {
  const lower = value.toLowerCase();
  if (lower.includes("success") || lower.includes("approved") || lower.includes("active") || lower.includes("attached")) return "green";
  if (lower.includes("submitted") || lower.includes("review") || lower.includes("request")) return "blue";
  if (lower.includes("suspend") || lower.includes("restricted") || lower.includes("denied") || lower.includes("failed")) return "red";
  if (lower.includes("deployed")) return "green";
  return "gray";
}

function riskClass(value) {
  return value.toLowerCase();
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

function renderTable(headers, rows, rowRenderer, className = "") {
  return `
    <div class="table-wrap ${className}">
      <table>
        <thead>
          <tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${rows.map(rowRenderer).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlaneTabs() {
  return `
    <div class="plane-tabs" role="tablist" aria-label="Platform planes">
      ${Object.entries(planeLabels).map(([plane, label]) => `
        <button class="plane-tab ${state.plane === plane ? "active" : ""}" data-plane="${plane}" role="tab" aria-selected="${state.plane === plane}">
          ${label}
        </button>
      `).join("")}
    </div>
  `;
}

function workspaceScreen() {
  const project = currentProject();
  const summary = project.summary;
  return `
    ${renderPlaneTabs()}
    ${renderApiBanner()}
    <div class="grid cols-3">
      <article class="metric"><span>Approved agents</span><strong>${summary.approvedAgents}</strong><small>${summary.reviewAgents} in review</small></article>
      <article class="metric"><span>Runs last 24h</span><strong>${summary.runs24h}</strong><small>${summary.failedRuns} failed, ${summary.policyPass} policy pass</small></article>
      <article class="metric"><span>Pending approvals</span><strong>${summary.approvals}</strong><small>${summary.blocked} blocked by policy</small></article>
    </div>

    <div class="split" style="margin-top:16px">
      <section class="panel">
        <div class="toolbar">
          <h2>Project Agents</h2>
          <button class="primary" data-screen="register">Register Agent</button>
        </div>
        ${renderTable(["Agent", "Runtime", "Version", "Status", "Last Run"], project.agents, (agent) => `
          <tr>
            <td><strong>${agent.name}</strong><br><span class="muted">${agent.owner}</span></td>
            <td>${agent.runtime}</td>
            <td>${agent.version}</td>
            <td><span class="status ${statusClass(agent.deployment)}">${agent.deployment}</span></td>
            <td>${agent.lastRun}</td>
          </tr>
        `)}
      </section>

      <section class="panel">
        <h2>Architecture Bands</h2>
        <div class="architecture-bands">
          <div class="band">
            <h3>Control Plane</h3>
            <div class="band-row">${["Agent Registry", "Policy Engine", "Approvals", "Audit"].map(componentCard).join("")}</div>
          </div>
          <div class="band">
            <h3>Execution Plane</h3>
            <div class="band-row">${["AgentCore Runtime", "AgentCore Gateway", "Bedrock", "Memory"].map(componentCard).join("")}</div>
          </div>
          <div class="band">
            <h3>Business User Plane</h3>
            <div class="band-row">${["Project Workspace", "Runnable Agents", "Run History", "Settings"].map(componentCard).join("")}</div>
          </div>
        </div>
      </section>
    </div>
  `;
}

function componentCard(name) {
  return `<div class="component"><strong>${name}</strong><span>Policy governed</span></div>`;
}

function agentsScreen() {
  const agents = currentAgents();
  return `
    ${renderPlaneTabs()}
    ${renderApiBanner()}
    <section class="panel">
      <div class="toolbar">
        <div class="filters">
          <input aria-label="Search agents" placeholder="Search agents">
          <select aria-label="Lifecycle"><option>All lifecycle states</option><option>Approved</option><option>Submitted</option></select>
          <select aria-label="Runtime"><option>All runtimes</option><option>AgentCore</option><option>LangGraph</option></select>
          <select aria-label="Risk"><option>All risk tiers</option><option>Low</option><option>Medium</option><option>High</option></select>
        </div>
        <button class="primary" data-screen="register">Register Agent</button>
      </div>
      ${renderTable(["Agent", "Version", "Runtime", "Lifecycle", "Deployment", "Risk", "Owner"], agents, (agent) => `
        <tr>
          <td><strong>${agent.name}</strong></td>
          <td>${agent.version}</td>
          <td>${agent.runtime}</td>
          <td><span class="status ${statusClass(agent.lifecycle)}">${agent.lifecycle}</span></td>
          <td><span class="status ${statusClass(agent.deployment)}">${agent.deployment}</span></td>
          <td><span class="risk ${riskClass(agent.risk)}">${agent.risk}</span></td>
          <td>${agent.owner}</td>
        </tr>
      `)}
    </section>
  `;
}

function registerScreen() {
  return `
    ${renderPlaneTabs()}
    ${renderApiBanner()}
    <div class="split">
      <section class="panel">
        <form id="agent-registration-form">
        <div class="stepper">
          <div class="step active">Basics</div>
          <div class="step">Runtime</div>
          <div class="step">Tools</div>
          <div class="step">Knowledge</div>
          <div class="step">Review</div>
        </div>
        <div class="form-grid">
          <label class="field">Agent name<input name="name" value="${currentAgents()[0].name}"></label>
          <label class="field">Agent type<select name="agentType">
            <option value="bedrock_agentcore">Bedrock AgentCore</option>
            <option value="langgraph">LangGraph</option>
            <option value="openai_agent">OpenAI Agent</option>
            <option value="crewai">CrewAI</option>
            <option value="strands">Strands</option>
            <option value="custom">Custom</option>
          </select></label>
          <label class="field">Runtime target<select name="runtimeTarget"><option value="agentcore">Amazon Bedrock AgentCore</option><option value="external">External runtime</option></select></label>
          <label class="field">Model<select name="modelId"><option value="anthropic.claude-3-5-sonnet">anthropic.claude-3-5-sonnet</option><option value="anthropic.claude-3-5-haiku">anthropic.claude-3-5-haiku</option><option value="amazon.nova-pro">amazon.nova-pro</option></select></label>
          <label class="field full">Description<textarea name="description">Submit a normalized portable agent specification for ${state.project}.</textarea></label>
          <label class="field">Tool access<select name="tools"><option value="${currentProject().tools.map((tool) => tool[0]).slice(0, 2).join(",")}">${currentProject().tools.map((tool) => tool[0]).slice(0, 2).join(", ")}</option></select></label>
          <label class="field">Knowledge base<select name="knowledge"><option value="${currentProject().knowledgeBases[0][0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}">${currentProject().knowledgeBases[0][0]}</option></select></label>
          <label class="field">Short-term memory<select name="shortTermMemory"><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
          <label class="field">Long-term memory<select name="longTermMemory"><option value="false">Disabled</option><option value="true">Requires approval</option></select></label>
          <label class="field">Owner email<input name="ownerUserId" value="current-user@example.com"></label>
          <label class="field">Version<input name="version" value="0.1.0"></label>
        </div>
        <div class="toolbar" style="margin-top:18px;margin-bottom:0">
          <button class="secondary" type="button">Save Draft</button>
          <button class="primary" type="submit">Register And Validate</button>
        </div>
        </form>
      </section>

      <aside class="panel">
        <h2>Validation Results</h2>
        <div class="validation-list">
          <div class="validation-item pass"><strong>PASS</strong><span>Portable spec schema is valid.</span></div>
          <div class="validation-item pass"><strong>PASS</strong><span>Project ownership and runtime target are valid.</span></div>
          <div class="validation-item warn"><strong>WARN</strong><span>Long-term memory would require retention approval.</span></div>
          <div class="validation-item fail"><strong>FAIL</strong><span>Critical tools require platform admin approval.</span></div>
        </div>
        <div id="registration-result" class="registration-result"></div>
      </aside>
    </div>
  `;
}

function approvalsScreen() {
  return `
    ${renderPlaneTabs()}
    <div class="split">
      <section class="panel">
        <div class="toolbar">
          <h2>Pending Reviews</h2>
          <select><option>Role: Platform Admin</option><option>Role: Project Owner</option></select>
        </div>
        ${renderTable(["Agent", "Version", "Needed From", "Risk", "Age", "Reason"], currentProject().approvals, (row) => `
          <tr>
            <td><strong>${row[0]}</strong></td>
            <td>${row[1]}</td>
            <td>${row[2]}</td>
            <td><span class="risk ${riskClass(row[3])}">${row[3]}</span></td>
            <td>${row[4]}</td>
            <td>${row[5]}</td>
          </tr>
        `)}
      </section>
      <section class="panel">
        <h2>Review Package</h2>
        <div class="validation-list">
          <div class="validation-item pass"><strong>PASS</strong><span>Runtime package is deployable to AgentCore.</span></div>
          <div class="validation-item warn"><strong>WARN</strong><span>Tool and memory risk require explicit approval.</span></div>
          <div class="validation-item fail"><strong>FAIL</strong><span>Requested resource is not attached to this project.</span></div>
        </div>
        <label class="field full" style="margin-top:14px">Decision comment<textarea placeholder="Add approval notes"></textarea></label>
        <div class="toolbar" style="margin-top:14px;margin-bottom:0">
          <button class="danger">Reject</button>
          <button class="primary">Approve</button>
        </div>
      </section>
    </div>
  `;
}

function toolsScreen() {
  return `
    ${renderPlaneTabs()}
    <section class="panel">
      <div class="toolbar">
        <h2>AgentCore Gateway Tool Catalog</h2>
        <button class="primary">Register Tool</button>
      </div>
      ${renderTable(["Tool", "Version", "Risk", "Auth Mode", "Provider", "Status"], currentProject().tools, (row) => `
        <tr>
          <td><strong>${row[0]}</strong></td>
          <td>${row[1]}</td>
          <td><span class="risk ${riskClass(row[2])}">${row[2]}</span></td>
          <td>${row[3]}</td>
          <td>${row[4]}</td>
          <td><span class="status ${statusClass(row[5])}">${row[5]}</span></td>
        </tr>
      `)}
    </section>
  `;
}

function knowledgeScreen() {
  return `
    ${renderPlaneTabs()}
    <section class="panel">
      <div class="toolbar">
        <h2>Project Knowledge Attachments</h2>
        <button class="primary">Request Knowledge Base</button>
      </div>
      ${renderTable(["Knowledge Base", "Business Unit", "Provider", "Status", "Approval"], currentProject().knowledgeBases, (row) => `
        <tr>
          <td><strong>${row[0]}</strong></td>
          <td>${row[1]}</td>
          <td>${row[2]}</td>
          <td><span class="status ${statusClass(row[3])}">${row[3]}</span></td>
          <td>${row[4]}</td>
        </tr>
      `)}
    </section>
  `;
}

function secretsScreen() {
  return `
    ${renderPlaneTabs()}
    <section class="panel">
      <div class="toolbar">
        <h2>Secret References</h2>
        <button class="primary">Create Secret Reference</button>
      </div>
      ${renderTable(["Name", "Provider", "Scope", "Rotation", "Status"], currentProject().secrets, (row) => `
        <tr>
          <td><strong>${row[0]}</strong></td>
          <td>${row[1]}</td>
          <td>${row[2]}</td>
          <td>${row[3]}</td>
          <td><span class="status ${statusClass(row[4])}">${row[4]}</span></td>
        </tr>
      `)}
    </section>
  `;
}

function executionPlaneScreen() {
  const agent = currentAgent();
  const run = currentRun();
  return `
    ${renderPlaneTabs()}
    <div class="grid cols-3">
      <article class="metric"><span>Execution agents</span><strong>${currentAgents().length}</strong><small>${state.project}</small></article>
      <article class="metric"><span>Tokens last 24h</span><strong>${formatNumber(currentAgents().reduce((total, item) => total + item.tokens24h, 0))}</strong><small>Across deployed agents</small></article>
      <article class="metric"><span>Selected agent</span><strong>${agent.name}</strong><small>${agent.runtime} / ${agent.deployment}</small></article>
    </div>

    <div class="execution-layout">
      <section class="panel">
        <div class="toolbar">
          <h2>Available Agents</h2>
          <span class="pill">${state.project}</span>
        </div>
        <div class="agent-list">
          ${currentAgents().map((item) => `
            <button class="agent-card ${item.id === agent.id ? "active" : ""}" data-agent-id="${item.id}">
              <span>
                <strong>${item.name}</strong>
                <small>${item.runtime} / ${item.model}</small>
              </span>
              <span class="status ${statusClass(item.deployment)}">${item.deployment}</span>
            </button>
          `).join("")}
        </div>
      </section>

      <section class="panel">
        <div class="detail-header inline">
          <div>
            <p class="eyebrow">Agent runtime detail</p>
            <h2>${agent.name}</h2>
            <p>${agent.lifecycle}. Uses ${agent.model}, ${agent.tools.length} tool${agent.tools.length === 1 ? "" : "s"}, ${agent.knowledge.length} knowledge source${agent.knowledge.length === 1 ? "" : "s"}, and ${agent.memory.toLowerCase()} memory.</p>
          </div>
          <span class="risk ${riskClass(agent.risk)}">${agent.risk}</span>
        </div>
        <div class="grid cols-3 compact">
          <article class="metric small"><span>Tokens 24h</span><strong>${formatNumber(agent.tokens24h)}</strong><small>${agent.cost24h}</small></article>
          <article class="metric small"><span>Success rate</span><strong>${agent.successRate}</strong><small>${agent.runs.length} recent run${agent.runs.length === 1 ? "" : "s"}</small></article>
          <article class="metric small"><span>Model</span><strong>${agent.model}</strong><small>${agent.runtime}</small></article>
        </div>
        <div class="metadata-row">
          <span class="pill">Tools: ${agent.tools.join(", ") || "None"}</span>
          <span class="pill">Knowledge: ${agent.knowledge.join(", ") || "None"}</span>
          <span class="pill">Memory: ${agent.memory}</span>
        </div>

        <h2 style="margin-top:18px">Runs</h2>
        ${agent.runs.length ? renderTable(["Run", "User", "Status", "Tokens", "Model", "Tools"], agent.runs, (item) => `
          <tr class="${item.id === state.selectedRunId ? "selected-row" : ""}">
            <td><button class="link-button" data-run-id="${item.id}">${item.id}</button><br><span class="muted">${item.started}</span></td>
            <td>${item.user}</td>
            <td><span class="status ${statusClass(item.status)}">${item.status}</span></td>
            <td>${formatNumber(item.totalTokens)}<br><span class="muted">${formatNumber(item.inputTokens)} in / ${formatNumber(item.outputTokens)} out</span></td>
            <td>${item.model}</td>
            <td>${item.tools.join(", ")}</td>
          </tr>
        `) : `<div class="empty-state">No runs available yet for this agent.</div>`}
      </section>
    </div>

    ${run ? runDetailPanel(agent, run) : ""}
  `;
}

function runDetailPanel(agent, run) {
  return `
    <section class="panel run-panel">
      <div class="detail-header inline">
        <div>
          <p class="eyebrow">Run detail</p>
          <h2>${run.id}</h2>
          <p>${agent.name} run by ${run.user}. Duration ${run.duration}. Model ${run.model}. Tools used: ${run.tools.join(", ") || "none"}.</p>
        </div>
        <div class="filters">
          <button class="secondary">Open in Arize</button>
          <button class="secondary">View Audit Events</button>
          <button class="primary">Export Trace</button>
        </div>
      </div>
      <div class="grid cols-3 compact">
        <article class="metric small"><span>Input tokens</span><strong>${formatNumber(run.inputTokens)}</strong><small>Prompt and context</small></article>
        <article class="metric small"><span>Output tokens</span><strong>${formatNumber(run.outputTokens)}</strong><small>Generated answer</small></article>
        <article class="metric small"><span>Total tokens</span><strong>${formatNumber(run.totalTokens)}</strong><small>${run.status}</small></article>
      </div>
      <div class="timeline" style="margin-top:16px">
        ${run.trace.map((row) => `
          <div class="timeline-item">
            <time>${row[0]}</time>
            <div><strong>${row[1]}</strong><br><span>${row[2]}</span></div>
            <span class="status ${statusClass(run.status)}">${run.status === "Success" ? "OK" : run.status}</span>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function businessPlaneScreen() {
  const runnable = currentAgents().filter((agent) => agent.deployment.toLowerCase().includes("deployed"));
  return `
    ${renderPlaneTabs()}
    <div class="detail-header">
      <div>
        <p class="eyebrow">Business user workspace</p>
        <h2>${state.project}</h2>
        <p>Business users see only agents approved and runnable for the current project. Project owners still control users, settings, knowledge attachments, and policy defaults.</p>
      </div>
      <button class="primary" data-plane="execution">View Execution Runs</button>
    </div>
    <section class="panel">
      <h2>Runnable Agents</h2>
      <div class="card-grid">
        ${runnable.map((agent) => `
          <article class="run-card">
            <div>
              <h3>${agent.name}</h3>
              <p>${agent.model}. Tools: ${agent.tools.join(", ")}.</p>
            </div>
            <button class="primary" data-plane="execution" data-agent-id="${agent.id}">Open</button>
          </article>
        `).join("") || `<div class="empty-state">No production agents are currently runnable for this project.</div>`}
      </div>
    </section>
  `;
}

function runsScreen() {
  state.plane = "execution";
  return executionPlaneScreen();
}

function settingsScreen() {
  return `
    ${renderPlaneTabs()}
    <div class="grid cols-2">
      <section class="panel">
        <h2>Users and Roles</h2>
        ${renderTable(["User", "Role", "Last Active"], currentProject().users, (row) => `<tr><td>${row[0]}</td><td><span class="pill">${row[1]}</span></td><td>${row[2]}</td></tr>`)}
      </section>
      <section class="panel">
        <h2>Policy Defaults</h2>
        <div class="form-grid">
          <label class="field full">Runtime targets<select><option>AgentCore only</option></select></label>
          <label class="field full">Long-term memory<select><option>Requires owner approval</option></select></label>
          <label class="field full">Critical tools<select><option>Platform admin approval required</option></select></label>
          <label class="field full">Cross-BU knowledge<select><option>BU owner approval required</option></select></label>
        </div>
      </section>
    </div>
  `;
}

function renderApiBanner() {
  const tone = state.apiStatus === "connected" ? "green" : state.apiStatus === "offline" ? "amber" : "blue";
  return `<div class="api-banner ${tone}"><strong>${state.apiStatus === "connected" ? "Live registry" : "Registry status"}</strong><span>${state.apiMessage}</span></div>`;
}

const controlRenderers = {
  workspace: workspaceScreen,
  agents: agentsScreen,
  register: registerScreen,
  approvals: approvalsScreen,
  tools: toolsScreen,
  knowledge: knowledgeScreen,
  secrets: secretsScreen,
  runs: runsScreen,
  settings: settingsScreen,
};

function renderCurrentScreen() {
  if (state.plane === "execution") return executionPlaneScreen();
  if (state.plane === "business") return businessPlaneScreen();
  return controlRenderers[state.screen]();
}

function setScreen(screen) {
  state.screen = screen;
  if (screen === "runs") {
    state.plane = "execution";
  } else if (state.plane !== "control") {
    state.plane = "control";
  }
  render();
}

function setPlane(plane) {
  state.plane = plane;
  if (plane === "control") state.screen = "workspace";
  render();
}

function selectAgent(agentId) {
  state.selectedAgentId = agentId;
  const agent = currentAgent();
  state.selectedRunId = agent.runs[0]?.id || "";
  state.plane = "execution";
  render();
}

function selectRun(runId) {
  state.selectedRunId = runId;
  render();
}

function syncSelectionToProject() {
  const firstAgent = currentAgents()[0];
  if (!currentAgents().some((agent) => agent.id === state.selectedAgentId)) {
    state.selectedAgentId = firstAgent.id;
  }
  const agent = currentAgent();
  if (!agent.runs.some((run) => run.id === state.selectedRunId)) {
    state.selectedRunId = agent.runs[0]?.id || "";
  }
}

function render() {
  syncSelectionToProject();
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", state.plane === "control" && button.dataset.screen === state.screen);
  });
  document.getElementById("plane-label").textContent = planeLabels[state.plane];
  document.getElementById("screen-title").textContent = state.plane === "control" ? screenTitles[state.screen] : planeLabels[state.plane];
  document.getElementById("screen-root").innerHTML = renderCurrentScreen();

  document.querySelectorAll("[data-screen]").forEach((element) => {
    element.addEventListener("click", () => setScreen(element.dataset.screen));
  });
  document.querySelectorAll("[data-plane]").forEach((element) => {
    element.addEventListener("click", () => {
      if (element.dataset.agentId) selectAgent(element.dataset.agentId);
      setPlane(element.dataset.plane);
    });
  });
  document.querySelectorAll("[data-agent-id]").forEach((element) => {
    element.addEventListener("click", () => selectAgent(element.dataset.agentId));
  });
  document.querySelectorAll("[data-run-id]").forEach((element) => {
    element.addEventListener("click", () => selectRun(element.dataset.runId));
  });

  const registrationForm = document.getElementById("agent-registration-form");
  if (registrationForm) {
    registrationForm.addEventListener("submit", handleAgentRegistration);
  }
}

async function handleAgentRegistration(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const result = document.getElementById("registration-result");
  const payload = {
    name: form.get("name"),
    projectId: currentProjectId(),
    projectName: state.project,
    agentType: form.get("agentType"),
    runtimeTarget: form.get("runtimeTarget"),
    modelId: form.get("modelId"),
    description: form.get("description"),
    tools: String(form.get("tools") || "").split(",").map((value) => value.trim()).filter(Boolean),
    knowledge: [form.get("knowledge")].filter(Boolean),
    shortTermMemory: form.get("shortTermMemory") === "true",
    longTermMemory: form.get("longTermMemory") === "true",
    ownerUserId: form.get("ownerUserId"),
    businessUnit: state.project,
    version: form.get("version"),
  };

  result.innerHTML = `<div class="validation-item warn"><strong>WAIT</strong><span>Registering ${payload.name}...</span></div>`;

  try {
    const response = await apiRequest("/api/agents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadProjectAgents();
    state.selectedAgentId = response.agent.id;
    result.innerHTML = response.agent.validations.map((item) => `
      <div class="validation-item ${item.status === "pass" ? "pass" : item.status === "warn" ? "warn" : "fail"}">
        <strong>${item.status.toUpperCase()}</strong><span>${item.message}</span>
      </div>
    `).join("");
    state.screen = "agents";
    setTimeout(render, 650);
  } catch (error) {
    result.innerHTML = `<div class="validation-item fail"><strong>FAIL</strong><span>${error.message}</span></div>`;
  }
}

document.getElementById("project-select").addEventListener("change", async (event) => {
  state.project = event.target.value;
  await loadProjectAgents();
  render();
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => setScreen(button.dataset.screen));
});

loadProjectAgents().then(render);
