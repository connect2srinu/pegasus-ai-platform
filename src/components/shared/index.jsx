import { ChevronRight } from "lucide-react";
import { statusClass, riskClass, titleCase } from "../../utils.js";
import { LIFECYCLE_STAGES, LIFECYCLE_STEP } from "../../constants.js";

export function Metric({ label, value, detail, small }) {
  return (
    <article className={`metric ${small ? "small" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function Status({ children }) {
  return <span className={`status ${statusClass(children)}`}>{children}</span>;
}

export function PlaneTabs({ plane, setPlane }) {
  return (
    <div className="plane-tabs" role="tablist" aria-label="Platform planes">
      {[["control", "Control Plane"], ["execution", "Execution Plane"], ["business", "Business User Plane"]].map(([id, label]) => (
        <button key={id} className={`plane-tab ${plane === id ? "active" : ""}`} onClick={() => setPlane(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function ApiBanner({ status, message }) {
  const tone = status === "connected" ? "green" : status === "offline" ? "amber" : "blue";
  return (
    <div className={`api-banner ${tone}`}>
      <strong>{status === "connected" ? "Live registry" : "Registry status"}</strong>
      <span>{message}</span>
    </div>
  );
}

export function Table({ headers, children }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ApproverBadge({ type }) {
  const color = ["platform_admin", "security"].includes(type) ? "red" : "blue";
  return <span className={`status ${color}`}>{titleCase(type)}</span>;
}

export function LifecycleStepper({ lifecycle }) {
  const current = LIFECYCLE_STEP[lifecycle] ?? 0;
  const isRejected = lifecycle === "Rejected";
  const isDraft = lifecycle === "Draft";

  return (
    <div className="lifecycle-stepper">
      {LIFECYCLE_STAGES.map((stage, i) => {
        const done = i < current && !isRejected;
        const active = i === current;
        const failed = active && (isRejected || isDraft);
        const label = i === 3 && isRejected ? "Rejected" : stage.label;
        return (
          <div key={stage.key} className={`step-node ${done ? "done" : active ? (failed ? "failed" : "active") : ""}`}>
            <div className="step-dot">{done ? "✓" : failed ? "✗" : i + 1}</div>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function WorkflowPipeline({ approvalTasks }) {
  const stages = [
    { key: "project_owner", label: "Business Owner", color: "amber" },
    { key: "tool_owner", label: "Tool Owner", color: "amber", conditional: true },
    { key: "data_owner", label: "Data Owner", color: "amber", conditional: true },
    { key: "platform_admin", label: "Platform Admin", color: "red" },
  ];

  const visibleStages = stages.filter((s) => !s.conditional || approvalTasks.some((t) => t.approverType === s.key));
  if (!visibleStages.length) return null;

  return (
    <div className="workflow-pipeline">
      {visibleStages.map((stage, i) => {
        const tasks = approvalTasks.filter((t) => t.approverType === stage.key);
        const pending = tasks.filter((t) => t.status === "pending").length;
        const approved = tasks.filter((t) => t.status === "approved").length;
        const rejected = tasks.filter((t) => t.status === "rejected").length;
        return (
          <div key={stage.key} className={`pipeline-stage border-${stage.color}`}>
            {stage.conditional && <span className="conditional-badge">Conditional</span>}
            <strong>{stage.label}</strong>
            <div className="stage-counts">
              {tasks.length === 0 && <span className="status gray">No tasks</span>}
              {pending > 0 && <span className="status blue">{pending} pending</span>}
              {approved > 0 && <span className="status green">{approved} approved</span>}
              {rejected > 0 && <span className="status red">{rejected} rejected</span>}
            </div>
            {i < visibleStages.length - 1 && <span className="pipeline-arrow"><ChevronRight size={14} /></span>}
          </div>
        );
      })}
    </div>
  );
}
