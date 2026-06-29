import { useState, useEffect, useCallback } from "react";
import {
  RefreshCw, Database, Zap, Globe, Server, Wrench,
  CheckCircle2, AlertTriangle, Clock, Eye, EyeOff,
  Plus, X, ChevronDown, ChevronRight,
} from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api } from "../../utils.js";
import { DISCOVERED_RESOURCE_TYPES, DISCOVERY_STATUS } from "../../constants.js";

// ── Type metadata ─────────────────────────────────────────────────────────────

const TYPE_ICONS = {
  API_GATEWAY_REST:         <Globe size={13} />,
  API_GATEWAY_HTTP:         <Globe size={13} />,
  LAMBDA:                   <Zap size={13} />,
  AGENTCORE_GATEWAY:        <Server size={13} />,
  AGENTCORE_GATEWAY_TARGET: <Server size={13} />,
  AGENTCORE_GATEWAY_TOOL:   <Wrench size={13} />,
  BEDROCK_KB:               <Database size={13} />,
  BEDROCK_KB_DATA_SOURCE:   <Database size={13} />,
};

// Resource types that can be registered as org-level tools
const REGISTERABLE_TYPES = new Set([
  "LAMBDA",
  "API_GATEWAY_REST",
  "API_GATEWAY_HTTP",
  "BEDROCK_KB",
]);

// Map discovered resource type → LogicalToolDefinition sourceType
const TO_SOURCE_TYPE = {
  LAMBDA:           "LAMBDA",
  API_GATEWAY_REST: "API_GATEWAY",
  API_GATEWAY_HTTP: "API_GATEWAY",
  BEDROCK_KB:       "BEDROCK_KB",
};

