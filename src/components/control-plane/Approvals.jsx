import { useState } from "react";
import { Table, Status, ApproverBadge, WorkflowPipeline } from "../shared/index.jsx";
import { api, riskClass, titleCase } from "../../utils.js";

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
