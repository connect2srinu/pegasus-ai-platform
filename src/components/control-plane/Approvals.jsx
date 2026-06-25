import { useState } from "react";
import { Package, ChevronDown, ChevronRight } from "lucide-react";
import { Table, Status, ApproverBadge, WorkflowPipeline } from "../shared/index.jsx";
import { api, riskClass, titleCase } from "../../utils.js";
import { PACKAGE_SOURCE_TYPES } from "../../constants.js";

function CrewAIPackageSummary({ task }) {
  const [open, setOpen] = useState(false);
  const meta = task.packageMetadata;
  if (!meta) return null;

  return (
    <div className="approval-pkg-summary">
      <button type="button" className="approval-pkg-toggle" onClick={() => setOpen((v) => !v)}>
        <Package size={13} />
        <span>CrewAI package details</span>
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
      </button>
      {open && (
        <div className="approval-pkg-body">
          {meta.packageSourceType && (
            <div className="approval-pkg-row">
              <span>Source</span>
              <code>{PACKAGE_SOURCE_TYPES[meta.packageSourceType]?.label || meta.packageSourceType}</code>
            </div>
          )}
          {meta.packageLocation && (
            <div className="approval-pkg-row">
              <span>Location</span>
              <code>{meta.packageLocation}</code>
            </div>
          )}
          {meta.entryPoint && (
            <div className="approval-pkg-row">
              <span>Entry point</span>
              <code>{meta.entryPoint} :: {meta.entryFunction || "handler"}</code>
            </div>
          )}
          {meta.pythonVersion && (
            <div className="approval-pkg-row">
              <span>Python</span>
              <code>{meta.pythonVersion}</code>
            </div>
          )}
          {meta.declaredDependencies?.length > 0 && (
            <div className="approval-pkg-row approval-pkg-row--deps">
              <span>Dependencies ({meta.declaredDependencies.length})</span>
              <div className="dep-list dep-list--compact">
                {meta.declaredDependencies.slice(0, 6).map((d, i) => (
                  <span key={i} className="dep-item"><code>{d}</code></span>
                ))}
                {meta.declaredDependencies.length > 6 && (
                  <span className="muted" style={{ fontSize: 11 }}>+{meta.declaredDependencies.length - 6} more</span>
                )}
              </div>
            </div>
          )}
          {task.validationSummary && (
            <div className="approval-pkg-row">
              <span>Validation</span>
              <span className={`status ${task.validationSummary === "passed" ? "green" : task.validationSummary === "failed" ? "red" : "blue"}`}>
                {titleCase(task.validationSummary.replace(/_/g, " "))}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Approvals({ approvalTasks, refreshApprovals, refreshAgents }) {
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
              <br /><span className="muted">{task.projectId}</span>
              {task.resourceType && <><br /><span className="pill" style={{ marginTop: 4 }}>{titleCase(task.resourceType)}</span></>}
              {task.agentType === "crewai" && <><br /><span className="pill" style={{ marginTop: 4, background: "var(--blue-light, #eff6ff)", color: "var(--blue, #2563eb)" }}>CrewAI package</span></>}
              <CrewAIPackageSummary task={task} />
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
