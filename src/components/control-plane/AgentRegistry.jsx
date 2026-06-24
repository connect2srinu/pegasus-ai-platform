import { Table, Status } from "../shared/index.jsx";
import { riskClass } from "../../utils.js";

export default function AgentRegistry({ agents, setScreen, selectAgent }) {
  return (
    <section className="panel">
      <div className="toolbar">
        <div className="filters">
          <input aria-label="Search agents" placeholder="Search agents" />
          <select><option>All lifecycle states</option></select>
          <select><option>All runtimes</option></select>
          <select><option>All risk tiers</option></select>
        </div>
        <div className="filters">
          <button className="secondary" onClick={() => setScreen("author")}>Author Agent</button>
          <button className="primary" onClick={() => setScreen("register")}>Register Agent</button>
        </div>
      </div>
      <Table headers={["Agent", "Version", "Runtime", "Lifecycle", "Deployment", "Risk", "Owner"]}>
        {agents.map((agent) => (
          <tr key={agent.id}>
            <td>
              <button className="link-button strong-link" onClick={() => { selectAgent(agent.id); setScreen("agentDetail"); }}>
                {agent.name}
              </button>
              <br /><span className="muted">{agent.id}</span>
            </td>
            <td>{agent.version}</td>
            <td>{agent.runtime}</td>
            <td><Status>{agent.lifecycle}</Status></td>
            <td><Status>{agent.deployment}</Status></td>
            <td><span className={`risk ${riskClass(agent.risk)}`}>{agent.risk}</span></td>
            <td>{agent.owner}</td>
          </tr>
        ))}
      </Table>
    </section>
  );
}
