import { Metric, Table, Status, LifecycleStepper } from "../shared/index.jsx";
import { titleCase } from "../../utils.js";

export default function AgentDetail({ agent, setScreen, setPlane }) {
  if (!agent) return <section className="panel"><div className="empty-state">Select an agent from the registry to view details.</div></section>;

  return (
    <div className="split">
      <section className="panel">
        <div className="detail-header inline">
          <div>
            <p className="eyebrow">Agent Registry Detail</p>
            <h2>{agent.name}</h2>
            <p>{agent.description || "No description provided."}</p>
          </div>
          <div className="filters">
            <button className="secondary" onClick={() => setScreen("agents")}>Back To Registry</button>
            <button className="primary" onClick={() => setPlane("execution")}>View Runs</button>
          </div>
        </div>

        <LifecycleStepper lifecycle={agent.lifecycle} />

        <div className="grid cols-3 compact">
          <Metric small label="Lifecycle" value={agent.lifecycle} detail={agent.deployment} />
          <Metric small label="Risk" value={agent.risk} detail={agent.runtime} />
          <Metric small label="Version" value={agent.version} detail={agent.model} />
        </div>
        <div className="metadata-row">
          <span className="pill">Owner: {agent.owner}</span>
          <span className="pill">Project: {agent.projectId}</span>
          <span className="pill">Memory: {agent.memory}</span>
        </div>
        <h2 style={{ marginTop: 18 }}>Resources</h2>
        <Table headers={["Type", "Requested", "Registry Policy"]}>
          <tr><td>Tools</td><td>{agent.tools.join(", ") || "None"}</td><td>Must exist in the selected project tool catalog before submission.</td></tr>
          <tr><td>Knowledge Bases</td><td>{agent.knowledge.join(", ") || "None"}</td><td>Must be attached to the selected project before submission.</td></tr>
        </Table>
      </section>

      <aside className="panel">
        <h2>Validation Findings</h2>
        <div className="validation-list">
          {(agent.validations || []).map((item, index) => (
            <div className={`validation-item ${item.status}`} key={index}>
              <strong>{item.status.toUpperCase()}</strong><span>{item.message}</span>
            </div>
          ))}
        </div>
        <h2 style={{ marginTop: 18 }}>Approval History</h2>
        <div className="validation-list">
          {(agent.approvals?.length
            ? agent.approvals
            : [{ decision: "pending", type: "workflow", approver: "Approval queue", comments: "No decisions recorded yet." }]
          ).map((item, index) => (
            <div className="approval-chip" key={index}>
              <span>{titleCase(item.type || item.decision)}</span>
              <strong>{titleCase(item.decision)} {item.approver ? `by ${item.approver}` : ""}</strong>
              <small>{item.comments}</small>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
