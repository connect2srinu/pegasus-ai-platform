import { useState, useEffect } from "react";
import { Globe, Zap, Database, Server, Wrench, CheckCircle2, AlertTriangle, ChevronRight, X } from "lucide-react";
import { api } from "../../utils.js";
import { DISCOVERED_RESOURCE_TYPES, SIDE_EFFECT_LEVELS, TOOL_REGISTRATION_TYPES } from "../../constants.js";

const STEPS = ["Source", "Metadata", "Governance", "Auth", "Review"];

const TYPE_ICONS = {
  API_GATEWAY_REST: <Globe size={14} />, API_GATEWAY_HTTP: <Globe size={14} />,
  LAMBDA: <Zap size={14} />, AGENTCORE_GATEWAY: <Server size={14} />,
  AGENTCORE_GATEWAY_TARGET: <Server size={14} />, AGENTCORE_GATEWAY_TOOL: <Wrench size={14} />,
  BEDROCK_KB: <Database size={14} />,
};

function resourceTypeToToolType(resourceType) {
  if (resourceType === "LAMBDA") return "LAMBDA";
  if (resourceType === "BEDROCK_KB") return "BEDROCK_KB";
  if (["AGENTCORE_GATEWAY_TOOL", "AGENTCORE_GATEWAY_TARGET"].includes(resourceType)) return "EXISTING_GATEWAY_TOOL";
  if (["API_GATEWAY_REST", "API_GATEWAY_HTTP"].includes(resourceType)) return "API_GATEWAY";
  return "LAMBDA";
}

// ── Step 1: Source picker ─────────────────────────────────────────────────────

