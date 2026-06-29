import { useState, useEffect } from "react";
import { RefreshCw, Database, Zap, Globe, Server, Wrench, CheckCircle2, AlertTriangle, Clock, Eye, EyeOff } from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api } from "../../utils.js";
import { DISCOVERED_RESOURCE_TYPES, DISCOVERY_STATUS } from "../../constants.js";

const TYPE_ICONS = {
  API_GATEWAY_REST:        <Globe size={13} />,
  API_GATEWAY_HTTP:        <Globe size={13} />,
  LAMBDA:                  <Zap size={13} />,
  AGENTCORE_GATEWAY:       <Server size={13} />,
  AGENTCORE_GATEWAY_TARGET:<Server size={13} />,
  AGENTCORE_GATEWAY_TOOL:  <Wrench size={13} />,
  BEDROCK_KB:              <Database size={13} />,
  BEDROCK_KB_DATA_SOURCE:  <Database size={13} />,
};

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

export default function InventoryCatalog({ orgId, connection, onAddToProject, projectId }) {
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [filterType, setFilterType] = useState("ALL");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [visibleSet, setVisibleSet] = useState(new Set());

  useEffect(() => {
    loadResources();
    if (projectId) loadVisibility();
  }, [orgId, projectId]);

  async function loadResources() {
    setLoading(true);
    try {
      const r = await api(`/api/organizations/${orgId}/discovered-resources`);
      setResources(r.resources || []);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }

  async function loadVisibility() {
    try {
      const r = await api(`/api/projects/${projectId}/visible-resources`);
      setVisibleSet(new Set((r.visibleResources || []).map((v) => v.discoveredResourceId)));
    } catch { /* offline */ }
  }

  async function triggerSync() {
    setSyncing(true); setSyncMsg("");
    try {
      const r = await api(`/api/organizations/${orgId}/account-connections/${connection.id}/sync`, { method: "POST" });
      setSyncMsg(`Sync complete — ${r.resourcesDiscovered} resources discovered.`);
      loadResources();
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
        // Find the pvr id via visible-resources endpoint and patch it
        const r2 = await api(`/api/projects/${projectId}/visible-resources`);
        const pvr = (r2.visibleResources || []).find((v) => v.discoveredResourceId === resource.id);
        if (pvr) await api(`/api/projects/${projectId}/visible-resources/${pvr.id}`, { method: "PATCH", body: JSON.stringify({ visibilityStatus: "HIDDEN" }) });
        setVisibleSet((s) => { const n = new Set(s); n.delete(resource.id); return n; });
      } else {
        await api(`/api/projects/${projectId}/visible-resources`, { method: "POST", body: JSON.stringify({ discoveredResourceId: resource.id }) });
        setVisibleSet((s) => new Set([...s, resource.id]));
      }
      onAddToProject?.();
    } catch (err) {
      alert(err.message);
    }
  }

  const resourceTypes = ["ALL", ...new Set(resources.map((r) => r.resourceType))];
  const filtered = resources.filter((r) => {
    if (filterType !== "ALL" && r.resourceType !== filterType) return false;
    if (filterStatus !== "ALL" && r.discoveryStatus !== filterStatus) return false;
    return true;
  });

  // Group by type for summary counts
  const typeCounts = {};
  for (const r of resources) typeCounts[r.resourceType] = (typeCounts[r.resourceType] || 0) + 1;

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

      {/* Type summary chips */}
      <div className="inventory-type-summary">
        {Object.entries(typeCounts).map(([type, count]) => (
          <button
            key={type}
            className={`inv-type-chip ${filterType === type ? "active" : ""}`}
            onClick={() => setFilterType(filterType === type ? "ALL" : type)}
          >
            {TYPE_ICONS[type]}<span>{DISCOVERED_RESOURCE_TYPES[type]?.label || type}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="filters" style={{ marginBottom: 10 }}>
        <select className="filter-select" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          {resourceTypes.map((t) => <option key={t} value={t}>{t === "ALL" ? "All types" : DISCOVERED_RESOURCE_TYPES[t]?.label || t}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {Object.entries(DISCOVERY_STATUS).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
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
        <Table headers={["Resource", "Type", "ARN", "Region", "Status", ...(projectId ? ["Project Visibility"] : [])]}>
          {filtered.map((r) => {
            const isVisible = visibleSet.has(r.id);
            let meta = {};
            try { meta = JSON.parse(r.metadataJson || "{}"); } catch { /* */ }
            return (
              <tr key={r.id}>
                <td>
                  <strong>{r.resourceName || r.resourceId}</strong>
                  {meta.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{meta.description}</span></>}
                </td>
                <td><ResourceTypeBadge type={r.resourceType} /></td>
                <td><code style={{ fontSize: 10, wordBreak: "break-all" }}>{r.resourceArn}</code></td>
                <td><span className="muted">{r.region}</span></td>
                <td><DiscoveryStatusBadge status={r.discoveryStatus} /></td>
                {projectId && (
                  <td>
                    <button
                      className={`vis-toggle-btn ${isVisible ? "vis-toggle-btn--visible" : ""}`}
                      onClick={() => toggleVisibility(r)}
                      title={isVisible ? "Remove from project" : "Add to project"}
                    >
                      {isVisible ? <><Eye size={12} /> Visible</> : <><EyeOff size={12} /> Hidden</>}
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </Table>
      )}

      {/* Sync history */}
      <details style={{ marginTop: 16 }}>
        <summary className="muted" style={{ cursor: "pointer", fontSize: 12 }}>Sync run history</summary>
        <SyncRunHistory orgId={orgId} connectionId={connection.id} />
      </details>
    </div>
  );
}
