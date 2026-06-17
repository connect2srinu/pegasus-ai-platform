import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Database,
  GitBranch,
  Grid2X2,
  KeyRound,
  ListChecks,
  Lock,
  Plus,
  PlayCircle,
  Server,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";

const PROJECTS = ["Claims Operations", "Billing Experience", "Member Services"];
const PROJECT_IDS = {
  "Claims Operations": "claims-operations",
  "Billing Experience": "billing-experience",
  "Member Services": "member-services",
};

const AGENT_TYPES = {
  bedrock_agentcore: "Bedrock AgentCore",
  langgraph: "LangGraph",
  openai_agent: "OpenAI Agent",
  crewai: "CrewAI",
  strands: "Strands",
  custom: "Custom",
};

const TOOL_TYPES = {
  rest: "REST API",
  graphql: "GraphQL",
  lambda: "Lambda Function",
  apigee: "Apigee Proxy",
  mcp: "MCP Tool",
};

const KB_TYPES = {
  bedrock_kb: "Bedrock Knowledge Base",
  s3: "S3 Data Source",
  opensearch: "OpenSearch",
  custom: "Custom",
};

const RISK_TIERS = ["low", "medium", "high", "critical"];
const CLASSIFICATIONS = ["internal", "confidential", "restricted"];

const PLATFORM_NAME = (import.meta.env.VITE_PLATFORM_NAME || "").trim() || "Pegasus";
const PLATFORM_MARK = PLATFORM_NAME.trim().charAt(0).toUpperCase() || "P";
const PLATFORM_SLUG = PLATFORM_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "pegasus";

const SAMPLE_YAML = `schemaVersion: ${PLATFORM_SLUG}.agent/v1
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

const fallback = {
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

const mockRuns = {
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

function projectId(project) {
  return PROJECT_IDS[project] || project.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function titleCase(value) {
  return String(value || "")
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function statusClass(value) {
  const lower = String(value).toLowerCase();
  if (lower.includes("success") || lower.includes("approved") || lower.includes("active") || lower.includes("deployed")) return "green";
  if (lower.includes("review") || lower.includes("submitted") || lower.includes("request") || lower.includes("pending")) return "blue";
  if (lower.includes("denied") || lower.includes("failed") || lower.includes("suspend") || lower.includes("restricted") || lower.includes("rejected")) return "red";
  return "gray";
}

function riskClass(value) {
  return String(value || "medium").toLowerCase();
}

function number(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function normalizeAgent(agent) {
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

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "content-type": "application/json" }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || `Request failed with ${response.status}`);
    error.payload = payload;
    throw error;
  }
  return payload;
}

// ─── Shared UI primitives ────────────────────────────────────────────────────

function Metric({ label, value, detail, small }) {
  return <article className={`metric ${small ? "small" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function Status({ children }) {
  return <span className={`status ${statusClass(children)}`}>{children}</span>;
}

function PlaneTabs({ plane, setPlane }) {
  return <div className="plane-tabs" role="tablist" aria-label="Platform planes">
    {[["control", "Control Plane"], ["execution", "Execution Plane"], ["business", "Business User Plane"]].map(([id, label]) =>
      <button key={id} className={`plane-tab ${plane === id ? "active" : ""}`} onClick={() => setPlane(id)}>{label}</button>
    )}
  </div>;
}

function ApiBanner({ status, message }) {
  const tone = status === "connected" ? "green" : status === "offline" ? "amber" : "blue";
  return <div className={`api-banner ${tone}`}><strong>{status === "connected" ? "Live registry" : "Registry status"}</strong><span>{message}</span></div>;
}

function Table({ headers, children }) {
  return <div className="table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

// ─── Lifecycle Stepper ────────────────────────────────────────────────────────

const LIFECYCLE_STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "business_owner_review", label: "Business Owner" },
  { key: "platform_admin_review", label: "Platform Admin" },
  { key: "approved", label: "Approved" },
];

const LIFECYCLE_STEP = {
  "Submitted": 0,
  "Draft": 0,
  "Business Owner Review": 1,
  "Platform Admin Review": 2,
  "Approved": 3,
  "Rejected": 3,
};

