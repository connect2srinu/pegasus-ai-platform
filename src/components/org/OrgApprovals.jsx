import { useState, useEffect, useCallback } from "react";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Zap, Globe, Database, Wrench, ChevronDown, ChevronRight,
} from "lucide-react";
import { api, titleCase } from "../../utils.js";

// ── helpers ───────────────────────────────────────────────────────────────────

const APPROVER_LABELS = {
  org_admin:      "Org Admin",
  platform_admin: "Platform Admin",
  security:       "Security",
  tool_owner:     "Tool Owner",
  data_owner:     "Data Owner",
};

const SOURCE_ICONS = {
  LAMBDA:      <Zap size={13} />,
  API_GATEWAY: <Globe size={13} />,
  BEDROCK_KB:  <Database size={13} />,
  MCP:         <Wrench size={13} />,
};

const SIDE_EFFECT_COLOR = {
  READ_ONLY:   "green",
  WRITE:       "amber",
  DESTRUCTIVE: "red",
};

function ApproverBadge({ type }) {
  const label = APPROVER_LABELS[type] || type;
  const colorMap = {
    platform_admin: "blue",
    org_admin:      "violet",
    security:       "red",
    tool_owner:     "green",
    data_owner:     "amber",
  };
  const color = colorMap[type] || "gray";
  return (
    <span className={`approver-badge approver-badge--${color}`}>{label}</span>
  );
}

function StatusIcon({ status }) {
  if (status === "approved") return <CheckCircle2 size={14} style={{ color: "var(--green)" }} />;
  if (status === "rejected") return <XCircle size={14} style={{ color: "var(--red)" }} />;
  return <Clock size={14} style={{ color: "var(--amber)" }} />;
}

// ── Tool registration task card ───────────────────────────────────────────────

