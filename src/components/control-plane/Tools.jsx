import { useState } from "react";
import { Plus, X, Server, Lock } from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api, projectId, riskClass, titleCase } from "../../utils.js";
import { AGENT_TYPES, TOOL_TYPES, KB_TYPES, RISK_TIERS, CLASSIFICATIONS, fallback } from "../../constants.js";

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
