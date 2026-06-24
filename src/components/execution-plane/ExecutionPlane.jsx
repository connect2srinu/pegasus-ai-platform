import { useEffect } from "react";
import { Metric, Table, Status } from "../shared/index.jsx";
import { riskClass, number } from "../../utils.js";

export default function ExecutionPlane({ project, agents, selectedAgentId, setSelectedAgentId, selectedRunId, setSelectedRunId }) {
  const agent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const run = agent?.runs.find((r) => r.id === selectedRunId) || agent?.runs[0];

  useEffect(() => {
    if (agent && !agent.runs.find((r) => r.id === selectedRunId)) setSelectedRunId(agent.runs[0]?.id || "");
  }, [agent?.id]);

  if (!agent) return <div className="empty-state">No agents are registered for this project.</div>;

  return (
    <>
      <div className="grid cols-3">
        <Metric label="Execution agents" value={agents.length} detail={project} />
        <Metric label="Tokens last 24h" value={number(agents.reduce((sum, a) => sum + a.tokens24h, 0))} detail="Across registered agents" />
        <Metric label="Selected agent" value={agent.name} detail={`${agent.runtime} / ${agent.deployment}`} />
      </div>

      <div className="execution-layout">
        <section className="panel">
          <div className="toolbar"><h2>Available Agents</h2><span className="pill">{project}</span></div>
          <div className="agent-list">
            {agents.map((a) => (
              <button
                className={`agent-card ${a.id === agent.id ? "active" : ""}`}
                key={a.id}
                onClick={() => { setSelectedAgentId(a.id); setSelectedRunId(a.runs[0]?.id || ""); }}
              >
                <span><strong>{a.name}</strong><small>{a.runtime} / {a.model}</small></span>
                <Status>{a.deployment}</Status>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="detail-header inline">
            <div>
              <p className="eyebrow">Agent runtime detail</p>
              <h2>{agent.name}</h2>
              <p>{agent.lifecycle}. Uses {agent.model}, {agent.tools.length} tools, {agent.knowledge.length} knowledge sources, and {agent.memory.toLowerCase()} memory.</p>
            </div>
            <span className={`risk ${riskClass(agent.risk)}`}>{agent.risk}</span>
          </div>
          <div className="grid cols-3 compact">
            <Metric small label="Tokens 24h" value={number(agent.tokens24h)} detail={agent.cost24h} />
            <Metric small label="Success rate" value={agent.successRate} detail={`${agent.runs.length} recent runs`} />
            <Metric small label="Model" value={agent.model} detail={agent.runtime} />
          </div>
          <div className="metadata-row">
            <span className="pill">Tools: {agent.tools.join(", ") || "None"}</span>
            <span className="pill">Knowledge: {agent.knowledge.join(", ") || "None"}</span>
            <span className="pill">Memory: {agent.memory}</span>
          </div>
          <h2 style={{ marginTop: 18 }}>Runs</h2>
          {agent.runs.length ? (
            <Table headers={["Run", "User", "Status", "Tokens", "Model", "Tools"]}>
              {agent.runs.map((r) => (
                <tr className={r.id === selectedRunId ? "selected-row" : ""} key={r.id}>
                  <td><button className="link-button" onClick={() => setSelectedRunId(r.id)}>{r.id}</button><br /><span className="muted">{r.started}</span></td>
                  <td>{r.user}</td>
                  <td><Status>{r.status}</Status></td>
                  <td>{number(r.inputTokens + r.outputTokens)}<br /><span className="muted">{number(r.inputTokens)} in / {number(r.outputTokens)} out</span></td>
                  <td>{r.model}</td>
                  <td>{r.tools.join(", ")}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <div className="empty-state">No runs available yet for this agent.</div>
          )}
        </section>
      </div>

      {run && (
        <section className="panel run-panel">
          <div className="detail-header inline">
            <div>
              <p className="eyebrow">Run detail</p>
              <h2>{run.id}</h2>
              <p>{agent.name} run by {run.user}. Duration {run.duration}. Model {run.model}. Tools used: {run.tools.join(", ") || "none"}.</p>
            </div>
            <div className="filters">
              <button className="secondary">Open in Arize</button>
              <button className="secondary">View Audit Events</button>
              <button className="primary">Export Trace</button>
            </div>
          </div>
          <div className="grid cols-3 compact">
            <Metric small label="Input tokens" value={number(run.inputTokens)} detail="Prompt and context" />
            <Metric small label="Output tokens" value={number(run.outputTokens)} detail="Generated answer" />
            <Metric small label="Total tokens" value={number(run.inputTokens + run.outputTokens)} detail={run.status} />
          </div>
          <div className="timeline" style={{ marginTop: 16 }}>
            {["Runtime authorization", "Model invocation", "Tool gateway", "Final response"].map((step, i) => (
              <div className="timeline-item" key={step}>
                <time>{i * 3}.0s</time>
                <div><strong>{step}</strong><br /><span>{step} completed for {run.id}</span></div>
                <Status>{run.status === "Success" ? "OK" : run.status}</Status>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
