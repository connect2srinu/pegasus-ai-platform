import { Status } from "../shared/index.jsx";

export default function BusinessPlane({ project, agents, setPlane, setSelectedAgentId }) {
  const runnable = agents.filter((a) => a.deployment.toLowerCase().includes("deployed") || a.lifecycle.toLowerCase().includes("approved"));

  return (
    <>
      <div className="detail-header">
        <div>
          <p className="eyebrow">Business user workspace</p>
          <h2>{project}</h2>
          <p>Business users see only agents approved and runnable for the current project.</p>
        </div>
        <button className="primary" onClick={() => setPlane("execution")}>View Execution Runs</button>
      </div>
      <section className="panel">
        <h2>Runnable Agents</h2>
        <div className="card-grid">
          {runnable.map((agent) => (
            <article className="run-card" key={agent.id}>
              <div>
                <h3>{agent.name}</h3>
                <p>{agent.model}. Tools: {agent.tools.join(", ")}.</p>
              </div>
              <button className="primary" onClick={() => { setSelectedAgentId(agent.id); setPlane("execution"); }}>Open</button>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