function LifecycleStepper({ lifecycle }) {
  const current = LIFECYCLE_STEP[lifecycle] ?? 0;
  const isRejected = lifecycle === "Rejected";
  const isDraft = lifecycle === "Draft";

  return (
    <div className="lifecycle-stepper">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const done = i < current && !isRejected;
        const active = i === current;
        const failed = active && (isRejected || isDraft);
        const label = i === 3 && isRejected ? "Rejected" : stage.label;
        return (
          <div key={stage.key} className={`step-node ${done ? "done" : active ? (failed ? "failed" : "active") : ""}`}>
            <div className="step-dot">{done ? "✓" : failed ? "✗" : i + 1}</div>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Workflow Pipeline (Approvals) ────────────────────────────────────────────

function WorkflowPipeline({ approvalTasks }) {
  const stages = [
    { key: "project_owner", label: "Business Owner", color: "amber" },
    { key: "tool_owner", label: "Tool Owner", color: "amber", conditional: true },
    { key: "data_owner", label: "Data Owner", color: "amber", conditional: true },
    { key: "platform_admin", label: "Platform Admin", color: "red" },
  ];

  const visibleStages = stages.filter((s) => !s.conditional || approvalTasks.some((t) => t.approverType === s.key));
  if (!visibleStages.length) return null;

  return (
    <div className="workflow-pipeline">
      {visibleStages.map((stage, i) => {
        const tasks = approvalTasks.filter((t) => t.approverType === stage.key);
        const pending = tasks.filter((t) => t.status === "pending").length;
        const approved = tasks.filter((t) => t.status === "approved").length;
        const rejected = tasks.filter((t) => t.status === "rejected").length;
        return (
          <div key={stage.key} className={`pipeline-stage border-${stage.color}`}>
            {stage.conditional && <span className="conditional-badge">Conditional</span>}
            <strong>{stage.label}</strong>
            <div className="stage-counts">
              {tasks.length === 0 && <span className="status gray">No tasks</span>}
              {pending > 0 && <span className="status blue">{pending} pending</span>}
              {approved > 0 && <span className="status green">{approved} approved</span>}
              {rejected > 0 && <span className="status red">{rejected} rejected</span>}
            </div>
            {i < visibleStages.length - 1 && (
              <span className="pipeline-arrow"><ChevronRight size={14} /></span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Add Tool / KB Form ───────────────────────────────────────────────────────

function AddResourceForm({ mode, pid, onSuccess, onCancel }) {
  const defaultTool = { name: "", toolType: "rest", endpoint: "", credentialRef: "", riskTier: "medium", classification: "internal", allowedAgentTypes: Object.keys(AGENT_TYPES), description: "" };
  const defaultKb = { name: "", kbType: "bedrock_kb", source: "", credentialRef: "", classification: "internal", description: "" };

  const [form, setForm] = useState(mode === "tool" ? defaultTool : defaultKb);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); }

  function toggleAgentType(type) {
    setForm((f) => {
      const current = f.allowedAgentTypes || [];
      return { ...f, allowedAgentTypes: current.includes(type) ? current.filter((t) => t !== type) : [...current, type] };
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required."); return; }
    if (mode === "tool" && !form.endpoint.trim()) { setError("Target endpoint is required."); return; }
    setBusy(true);
    setError("");
    try {
      const endpoint = mode === "tool" ? `/api/projects/${pid}/tools` : `/api/projects/${pid}/knowledge`;
      const result = await api(endpoint, { method: "POST", body: JSON.stringify({ ...form, createdBy: "current-user@example.com" }) });
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="resource-form">
      <div className="toolbar">
        <div>
          <h2 style={{ marginBottom: 2 }}>{mode === "tool" ? "Register New Tool" : "Register New Knowledge Base"}</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {mode === "tool"
              ? "Tool will be queued for Tool Owner then Platform Admin approval before agents can use it."
              : "Knowledge base will be queued for Data Owner then Platform Admin approval before agents can access it."}
          </p>
        </div>
        <button className="secondary" type="button" onClick={onCancel}><X size={14} style={{ marginRight: 4 }} />Cancel</button>
      </div>

      {error && <div className="validation-item fail" style={{ marginBottom: 14 }}><strong>ERROR</strong><span>{error}</span></div>}

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            {mode === "tool" ? "Tool name" : "Knowledge base name"}
            <input name="name" value={form.name} onChange={update} placeholder={mode === "tool" ? "e.g. claim_lookup" : "e.g. claims-policy-kb"} />
          </label>

          <label className="field">
            {mode === "tool" ? "Tool type" : "Knowledge base type"}
            <select name={mode === "tool" ? "toolType" : "kbType"} value={mode === "tool" ? form.toolType : form.kbType} onChange={update}>
              {Object.entries(mode === "tool" ? TOOL_TYPES : KB_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>

          <label className="field full">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Server size={13} />{mode === "tool" ? "Target endpoint URL" : "Source ARN / endpoint"}
            </span>
            <input
              name={mode === "tool" ? "endpoint" : "source"}
              value={mode === "tool" ? form.endpoint : form.source}
              onChange={update}
              placeholder={mode === "tool" ? "https://api.example.com/v1/lookup" : "arn:aws:bedrock:us-east-1:123456789012:knowledge-base/ABCDEF"}
            />
          </label>

          <label className="field full">
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Lock size={13} />Credential reference
              <em className="cred-hint">— secret name only, never the value</em>
            </span>
            <input name="credentialRef" value={form.credentialRef} onChange={update} placeholder="sm/claims-api-key" />
          </label>

          {mode === "tool" && (
            <label className="field">
              Risk tier
              <select name="riskTier" value={form.riskTier} onChange={update}>
                {RISK_TIERS.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </label>
          )}

          <label className="field">
            Data classification
            <select name="classification" value={form.classification} onChange={update}>
              {CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </label>

          {mode === "tool" && (
            <div className="field full">
              <span>Allowed agent types</span>
              <div className="agent-type-checks">
                {Object.entries(AGENT_TYPES).map(([v, l]) => (
                  <label key={v} className="check-label">
                    <input type="checkbox" checked={(form.allowedAgentTypes || []).includes(v)} onChange={() => toggleAgentType(v)} />
                    {l}
                  </label>
                ))}
              </div>
            </div>
          )}

          <label className="field full">
            Description
            <textarea name="description" value={form.description} onChange={update} placeholder={mode === "tool" ? "What this tool does and when agents should use it." : "What knowledge this base contains and its intended use."} />
          </label>
        </div>

        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Submitting creates {mode === "tool" ? "Tool Owner + Platform Admin" : "Data Owner + Platform Admin"} approval tasks.
          </span>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : `Register ${mode === "tool" ? "Tool" : "Knowledge Base"}`}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Screen components ────────────────────────────────────────────────────────

function Workspace({ project, agents, setScreen }) {
  const summary = fallback[project].summary;
  return <>
    <div className="grid cols-3">
      <Metric label="Approved agents" value={summary.approvedAgents} detail={`${summary.reviewAgents} in review`} />
      <Metric label="Runs last 24h" value={summary.runs24h} detail={`${summary.failedRuns} failed, ${summary.policyPass} policy pass`} />
      <Metric label="Pending approvals" value={summary.approvals} detail={`${summary.blocked} blocked by policy`} />
    </div>
    <div className="split" style={{ marginTop: 16 }}>
      <section className="panel">
        <div className="toolbar"><h2>Project Agents</h2><button className="primary" onClick={() => setScreen("register")}>Register Agent</button></div>
        <Table headers={["Agent", "Runtime", "Version", "Status", "Last Run"]}>{agents.map((agent) =>
          <tr key={agent.id}><td><strong>{agent.name}</strong><br /><span className="muted">{agent.owner}</span></td><td>{agent.runtime}</td><td>{agent.version}</td><td><Status>{agent.deployment}</Status></td><td>{agent.lastRun}</td></tr>
        )}</Table>
      </section>
      <section className="panel"><h2>Architecture Bands</h2><div className="architecture-bands">
        {[["Control Plane", ["Agent Registry", "Policy Engine", "Approvals", "Audit"]], ["Execution Plane", ["AgentCore Runtime", "AgentCore Gateway", "Bedrock", "Memory"]], ["Business User Plane", ["Project Workspace", "Runnable Agents", "Run History", "Settings"]]].map(([title, items]) =>
          <div className="band" key={title}><h3>{title}</h3><div className="band-row">{items.map((item) => <div className="component" key={item}><strong>{item}</strong><span>Policy governed</span></div>)}</div></div>
        )}
      </div></section>
    </div>
  </>;
}

function AgentRegistry({ agents, setScreen, selectAgent }) {
  return <section className="panel">
    <div className="toolbar"><div className="filters"><input aria-label="Search agents" placeholder="Search agents" /><select><option>All lifecycle states</option></select><select><option>All runtimes</option></select><select><option>All risk tiers</option></select></div><button className="primary" onClick={() => setScreen("register")}>Register Agent</button></div>
    <Table headers={["Agent", "Version", "Runtime", "Lifecycle", "Deployment", "Risk", "Owner"]}>{agents.map((agent) =>
      <tr key={agent.id}><td><button className="link-button strong-link" onClick={() => { selectAgent(agent.id); setScreen("agentDetail"); }}>{agent.name}</button><br /><span className="muted">{agent.id}</span></td><td>{agent.version}</td><td>{agent.runtime}</td><td><Status>{agent.lifecycle}</Status></td><td><Status>{agent.deployment}</Status></td><td><span className={`risk ${riskClass(agent.risk)}`}>{agent.risk}</span></td><td>{agent.owner}</td></tr>
    )}</Table>
  </section>;
}

function AgentDetail({ agent, setScreen, setPlane }) {
  if (!agent) return <section className="panel"><div className="empty-state">Select an agent from the registry to view details.</div></section>;
  return <div className="split">
    <section className="panel">
      <div className="detail-header inline">
        <div>
          <p className="eyebrow">Agent Registry Detail</p>
          <h2>{agent.name}</h2>
          <p>{agent.description || "No description provided."}</p>
        </div>
        <div className="filters">
          <button className="secondary" onClick={() => setScreen("agents")}>Back To Registry</button>
          <button className="primary" onClick={() => setPlane("execution")}>View Runs</button>
        </div>
      </div>

      <LifecycleStepper lifecycle={agent.lifecycle} />

      <div className="grid cols-3 compact"><Metric small label="Lifecycle" value={agent.lifecycle} detail={agent.deployment} /><Metric small label="Risk" value={agent.risk} detail={agent.runtime} /><Metric small label="Version" value={agent.version} detail={agent.model} /></div>
      <div className="metadata-row"><span className="pill">Owner: {agent.owner}</span><span className="pill">Project: {agent.projectId}</span><span className="pill">Memory: {agent.memory}</span></div>
      <h2 style={{ marginTop: 18 }}>Resources</h2>
      <Table headers={["Type", "Requested", "Registry Policy"]}>
        <tr><td>Tools</td><td>{agent.tools.join(", ") || "None"}</td><td>Must exist in the selected project tool catalog before submission.</td></tr>
        <tr><td>Knowledge Bases</td><td>{agent.knowledge.join(", ") || "None"}</td><td>Must be attached to the selected project before submission.</td></tr>
      </Table>
    </section>
    <aside className="panel">
      <h2>Validation Findings</h2>
      <div className="validation-list">{(agent.validations || []).map((item, index) => <div className={`validation-item ${item.status}`} key={index}><strong>{item.status.toUpperCase()}</strong><span>{item.message}</span></div>)}</div>
      <h2 style={{ marginTop: 18 }}>Approval History</h2>
      <div className="validation-list">{(agent.approvals?.length ? agent.approvals : [{ decision: "pending", type: "workflow", approver: "Approval queue", comments: "No decisions recorded yet." }]).map((item, index) => <div className="approval-chip" key={index}><span>{titleCase(item.type || item.decision)}</span><strong>{titleCase(item.decision)} {item.approver ? `by ${item.approver}` : ""}</strong><small>{item.comments}</small></div>)}</div>
    </aside>
  </div>;
}

function RegisterAgent({ project, refreshAgents, refreshApprovals, setScreen, selectAgent }) {
  const defaults = fallback[project];
  const [form, setForm] = useState({ name: "Claims Intake Agent", agentType: "crewai", runtimeTarget: "agentcore", modelId: "anthropic.claude-3-5-sonnet", description: `Submit a normalized portable agent specification for ${project}.`, tools: defaults.tools.slice(0, 2).join(","), knowledge: defaults.knowledge[0], shortTermMemory: "true", longTermMemory: "false", ownerUserId: "current-user@example.com", version: "0.1.0" });
  const [result, setResult] = useState([]);
  const [approvalPreview, setApprovalPreview] = useState([]);
  const [yamlText, setYamlText] = useState(SAMPLE_YAML.replace("claims-operations", projectId(project)).replace("Claims Operations", project));
  const [busy, setBusy] = useState(false);

  function update(event) { setForm({ ...form, [event.target.name]: event.target.value }); }

  useEffect(() => {
    setForm((current) => ({ ...current, description: `Submit a normalized portable agent specification for ${project}.`, tools: defaults.tools.slice(0, 2).join(","), knowledge: defaults.knowledge[0] }));
    setYamlText(SAMPLE_YAML.replace("claims-operations", projectId(project)).replace("Claims Operations", project));
  }, [project]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setResult([{ status: "warn", message: `Registering ${form.name}…` }]);
    try {
      const payload = { ...form, projectId: projectId(project), projectName: project, tools: form.tools.split(",").map((x) => x.trim()).filter(Boolean), knowledge: [form.knowledge], shortTermMemory: form.shortTermMemory === "true", longTermMemory: form.longTermMemory === "true", businessUnit: project };
      const response = await api("/api/agents", { method: "POST", body: JSON.stringify(payload) });
      setResult(response.agent.validations || []);
      setApprovalPreview(response.approvalTasks || []);
      await refreshAgents();
      await refreshApprovals();
      selectAgent(response.agent.id);
      setTimeout(() => setScreen("agents"), 500);
    } catch (error) {
      setResult(error.payload?.validations || [{ status: "fail", message: error.message }]);
    } finally {
      setBusy(false);
    }
  }

  async function uploadYaml() {
    setBusy(true);
    setResult([{ status: "warn", message: "Uploading YAML specification and running registry validation…" }]);
    try {
      const response = await api("/api/agents/spec-upload", {
        method: "POST",
        body: JSON.stringify({ yamlText, submittedBy: "current-user@example.com", expectedProjectId: projectId(project) }),
      });
      setResult(response.validations || response.agent.validations || []);
      setApprovalPreview(response.approvalTasks || []);
      await refreshAgents();
      await refreshApprovals();
      selectAgent(response.agent.id);
      setScreen("approvals");
    } catch (error) {
      setResult(error.payload?.validations || [{ status: "fail", message: error.message }]);
      setApprovalPreview([]);
    } finally {
      setBusy(false);
    }
  }

  async function loadYamlFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setYamlText(await file.text());
  }

  return <div className="split">
    <section className="panel"><form onSubmit={submit}>
      <div className="stepper">{["Basics", "Runtime", "Tools", "Knowledge", "Review"].map((step, index) => <div key={step} className={`step ${index === 0 ? "active" : ""}`}>{step}</div>)}</div>
      <div className="form-grid">
        <label className="field">Agent name<input name="name" value={form.name} onChange={update} /></label>
        <label className="field">Agent type<select name="agentType" value={form.agentType} onChange={update}>{Object.entries(AGENT_TYPES).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label className="field">Runtime target<select name="runtimeTarget" value={form.runtimeTarget} onChange={update}><option value="agentcore">Amazon Bedrock AgentCore</option><option value="external">External runtime</option></select></label>
        <label className="field">Model<select name="modelId" value={form.modelId} onChange={update}><option value="anthropic.claude-3-5-sonnet">anthropic.claude-3-5-sonnet</option><option value="anthropic.claude-3-5-haiku">anthropic.claude-3-5-haiku</option><option value="amazon.nova-pro">amazon.nova-pro</option></select></label>
        <label className="field full">Description<textarea name="description" value={form.description} onChange={update} /></label>
        <label className="field">Tool access<select name="tools" value={form.tools} onChange={update}><option value={defaults.tools.slice(0, 2).join(",")}>{defaults.tools.slice(0, 2).join(", ")}</option><option value={defaults.tools.join(",")}>{defaults.tools.join(", ")}</option></select></label>
        <label className="field">Knowledge base<select name="knowledge" value={form.knowledge} onChange={update}>{defaults.knowledge.map((kb) => <option value={kb} key={kb}>{kb}</option>)}</select></label>
        <label className="field">Short-term memory<select name="shortTermMemory" value={form.shortTermMemory} onChange={update}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
        <label className="field">Long-term memory<select name="longTermMemory" value={form.longTermMemory} onChange={update}><option value="false">Disabled</option><option value="true">Requires approval</option></select></label>
        <label className="field">Owner email<input name="ownerUserId" value={form.ownerUserId} onChange={update} /></label>
        <label className="field">Version<input name="version" value={form.version} onChange={update} /></label>
      </div>
      <div className="toolbar" style={{ marginTop: 18, marginBottom: 0 }}><button className="secondary" type="button">Save Draft</button><button className="primary" type="submit" disabled={busy}>{busy ? "Registering…" : "Register And Validate"}</button></div>
    </form>
      <div className="yaml-upload">
        <div className="toolbar"><div><h2>YAML Spec Upload</h2><p className="muted">Upload a portable {PLATFORM_NAME} agent spec, then validate project access, tools, knowledge bases, memory, and secret references.</p></div><label className="file-button">Choose YAML<input type="file" accept=".yaml,.yml,text/yaml" onChange={loadYamlFile} /></label></div>
        <textarea className="yaml-editor" value={yamlText} onChange={(event) => setYamlText(event.target.value)} aria-label="Agent YAML specification" />
        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}><button className="secondary" type="button" onClick={() => setYamlText(SAMPLE_YAML.replace("claims-operations", projectId(project)).replace("Claims Operations", project))}>Reset Sample</button><button className="primary" type="button" onClick={uploadYaml} disabled={busy}>{busy ? "Validating…" : "Upload YAML And Validate"}</button></div>
      </div>
    </section>
    <aside className="panel"><h2>Validation Results</h2><div className="validation-list">{(result.length ? result : [{ status: "pass", message: "Portable spec schema is valid." }, { status: "pass", message: "CrewAI and Strands are supported normalized agent types." }, { status: "warn", message: "Long-term memory requires retention approval." }]).map((item, index) => <div className={`validation-item ${item.status}`} key={index}><strong>{item.status.toUpperCase()}</strong><span>{item.message}</span></div>)}</div>{approvalPreview.length > 0 && <div className="approval-preview"><h2>Generated Approval Tasks</h2>{approvalPreview.map((task) => <div className="approval-chip" key={task.id}><span>{titleCase(task.approverType)}</span><strong>{task.reason}</strong></div>)}</div>}</aside>
  </div>;
}

function ApproverBadge({ type }) {
  const color = ["platform_admin", "security"].includes(type) ? "red" : "blue";
  return <span className={`status ${color}`}>{titleCase(type)}</span>;
}

function Approvals({ approvalTasks, refreshApprovals, refreshAgents }) {
  const [comments, setComments] = useState({});
  const [filter, setFilter] = useState("all");

  async function decide(task, decision) {
    await api(`/api/approvals/${task.id}/decision`, {
      method: "POST",
      body: JSON.stringify({ decision, comments: comments[task.id] || "", approver: "platform-admin@example.com" }),
    });
    await refreshApprovals();
    await refreshAgents();
  }

  const filtered = filter === "all" ? approvalTasks : approvalTasks.filter((t) => t.status === filter);

  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h2>Approval Queue</h2>
          <p className="muted">Approval tasks are generated from validation findings, requested tools, knowledge bases, memory policy, and lifecycle transitions.</p>
        </div>
        <div className="filters">
          {["all", "pending", "approved", "rejected"].map((f) => (
            <button key={f} className={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : titleCase(f)}
            </button>
          ))}
          <button className="secondary" onClick={refreshApprovals}>Refresh</button>
        </div>
      </div>

      <WorkflowPipeline approvalTasks={approvalTasks} />

      <Table headers={["Resource", "Approver Stage", "Risk", "Status", "Reason & Comment", "Action"]}>
        {filtered.map((task) => (
          <tr key={task.id}>
            <td>
              <strong>{task.agentName || task.resourceName}</strong>
              <br />
              <span className="muted">{task.projectId}</span>
              {task.resourceType && <><br /><span className="pill" style={{ marginTop: 4 }}>{titleCase(task.resourceType)}</span></>}
            </td>
            <td><ApproverBadge type={task.approverType} /></td>
            <td><span className={`risk ${riskClass(task.riskTier)}`}>{titleCase(task.riskTier)}</span></td>
            <td><Status>{titleCase(task.status)}</Status></td>
            <td>
              {task.reason}
              <br />
              <input
                className="comment-input"
                placeholder="Reviewer comment"
                value={comments[task.id] || ""}
                onChange={(e) => setComments({ ...comments, [task.id]: e.target.value })}
              />
            </td>
            <td>
              {task.status === "pending" ? (
                <div className="approval-actions">
                  <button className="primary" onClick={() => decide(task, "approved")}>Approve</button>
                  <button className="danger" onClick={() => decide(task, "rejected")}>Reject</button>
                </div>
              ) : (
                <span className="muted">{task.decision} by {task.approver || "—"}</span>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {!filtered.length && <div className="empty-state">No approval tasks{filter !== "all" ? ` with status "${filter}"` : ""} for this project.</div>}
    </section>
  );
}

function Tools({ project, tools, refreshTools, refreshApprovals }) {
  const [showForm, setShowForm] = useState(false);
  const pid = projectId(project);

  const rows = tools.length > 0
    ? tools
    : fallback[project].tools.map((name, i) => ({
        id: name, name, toolType: "rest",
        riskTier: i > 1 ? "high" : "medium",
        classification: "internal",
        status: i > 2 ? "pending_review" : "approved",
        endpoint: "", credentialRef: "", description: "",
      }));

  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h2>AgentCore Gateway Tool Catalog</h2>
          <p className="muted">Tools must be registered and approved before agents can request access. High and critical-risk tools require Tool Owner + Platform Admin sign-off.</p>
        </div>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X size={14} style={{ marginRight: 4 }} />Cancel</> : <><Plus size={14} style={{ marginRight: 4 }} />Add Tool</>}
        </button>
      </div>

      {showForm && (
        <AddResourceForm
          mode="tool"
          pid={pid}
          onSuccess={() => { setShowForm(false); refreshTools(); refreshApprovals(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <Table headers={["Tool", "Type", "Endpoint", "Credential Ref", "Risk", "Classification", "Status"]}>
        {rows.map((tool) => (
          <tr key={tool.id || tool.name}>
            <td>
              <strong>{tool.name || tool.id}</strong>
              {tool.description && <><br /><span className="muted">{tool.description}</span></>}
            </td>
            <td>{TOOL_TYPES[tool.toolType] || "REST API"}</td>
            <td><span className="muted">{tool.endpoint || "—"}</span></td>
            <td>{tool.credentialRef ? <code className="secret-ref">{tool.credentialRef}</code> : <span className="muted">—</span>}</td>
            <td><span className={`risk ${riskClass(tool.riskTier || "medium")}`}>{titleCase(tool.riskTier || "medium")}</span></td>
            <td>{titleCase(tool.classification || "internal")}</td>
            <td><Status>{titleCase(tool.status || "approved")}</Status></td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function Knowledge({ project, knowledge, refreshKnowledge, refreshApprovals }) {
  const [showForm, setShowForm] = useState(false);
  const pid = projectId(project);

  const rows = knowledge.length > 0
    ? knowledge
    : fallback[project].knowledge.map((name) => ({
        id: name, name, kbType: "bedrock_kb",
        classification: "internal",
        status: "approved",
        source: "", credentialRef: "", description: "",
      }));

  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h2>Project Knowledge Attachments</h2>
          <p className="muted">Knowledge bases must be registered and approved before agents can access them. Confidential or restricted KBs require Data Owner + Platform Admin approval.</p>
        </div>
        <button className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X size={14} style={{ marginRight: 4 }} />Cancel</> : <><Plus size={14} style={{ marginRight: 4 }} />Add Knowledge Base</>}
        </button>
      </div>

      {showForm && (
        <AddResourceForm
          mode="kb"
          pid={pid}
          onSuccess={() => { setShowForm(false); refreshKnowledge(); refreshApprovals(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <Table headers={["Knowledge Base", "Type", "Source", "Credential Ref", "Classification", "Status"]}>
        {rows.map((kb) => (
          <tr key={kb.id || kb.name}>
            <td>
              <strong>{kb.name || kb.id}</strong>
              {kb.description && <><br /><span className="muted">{kb.description}</span></>}
            </td>
            <td>{KB_TYPES[kb.kbType] || "Bedrock KB"}</td>
            <td><span className="muted">{kb.source || "—"}</span></td>
            <td>{kb.credentialRef ? <code className="secret-ref">{kb.credentialRef}</code> : <span className="muted">—</span>}</td>
            <td>{titleCase(kb.classification || "internal")}</td>
            <td><Status>{titleCase(kb.status || "approved")}</Status></td>
          </tr>
        ))}
      </Table>
    </section>
  );
}

function Secrets() {
  const rows = [["apigee-client", "Secrets Manager", "Project", "30 days", "Active"], ["kb-reader", "Secrets Manager", "Agent", "60 days", "Active"]];
  return <section className="panel"><h2>Secret References</h2><Table headers={["Name", "Provider", "Scope", "Rotation", "Status"]}>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{index === 4 ? <Status>{cell}</Status> : cell}</td>)}</tr>)}</Table></section>;
}

function SettingsScreen({ project }) {
  return <div className="grid cols-2"><section className="panel"><h2>Users and Roles</h2><Table headers={["User", "Role", "Last Active"]}>{fallback[project].users.map((row) => <tr key={row[0]}><td>{row[0]}</td><td><span className="pill">{row[1]}</span></td><td>{row[2]}</td></tr>)}</Table></section><section className="panel"><h2>Policy Defaults</h2><div className="form-grid"><label className="field full">Runtime targets<select><option>AgentCore only</option></select></label><label className="field full">Long-term memory<select><option>Requires owner approval</option></select></label><label className="field full">Critical tools<select><option>Platform admin approval required</option></select></label></div></section></div>;
}

function ExecutionPlane({ project, agents, selectedAgentId, setSelectedAgentId, selectedRunId, setSelectedRunId }) {
  const agent = agents.find((item) => item.id === selectedAgentId) || agents[0];
  const run = agent?.runs.find((item) => item.id === selectedRunId) || agent?.runs[0];
  useEffect(() => { if (agent && !agent.runs.find((item) => item.id === selectedRunId)) setSelectedRunId(agent.runs[0]?.id || ""); }, [agent?.id]);
  if (!agent) return <div className="empty-state">No agents are registered for this project.</div>;
  return <>
    <div className="grid cols-3"><Metric label="Execution agents" value={agents.length} detail={project} /><Metric label="Tokens last 24h" value={number(agents.reduce((sum, item) => sum + item.tokens24h, 0))} detail="Across registered agents" /><Metric label="Selected agent" value={agent.name} detail={`${agent.runtime} / ${agent.deployment}`} /></div>
    <div className="execution-layout"><section className="panel"><div className="toolbar"><h2>Available Agents</h2><span className="pill">{project}</span></div><div className="agent-list">{agents.map((item) => <button className={`agent-card ${item.id === agent.id ? "active" : ""}`} key={item.id} onClick={() => { setSelectedAgentId(item.id); setSelectedRunId(item.runs[0]?.id || ""); }}><span><strong>{item.name}</strong><small>{item.runtime} / {item.model}</small></span><Status>{item.deployment}</Status></button>)}</div></section>
      <section className="panel"><div className="detail-header inline"><div><p className="eyebrow">Agent runtime detail</p><h2>{agent.name}</h2><p>{agent.lifecycle}. Uses {agent.model}, {agent.tools.length} tools, {agent.knowledge.length} knowledge sources, and {agent.memory.toLowerCase()} memory.</p></div><span className={`risk ${riskClass(agent.risk)}`}>{agent.risk}</span></div><div className="grid cols-3 compact"><Metric small label="Tokens 24h" value={number(agent.tokens24h)} detail={agent.cost24h} /><Metric small label="Success rate" value={agent.successRate} detail={`${agent.runs.length} recent runs`} /><Metric small label="Model" value={agent.model} detail={agent.runtime} /></div><div className="metadata-row"><span className="pill">Tools: {agent.tools.join(", ") || "None"}</span><span className="pill">Knowledge: {agent.knowledge.join(", ") || "None"}</span><span className="pill">Memory: {agent.memory}</span></div><h2 style={{ marginTop: 18 }}>Runs</h2>{agent.runs.length ? <Table headers={["Run", "User", "Status", "Tokens", "Model", "Tools"]}>{agent.runs.map((item) => <tr className={item.id === selectedRunId ? "selected-row" : ""} key={item.id}><td><button className="link-button" onClick={() => setSelectedRunId(item.id)}>{item.id}</button><br /><span className="muted">{item.started}</span></td><td>{item.user}</td><td><Status>{item.status}</Status></td><td>{number(item.inputTokens + item.outputTokens)}<br /><span className="muted">{number(item.inputTokens)} in / {number(item.outputTokens)} out</span></td><td>{item.model}</td><td>{item.tools.join(", ")}</td></tr>)}</Table> : <div className="empty-state">No runs available yet for this agent.</div>}</section></div>
    {run && <section className="panel run-panel"><div className="detail-header inline"><div><p className="eyebrow">Run detail</p><h2>{run.id}</h2><p>{agent.name} run by {run.user}. Duration {run.duration}. Model {run.model}. Tools used: {run.tools.join(", ") || "none"}.</p></div><div className="filters"><button className="secondary">Open in Arize</button><button className="secondary">View Audit Events</button><button className="primary">Export Trace</button></div></div><div className="grid cols-3 compact"><Metric small label="Input tokens" value={number(run.inputTokens)} detail="Prompt and context" /><Metric small label="Output tokens" value={number(run.outputTokens)} detail="Generated answer" /><Metric small label="Total tokens" value={number(run.inputTokens + run.outputTokens)} detail={run.status} /></div><div className="timeline" style={{ marginTop: 16 }}>{["Runtime authorization", "Model invocation", "Tool gateway", "Final response"].map((step, index) => <div className="timeline-item" key={step}><time>{index * 3}.0s</time><div><strong>{step}</strong><br /><span>{step} completed for {run.id}</span></div><Status>{run.status === "Success" ? "OK" : run.status}</Status></div>)}</div></section>}
  </>;
}

function BusinessPlane({ project, agents, setPlane, setSelectedAgentId }) {
  const runnable = agents.filter((agent) => agent.deployment.toLowerCase().includes("deployed") || agent.lifecycle.toLowerCase().includes("approved"));
  return <><div className="detail-header"><div><p className="eyebrow">Business user workspace</p><h2>{project}</h2><p>Business users see only agents approved and runnable for the current project.</p></div><button className="primary" onClick={() => setPlane("execution")}>View Execution Runs</button></div><section className="panel"><h2>Runnable Agents</h2><div className="card-grid">{runnable.map((agent) => <article className="run-card" key={agent.id}><div><h3>{agent.name}</h3><p>{agent.model}. Tools: {agent.tools.join(", ")}.</p></div><button className="primary" onClick={() => { setSelectedAgentId(agent.id); setPlane("execution"); }}>Open</button></article>)}</div></section></>;
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [project, setProject] = useState(PROJECTS[0]);
  const [plane, setPlane] = useState("control");
  const [screen, setScreen] = useState("workspace");
  const [agentsByProject, setAgentsByProject] = useState({});
  const [approvalTasksByProject, setApprovalTasksByProject] = useState({});
  const [toolsByProject, setToolsByProject] = useState({});
  const [knowledgeByProject, setKnowledgeByProject] = useState({});
  const [apiStatus, setApiStatus] = useState("loading");
  const [apiMessage, setApiMessage] = useState("Connecting to Control Plane API");
  const [selectedAgentId, setSelectedAgentId] = useState("claims-assistant");
  const [selectedRunId, setSelectedRunId] = useState("run-claims-001");

  const agents = useMemo(() => (agentsByProject[project] || []).map(normalizeAgent), [agentsByProject, project]);
  const approvalTasks = approvalTasksByProject[project] || [];
  const tools = toolsByProject[project] || [];
  const knowledge = knowledgeByProject[project] || [];
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId) || agents[0];

  async function refreshAgents(targetProject = project) {
    try {
      const payload = await api(`/api/projects/${projectId(targetProject)}/agents`);
      setAgentsByProject((prev) => ({ ...prev, [targetProject]: payload.agents || [] }));
      setApiStatus("connected");
      setApiMessage("Control Plane API connected");
    } catch (error) {
      setApiStatus("offline");
      setApiMessage(`Using fallback data: ${error.message}`);
    }
  }

  async function refreshApprovals(targetProject = project) {
    try {
      const payload = await api(`/api/approvals?projectId=${projectId(targetProject)}`);
      setApprovalTasksByProject((prev) => ({ ...prev, [targetProject]: payload.approvalTasks || [] }));
    } catch (error) {
      setApiStatus("offline");
      setApiMessage(`Approval queue unavailable: ${error.message}`);
    }
  }

  async function refreshTools(targetProject = project) {
    try {
      const payload = await api(`/api/projects/${projectId(targetProject)}/tools`);
      setToolsByProject((prev) => ({ ...prev, [targetProject]: payload.tools || [] }));
    } catch {}
  }

  async function refreshKnowledge(targetProject = project) {
    try {
      const payload = await api(`/api/projects/${projectId(targetProject)}/knowledge`);
      setKnowledgeByProject((prev) => ({ ...prev, [targetProject]: payload.knowledge || [] }));
    } catch {}
  }

  useEffect(() => {
    refreshAgents(project);
    refreshApprovals(project);
    refreshTools(project);
    refreshKnowledge(project);
  }, [project]);

  useEffect(() => {
    if (agents.length && !agents.some((agent) => agent.id === selectedAgentId)) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  useEffect(() => { document.title = `${PLATFORM_NAME} AI Platform`; }, []);

  function chooseScreen(nextScreen) { setScreen(nextScreen); setPlane(nextScreen === "runs" ? "execution" : "control"); }

  const nav = [["workspace", "Workspace", Grid2X2], ["agents", "Agents", GitBranch], ["register", "Register", ListChecks], ["approvals", "Approvals", CheckCircle2], ["tools", "Tools", Wrench], ["knowledge", "Knowledge", Database], ["secrets", "Secrets", KeyRound], ["runs", "Runs", PlayCircle], ["settings", "Settings", Settings]];
  const title = plane === "control" ? { workspace: "Project Workspace", agents: "Agent Registry", agentDetail: "Agent Detail", register: "Register Agent", approvals: "Approval Queue", tools: "Tool Catalog", knowledge: "Knowledge Bases", secrets: "Secret Policies", runs: "Run Trace", settings: "Project Settings" }[screen] : plane === "execution" ? "Execution Plane" : "Business User Plane";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{PLATFORM_MARK}</div>
          <div><strong>{PLATFORM_NAME} AI</strong><span>Agent governance</span></div>
        </div>
        <nav className="nav" aria-label="Primary">
          {nav.map(([id, label, Icon]) => (
            <button className={`nav-item ${plane === "control" && (screen === id || (id === "agents" && screen === "agentDetail")) ? "active" : ""}`} key={id} onClick={() => chooseScreen(id)} title={label}>
              <span className="icon"><Icon size={18} /></span><span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{plane === "control" ? "Control Plane" : plane === "execution" ? "Execution Plane" : "Business User Plane"}</p>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            <label className="project-picker">
              <span>Project</span>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                {PROJECTS.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <button className="icon-button" title="Notifications" aria-label="Notifications"><Bell size={18} /></button>
            <div className="avatar" title="Platform Admin">PA</div>
          </div>
        </header>
        <section className="screen">
          <PlaneTabs plane={plane} setPlane={setPlane} />
          <ApiBanner status={apiStatus} message={apiMessage} />
          {plane === "execution" ? (
            <ExecutionPlane project={project} agents={agents} selectedAgentId={selectedAgentId} setSelectedAgentId={setSelectedAgentId} selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} />
          ) : plane === "business" ? (
            <BusinessPlane project={project} agents={agents} setPlane={setPlane} setSelectedAgentId={setSelectedAgentId} />
          ) : screen === "workspace" ? (
            <Workspace project={project} agents={agents} setScreen={setScreen} />
          ) : screen === "agents" ? (
            <AgentRegistry agents={agents} setScreen={setScreen} selectAgent={setSelectedAgentId} />
          ) : screen === "agentDetail" ? (
            <AgentDetail agent={selectedAgent} setScreen={setScreen} setPlane={setPlane} />
          ) : screen === "register" ? (
            <RegisterAgent project={project} refreshAgents={refreshAgents} refreshApprovals={refreshApprovals} setScreen={setScreen} selectAgent={setSelectedAgentId} />
          ) : screen === "approvals" ? (
            <Approvals approvalTasks={approvalTasks} refreshApprovals={refreshApprovals} refreshAgents={refreshAgents} />
          ) : screen === "tools" ? (
            <Tools project={project} tools={tools} refreshTools={refreshTools} refreshApprovals={refreshApprovals} />
          ) : screen === "knowledge" ? (
            <Knowledge project={project} knowledge={knowledge} refreshKnowledge={refreshKnowledge} refreshApprovals={refreshApprovals} />
          ) : screen === "secrets" ? (
            <Secrets />
          ) : (
            <SettingsScreen project={project} />
          )}
        </section>
      </main>
    </div>
  );
}