function toToolKey(name = "") {
  return name
    .toLowerCase()
    .replace(/[-\s.]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ResourceTypeBadge({ type }) {
  const meta = DISCOVERED_RESOURCE_TYPES[type] || { label: type, color: "gray" };
  return (
    <span className={`res-type-badge res-type-badge--${meta.color}`}>
      {TYPE_ICONS[type] || <Globe size={13} />}
      {meta.label}
    </span>
  );
}

function DiscoveryStatusBadge({ status }) {
  const meta = DISCOVERY_STATUS[status] || { label: status, cls: "pass" };
  return <span className={`pill validation-${meta.cls}`}>{meta.label}</span>;
}

function SyncRunHistory({ orgId, connectionId }) {
  const [runs, setRuns] = useState([]);
  useEffect(() => {
    api(`/api/organizations/${orgId}/account-connections/${connectionId}/sync-runs`)
      .then((r) => setRuns(r.syncRuns || []))
      .catch(() => {});
  }, [connectionId]);

  if (!runs.length) return <p className="muted" style={{ fontSize: 12 }}>No sync runs yet.</p>;
  return (
    <div className="sync-run-list">
      {runs.slice(0, 5).map((run) => (
        <div key={run.id} className="sync-run-row">
          <span className={`sync-run-status ${run.status === "SUCCEEDED" ? "green" : run.status === "PARTIAL" ? "amber" : "red"}`}>
            {run.status === "SUCCEEDED" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          </span>
          <span className="sync-run-type">{run.syncType}</span>
          <span className="muted" style={{ fontSize: 11 }}>{new Date(run.completedAt || run.startedAt).toLocaleString()}</span>
          <span className="muted" style={{ fontSize: 11 }}>{run.resourcesDiscovered} resources</span>
          {run.errorSummary && <span className="sync-run-error">{run.errorSummary}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Registration form (pre-filled from discovered resource) ───────────────────

function RegisterFromDiscoveryForm({ orgId, connection, resource, onSuccess, onCancel }) {
  // Parse description from metadata
  let meta = {};
  try { meta = JSON.parse(resource.metadataJson || "{}"); } catch { /* */ }
  const description = meta.description || "";

  const derivedKey = toToolKey(resource.resourceName || resource.resourceId);
  const sourceType = TO_SOURCE_TYPE[resource.resourceType] || "LAMBDA";

  const [form, setForm] = useState({
    toolKey:              derivedKey,
    displayName:          (resource.resourceName || resource.resourceId)
                            .replace(/[-_]/g, " ")
                            .replace(/\b\w/g, (c) => c.toUpperCase()),
    description,
    sourceType,
    sideEffectLevel:      "READ_ONLY",
    businessOwner:        "",
    dataClassification:   "internal",
    credentialProviderRef: "",
    // pre-filled, not shown as editable
    sourceResourceArn:    resource.resourceArn,
    sourceDiscoveredResourceId: resource.id,
    environmentId:        connection.environmentId || "",
    awsAccountConnectionId: connection.id,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
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

  const sideEffectHints = {
    READ_ONLY:   "Safe to call frequently. No data is modified.",
    WRITE:       "Modifies data — e.g. POST/PUT endpoints. Requires elevated approval.",
    DESTRUCTIVE: "Irreversible operation. Requires security sign-off.",
  };

  return (
    <div className="reg-drawer">
      {/* Header */}
      <div className="reg-drawer-header">
        <div className="reg-drawer-title">
          <div className="reg-drawer-icon">{TYPE_ICONS[resource.resourceType] || <Wrench size={14} />}</div>
          <div>
            <strong>Register as Org Tool</strong>
            <p className="muted" style={{ margin: "2px 0 0", fontSize: 11 }}>
              From: <code>{resource.resourceName}</code> · {resource.resourceType}
            </p>
          </div>
        </div>
        <button className="secondary icon-only" onClick={onCancel} style={{ padding: "4px 8px" }}>
          <X size={13} />
        </button>
      </div>

      {/* Pre-filled summary (read-only) */}
      <div className="reg-drawer-prefilled">
        <div className="reg-prefilled-row">
          <span className="muted">ARN</span>
          <code style={{ fontSize: 10, wordBreak: "break-all" }}>{resource.resourceArn}</code>
        </div>
        <div className="reg-prefilled-row">
          <span className="muted">Account / env</span>
          <span>{connection.awsAccountId} · {connection.environmentType || "DEV"}</span>
        </div>
        {description && (
          <div className="reg-prefilled-row">
            <span className="muted">Discovered description</span>
            <span>{description}</span>
          </div>
        )}
      </div>

      {error && (
        <div className="validation-item fail" style={{ margin: "8px 0" }}>
          <strong>ERROR</strong><span>{error}</span>
        </div>
      )}

      <form onSubmit={submit}>
        {/* Tool key + display name */}
        <div className="form-grid" style={{ marginTop: 10 }}>
          <label className="field">
            Tool key <span className="required">*</span>
            <input
              value={form.toolKey}
              onChange={(e) => set("toolKey", e.target.value)}
              placeholder="claim_lookup"
              pattern="[a-z][a-z0-9_]*"
            />
            <span className="hint">snake_case · auto-derived from resource name</span>
          </label>
          <label className="field">
            Display name
            <input
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          Description
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            placeholder="What does this tool do for agents?"
          />
        </label>

        {/* Side-effect level — most important decision */}
        <label className="field">
          Side-effect level <span className="required">*</span>
          <div className="side-effect-options">
            {["READ_ONLY", "WRITE", "DESTRUCTIVE"].map((level) => (
              <label
                key={level}
                className={`side-effect-option ${form.sideEffectLevel === level ? "side-effect-option--selected" : ""} side-effect-option--${level === "READ_ONLY" ? "green" : level === "WRITE" ? "amber" : "red"}`}
              >
                <input
                  type="radio"
                  name="sideEffectLevel"
                  value={level}
                  checked={form.sideEffectLevel === level}
                  onChange={() => set("sideEffectLevel", level)}
                  style={{ display: "none" }}
                />
                <strong>{level.replace(/_/g, " ")}</strong>
                <span>{sideEffectHints[level]}</span>
              </label>
            ))}
          </div>
        </label>

        <div className="form-grid">
          <label className="field">
            Business owner email <span className="required">*</span>
            <input
              value={form.businessOwner}
              onChange={(e) => set("businessOwner", e.target.value)}
              placeholder="owner@example.com"
              type="email"
            />
            <span className="hint">Who is accountable for this tool's usage?</span>
          </label>
          <label className="field">
            Data classification
            <select value={form.dataClassification} onChange={(e) => set("dataClassification", e.target.value)}>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
              <option value="restricted">Restricted / PII</option>
            </select>
          </label>
        </div>

        <label className="field">
          Credential reference <span className="muted">(optional)</span>
          <input
            value={form.credentialProviderRef}
            onChange={(e) => set("credentialProviderRef", e.target.value)}
            placeholder="sm/my-api-key-secret-name"
          />
          <span className="hint">Secret manager reference only — never paste a raw key or token</span>
        </label>

        <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
          <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit for Approval"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Registration status badge ─────────────────────────────────────────────────

function RegistrationBadge({ status, toolKey }) {
  if (status === "APPROVED") {
    return (
      <span className="pill pill--green" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <CheckCircle2 size={11} />Registered · {toolKey}
      </span>
    );
  }
  if (status === "PENDING_APPROVAL") {
    return (
      <span className="pill pill--amber" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Clock size={11} />Pending approval · {toolKey}
      </span>
    );
  }
  if (status === "PROVISIONED") {
    return (
      <span className="pill pill--green" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <CheckCircle2 size={11} />Provisioned · {toolKey}
      </span>
    );
  }
  return null;
}

// ── Resource row ──────────────────────────────────────────────────────────────

function ResourceRow({
  resource, orgId, connection, isVisible,
  onToggleVisibility, projectId,
  registrationInfo, onRegisterClick, onRegisterSuccess,
  isRegisteringThis, onCancelRegister,
}) {
  let meta = {};
  try { meta = JSON.parse(resource.metadataJson || "{}"); } catch { /* */ }

  const canRegister = REGISTERABLE_TYPES.has(resource.resourceType);
  const isRegistered = !!registrationInfo;
  const isAlreadyRegistered = isRegistered && registrationInfo.approvalStatus !== "DRAFT";

  return (
    <>
      <tr className={isRegisteringThis ? "resource-row resource-row--registering" : "resource-row"}>
        <td>
          <strong>{resource.resourceName || resource.resourceId}</strong>
          {meta.description && (
            <><br /><span className="muted" style={{ fontSize: 11 }}>{meta.description}</span></>
          )}
          {meta.runtime && (
            <><br /><span className="muted" style={{ fontSize: 10 }}>Runtime: {meta.runtime}</span></>
          )}
        </td>
        <td><ResourceTypeBadge type={resource.resourceType} /></td>
        <td><code style={{ fontSize: 10, wordBreak: "break-all" }}>{resource.resourceArn}</code></td>
        <td><span className="muted">{resource.region}</span></td>
        <td><DiscoveryStatusBadge status={resource.discoveryStatus} /></td>

        {/* Registration action */}
        <td>
          {canRegister && (
            isAlreadyRegistered ? (
              <RegistrationBadge
                status={registrationInfo.approvalStatus}
                toolKey={registrationInfo.toolKey}
              />
            ) : isRegisteringThis ? (
              <button
                className="secondary"
                style={{ fontSize: 11, padding: "2px 8px" }}
                onClick={onCancelRegister}
              >
                <X size={11} style={{ marginRight: 3 }} />Cancel
              </button>
            ) : (
              <button
                className="reg-from-discovery-btn"
                onClick={() => onRegisterClick(resource)}
                title="Register this resource as an org-level tool"
              >
                <Plus size={12} />Register as Tool
              </button>
            )
          )}
          {!canRegister && (
            <span className="muted" style={{ fontSize: 11 }}>—</span>
          )}
        </td>

        {/* Project visibility (only shown when in project context) */}
        {projectId && (
          <td>
            <button
              className={`vis-toggle-btn ${isVisible ? "vis-toggle-btn--visible" : ""}`}
              onClick={onToggleVisibility}
              title={isVisible ? "Remove from project" : "Add to project"}
            >
              {isVisible ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Hidden</>}
            </button>
          </td>
        )}
      </tr>

      {/* Inline registration form — spans full row */}
      {isRegisteringThis && (
        <tr className="resource-row-form-row">
          <td colSpan={projectId ? 7 : 6} style={{ padding: 0 }}>
            <RegisterFromDiscoveryForm
              orgId={orgId}
              connection={connection}
              resource={resource}
              onSuccess={onRegisterSuccess}
              onCancel={onCancelRegister}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main InventoryCatalog ─────────────────────────────────────────────────────

export default function InventoryCatalog({ orgId, connection, onAddToProject, projectId }) {
  const [resources, setResources] = useState([]);
  const [logicalTools, setLogicalTools] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [visibleSet, setVisibleSet] = useState(new Set());
  const [registeringResource, setRegisteringResource] = useState(null);
  const [registerSuccess, setRegisterSuccess] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [resResult, ltdResult] = await Promise.all([
        api(`/api/organizations/${orgId}/discovered-resources`),
        api(`/api/organizations/${orgId}/logical-tools`),
      ]);
      setResources(resResult.resources || []);
      setLogicalTools(ltdResult.logicalToolDefinitions || []);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => {
    loadAll();
    if (projectId) loadVisibility();
  }, [orgId, projectId, loadAll]);

  async function loadVisibility() {
    try {
      const r = await api(`/api/projects/${projectId}/visible-resources`);
      setVisibleSet(new Set((r.visibleResources || []).map((v) => v.discoveredResourceId)));
    } catch { /* offline */ }
  }

  async function triggerSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await api(
        `/api/organizations/${orgId}/account-connections/${connection.id}/sync`,
        { method: "POST" }
      );
      setSyncMsg(`Sync complete — ${r.resourcesDiscovered} resources discovered.`);
      loadAll();
    } catch (err) {
      setSyncMsg(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  async function toggleVisibility(resource) {
    if (!projectId) return;
    try {
      if (visibleSet.has(resource.id)) {
        const r2 = await api(`/api/projects/${projectId}/visible-resources`);
        const pvr = (r2.visibleResources || []).find((v) => v.discoveredResourceId === resource.id);
        if (pvr) await api(`/api/projects/${projectId}/visible-resources/${pvr.id}`, {
          method: "PATCH", body: JSON.stringify({ visibilityStatus: "HIDDEN" }),
        });
        setVisibleSet((s) => { const n = new Set(s); n.delete(resource.id); return n; });
      } else {
        await api(`/api/projects/${projectId}/visible-resources`, {
          method: "POST", body: JSON.stringify({ discoveredResourceId: resource.id }),
        });
        setVisibleSet((s) => new Set([...s, resource.id]));
      }
      onAddToProject?.();
    } catch (err) {
      alert(err.message);
    }
  }

  function handleRegisterSuccess(result) {
    setRegisteringResource(null);
    setRegisterSuccess(result);
    loadAll(); // refresh to show new registration status
  }

  // Build a lookup: resourceId / ARN → logical tool registration info
  // Match on sourceDiscoveredResourceId or by deriving toolKey from resourceName
  const registrationMap = {};
  for (const ltd of logicalTools) {
    // Direct link via sourceDiscoveredResourceId stored in ETD (check env deployments)
    // Fallback: match by toolKey derivation from resource name
    registrationMap[toToolKey(ltd.toolKey)] = {
      toolKey: ltd.toolKey,
      approvalStatus: ltd.approvalStatus,
      ltdId: ltd.id,
    };
  }
  // Build resource → registration lookup by deriving key from name
  function getRegistration(resource) {
    const derived = toToolKey(resource.resourceName || resource.resourceId);
    return registrationMap[derived] || null;
  }

  const resourceTypes = ["ALL", ...new Set(resources.map((r) => r.resourceType))];
  const filtered = resources.filter((r) => {
    if (filterType !== "ALL" && r.resourceType !== filterType) return false;
    if (filterStatus !== "ALL" && r.discoveryStatus !== filterStatus) return false;
    return true;
  });

  // Group counts
  const typeCounts = {};
  for (const r of resources) typeCounts[r.resourceType] = (typeCounts[r.resourceType] || 0) + 1;

  const registerableCount = resources.filter((r) => REGISTERABLE_TYPES.has(r.resourceType)).length;
  const registeredCount = resources.filter((r) => REGISTERABLE_TYPES.has(r.resourceType) && !!getRegistration(r)).length;

  const headers = [
    "Resource", "Type", "ARN", "Region", "Status", "Tool Registry",
    ...(projectId ? ["Project"] : []),
  ];

  return (
    <div className="inventory-catalog">
      {/* Header */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0 }}>Discovered Resources</h3>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
            Account: <code>{connection.awsAccountId}</code> · {connection.accountName} · {connection.enabledRegions?.join(", ")}
          </p>
        </div>
        <div className="filters">
          {connection.lastSuccessfulSyncAt && (
            <span className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} />Last sync: {new Date(connection.lastSuccessfulSyncAt).toLocaleString()}
            </span>
          )}
          <button className="secondary" onClick={triggerSync} disabled={syncing}>
            <RefreshCw size={13} style={{ marginRight: 5, animation: syncing ? "spin 1s linear infinite" : "none" }} />
            {syncing ? "Scanning…" : "Sync Now"}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className={`validation-item ${syncMsg.startsWith("Sync failed") ? "fail" : "pass"}`} style={{ marginBottom: 10 }}>
          <span>{syncMsg}</span>
        </div>
      )}

      {/* Registration progress bar */}
      {registerableCount > 0 && (
        <div className="inv-reg-progress">
          <div className="inv-reg-progress-bar">
            <div
              className="inv-reg-progress-fill"
              style={{ width: `${Math.round((registeredCount / registerableCount) * 100)}%` }}
            />
          </div>
          <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {registeredCount} of {registerableCount} registerable resources in Org Tool Registry
          </span>
        </div>
      )}

      {/* Registration success banner */}
      {registerSuccess && (
        <div className="validation-item pass" style={{ marginBottom: 10, alignItems: "flex-start" }}>
          <CheckCircle2 size={14} style={{ marginTop: 2, flexShrink: 0, color: "var(--green)" }} />
          <div style={{ flex: 1 }}>
            <strong>
              <code>{registerSuccess.logicalToolDefinition?.toolKey}</code> submitted for approval
            </strong>
            <p style={{ margin: "3px 0 0", fontSize: 12 }}>
              {registerSuccess.approvalTasks?.length} approval task{registerSuccess.approvalTasks?.length !== 1 ? "s" : ""} created.
              Once approved, the tool can be deployed to any environment via the <strong>Tool Registry</strong> tab.
            </p>
          </div>
          <button
            className="secondary"
            style={{ padding: "2px 8px", fontSize: 11, flexShrink: 0 }}
            onClick={() => setRegisterSuccess(null)}
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Type filter chips */}
      <div className="inventory-type-summary">
        {Object.entries(typeCounts).map(([type, count]) => {
          const isRegisterable = REGISTERABLE_TYPES.has(type);
          return (
            <button
              key={type}
              className={`inv-type-chip ${filterType === type ? "active" : ""}`}
              onClick={() => setFilterType(filterType === type ? "ALL" : type)}
            >
              {TYPE_ICONS[type]}
              <span>{DISCOVERED_RESOURCE_TYPES[type]?.label || type}</span>
              <strong>{count}</strong>
              {isRegisterable && <span className="inv-chip-dot" title="Can be registered as org tool" />}
            </button>
          );
        })}
      </div>

      {/* Status filter */}
      <div className="filters" style={{ marginBottom: 10 }}>
        <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          {resourceTypes.map((t) => (
            <option key={t} value={t}>{t === "ALL" ? "All types" : DISCOVERED_RESOURCE_TYPES[t]?.label || t}</option>
          ))}
        </select>
        <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {Object.entries(DISCOVERY_STATUS).map(([v, m]) => (
            <option key={v} value={v}>{m.label}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value=""
          onChange={(e) => {
            if (e.target.value === "registerable") setFilterType("LAMBDA");
          }}
        >
          <option value="">All resources</option>
          <option value="registerable">Registerable only</option>
        </select>
      </div>

      {loading && <p className="muted">Loading resources…</p>}

      {!loading && filtered.length === 0 && (
        <div className="empty-state">
          No resources match the current filter.
          {resources.length === 0 && " Click Sync Now to scan the connected AWS account."}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              {headers.map((h) => <th key={h}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <ResourceRow
                key={r.id}
                resource={r}
                orgId={orgId}
                connection={connection}
                isVisible={visibleSet.has(r.id)}
                onToggleVisibility={() => toggleVisibility(r)}
                projectId={projectId}
                registrationInfo={getRegistration(r)}
                isRegisteringThis={registeringResource?.id === r.id}
                onRegisterClick={(res) => {
                  setRegisterSuccess(null);
                  setRegisteringResource(res);
                }}
                onRegisterSuccess={handleRegisterSuccess}
                onCancelRegister={() => setRegisteringResource(null)}
              />
            ))}
          </tbody>
        </table>
      )}

      {/* Sync history */}
      <details style={{ marginTop: 16 }}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Sync run history</summary>
        <SyncRunHistory orgId={orgId} connectionId={connection.id} />
      </details>
    </div>
  );
}
