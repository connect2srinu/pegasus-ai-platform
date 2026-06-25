import { useState, useEffect } from "react";
import { Plus, X, Lock, Server, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { api, projectId as toProjectId, titleCase } from "../../utils.js";
import {
  PACKAGE_SOURCE_TYPES, CREWAI_PYTHON_VERSIONS, BEDROCK_MODELS,
  FALLBACK_ORGS, RISK_TIERS, CREWAI_EXCLUDED_PROJECTS
} from "../../constants.js";
import PackageValidationResults from "./PackageValidationResults.jsx";

const EMPTY_FORM = {
  name: "",
  description: "",
  version: "1.0.0",
  riskTier: "medium",
  packageSourceType: "s3",
  packageLocation: "",
  entryPoint: "app.py",
  entryFunction: "handler",
  runtimeCommand: "",
  pythonVersion: "3.12",
  dependencyFile: "requirements.txt",
  declaredDependencies: "",
  modelId: "",
  toolIds: [],
  knowledgeIds: [],
  envVars: [],
  secretRefs: [],
  inputSchema: "",
  outputSchema: "",
  organizationId: "",
};

function SectionToggle({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="crewai-section">
      <button type="button" className="crewai-section-header" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <strong>{title}</strong>
      </button>
      {open && <div className="crewai-section-body">{children}</div>}
    </div>
  );
}

function EnvVarList({ envVars, onChange }) {
  function add() { onChange([...envVars, { key: "", value: "" }]); }
  function remove(i) { onChange(envVars.filter((_, idx) => idx !== i)); }
  function update(i, field, val) {
    const next = envVars.map((e, idx) => idx === i ? { ...e, [field]: val } : e);
    onChange(next);
  }

  return (
    <div>
      {envVars.map((ev, i) => (
        <div key={i} className="kv-row">
          <input placeholder="KEY" value={ev.key} onChange={(e) => update(i, "key", e.target.value)} />
          <input placeholder="Description or non-secret value" value={ev.value} onChange={(e) => update(i, "value", e.target.value)} />
          <button type="button" className="icon-button" onClick={() => remove(i)}><X size={13} /></button>
        </div>
      ))}
      <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={add}><Plus size={12} style={{ marginRight: 4 }} />Add variable</button>
    </div>
  );
}

function SecretRefList({ secretRefs, onChange }) {
  function add() { onChange([...secretRefs, { name: "" }]); }
  function remove(i) { onChange(secretRefs.filter((_, idx) => idx !== i)); }
  function update(i, val) {
    onChange(secretRefs.map((s, idx) => idx === i ? { name: val } : s));
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        <Lock size={11} style={{ marginRight: 3, verticalAlign: "middle" }} />
        Secret names only — never paste raw keys or tokens.
      </p>
      {secretRefs.map((s, i) => (
        <div key={i} className="kv-row">
          <input placeholder="sm/my-api-key" value={s.name} onChange={(e) => update(i, e.target.value)} style={{ flex: 1 }} />
          <button type="button" className="icon-button" onClick={() => remove(i)}><X size={13} /></button>
        </div>
      ))}
      <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={add}><Plus size={12} style={{ marginRight: 4 }} />Add secret reference</button>
    </div>
  );
}

export default function CrewAIRegisterForm({ project, tools, knowledge, refreshAgents, refreshApprovals, selectAgent, setScreen, orgs }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("draft"); // draft | validating | validated | submitting | submitted
  const [agentId, setAgentId] = useState(null);
  const [versionId, setVersionId] = useState(null);
  const [validationResults, setValidationResults] = useState([]);
  const [validationStatus, setValidationStatus] = useState(null);
  const [approvalTasks, setApprovalTasks] = useState([]);

  const pid = toProjectId(project);
  const projectExcludesCrewAI = CREWAI_EXCLUDED_PROJECTS.some(
    (p) => p === project || p === pid
  );

  // Org list from props (live) or fallback
  const orgList = orgs && orgs.length ? orgs : FALLBACK_ORGS;

  // Resolve selected org's config for model picker
  const selectedOrg = orgList.find((o) => o.id === form.organizationId);
  const allowedModels = selectedOrg?.awsConfig?.modelAccount?.allowedModelIds || [];
  const allModels = BEDROCK_MODELS;
  const modelOptions = allowedModels.length ? allModels.filter((m) => allowedModels.includes(m.id)) : allModels;

  // Project tool/KB lists
  const projectTools = tools.length ? tools : [];
  const projectKbs   = knowledge.length ? knowledge : [];

  function upd(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); }
  function set(key, val) { setForm((f) => ({ ...f, [key]: val })); }

  function toggleTool(id) {
    set("toolIds", form.toolIds.includes(id) ? form.toolIds.filter((t) => t !== id) : [...form.toolIds, id]);
  }
  function toggleKb(id) {
    set("knowledgeIds", form.knowledgeIds.includes(id) ? form.knowledgeIds.filter((k) => k !== id) : [...form.knowledgeIds, id]);
  }

  function buildPayload() {
    return {
      ...form,
      projectId: pid,
      organizationId: form.organizationId || orgList[0]?.id || "",
      declaredDependencies: form.declaredDependencies
        ? form.declaredDependencies.split("\n").map((s) => s.trim()).filter(Boolean)
        : [],
    };
  }

  async function handleSaveDraft(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Agent name is required."); return; }
    setBusy(true); setError("");
    try {
      const payload = buildPayload();
      const res = await api("/api/agents/crewai", { method: "POST", body: JSON.stringify(payload) });
      setAgentId(res.agent.id);
      setVersionId(res.version.id);
      setPhase("draft_saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleValidate() {
    if (!agentId || !versionId) { setError("Save draft first."); return; }
    setBusy(true); setError(""); setPhase("validating");
    try {
      const res = await api(`/api/agents/${agentId}/versions/${versionId}/validate`, { method: "POST" });
      setValidationResults(res.validationResults || []);
      setValidationStatus(res.validationStatus);
      setPhase("validated");
    } catch (err) {
      setError(err.message);
      setPhase("draft_saved");
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateSpec() {
    if (!agentId || !versionId) return;
    setBusy(true); setError("");
    try {
      await api(`/api/agents/${agentId}/versions/${versionId}/generate-spec`, { method: "POST" });
      setPhase("spec_generated");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!agentId || !versionId) return;
    setBusy(true); setError(""); setPhase("submitting");
    try {
      const res = await api(`/api/agents/${agentId}/versions/${versionId}/submit`, {
        method: "POST",
        body: JSON.stringify({ submittedBy: "current-user@example.com" }),
      });
      setApprovalTasks(res.approvalTasks || []);
      setPhase("submitted");
      await refreshAgents();
      await refreshApprovals();
      selectAgent(agentId);
      setTimeout(() => setScreen("approvals"), 1400);
    } catch (err) {
      setError(err.message);
      setPhase("spec_generated");
    } finally {
      setBusy(false);
    }
  }

  const canValidate   = phase === "draft_saved" || phase === "validated";
  const canGenSpec    = (phase === "validated") && validationStatus !== "failed";
  const canSubmit     = phase === "spec_generated";
  const isSubmitted   = phase === "submitted";

  return (
    <div>
      {/* Step progress */}
      <div className="crewai-progress">
        {[
          { key: "draft",    label: "1. Package details" },
          { key: "validate", label: "2. Validate" },
          { key: "spec",     label: "3. Generate spec" },
          { key: "submit",   label: "4. Submit for approval" },
        ].map(({ key, label }) => {
          const done = (
            (key === "draft"    && ["draft_saved","validated","spec_generated","submitting","submitted"].includes(phase)) ||
            (key === "validate" && ["validated","spec_generated","submitting","submitted"].includes(phase)) ||
            (key === "spec"     && ["spec_generated","submitting","submitted"].includes(phase)) ||
            (key === "submit"   && ["submitted"].includes(phase))
          );
          const active = (
            (key === "draft"    && ["draft","draft_saved"].includes(phase)) ||
            (key === "validate" && ["validated","validating"].includes(phase)) ||
            (key === "spec"     && phase === "spec_generated") ||
            (key === "submit"   && ["submitting","submitted"].includes(phase))
          );
          return (
            <div key={key} className={`crewai-progress-step ${done ? "done" : active ? "active" : ""}`}>
              <span className="crewai-progress-dot">{done ? "✓" : ""}</span>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {projectExcludesCrewAI && (
        <div className="validation-item fail" style={{ marginBottom: 14 }}>
          <AlertTriangle size={15} />
          <span>
            Project <strong>{project}</strong> does not permit CrewAI agents.
            Switch to a project that allows CrewAI (e.g. Claims Operations or Billing Experience),
            or ask a Platform Admin to enable CrewAI for this project.
          </span>
        </div>
      )}

      {error && (
        <div className="validation-item fail" style={{ marginBottom: 14 }}>
          <strong>ERROR</strong><span>{error}</span>
        </div>
      )}

      {isSubmitted && (
        <div className="validation-item pass" style={{ marginBottom: 14 }}>
          <CheckCircle2 size={15} />
          <span>Agent submitted for approval. Redirecting to approval queue…</span>
        </div>
      )}

      <form onSubmit={handleSaveDraft}>
        {/* ── Section 1: Agent Identity ────────────────────────────────── */}
        <SectionToggle title="Agent identity">
          <div className="form-grid">
            <label className="field">
              Agent name <span className="required">*</span>
              <input name="name" value={form.name} onChange={upd} placeholder="e.g. Claims Processing Crew" disabled={isSubmitted} />
            </label>
            <label className="field">
              Version
              <input name="version" value={form.version} onChange={upd} placeholder="1.0.0" disabled={isSubmitted} />
            </label>
            <label className="field">
              Organization <span className="required">*</span>
              <select name="organizationId" value={form.organizationId} onChange={upd} disabled={isSubmitted}>
                <option value="">— select —</option>
                {orgList.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            <label className="field">
              Risk tier
              <select name="riskTier" value={form.riskTier} onChange={upd} disabled={isSubmitted}>
                {RISK_TIERS.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </label>
            <label className="field full">
              Description
              <textarea name="description" value={form.description} onChange={upd} rows={2} placeholder="What does this CrewAI package do?" disabled={isSubmitted} />
            </label>
          </div>
        </SectionToggle>

        {/* ── Section 2: Package Source ────────────────────────────────── */}
        <SectionToggle title="Package source">
          <div className="form-grid">
            <label className="field full">
              Source type <span className="required">*</span>
              <div className="pkg-source-tabs">
                {Object.entries(PACKAGE_SOURCE_TYPES).map(([key, { label }]) => (
                  <button
                    key={key}
                    type="button"
                    className={`pkg-source-tab ${form.packageSourceType === key ? "active" : ""}`}
                    onClick={() => set("packageSourceType", key)}
                    disabled={isSubmitted}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </label>

            {form.packageSourceType === "upload" ? (
              <label className="field full">
                Package file (zip)
                <input type="file" accept=".zip" onChange={(e) => set("uploadedFile", e.target.files?.[0])} disabled={isSubmitted} />
                <small className="muted">Upload a .zip containing your CrewAI project folder.</small>
              </label>
            ) : form.packageSourceType === "git" ? (
              <>
                <label className="field full">
                  Repository URL <span className="required">*</span>
                  <input name="packageLocation" value={form.packageLocation} onChange={upd}
                    placeholder="https://github.com/your-org/my-crew.git" disabled={isSubmitted} />
                </label>
                <label className="field">
                  Branch / tag
                  <input name="gitBranch" value={form.gitBranch || ""} onChange={upd} placeholder="main" disabled={isSubmitted} />
                </label>
                <label className="field">
                  Subdirectory path
                  <input name="gitSubPath" value={form.gitSubPath || ""} onChange={upd} placeholder="packages/my-crew" disabled={isSubmitted} />
                </label>
              </>
            ) : (
              <label className="field full">
                {PACKAGE_SOURCE_TYPES[form.packageSourceType]?.label} <span className="required">*</span>
                <input name="packageLocation" value={form.packageLocation} onChange={upd}
                  placeholder={PACKAGE_SOURCE_TYPES[form.packageSourceType]?.hint} disabled={isSubmitted} />
              </label>
            )}
          </div>
        </SectionToggle>

        {/* ── Section 3: Runtime Configuration ─────────────────────────── */}
        <SectionToggle title="Runtime configuration">
          <div className="form-grid">
            <label className="field">
              Entry point file <span className="required">*</span>
              <input name="entryPoint" value={form.entryPoint} onChange={upd} placeholder="app.py" disabled={isSubmitted} />
            </label>
            <label className="field">
              Entry function
              <input name="entryFunction" value={form.entryFunction} onChange={upd} placeholder="handler" disabled={isSubmitted} />
              <small className="muted">AgentCore expects <code>handler(event, context)</code>. A wrapper is generated if different.</small>
            </label>
            <label className="field">
              Python version
              <select name="pythonVersion" value={form.pythonVersion} onChange={upd} disabled={isSubmitted}>
                {CREWAI_PYTHON_VERSIONS.map((v) => <option key={v} value={v}>Python {v}</option>)}
              </select>
            </label>
            <label className="field">
              Dependency file
              <input name="dependencyFile" value={form.dependencyFile} onChange={upd} placeholder="requirements.txt" disabled={isSubmitted} />
            </label>
            <label className="field full">
              Runtime command (optional)
              <input name="runtimeCommand" value={form.runtimeCommand} onChange={upd} placeholder="python app.py" disabled={isSubmitted} />
            </label>
            <label className="field full">
              Declared dependencies (one per line, from your requirements.txt)
              <textarea
                name="declaredDependencies"
                value={form.declaredDependencies}
                onChange={upd}
                rows={5}
                placeholder={"crewai>=0.60.0\nboto3>=1.34.0\nbotocore>=1.34.0"}
                style={{ fontFamily: "monospace", fontSize: 12 }}
                disabled={isSubmitted}
              />
              <small className="muted">Paste key dependencies for governance validation. Missing crewai or boto3 will be flagged.</small>
            </label>
          </div>
        </SectionToggle>

        {/* ── Section 4: Environment & Secrets ──────────────────────────── */}
        <SectionToggle title="Environment variables & secrets" defaultOpen={false}>
          <div className="form-grid">
            <div className="field full">
              <span>Environment variables</span>
              <EnvVarList envVars={form.envVars} onChange={(v) => set("envVars", v)} />
            </div>
            <div className="field full">
              <span>Secret references</span>
              <SecretRefList secretRefs={form.secretRefs} onChange={(v) => set("secretRefs", v)} />
            </div>
          </div>
        </SectionToggle>

        {/* ── Section 5: Governance mapping ─────────────────────────────── */}
        <SectionToggle title="Governance mapping — model, tools, knowledge">
          <div className="form-grid">
            <label className="field full">
              Model
              <select name="modelId" value={form.modelId} onChange={upd} disabled={isSubmitted}>
                <option value="">— use org default —</option>
                {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.label} ({m.id})</option>)}
              </select>
              {!selectedOrg?.awsConfig && (
                <small className="muted" style={{ color: "var(--amber)" }}>
                  <AlertTriangle size={11} style={{ verticalAlign: "middle", marginRight: 3 }} />
                  Select an organization with AWS accounts configured to see approved models.
                </small>
              )}
            </label>
          </div>

          <div className="split" style={{ marginTop: 12 }}>
            <div>
              <h4 style={{ marginBottom: 8 }}>Tools ({projectTools.length} approved in project)</h4>
              {projectTools.length === 0 && <p className="muted">No approved tools in this project.</p>}
              <div className="resource-checklist">
                {projectTools.map((t) => (
                  <label key={t.id} className={`resource-check-item ${form.toolIds.includes(t.id) ? "checked" : ""}`}>
                    <input type="checkbox" checked={form.toolIds.includes(t.id)} onChange={() => toggleTool(t.id)} disabled={isSubmitted} />
                    <div><strong>{t.name}</strong><p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t.description || t.toolType}</p></div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h4 style={{ marginBottom: 8 }}>Knowledge bases ({projectKbs.length} approved)</h4>
              {projectKbs.length === 0 && <p className="muted">No approved knowledge bases in this project.</p>}
              <div className="resource-checklist">
                {projectKbs.map((kb) => (
                  <label key={kb.id} className={`resource-check-item ${form.knowledgeIds.includes(kb.id) ? "checked" : ""}`}>
                    <input type="checkbox" checked={form.knowledgeIds.includes(kb.id)} onChange={() => toggleKb(kb.id)} disabled={isSubmitted} />
                    <div><strong>{kb.name}</strong><p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{kb.description || kb.kbType}</p></div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </SectionToggle>

        {/* ── Section 6: Schema ──────────────────────────────────────────── */}
        <SectionToggle title="Input / output schema (optional)" defaultOpen={false}>
          <div className="form-grid">
            <label className="field full">
              Expected input schema (JSON)
              <textarea name="inputSchema" value={form.inputSchema} onChange={upd} rows={4}
                placeholder={'{\n  "type": "object",\n  "properties": { "query": { "type": "string" } }\n}'}
                style={{ fontFamily: "monospace", fontSize: 12 }} disabled={isSubmitted} />
            </label>
            <label className="field full">
              Expected output schema (JSON)
              <textarea name="outputSchema" value={form.outputSchema} onChange={upd} rows={4}
                placeholder={'{\n  "type": "object",\n  "properties": { "result": { "type": "string" } }\n}'}
                style={{ fontFamily: "monospace", fontSize: 12 }} disabled={isSubmitted} />
            </label>
          </div>
        </SectionToggle>

        {/* ── Actions ─────────────────────────────────────────────────────── */}
        <div className="toolbar crewai-actions" style={{ marginTop: 20 }}>
          <button className="secondary" type="button" onClick={() => setScreen("workspace")}>Cancel</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="secondary" type="submit" disabled={busy || isSubmitted || projectExcludesCrewAI}>
              {busy && phase === "draft" ? "Saving…" : "Save draft"}
            </button>
            <button className="secondary" type="button" onClick={handleValidate}
              disabled={busy || !canValidate || isSubmitted}>
              {busy && phase === "validating" ? "Validating…" : "Validate package"}
            </button>
            <button className="secondary" type="button" onClick={handleGenerateSpec}
              disabled={busy || !canGenSpec || isSubmitted}>
              {busy && phase === "spec_generated" ? "Generating…" : "Generate AgentCore spec"}
            </button>
            <button className="primary" type="button" onClick={handleSubmit}
              disabled={busy || !canSubmit || isSubmitted}>
              {busy && phase === "submitting" ? "Submitting…" : "Submit for approval →"}
            </button>
          </div>
        </div>
      </form>

      {/* Approval task preview */}
      {approvalTasks.length > 0 && (
        <div className="approval-preview" style={{ marginTop: 20 }}>
          <h2>Generated approval tasks</h2>
          {approvalTasks.map((task) => (
            <div className="approval-chip" key={task.id}>
              <span>{titleCase(task.approverType)}</span>
              <strong>{task.reason}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
