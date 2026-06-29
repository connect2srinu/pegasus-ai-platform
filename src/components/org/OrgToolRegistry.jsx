import { useState, useEffect, useCallback } from "react";
import {
  Wrench, Plus, ChevronRight, ChevronDown, CheckCircle2, AlertTriangle,
  Clock, XCircle, RefreshCw, ArrowRight, Package, AlertCircle, X,
  FolderOpen, ShieldCheck,
} from "lucide-react";
import { api } from "../../utils.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const SIDE_EFFECT_COLORS = { READ_ONLY: "green", WRITE: "amber", DESTRUCTIVE: "red" };
const DEPLOY_STATUS_ICON = {
  ACTIVE: <CheckCircle2 size={13} style={{ color: "var(--green)" }} />,
  NOT_DEPLOYED: <XCircle size={13} style={{ color: "var(--muted)" }} />,
  PENDING_SETUP: <Clock size={13} style={{ color: "var(--amber)" }} />,
  STALE: <AlertTriangle size={13} style={{ color: "var(--amber)" }} />,
  DRIFT_DETECTED: <AlertTriangle size={13} style={{ color: "var(--red)" }} />,
  PENDING_APPROVAL: <Clock size={13} style={{ color: "var(--amber)" }} />,
};

function envBadge(status) {
  const icon = DEPLOY_STATUS_ICON[status] || <Clock size={13} />;
  const cls = {
    ACTIVE: "pill--green",
    NOT_DEPLOYED: "pill--muted",
    STALE: "pill--amber",
    DRIFT_DETECTED: "pill--red",
    PENDING_SETUP: "pill--amber",
    PENDING_APPROVAL: "pill--amber",
  }[status] || "pill--muted";
  return (
    <span className={`pill ${cls}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10 }}>
      {icon}{status?.replace(/_/g, " ")}
    </span>
  );
}

// ── Register new logical tool form ───────────────────────────────────────────

function RegisterToolForm({ orgId, environments, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    toolKey: "",
    displayName: "",
    description: "",
    sourceType: "LAMBDA",
    sideEffectLevel: "READ_ONLY",
    businessOwner: "",
    dataClassification: "internal",
    credentialProviderRef: "",
    environmentId: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function deriveKey(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.toolKey.trim()) { setError("Tool key is required (snake_case)."); return; }
    if (!form.businessOwner.trim()) { setError("Business owner email is required."); return; }
    setBusy(true); setError("");
    try {
      const body = { ...form };
      if (!body.credentialProviderRef) delete body.credentialProviderRef;
      if (!body.environmentId) delete body.environmentId;
      const result = await api(`/api/organizations/${orgId}/logical-tools`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="otr-register-form">
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>Register Org-Level Tool</h3>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
            Creates a logical definition that goes through approval, then can be deployed to any environment.
          </p>
        </div>
        <button className="secondary" type="button" onClick={onCancel}><X size={13} style={{ marginRight: 4 }} />Cancel</button>
      </div>

      {error && (
        <div className="validation-item fail" style={{ marginBottom: 12 }}>
          <strong>ERROR</strong><span>{error}</span>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            Display name
            <input
              value={form.displayName}
              onChange={(e) => { set("displayName", e.target.value); if (!form.toolKey) set("toolKey", deriveKey(e.target.value)); }}
              placeholder="Claim Lookup"
            />
          </label>
          <label className="field">
            Tool key <span className="required">*</span>
            <input
              value={form.toolKey}
              onChange={(e) => set("toolKey", e.target.value)}
              placeholder="claim_lookup"
              pattern="[a-z][a-z0-9_]*"
              title="snake_case, letters/numbers/underscores only"
            />
            <span className="hint">snake_case · must be unique in this org</span>
          </label>
        </div>

        <label className="field">
          Description
          <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="What does this tool do?" />
        </label>

        <div className="form-grid">
          <label className="field">
            Source type
            <select value={form.sourceType} onChange={(e) => set("sourceType", e.target.value)}>
              {["LAMBDA","API_GATEWAY","BEDROCK_KB","MCP","EXISTING_GATEWAY_TOOL"].map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Side-effect level <span className="required">*</span>
            <select value={form.sideEffectLevel} onChange={(e) => set("sideEffectLevel", e.target.value)}>
              <option value="READ_ONLY">READ ONLY — safe to call frequently</option>
              <option value="WRITE">WRITE — modifies data, requires approval</option>
              <option value="DESTRUCTIVE">DESTRUCTIVE — irreversible, requires elevated approval</option>
            </select>
          </label>
        </div>

        <div className="form-grid">
          <label className="field">
            Business owner email <span className="required">*</span>
            <input value={form.businessOwner} onChange={(e) => set("businessOwner", e.target.value)} placeholder="owner@example.com" />
          </label>
          <label className="field">
            Data classification
            <select value={form.dataClassification} onChange={(e) => set("dataClassification", e.target.value)}>
              {["public","internal","confidential","restricted"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          Credential reference <span className="muted">(optional)</span>
          <input
            value={form.credentialProviderRef}
            onChange={(e) => set("credentialProviderRef", e.target.value)}
            placeholder="sm/my-org-api-key-name"
          />
          <span className="hint">Secret name only — never paste a raw key or token</span>
        </label>

        {environments.length > 0 && (
          <label className="field">
            Target environment for initial deployment <span className="muted">(optional)</span>
            <select value={form.environmentId} onChange={(e) => set("environmentId", e.target.value)}>
              <option value="">— select after approval —</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>{env.name}{env.isProduction ? " (PROD)" : ""}</option>
              ))}
            </select>
          </label>
        )}

        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit for Approval"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Deploy-to-environment form ────────────────────────────────────────────────

function DeployToEnvForm({ orgId, ltd, environments, connections, onSuccess, onCancel }) {
  const alreadyDeployed = new Set((ltd.environmentDeployments || []).map((e) => e.environmentId));
  const available = environments.filter((e) => !alreadyDeployed.has(e.id));

  const [form, setForm] = useState({
    environmentId: available[0]?.id || "",
    awsAccountConnectionId: "",
    sourceResourceArn: "",
    credentialProviderRef: "",
    mcpToolName: ltd.toolKey,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const relevantConnections = connections.filter(
    (c) => !form.environmentId || c.environmentId === form.environmentId
  );

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.environmentId) { setError("Select a target environment."); return; }
    if (!form.awsAccountConnectionId) { setError("Select an AWS account connection."); return; }
    setBusy(true); setError("");
    try {
      const body = { ...form };
      if (!body.sourceResourceArn) delete body.sourceResourceArn;
      if (!body.credentialProviderRef) delete body.credentialProviderRef;
      const result = await api(
        `/api/organizations/${orgId}/logical-tools/${ltd.id}/env-deployments`,
        { method: "POST", body: JSON.stringify(body) }
      );
      onSuccess(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (available.length === 0) {
    return (
      <div className="otr-deploy-form">
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <h4 style={{ margin: 0 }}>Deploy to Environment</h4>
          <button className="secondary" type="button" onClick={onCancel}><X size={13} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          This tool is already deployed to all configured environments.
        </p>
        <button className="secondary" onClick={onCancel}>Close</button>
      </div>
    );
  }

  return (
    <div className="otr-deploy-form">
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: 0 }}>Deploy <code>{ltd.toolKey}</code> to Environment</h4>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
            Provide the environment-specific bindings. No DEV ARNs or credentials will be copied.
          </p>
        </div>
        <button className="secondary" type="button" onClick={onCancel}><X size={13} /></button>
      </div>

      {error && (
        <div className="validation-item fail" style={{ marginBottom: 12 }}>
          <strong>ERROR</strong><span>{error}</span>
        </div>
      )}

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            Target environment <span className="required">*</span>
            <select value={form.environmentId} onChange={(e) => set("environmentId", e.target.value)}>
              <option value="">— select —</option>
              {available.map((env) => (
                <option key={env.id} value={env.id}>{env.name}{env.isProduction ? " (PROD)" : ""}</option>
              ))}
            </select>
          </label>
          <label className="field">
            AWS account connection <span className="required">*</span>
            <select value={form.awsAccountConnectionId} onChange={(e) => set("awsAccountConnectionId", e.target.value)}>
              <option value="">— select —</option>
              {relevantConnections.map((c) => (
                <option key={c.id} value={c.id}>{c.accountName || c.awsAccountId} ({c.environmentType})</option>
              ))}
              {relevantConnections.length === 0 && connections.map((c) => (
                <option key={c.id} value={c.id}>{c.accountName || c.awsAccountId} ({c.environmentType})</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          Source resource ARN <span className="muted">(optional — env-specific Lambda / API)</span>
          <input
            value={form.sourceResourceArn}
            onChange={(e) => set("sourceResourceArn", e.target.value)}
            placeholder={`arn:aws:lambda:us-east-1:ACCOUNT:function/${form.mcpToolName}-fn`}
            className="arn-input"
          />
          <span className="hint">Must belong to the selected account — cross-account ARNs are rejected</span>
        </label>

        <label className="field">
          MCP tool name
          <input
            value={form.mcpToolName}
            onChange={(e) => set("mcpToolName", e.target.value)}
            placeholder={ltd.toolKey}
          />
        </label>

        <label className="field">
          Credential reference <span className="muted">(optional)</span>
          <input
            value={form.credentialProviderRef}
            onChange={(e) => set("credentialProviderRef", e.target.value)}
            placeholder="sm/prod-api-key-name"
          />
          <span className="hint">Secret name only — never a raw value</span>
        </label>

        <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
          <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Deploying…" : "Create Environment Deployment"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Environment deployment row ────────────────────────────────────────────────

function EnvDeploymentRow({ envDep, onValidate }) {
  const [validating, setValidating] = useState(false);

  async function runValidate() {
    setValidating(true);
    try {
      const result = await api(`/api/env-tool-deployments/${envDep.etdId || envDep.id}/validate`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      onValidate(result);
    } catch (err) {
      // show inline
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="otr-env-row">
      <div className="otr-env-row-name">
        <span className="otr-env-badge">{envDep.environmentName || envDep.environmentId}</span>
        {envDep.isProduction && <span className="pill pill--red" style={{ fontSize: 9, padding: "1px 5px" }}>PROD</span>}
      </div>
      <div className="otr-env-row-status">{envBadge(envDep.deploymentStatus)}</div>
      <div className="otr-env-row-actions">
        {envDep.deploymentStatus === "ACTIVE" && (
          <button
            className="secondary"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={runValidate}
            disabled={validating}
          >
            <RefreshCw size={11} style={{ marginRight: 3 }} />
            {validating ? "Checking…" : "Validate"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Inline approval panel ─────────────────────────────────────────────────────

function InlineApprovalPanel({ ltd, orgId, onApproved }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState({});
  const [busy, setBusy] = useState({});

  useEffect(() => {
    api(`/api/approvals?organizationId=${orgId}&scope=org&status=pending`)
      .then((r) => {
        // filter to tasks for this specific tool
        const relevant = (r.approvalTasks || []).filter(
          (t) => t._ltd?.id === ltd.id || t._trr?.logicalToolDefinitionId === ltd.id
        );
        setTasks(relevant);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId, ltd.id]);

  async function decide(taskId, decision) {
    setBusy((b) => ({ ...b, [taskId]: true }));
    try {
      await api(`/api/approvals/${taskId}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          comments: comments[taskId] || "",
          approver: "platform-admin@example.com",
        }),
      });
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: decision === "approved" ? "approved" : "rejected", decision } : t));
      // If all remaining tasks approved, trigger parent refresh
      const updated = tasks.map((t) => t.id === taskId ? { ...t, status: decision === "approved" ? "approved" : "rejected" } : t);
      if (updated.every((t) => t.status === "approved")) {
        setTimeout(onApproved, 300);
      }
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy((b) => ({ ...b, [taskId]: false }));
    }
  }

  if (loading) return <p className="muted" style={{ fontSize: 12 }}>Loading approval tasks…</p>;

  if (tasks.length === 0) {
    return (
      <div className="validation-item pass" style={{ marginBottom: 0 }}>
        <CheckCircle2 size={13} />
        <span style={{ fontSize: 12 }}>All approval stages complete — tool is now active.</span>
      </div>
    );
  }

  const APPROVER_LABELS = { org_admin: "Org Admin", platform_admin: "Platform Admin", security: "Security" };

  return (
    <div className="otr-inline-approval">
      <p className="field-label" style={{ marginBottom: 8 }}>
        <ShieldCheck size={13} style={{ marginRight: 4, verticalAlign: "middle" }} />
        Pending approval stages ({tasks.length})
      </p>
      {tasks.map((task) => (
        <div key={task.id} className={`otr-approval-task ${task.status !== "pending" ? "otr-approval-task--done" : ""}`}>
          <div className="otr-approval-task-header">
            {task.status === "approved"
              ? <CheckCircle2 size={13} style={{ color: "var(--green)", flexShrink: 0 }} />
              : task.status === "rejected"
              ? <XCircle size={13} style={{ color: "var(--red)", flexShrink: 0 }} />
              : <Clock size={13} style={{ color: "var(--amber)", flexShrink: 0 }} />}
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {APPROVER_LABELS[task.approverType] || task.approverType}
            </span>
            <span className="muted" style={{ fontSize: 11 }}>{task.reason}</span>
          </div>
          {task.status === "pending" && (
            <div className="otr-approval-task-actions">
              <input
                className="comment-input"
                style={{ flex: 1, fontSize: 11 }}
                placeholder="Comment (optional)"
                value={comments[task.id] || ""}
                onChange={(e) => setComments((c) => ({ ...c, [task.id]: e.target.value }))}
              />
              <button
                className="danger"
                style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={() => decide(task.id, "rejected")}
                disabled={busy[task.id]}
              >
                Reject
              </button>
              <button
                className="primary"
                style={{ fontSize: 11, padding: "3px 10px" }}
                onClick={() => decide(task.id, "approved")}
                disabled={busy[task.id]}
              >
                {busy[task.id] ? "…" : "Approve"}
              </button>
            </div>
          )}
          {task.status !== "pending" && (
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              {task.decision} by {task.approver || "reviewer"}
              {task.comments ? ` · "${task.comments}"` : ""}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Grant to project panel ────────────────────────────────────────────────────

function GrantToProjectPanel({ ltd, orgId, environments, onGranted, onCancel }) {
  const [projects, setProjects] = useState([]);
  const [existingGrants, setExistingGrants] = useState([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedEnv, setSelectedEnv] = useState(
    environments.find((e) => !e.isProduction)?.id || environments[0]?.id || ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    api(`/api/organizations/${orgId}`)
      .then((r) => setProjects(r.organization?.projects || []))
      .catch(() => {});
    // Load existing grants for this tool to show which projects already have it
    api(`/api/organizations/${orgId}/logical-tools`)
      .then((r) => {
        const thisTool = (r.logicalToolDefinitions || []).find((l) => l.id === ltd.id);
        // We don't have a dedicated grants endpoint yet, so use activeGrantCount
      })
      .catch(() => {});
  }, [orgId, ltd.id]);

  async function grant() {
    if (!selectedProject) { setError("Select a project."); return; }
    if (!selectedEnv) { setError("Select an environment."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      await api(`/api/organizations/${orgId}/logical-tools/${ltd.id}/grants`, {
        method: "POST",
        body: JSON.stringify({
          projectId: selectedProject,
          environmentId: selectedEnv,
          grantedBy: "platform-admin@example.com",
        }),
      });
      const proj = projects.find((p) => p.id === selectedProject);
      const env  = environments.find((e) => e.id === selectedEnv);
      setSuccess(`Granted to ${proj?.name || selectedProject} in ${env?.name || selectedEnv}.`);
      onGranted?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Active env deployments the tool has — only grant for envs where tool is deployed
  const deployedEnvIds = new Set((ltd.environmentDeployments || [])
    .filter((e) => e.deploymentStatus === "ACTIVE")
    .map((e) => e.environmentId));
  const grantableEnvs = environments.filter((e) => deployedEnvIds.has(e.id));

  return (
    <div className="otr-grant-panel">
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div>
          <p className="field-label" style={{ margin: 0 }}>
            <FolderOpen size={13} style={{ marginRight: 5, verticalAlign: "middle" }} />
            Grant <code>{ltd.toolKey}</code> to a project
          </p>
          <p className="muted" style={{ fontSize: 11, marginTop: 3 }}>
            Projects can only use this tool in environments where it is deployed and active.
          </p>
        </div>
        <button className="secondary icon-only" onClick={onCancel} style={{ padding: "4px 8px" }}><X size={12} /></button>
      </div>

      {error && <div className="validation-item fail" style={{ marginBottom: 8 }}><strong>ERROR</strong><span>{error}</span></div>}
      {success && <div className="validation-item pass" style={{ marginBottom: 8 }}><CheckCircle2 size={13} /><span>{success}</span></div>}

      {grantableEnvs.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>
          No active environment deployments. Deploy the tool to at least one environment before granting to projects.
        </p>
      ) : (
        <div className="form-grid" style={{ gap: 10 }}>
          <label className="field" style={{ marginBottom: 0 }}>
            Project
            <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}>
              <option value="">— select project —</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="field" style={{ marginBottom: 0 }}>
            Environment
            <select value={selectedEnv} onChange={(e) => setSelectedEnv(e.target.value)}>
              {grantableEnvs.map((e) => (
                <option key={e.id} value={e.id}>{e.name}{e.isProduction ? " (PROD)" : ""}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {grantableEnvs.length > 0 && (
        <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
          <button className="secondary" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={grant} disabled={busy || !!success}>
            {busy ? "Granting…" : success ? "Granted" : "Grant Access"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Single logical tool card ──────────────────────────────────────────────────

function ToolCard({ ltd, environments, connections, orgId, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [deployingTo, setDeployingTo] = useState(false);
  const [validateResult, setValidateResult] = useState(null);
  const [showGrantPanel, setShowGrantPanel] = useState(false);

  const sideColor = SIDE_EFFECT_COLORS[ltd.sideEffectLevel] || "muted";
  const envDeps = ltd.environmentDeployments || [];
  const activeCount = envDeps.filter((e) => e.deploymentStatus === "ACTIVE").length;
  const totalEnvs = environments.length;
  const allDeployed = envDeps.length >= totalEnvs && activeCount === totalEnvs;
  const hasDrift = envDeps.some((e) => e.deploymentStatus === "DRIFT_DETECTED");
  const hasStale = envDeps.some((e) => e.deploymentStatus === "STALE");

  function handleDeploySuccess() {
    setDeployingTo(false);
    onRefresh();
  }

  function handleValidate(result) {
    setValidateResult(result);
    onRefresh();
  }

  const approvalBadge = ltd.approvalStatus === "APPROVED"
    ? <CheckCircle2 size={13} style={{ color: "var(--green)" }} />
    : ltd.approvalStatus === "PENDING_APPROVAL"
    ? <Clock size={13} style={{ color: "var(--amber)" }} />
    : <AlertTriangle size={13} style={{ color: "var(--red)" }} />;

  return (
    <div className={`otr-tool-card ${hasDrift ? "otr-tool-card--drift" : hasStale ? "otr-tool-card--stale" : ""}`}>
      {/* Card header */}
      <div className="otr-tool-card-header" onClick={() => setExpanded((v) => !v)}>
        <div className="otr-tool-card-icon">
          <Wrench size={15} />
        </div>

        <div className="otr-tool-card-meta">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <strong>{ltd.displayName}</strong>
            <code className="muted" style={{ fontSize: 11 }}>{ltd.toolKey}</code>
            <span className={`pill pill--${sideColor}`} style={{ fontSize: 10 }}>
              {ltd.sideEffectLevel?.replace(/_/g, " ")}
            </span>
          </div>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>{ltd.description || "No description."}</p>
        </div>

        <div className="otr-tool-card-right">
          {/* Approval status */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            {approvalBadge}
            <span className="muted">{ltd.approvalStatus?.replace(/_/g, " ")}</span>
          </div>

          {/* Env coverage */}
          <div className="otr-env-coverage" title={`${activeCount} of ${totalEnvs} environments active`}>
            {environments.map((env) => {
              const dep = envDeps.find((d) => d.environmentId === env.id);
              const status = dep?.deploymentStatus || "NOT_DEPLOYED";
              const dotClass = {
                ACTIVE: "otr-env-dot--active",
                NOT_DEPLOYED: "otr-env-dot--missing",
                STALE: "otr-env-dot--stale",
                DRIFT_DETECTED: "otr-env-dot--drift",
              }[status] || "otr-env-dot--missing";
              return (
                <div key={env.id} className={`otr-env-dot ${dotClass}`} title={`${env.name}: ${status}`}>
                  <span className="otr-env-dot-label">{env.name.slice(0, 1)}</span>
                </div>
              );
            })}
          </div>

          {/* Grant count */}
          <span className="muted" style={{ fontSize: 11, whiteSpace: "nowrap" }}>
            {ltd.activeGrantCount} grant{ltd.activeGrantCount !== 1 ? "s" : ""}
          </span>

          {/* Pending approval call-to-action on the collapsed card */}
          {ltd.approvalStatus === "PENDING_APPROVAL" && !expanded && (
            <span
              className="pill pill--amber"
              style={{ fontSize: 10, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 3 }}
              onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            >
              <ShieldCheck size={11} />Needs approval
            </span>
          )}

          <button className="icon-btn">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="otr-tool-card-body">
          {validateResult && (
            <div className={`validation-item ${validateResult.driftDetected ? "fail" : "pass"}`} style={{ marginBottom: 12 }}>
              <strong>{validateResult.driftDetected ? "DRIFT" : "OK"}</strong>
              <span>{validateResult.message}</span>
              <button className="secondary" style={{ marginLeft: "auto", fontSize: 11, padding: "2px 8px" }} onClick={() => setValidateResult(null)}>Dismiss</button>
            </div>
          )}

          {/* ── PENDING APPROVAL: show approval tasks inline ── */}
          {ltd.approvalStatus === "PENDING_APPROVAL" && (
            <InlineApprovalPanel
              ltd={ltd}
              orgId={orgId}
              onApproved={() => { setExpanded(false); onRefresh(); }}
            />
          )}

          {/* ── APPROVED: show full detail + env deployments ── */}
          {ltd.approvalStatus !== "PENDING_APPROVAL" && (
            <div className="otr-detail-grid">
              {/* Left: info */}
              <div>
                <p className="field-label">Tool details</p>
                <table className="otr-info-table">
                  <tbody>
                    <tr><td className="muted">Source type</td><td>{ltd.sourceType}</td></tr>
                    <tr><td className="muted">Version</td><td>{ltd.version}</td></tr>
                    <tr><td className="muted">Classification</td><td>{ltd.dataClassification}</td></tr>
                    <tr><td className="muted">Business owner</td><td>{ltd.businessOwner}</td></tr>
                    <tr><td className="muted">Project grants</td><td>{ltd.activeGrantCount} active</td></tr>
                    {ltd.checksum && <tr><td className="muted">Schema checksum</td><td><code style={{ fontSize: 10 }}>{ltd.checksum}</code></td></tr>}
                  </tbody>
                </table>

                {/* Grant to project button */}
                {ltd.approvalStatus === "APPROVED" && (
                  <div style={{ marginTop: 14 }}>
                    {showGrantPanel ? (
                      <GrantToProjectPanel
                        ltd={ltd}
                        orgId={orgId}
                        environments={environments}
                        onGranted={() => { setTimeout(onRefresh, 400); }}
                        onCancel={() => setShowGrantPanel(false)}
                      />
                    ) : (
                      <button
                        className="secondary"
                        style={{ fontSize: 12, width: "100%" }}
                        onClick={() => setShowGrantPanel(true)}
                      >
                        <FolderOpen size={12} style={{ marginRight: 5 }} />Grant to Project
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Right: env deployments */}
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <p className="field-label" style={{ margin: 0 }}>Environment deployments</p>
                  {ltd.approvalStatus === "APPROVED" && (
                    <button
                      className="secondary"
                      style={{ fontSize: 11, padding: "2px 8px", marginLeft: "auto" }}
                      onClick={() => setDeployingTo(true)}
                    >
                      <ArrowRight size={11} style={{ marginRight: 3 }} />Deploy to env
                    </button>
                  )}
                </div>

                {deployingTo && (
                  <DeployToEnvForm
                    orgId={orgId}
                    ltd={ltd}
                    environments={environments}
                    connections={connections}
                    onSuccess={handleDeploySuccess}
                    onCancel={() => setDeployingTo(false)}
                  />
                )}

                {!deployingTo && (
                  <>
                    {environments.map((env) => {
                      const dep = envDeps.find((d) => d.environmentId === env.id);
                      if (!dep) {
                        return (
                          <div key={env.id} className="otr-env-row otr-env-row--missing">
                            <div className="otr-env-row-name">
                              <span className="otr-env-badge otr-env-badge--missing">{env.name}</span>
                              {env.isProduction && <span className="pill pill--red" style={{ fontSize: 9, padding: "1px 5px" }}>PROD</span>}
                            </div>
                            <div className="otr-env-row-status">{envBadge("NOT_DEPLOYED")}</div>
                            <div className="otr-env-row-actions">
                              {ltd.approvalStatus === "APPROVED" && (
                                <button
                                  className="secondary"
                                  style={{ fontSize: 11, padding: "2px 8px" }}
                                  onClick={() => setDeployingTo(true)}
                                >
                                  <Plus size={11} style={{ marginRight: 3 }} />Deploy
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <EnvDeploymentRow
                          key={env.id}
                          envDep={{ ...dep, environmentName: env.name, isProduction: env.isProduction }}
                          onValidate={handleValidate}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main OrgToolRegistry ──────────────────────────────────────────────────────

export default function OrgToolRegistry({ org }) {
  const [ltds, setLtds] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [registerSuccess, setRegisterSuccess] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ltdRes, envRes, connRes] = await Promise.all([
        api(`/api/organizations/${org.id}/logical-tools`),
        api(`/api/organizations/${org.id}/environments`),
        api(`/api/organizations/${org.id}/account-connections`),
      ]);
      setLtds(ltdRes.logicalToolDefinitions || []);
      setEnvironments((envRes.environments || []).sort((a, b) => a.promotionOrder - b.promotionOrder));
      setConnections(connRes.connections || []);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [org.id]);

  useEffect(() => { load(); }, [load]);

  function handleRegisterSuccess(result) {
    setShowRegister(false);
    setRegisterSuccess(result);
    load();
  }

  const filtered = ltds.filter((l) => {
    if (filterStatus === "all") return true;
    if (filterStatus === "active") return l.status === "ACTIVE" && l.approvalStatus === "APPROVED";
    if (filterStatus === "pending") return l.approvalStatus === "PENDING_APPROVAL";
    if (filterStatus === "issues") {
      return l.environmentDeployments?.some((e) =>
        e.deploymentStatus === "DRIFT_DETECTED" || e.deploymentStatus === "STALE"
      );
    }
    return true;
  });

  // Summary stats
  const totalActive = ltds.filter((l) => l.approvalStatus === "APPROVED").length;
  const totalPending = ltds.filter((l) => l.approvalStatus === "PENDING_APPROVAL").length;
  const totalDrift = ltds.filter((l) =>
    l.environmentDeployments?.some((e) => e.deploymentStatus === "DRIFT_DETECTED" || e.deploymentStatus === "STALE")
  ).length;

  if (showRegister) {
    return (
      <RegisterToolForm
        orgId={org.id}
        environments={environments}
        onSuccess={handleRegisterSuccess}
        onCancel={() => setShowRegister(false)}
      />
    );
  }

  return (
    <div className="otr-root">
      {/* Header */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Org Tool Registry</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Organization-level tool definitions shared across projects. Each tool is promoted per-environment — no DEV credentials or ARNs are copied to PROD.
          </p>
        </div>
        <button className="primary" onClick={() => setShowRegister(true)}>
          <Plus size={13} style={{ marginRight: 6 }} />Register Tool
        </button>
      </div>

      {/* Summary strip */}
      {!loading && ltds.length > 0 && (
        <div className="otr-summary-strip">
          <div className="otr-summary-stat">
            <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
            <strong>{totalActive}</strong><span className="muted">approved</span>
          </div>
          <div className="otr-summary-stat">
            <Clock size={14} style={{ color: "var(--amber)" }} />
            <strong>{totalPending}</strong><span className="muted">pending approval</span>
          </div>
          <div className="otr-summary-stat">
            <AlertTriangle size={14} style={{ color: totalDrift > 0 ? "var(--red)" : "var(--muted)" }} />
            <strong>{totalDrift}</strong><span className="muted">with drift/stale</span>
          </div>
          <div className="otr-summary-stat">
            <Package size={14} />
            <strong>{ltds.reduce((s, l) => s + (l.activeGrantCount || 0), 0)}</strong>
            <span className="muted">active grants</span>
          </div>
          {/* Env legend */}
          <div className="otr-env-legend">
            {environments.map((env) => (
              <div key={env.id} className="otr-env-legend-item">
                <div className={`otr-env-dot otr-env-dot--active`} />
                <span className="muted" style={{ fontSize: 11 }}>{env.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Register success toast */}
      {registerSuccess && (
        <div className="validation-item pass" style={{ marginBottom: 12, alignItems: "flex-start" }}>
          <CheckCircle2 size={14} style={{ marginTop: 2, flexShrink: 0 }} />
          <div>
            <strong>Tool submitted for approval</strong>
            <p style={{ margin: "4px 0 0", fontSize: 12 }}>
              <code>{registerSuccess.logicalToolDefinition?.toolKey}</code> is PENDING_APPROVAL.
              {" "}{registerSuccess.approvalTasks?.length} approval task{registerSuccess.approvalTasks?.length !== 1 ? "s" : ""} created.
              Once approved, use "Deploy to env" to register it with an environment gateway.
            </p>
          </div>
          <button className="secondary" style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11 }} onClick={() => setRegisterSuccess(null)}>
            <X size={11} />
          </button>
        </div>
      )}

      {/* Filters */}
      {ltds.length > 0 && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <div className="filters">
            {[
              ["all", "All"],
              ["active", "Approved"],
              ["pending", "Pending approval"],
              ["issues", "Issues"],
            ].map(([k, label]) => (
              <button
                key={k}
                className={`secondary ${filterStatus === k ? "active" : ""}`}
                onClick={() => setFilterStatus(k)}
                style={filterStatus === k ? { background: "var(--surface-active)", fontWeight: 600 } : {}}
              >
                {label}
                {k === "pending" && totalPending > 0 && (
                  <span className="pill pill--amber" style={{ marginLeft: 4, fontSize: 10, padding: "1px 5px" }}>{totalPending}</span>
                )}
                {k === "issues" && totalDrift > 0 && (
                  <span className="pill pill--red" style={{ marginLeft: 4, fontSize: 10, padding: "1px 5px" }}>{totalDrift}</span>
                )}
              </button>
            ))}
          </div>
          <button className="secondary" onClick={load} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>
      )}

      {/* Tool list */}
      {loading && <p className="muted">Loading tool registry…</p>}

      {!loading && ltds.length === 0 && (
        <div className="empty-state" style={{ border: "1px dashed var(--border)" }}>
          <Wrench size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
          <strong>No org-level tools registered</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            Register your first tool to make it available across all projects in this organization.
            Tools go through approval before they can be deployed to any environment.
          </p>
          <button className="primary" style={{ marginTop: 14 }} onClick={() => setShowRegister(true)}>
            <Plus size={13} style={{ marginRight: 6 }} />Register First Tool
          </button>
        </div>
      )}

      {!loading && ltds.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <p className="muted">No tools match the current filter.</p>
          <button className="secondary" onClick={() => setFilterStatus("all")}>Clear filter</button>
        </div>
      )}

      <div className="otr-tool-list">
        {filtered.map((ltd) => (
          <ToolCard
            key={ltd.id}
            ltd={ltd}
            environments={environments}
            connections={connections}
            orgId={org.id}
            onRefresh={load}
          />
        ))}
      </div>
    </div>
  );
}