function ToolRegistrationCard({ task, onDecide }) {
  const [expanded, setExpanded] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const ltd = task._ltd;
  const trr = task._trr;
  const isPending = task.status === "pending";
  const sideEffect = ltd?.sideEffectLevel || trr?.sideEffectLevel;
  const sideColor = SIDE_EFFECT_COLOR[sideEffect] || "muted";

  async function decide(decision) {
    setBusy(true);
    try {
      const result = await api(`/api/approvals/${task.id}/decision`, {
        method: "POST",
        body: JSON.stringify({
          decision,
          comments: comment,
          approver: "platform-admin@example.com",
        }),
      });
      onDecide(result);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`org-approval-card ${isPending ? "org-approval-card--pending" : task.status === "approved" ? "org-approval-card--approved" : "org-approval-card--rejected"}`}>
      {/* Card header — always visible */}
      <div className="org-approval-card-header" onClick={() => setExpanded((v) => !v)}>
        <StatusIcon status={task.status} />

        <div className="org-approval-card-meta">
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <strong>{ltd?.displayName || task.resourceName}</strong>
            <code className="muted" style={{ fontSize: 11 }}>{ltd?.toolKey || trr?.requestedToolName}</code>
            {sideEffect && (
              <span className={`pill pill--${sideColor}`} style={{ fontSize: 10 }}>
                {sideEffect.replace(/_/g, " ")}
              </span>
            )}
            {ltd?.sourceType && (
              <span className="pill" style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                {SOURCE_ICONS[ltd.sourceType]}{ltd.sourceType.replace(/_/g, " ")}
              </span>
            )}
          </div>
          <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
            {ltd?.description || trr?.requestedDescription || "No description."}
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <ApproverBadge type={task.approverType} />
          <span className={`pill ${task.status === "approved" ? "pill--green" : task.status === "rejected" ? "pill--red" : "pill--amber"}`} style={{ fontSize: 10 }}>
            {task.status.toUpperCase()}
          </span>
          {task.riskTier && (
            <span className={`risk risk-${task.riskTier === "high" || task.riskTier === "critical" ? "high" : task.riskTier === "medium" ? "medium" : "low"}`}>
              {task.riskTier}
            </span>
          )}
          <button className="icon-btn">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Expanded detail + actions */}
      {expanded && (
        <div className="org-approval-card-body">
          {/* What the approver is being asked to review */}
          <div className="org-approval-detail-grid">
            <div>
              <p className="field-label">Tool details</p>
              <table className="otr-info-table">
                <tbody>
                  <tr><td className="muted">Tool key</td><td><code>{ltd?.toolKey || "—"}</code></td></tr>
                  <tr><td className="muted">Source type</td><td>{ltd?.sourceType || trr?.sourceResourceType || "—"}</td></tr>
                  <tr><td className="muted">Side-effect level</td><td>
                    <span className={`pill pill--${sideColor}`} style={{ fontSize: 10 }}>{sideEffect?.replace(/_/g, " ")}</span>
                  </td></tr>
                  <tr><td className="muted">Data classification</td><td>{ltd?.dataClassification || trr?.dataClassification || "—"}</td></tr>
                  <tr><td className="muted">Business owner</td><td>{ltd?.businessOwner || trr?.businessOwner || "—"}</td></tr>
                  <tr><td className="muted">Requested by</td><td>{trr?.requestedBy || "—"}</td></tr>
                  {trr?.sourceResourceArn && (
                    <tr>
                      <td className="muted">Source ARN</td>
                      <td><code style={{ fontSize: 10, wordBreak: "break-all" }}>{trr.sourceResourceArn}</code></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <p className="field-label">Validation results</p>
              {trr?.validationResultsJson ? (
                <div className="org-approval-validations">
                  {JSON.parse(trr.validationResultsJson).map((v, i) => (
                    <div key={i} className={`validation-item ${v.status === "pass" ? "pass" : v.status === "warn" ? "warn" : "fail"}`} style={{ marginBottom: 4 }}>
                      <strong style={{ textTransform: "uppercase", fontSize: 10 }}>{v.status}</strong>
                      <span style={{ fontSize: 12 }}>{v.message}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted" style={{ fontSize: 12 }}>No validation results.</p>
              )}

              <p className="field-label" style={{ marginTop: 14 }}>Approval reason</p>
              <p style={{ fontSize: 12, color: "var(--ink)" }}>{task.reason}</p>
            </div>
          </div>

          {/* Decision actions */}
          {isPending && (
            <div className="org-approval-action-bar">
              <input
                className="comment-input"
                placeholder="Reviewer comment (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="danger"
                onClick={() => decide("rejected")}
                disabled={busy}
              >
                <XCircle size={13} style={{ marginRight: 5 }} />Reject
              </button>
              <button
                className="primary"
                onClick={() => decide("approved")}
                disabled={busy}
              >
                <CheckCircle2 size={13} style={{ marginRight: 5 }} />
                {busy ? "Saving…" : "Approve"}
              </button>
            </div>
          )}

          {!isPending && (
            <div className="org-approval-decided">
              <StatusIcon status={task.status} />
              <span>
                {task.decision === "approved" ? "Approved" : "Rejected"} by <strong>{task.approver || "—"}</strong>
                {task.decidedAt && ` · ${new Date(task.decidedAt).toLocaleString()}`}
              </span>
              {task.comments && <span className="muted">· "{task.comments}"</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main OrgApprovals ─────────────────────────────────────────────────────────

export default function OrgApprovals({ org }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`/api/approvals?organizationId=${org.id}&scope=org`);
      setTasks(r.approvalTasks || []);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }, [org.id]);

  useEffect(() => { load(); }, [load]);

  function handleDecide(result) {
    // Optimistically update the task in state, then reload
    const decided = result.approvalTask;
    setTasks((prev) => prev.map((t) => t.id === decided.id ? { ...t, ...decided } : t));
    // If all tasks for a TRR are now approved, the LTD was promoted — refresh
    load();
  }

  const filtered = tasks.filter((t) => statusFilter === "all" || t.status === statusFilter);
  const pendingCount = tasks.filter((t) => t.status === "pending").length;

  // Group by TRR so related tasks (org_admin + platform_admin) are together
  const byTrr = {};
  for (const t of filtered) {
    const key = t.toolRegistrationRequestId || t.id;
    if (!byTrr[key]) byTrr[key] = { trr: t._trr, ltd: t._ltd, tasks: [] };
    byTrr[key].tasks.push(t);
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Org-Level Approvals</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Approve or reject tool registration requests for this organization.
            Once all stages approve, the tool becomes active and can be deployed to environments.
          </p>
        </div>
        <button className="secondary" onClick={load}>
          <RefreshCw size={13} style={{ marginRight: 5 }} />Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="filters" style={{ marginBottom: 16 }}>
        {[
          ["pending", "Pending", pendingCount],
          ["approved", "Approved", null],
          ["rejected", "Rejected", null],
          ["all", "All", tasks.length],
        ].map(([k, label, count]) => (
          <button
            key={k}
            className={`secondary ${statusFilter === k ? "active" : ""}`}
            style={statusFilter === k ? { background: "var(--surface-active)", fontWeight: 600 } : {}}
            onClick={() => setStatusFilter(k)}
          >
            {label}
            {count != null && count > 0 && (
              <span className={`pill ${k === "pending" ? "pill--amber" : "pill--muted"}`} style={{ marginLeft: 5, fontSize: 10, padding: "1px 5px" }}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Loading approval queue…</p>}

      {!loading && tasks.length === 0 && (
        <div className="empty-state" style={{ border: "1px dashed var(--border)" }}>
          <CheckCircle2 size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
          <strong>No org-level approval tasks</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            When you register a tool from the Connected Accounts page, approval tasks appear here.
          </p>
        </div>
      )}

      {!loading && tasks.length > 0 && filtered.length === 0 && (
        <div className="empty-state">
          <p className="muted">No {statusFilter} tasks.</p>
          <button className="secondary" onClick={() => setStatusFilter("all")}>Show all</button>
        </div>
      )}

      {/* Group tasks by TRR */}
      <div className="org-approvals-list">
        {Object.values(byTrr).map((group) => (
          <div key={group.tasks[0].toolRegistrationRequestId || group.tasks[0].id} className="org-approval-group">
            {group.tasks.length > 1 && (
              <div className="org-approval-group-label">
                <span className="muted" style={{ fontSize: 11 }}>
                  {group.tasks.length} approval stages for{" "}
                  <strong>{group.ltd?.toolKey || group.trr?.requestedToolName || "tool"}</strong>
                </span>
                <div className="org-approval-stage-dots">
                  {group.tasks.map((t) => (
                    <div
                      key={t.id}
                      className={`org-approval-stage-dot org-approval-stage-dot--${t.status === "approved" ? "approved" : t.status === "rejected" ? "rejected" : "pending"}`}
                      title={`${APPROVER_LABELS[t.approverType] || t.approverType}: ${t.status}`}
                    />
                  ))}
                </div>
              </div>
            )}
            {group.tasks.map((t) => (
              <ToolRegistrationCard key={t.id} task={t} onDecide={handleDecide} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
