import { useState, useEffect } from "react";
import { Plus, X, Server, Lock, CheckCircle2, AlertTriangle, Clock, Wrench } from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api, projectId, riskClass, titleCase } from "../../utils.js";
import { AGENT_TYPES, TOOL_TYPES, KB_TYPES, RISK_TIERS, CLASSIFICATIONS, fallback, SIDE_EFFECT_LEVELS, PROJECT_TOOL_STATUS } from "../../constants.js";
import AddToolWizard from "./AddToolWizard.jsx";

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

export function Tools({ project, tools, refreshTools, refreshApprovals }) {
  const [showWizard, setShowWizard] = useState(false);
  const [projectTools, setProjectTools] = useState([]);
  const [pendingTRRs, setPendingTRRs] = useState([]);
  const pid = projectId(project);

  useEffect(() => {
    loadProjectTools();
    loadPendingTRRs();
  }, [project]);

  async function loadProjectTools() {
    try {
      const r = await api(`/api/projects/${pid}/project-tools`);
      setProjectTools(r.projectTools || []);
    } catch { setProjectTools([]); }
  }

  async function loadPendingTRRs() {
    try {
      const r = await api(`/api/projects/${pid}/tool-registration-requests`);
      setPendingTRRs((r.toolRegistrationRequests || []).filter((t) => !["PROVISIONED","CANCELLED"].includes(t.approvalStatus)));
    } catch { setPendingTRRs([]); }
  }

  function handleWizardSuccess() {
    setShowWizard(false);
    loadProjectTools();
    loadPendingTRRs();
    refreshApprovals?.();
  }

  const displayTools = projectTools.length > 0
    ? projectTools
    : (tools.length > 0 ? tools : []);

  const legacyTools = displayTools.filter((t) => !t.mcpToolName);
  const gatewayTools = displayTools.filter((t) => t.mcpToolName);

  return (
    <>
      {showWizard && (
        <AddToolWizard
          project={project}
          pid={pid}
          onSuccess={handleWizardSuccess}
          onCancel={() => setShowWizard(false)}
        />
      )}
      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>AgentCore Gateway Tool Catalog</h2>
            <p className="muted">
              Tools must be discovered, registered, and approved before agents can use them.
              Approved tools are provisioned as AgentCore Gateway targets and exposed as MCP tools.
            </p>
          </div>
          <button className="primary" onClick={() => setShowWizard(true)}>
            <Plus size={14} style={{ marginRight: 4 }} />Add Tool
          </button>
        </div>

        {/* Approved Gateway-backed Project Tools */}
        {gatewayTools.length > 0 && (
          <>
            <h3 style={{ marginTop: 8, marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
              <CheckCircle2 size={13} style={{ marginRight: 5, color: "var(--green)" }} />
              Approved Project Tools ({gatewayTools.length})
            </h3>
            <Table headers={["Tool", "MCP Name", "Gateway", "Side Effect", "Classification", "Status"]}>
              {gatewayTools.map((tool) => {
                const se = SIDE_EFFECT_LEVELS[tool.sideEffectLevel] || {};
                const ts = PROJECT_TOOL_STATUS[tool.toolStatus] || { label: tool.toolStatus, cls: "pass" };
                return (
                  <tr key={tool.id}>
                    <td>
                      <strong>{tool.displayName || tool.mcpToolName}</strong>
                      {tool.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{tool.description}</span></>}
                      <br /><span className="muted" style={{ fontSize: 10 }}>Owner: {tool.businessOwner}</span>
                    </td>
                    <td><code style={{ fontSize: 11 }}>{tool.mcpToolName}</code></td>
                    <td><code style={{ fontSize: 10, wordBreak: "break-all" }}>{tool.gatewayTargetId || "—"}</code></td>
                    <td><span className={`pill validation-${se.cls || "pass"}`}>{se.label || tool.sideEffectLevel}</span></td>
                    <td>{titleCase(tool.dataClassification || tool.classification || "internal")}</td>
                    <td><span className={`pill validation-${ts.cls}`}>{ts.label}</span></td>
                  </tr>
                );
              })}
            </Table>
          </>
        )}

        {/* Legacy / fallback tools */}
        {legacyTools.length > 0 && (
          <>
            <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
              Legacy Tool Records
            </h3>
            <Table headers={["Tool", "Type", "Endpoint", "Credential Ref", "Risk", "Status"]}>
              {legacyTools.map((tool) => (
                <tr key={tool.id || tool.name}>
                  <td><strong>{tool.name || tool.id}</strong>{tool.description && <><br /><span className="muted">{tool.description}</span></>}</td>
                  <td>{TOOL_TYPES[tool.toolType] || "REST API"}</td>
                  <td><span className="muted">{tool.endpoint || "—"}</span></td>
                  <td>{tool.credentialRef ? <code className="secret-ref">{tool.credentialRef}</code> : <span className="muted">—</span>}</td>
                  <td><span className={`risk ${riskClass(tool.riskTier || "medium")}`}>{titleCase(tool.riskTier || "medium")}</span></td>
                  <td><Status>{titleCase(tool.status || "approved")}</Status></td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {gatewayTools.length === 0 && legacyTools.length === 0 && (
          <div className="empty-state">
            <Wrench size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
            <p>No approved tools yet.</p>
            <p className="muted" style={{ fontSize: 12 }}>Click Add Tool to register a resource from the connected AWS account through the approval workflow.</p>
          </div>
        )}

        {/* Pending Registration Requests */}
        {pendingTRRs.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h3 style={{ marginBottom: 8, fontSize: 13, color: "var(--muted)" }}>
              <Clock size={13} style={{ marginRight: 5, color: "var(--amber)" }} />
              Pending Registration Requests ({pendingTRRs.length})
            </h3>
            <Table headers={["Tool Name", "Source Type", "Side Effect", "Requested By", "Approval Status"]}>
              {pendingTRRs.map((trr) => {
                const se = SIDE_EFFECT_LEVELS[trr.sideEffectLevel] || {};
                return (
                  <tr key={trr.id}>
                    <td><strong>{trr.requestedToolName}</strong><br /><span className="muted" style={{ fontSize: 11 }}>{trr.requestedDescription}</span></td>
                    <td><span className="muted">{trr.sourceResourceType || trr.toolType}</span></td>
                    <td><span className={`pill validation-${se.cls || "pass"}`}>{se.label || trr.sideEffectLevel}</span></td>
                    <td>{trr.requestedBy}</td>
                    <td><Status>{trr.approvalStatus}</Status></td>
                  </tr>
                );
              })}
            </Table>
          </div>
        )}
      </section>
    </>
  );
}

export function Knowledge({ project, knowledge, refreshKnowledge, refreshApprovals }) {
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