function SourceStep({ pid, onSelect, selected }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    api(`/api/projects/${pid}/visible-resources`)
      .then((r) => setResources(r.visibleResources || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [pid]);

  const eligible = resources.filter((v) => {
    const dr = v.discoveredResource;
    if (!dr) return false;
    if (dr.discoveryStatus === "REMOVED") return false;
    if (filter !== "ALL" && dr.resourceType !== filter) return false;
    // Skip gateway-level entries — only allow leaf resources (targets, tools, lambdas, KBs, APIs)
    if (dr.resourceType === "AGENTCORE_GATEWAY") return false;
    return true;
  });

  const types = ["ALL", ...new Set(resources.map((v) => v.discoveredResource?.resourceType).filter(Boolean))];

  if (loading) return <p className="muted">Loading project resources…</p>;

  if (resources.length === 0) {
    return (
      <div className="empty-state">
        <AlertTriangle size={20} style={{ color: "var(--amber)" }} />
        <p>No resources are currently visible to this project.</p>
        <p className="muted" style={{ fontSize: 12 }}>Ask a Platform Admin to connect a BU AWS account and add resources to this project's Resource Visibility.</p>
      </div>
    );
  }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Select the AWS resource you want to register as an approved tool. Only resources made visible to this project are shown.
        Raw discovered resources go through approval before agents can use them.
      </p>
      <div className="filters" style={{ marginBottom: 10 }}>
        {types.map((t) => (
          <button key={t} className={`pill ${filter === t ? "pill--active" : ""}`} onClick={() => setFilter(t)}>
            {t === "ALL" ? "All" : DISCOVERED_RESOURCE_TYPES[t]?.label || t}
          </button>
        ))}
      </div>
      <div className="source-picker">
        {eligible.length === 0 && <p className="muted">No eligible resources match this filter.</p>}
        {eligible.map((v) => {
          const dr = v.discoveredResource;
          const isSelected = selected?.discoveredResourceId === v.discoveredResourceId;
          let meta = {};
          try { meta = JSON.parse(dr.metadataJson || "{}"); } catch { /* */ }
          return (
            <button
              key={v.id}
              className={`source-card ${isSelected ? "source-card--selected" : ""}`}
              onClick={() => onSelect(v)}
            >
              <span className="source-card-icon">{TYPE_ICONS[dr.resourceType] || <Globe size={14} />}</span>
              <div className="source-card-body">
                <strong>{dr.resourceName}</strong>
                <span className="muted">{DISCOVERED_RESOURCE_TYPES[dr.resourceType]?.label || dr.resourceType} · {dr.region}</span>
                {meta.description && <span className="muted" style={{ fontSize: 11 }}>{meta.description}</span>}
                {dr.discoveryStatus === "CHANGED" && (
                  <span className="validation-item warn" style={{ marginTop: 4, padding: "2px 6px", fontSize: 11, display: "inline-flex" }}>
                    <AlertTriangle size={10} /> Changed since last sync
                  </span>
                )}
              </div>
              {isSelected && <CheckCircle2 size={16} style={{ color: "var(--green)", flexShrink: 0 }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Step 2: Metadata ──────────────────────────────────────────────────────────

function MetadataStep({ form, setForm, sourceResource }) {
  const dr = sourceResource?.discoveredResource;
  let meta = {};
  try { meta = JSON.parse(dr?.metadataJson || "{}"); } catch { /* */ }

  // Pre-fill tool name from resource if empty
  useEffect(() => {
    if (!form.requestedToolName && dr) {
      const suggested = meta.mcpToolName || dr.resourceId?.replace(/-fn$/, "").replace(/-/g, "_") || "";
      setForm((f) => ({
        ...f,
        requestedToolName: suggested,
        requestedDescription: meta.description || f.requestedDescription,
        inputSchemaJson: meta.inputSchema ? JSON.stringify(meta.inputSchema, null, 2) : f.inputSchemaJson,
      }));
    }
  }, [dr?.resourceId]);

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Provide the tool metadata that agents and approvers will see.
        The tool name becomes the MCP tool identifier used in agent specs.
      </p>
      {dr?.resourceType === "AGENTCORE_GATEWAY_TOOL" && (
        <div className="validation-item pass" style={{ marginBottom: 12 }}>
          <CheckCircle2 size={13} /><span>This tool already exists in the AgentCore Gateway. Schema will be imported from MCP tools/list after approval.</span>
        </div>
      )}
      <div className="form-grid">
        <label className="field full">
          Tool name (MCP identifier) <span className="required">*</span>
          <input value={form.requestedToolName} onChange={(e) => set("requestedToolName", e.target.value)} placeholder="claim_lookup" />
          <span className="hint">Lowercase, underscores only. This is the name agents reference in their tool list.</span>
        </label>
        <label className="field full">
          Description <span className="required">*</span>
          <textarea rows={3} value={form.requestedDescription} onChange={(e) => set("requestedDescription", e.target.value)} placeholder="What this tool does and when agents should call it." />
        </label>
        <label className="field full">
          Input schema (JSON Schema)
          <textarea rows={6} value={form.inputSchemaJson} onChange={(e) => set("inputSchemaJson", e.target.value)} placeholder='{"type": "object", "properties": {"claim_id": {"type": "string"}}, "required": ["claim_id"]}' style={{ fontFamily: "monospace", fontSize: 12 }} />
        </label>
        <label className="field full">
          Output schema (JSON Schema, optional)
          <textarea rows={4} value={form.outputSchemaJson} onChange={(e) => set("outputSchemaJson", e.target.value)} placeholder='{"type": "object", "properties": {"result": {"type": "string"}}}' style={{ fontFamily: "monospace", fontSize: 12 }} />
        </label>
        <label className="field full">
          Sample request (JSON, optional)
          <textarea rows={3} value={form.sampleRequestJson} onChange={(e) => set("sampleRequestJson", e.target.value)} placeholder='{"claim_id": "CLM-20240101-001"}' style={{ fontFamily: "monospace", fontSize: 12 }} />
        </label>
        <label className="field full">
          Sample response (JSON, optional)
          <textarea rows={3} value={form.sampleResponseJson} onChange={(e) => set("sampleResponseJson", e.target.value)} placeholder='{"status": "APPROVED", "amount": 1250.00}' style={{ fontFamily: "monospace", fontSize: 12 }} />
        </label>
      </div>
    </div>
  );
}

// ── Step 3: Governance ────────────────────────────────────────────────────────

function GovernanceStep({ form, setForm }) {
  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Governance metadata is stored immutably on the tool version.
        It informs approval decisions and controls how agents may invoke this tool.
      </p>
      <div className="form-grid">
        <div className="field full">
          <span>Side effect level <span className="required">*</span></span>
          <div className="side-effect-cards">
            {Object.entries(SIDE_EFFECT_LEVELS).map(([v, m]) => (
              <button
                key={v}
                type="button"
                className={`side-effect-card side-effect-card--${v.toLowerCase()} ${form.sideEffectLevel === v ? "selected" : ""}`}
                onClick={() => set("sideEffectLevel", v)}
              >
                <strong>{m.label}</strong>
                <span>{m.description}</span>
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          Business owner email <span className="required">*</span>
          <input value={form.businessOwner} onChange={(e) => set("businessOwner", e.target.value)} placeholder="owner@example.com" />
          <span className="hint">Receives approval notifications and is responsible for this tool's accuracy.</span>
        </label>
        <label className="field">
          Data classification
          <select value={form.dataClassification} onChange={(e) => set("dataClassification", e.target.value)}>
            {["internal", "confidential", "restricted"].map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </label>
        <label className="field">
          Rate limit (requests/min)
          <input type="number" min={0} value={form.rateLimitRpm || ""} onChange={(e) => set("rateLimitRpm", e.target.value ? Number(e.target.value) : null)} placeholder="60" />
        </label>
        <label className="field">
          Timeout (seconds)
          <input type="number" min={1} max={900} value={form.timeoutSeconds} onChange={(e) => set("timeoutSeconds", Number(e.target.value))} />
        </label>
        <label className="field full">
          Allowed use cases (optional)
          <textarea rows={2} value={(form.allowedUseCases || []).join("\n")} onChange={(e) => set("allowedUseCases", e.target.value.split("\n").filter(Boolean))} placeholder={"Claims processing\nFraud detection"} />
          <span className="hint">One per line. Agents may only invoke this tool for these declared use cases.</span>
        </label>
      </div>
    </div>
  );
}

// ── Step 4: Auth ──────────────────────────────────────────────────────────────

function AuthStep({ form, setForm }) {
  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        Specify how Guardian should authenticate when invoking this tool through the AgentCore Gateway.
        All credentials must be referenced by secret name — never paste raw values here.
      </p>
      <div className="form-grid">
        <label className="field">
          Auth type
          <select value={form.authType || "IAM"} onChange={(e) => set("authType", e.target.value)}>
            <option value="IAM">AWS IAM (role-based, recommended)</option>
            <option value="API_KEY">API Key (via Secrets Manager)</option>
            <option value="OAUTH2">OAuth 2.0 client credentials</option>
            <option value="NONE">None (public endpoint)</option>
          </select>
        </label>
        <label className="field">
          Credential reference (secret name)
          <input
            value={form.authConfigRef || ""}
            onChange={(e) => set("authConfigRef", e.target.value)}
            placeholder="sm/claims-api-key"
          />
          <span className="hint" style={{ color: "var(--amber)" }}>Secret name only — never the actual key or password.</span>
        </label>
      </div>
      {form.authType === "IAM" && (
        <div className="validation-item pass" style={{ marginTop: 8 }}>
          <CheckCircle2 size={13} />
          <span>IAM auth: Guardian assumes the provisioning role into the BU account. No stored credentials required.</span>
        </div>
      )}
    </div>
  );
}

// ── Step 5: Review ────────────────────────────────────────────────────────────

function ReviewStep({ form, sourceResource }) {
  const dr = sourceResource?.discoveredResource;
  const se = SIDE_EFFECT_LEVELS[form.sideEffectLevel] || {};
  const tt = TOOL_REGISTRATION_TYPES[form.toolType] || form.toolType;
  return (
    <div>
      <p className="muted" style={{ fontSize: 13, marginBottom: 16 }}>
        Review all details before submitting. Submitting creates approval tasks for the business owner and project/platform admins.
        Provisioning only happens after all approvals are granted.
      </p>
      <div className="review-card">
        <div className="review-section">
          <h4>Source Resource</h4>
          <div className="review-row"><span>Name</span><code>{dr?.resourceName}</code></div>
          <div className="review-row"><span>Type</span><code>{DISCOVERED_RESOURCE_TYPES[dr?.resourceType]?.label || dr?.resourceType}</code></div>
          <div className="review-row"><span>ARN</span><code style={{ fontSize: 10, wordBreak: "break-all" }}>{dr?.resourceArn}</code></div>
          <div className="review-row"><span>Tool type</span><code>{tt}</code></div>
        </div>
        <div className="review-section">
          <h4>Tool Metadata</h4>
          <div className="review-row"><span>MCP name</span><code>{form.requestedToolName}</code></div>
          <div className="review-row"><span>Description</span><span>{form.requestedDescription || "—"}</span></div>
          <div className="review-row"><span>Input schema</span><span>{form.inputSchemaJson ? "Provided" : "Not provided"}</span></div>
        </div>
        <div className="review-section">
          <h4>Governance</h4>
          <div className="review-row"><span>Side effect</span><span className={`pill validation-${se.cls}`}>{se.label}</span></div>
          <div className="review-row"><span>Business owner</span><code>{form.businessOwner}</code></div>
          <div className="review-row"><span>Classification</span><code>{form.dataClassification}</code></div>
          {form.rateLimitRpm && <div className="review-row"><span>Rate limit</span><code>{form.rateLimitRpm} req/min</code></div>}
          <div className="review-row"><span>Timeout</span><code>{form.timeoutSeconds}s</code></div>
        </div>
        <div className="review-section">
          <h4>Auth</h4>
          <div className="review-row"><span>Auth type</span><code>{form.authType || "IAM"}</code></div>
          {form.authConfigRef && <div className="review-row"><span>Credential ref</span><code>{form.authConfigRef}</code></div>}
        </div>
      </div>
      {form.sideEffectLevel !== "READ_ONLY" && (
        <div className="validation-item warn" style={{ marginTop: 12 }}>
          <AlertTriangle size={13} />
          <span><strong>{SIDE_EFFECT_LEVELS[form.sideEffectLevel]?.label}</strong> tools require an additional security review before approval.</span>
        </div>
      )}
      <div className="validation-item pass" style={{ marginTop: 8 }}>
        <CheckCircle2 size={13} />
        <span>After all approvals, Guardian will automatically create an AgentCore Gateway target and activate the tool for agents.</span>
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

const BLANK_FORM = {
  requestedToolName: "",
  requestedDescription: "",
  toolType: "LAMBDA",
  inputSchemaJson: "",
  outputSchemaJson: "",
  sampleRequestJson: "",
  sampleResponseJson: "",
  authType: "IAM",
  authConfigRef: "",
  dataClassification: "internal",
  sideEffectLevel: "READ_ONLY",
  rateLimitRpm: null,
  timeoutSeconds: 30,
  businessOwner: "",
  allowedUseCases: [],
};

export default function AddToolWizard({ project, pid, onSuccess, onCancel }) {
  const [step, setStep] = useState(0);
  const [sourceResource, setSourceResource] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function selectSource(visibleResource) {
    setSourceResource(visibleResource);
    const dr = visibleResource.discoveredResource;
    setForm((f) => ({ ...f, toolType: resourceTypeToToolType(dr?.resourceType) }));
  }

  function canAdvance() {
    if (step === 0) return !!sourceResource;
    if (step === 1) return form.requestedToolName.trim().length >= 2 && form.requestedDescription.trim().length >= 5;
    if (step === 2) return !!form.sideEffectLevel && !!form.businessOwner.trim();
    return true;
  }

  async function submit() {
    setBusy(true); setError("");
    try {
      const payload = {
        ...form,
        sourceDiscoveredResourceId: sourceResource.discoveredResourceId,
        requestedBy: "current-user@example.com",
      };
      const res = await api(`/api/projects/${pid}/tool-registration-requests`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onSuccess(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wizard-overlay">
      <div className="wizard-modal">
        {/* Header */}
        <div className="wizard-header">
          <div>
            <p className="eyebrow">Tool Registration</p>
            <h2>Add Tool to {project}</h2>
          </div>
          <button className="secondary icon-only" onClick={onCancel}><X size={16} /></button>
        </div>

        {/* Step indicator */}
        <div className="wizard-steps">
          {STEPS.map((label, i) => (
            <div key={label} className={`wizard-step ${i === step ? "active" : i < step ? "done" : ""}`}>
              <span className="wizard-step-num">{i < step ? <CheckCircle2 size={12} /> : i + 1}</span>
              <span className="wizard-step-label">{label}</span>
              {i < STEPS.length - 1 && <ChevronRight size={12} className="wizard-step-sep" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="wizard-body">
          {step === 0 && <SourceStep pid={pid} onSelect={selectSource} selected={sourceResource} />}
          {step === 1 && <MetadataStep form={form} setForm={setForm} sourceResource={sourceResource} />}
          {step === 2 && <GovernanceStep form={form} setForm={setForm} />}
          {step === 3 && <AuthStep form={form} setForm={setForm} />}
          {step === 4 && <ReviewStep form={form} sourceResource={sourceResource} />}
        </div>

        {error && <div className="validation-item fail" style={{ margin: "0 20px 12px" }}><AlertTriangle size={13} /><span>{error}</span></div>}

        {/* Footer */}
        <div className="wizard-footer">
          <button className="secondary" onClick={() => step > 0 ? setStep(step - 1) : onCancel()}>
            {step === 0 ? "Cancel" : "Back"}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>Step {step + 1} of {STEPS.length}</span>
          {step < STEPS.length - 1 ? (
            <button className="primary" onClick={() => setStep(step + 1)} disabled={!canAdvance()}>
              Next <ChevronRight size={13} />
            </button>
          ) : (
            <button className="primary" onClick={submit} disabled={busy || !canAdvance()}>
              {busy ? "Submitting…" : "Submit for Approval"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
