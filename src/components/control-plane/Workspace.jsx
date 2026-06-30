import { Metric, Table, Status } from "../shared/index.jsx";
import { fallback } from "../../constants.js";

export default function Workspace({ project, agents, setScreen }) {
  const projectName = typeof project === "object" ? project?.name : project;
  const summaryData = fallback[projectName] || fallback[Object.keys(fallback)[0]];
  const summary = summaryData?.summary || { approvedAgents: 0, reviewAgents: 0, runs24h: 0, failedRuns: 0, policyPass: 0, approvals: 0, blocked: 0 };
  return (
    <>
      <div className="grid cols-3">
        <Metric label="Approved agents" value={summary.approvedAgents} detail={`${summary.reviewAgents} in review`} />
        <Metric label="Runs last 24h" value={summary.runs24h} detail={`${summary.failedRuns} failed, ${summary.policyPass} policy pass`} />
        <Metric label="Pending approvals" value={summary.approvals} detail={`${summary.blocked} blocked by policy`} />
      </div>
      <div className="split" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="toolbar">
            <h2>Project Agents</h2>
            <div className="filters">
              <button className="secondary" onClick={() => setScreen("author")}>Author Agent</button>
              <button className="primary" onClick={() => setScreen("register")}>Register Agent</button>
            </div>
          </div>
          <Table headers={["Agent", "Runtime", "Version", "Status", "Last Run"]}>
            {agents.map((agent) => (
              <tr key={agent.id}>
                <td><strong>{agent.name}</strong><br /><span className="muted">{agent.owner}</span></td>
                <td>{agent.runtime}</td>
                <td>{agent.version}</td>
                <td><Status>{agent.deployment}</Status></td>
                <td>{agent.lastRun}</td>
              </tr>
            ))}
          </Table>
        </section>
        <section className="panel">
          <h2>Architecture Bands</h2>
          <div className="architecture-bands">
            {[
              ["Control Plane", ["Agent Registry", "Policy Engine", "Approvals", "Audit"]],
              ["Execution Plane", ["AgentCore Runtime", "AgentCore Gateway", "Bedrock", "Memory"]],
              ["Business User Plane", ["Project Workspace", "Runnable Agents", "Run History", "Settings"]],
            ].map(([title, items]) => (
              <div className="band" key={title}>
                <h3>{title}</h3>
                <div className="band-row">
                  {items.map((item) => (
                    <div className="component" key={item}><strong>{item}</strong><span>Policy governed</span></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
