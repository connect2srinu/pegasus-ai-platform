import { useEffect, useState } from "react";
import { Metric, Table, Status } from "../shared/index.jsx";
import { riskClass, number, api } from "../../utils.js";
import { PlayCircle, Server, CheckCircle2 } from "lucide-react";

// ── CrewAI invocation panel ──────────────────────────────────────────────────

function CrewAIInvokePanel({ agent }) {
  const [payload, setPayload]         = useState('{\n  "query": "Process claim #CLM-20240101 for patient John Doe"\n}');
  const [busy, setBusy]               = useState(false);
  const [error, setError]             = useState("");
  const [lastResult, setLastResult]   = useState(null);
  const [invocations, setInvocations] = useState([]);
  const [deployment, setDeployment]   = useState(null);

  useEffect(() => {
    if (!agent?.id) return;
    // Load existing invocations and active deployment for this agent
    Promise.all([
      api(`/api/agents/${agent.id}/invocations`).catch(() => ({ invocations: [] })),
      api(`/api/agents/${agent.id}/deployments`).catch(() => ({ deployments: [] })),
    ]).then(([invRes, depRes]) => {
      setInvocations(invRes.invocations || []);
      const active = (depRes.deployments || []).find((d) => d.deploymentStatus === "deployed");
      setDeployment(active || null);
    });
  }, [agent?.id]);

  async function invoke() {
    let parsed;
    try { parsed = JSON.parse(payload); } catch { setError("Invalid JSON payload."); return; }
    setBusy(true); setError("");
    try {
      const res = await api(`/api/agents/${agent.id}/invoke`, {
        method: "POST",
        body: JSON.stringify({ inputs: parsed, invokedBy: "current-user@example.com" }),
      });
      setLastResult(res);
      setInvocations((prev) => [res.invocation, ...prev]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const isDeployed = !!deployment;

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="detail-header inline">
        <div>
          <p className="eyebrow">CrewAI AgentCore Runtime</p>
          <h2>Invoke Agent</h2>
          <p style={{ margin: 0, fontSize: 13 }}>
            Route requests directly to the deployed AgentCore runtime via the platform invocation service.
          </p>
        </div>
        {isDeployed && (
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
              <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--green)" }}>Runtime active</span>
            </div>
            <code style={{ fontSize: 10, color: "var(--muted)", display: "block", marginTop: 2 }}>
              {deployment.runtimeArn}
            </code>
          </div>
        )}
      </div>

      {!isDeployed && (
        <div className="validation-item warn" style={{ marginBottom: 16 }}>
          <Server size={14} />
          <span>No active deployment found for this agent. Deploy an approved version from the Agent Detail → Deployment tab first.</span>
        </div>
      )}

      {isDeployed && (
        <>
          <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
            <div style={{ flex: 1 }}>
              <label className="field">
                Input payload (JSON)
                <textarea
                  value={payload}
                  onChange={(e) => setPayload(e.target.value)}
                  rows={6}
                  style={{ fontFamily: "monospace", fontSize: 12 }}
                />
              </label>
            </div>
            <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 8 }}>
              <div className="dep-meta-row"><span style={{ width: 80 }}>Agent</span><code>{agent.name}</code></div>
              <div className="dep-meta-row"><span style={{ width: 80 }}>Runtime</span><code style={{ fontSize: 10, wordBreak: "break-all" }}>{deployment.runtimeId}</code></div>
              <div className="dep-meta-row"><span style={{ width: 80 }}>Region</span><code>{deployment.region}</code></div>
              <div className="dep-meta-row"><span style={{ width: 80 }}>Model acct</span><code>{deployment.modelAccountId}</code></div>
            </div>
          </div>

          {error && (
            <div className="validation-item fail" style={{ margin: "8px 0" }}>
              <strong>ERROR</strong><span>{error}</span>
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
            <span className="muted" style={{ fontSize: 12 }}>
              Invocation is routed to the AgentCore runtime ARN via the platform invocation service. No credentials are passed.
            </span>
            <button className="primary" onClick={invoke} disabled={busy}>
              <PlayCircle size={14} style={{ marginRight: 6 }} />
              {busy ? "Invoking…" : "Invoke agent"}
            </button>
          </div>

          {lastResult && (
            <div className="invoke-result">
              <div className="invoke-result-header">
                <CheckCircle2 size={14} style={{ color: "var(--green)" }} />
                <strong>Invocation successful</strong>
                <span className="muted" style={{ marginLeft: "auto", fontSize: 11 }}>
                  Run ID: {lastResult.runId}
                </span>
              </div>
              <pre className="invoke-result-body">{JSON.stringify(lastResult.output, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {invocations.length > 0 && (
        <>
          <h2 style={{ marginTop: 20 }}>Invocation history</h2>
          <Table headers={["Run ID", "Invoked by", "Status", "Tokens", "Duration", "Started"]}>
            {invocations.slice(0, 10).map((inv) => (
              <tr key={inv.id}>
                <td><code style={{ fontSize: 11 }}>{inv.id}</code></td>
                <td>{inv.invokedBy}</td>
                <td><Status>{inv.status}</Status></td>
                <td>
                  {number(inv.inputTokens + inv.outputTokens)}
                  <br /><span className="muted" style={{ fontSize: 11 }}>{number(inv.inputTokens)} in / {number(inv.outputTokens)} out</span>
                </td>
                <td>{inv.durationMs ? `${(inv.durationMs / 1000).toFixed(1)}s` : "—"}</td>
                <td><span className="muted">{inv.startedAt ? new Date(inv.startedAt).toLocaleTimeString() : "—"}</span></td>
              </tr>
            ))}
          </Table>
        </>
      )}
    </section>
  );
}

// ── Main Execution Plane ─────────────────────────────────────────────────────

export default function ExecutionPlane({ project, agents, selectedAgentId, setSelectedAgentId, selectedRunId, setSelectedRunId }) {
  const agent = agents.find((a) => a.id === selectedAgentId) || agents[0];
  const run   = agent?.runs.find((r) => r.id === selectedRunId) || agent?.runs[0];
  const isCrewAI = agent?.agentType === "crewai";

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
                <span>
                  <strong>{a.name}</strong>
                  <small>{a.runtime} / {a.model}</small>
                  {a.agentType === "crewai" && <small style={{ color: "var(--blue)" }}>CrewAI · External package</small>}
                </span>
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
              <p>{agent.lifecycle}. Uses {agent.model || "—"}, {agent.tools.length} tools, {agent.knowledge.length} knowledge sources, and {agent.memory.toLowerCase()} memory.</p>
            </div>
            <span className={`risk ${riskClass(agent.risk)}`}>{agent.risk}</span>
          </div>
          <div className="grid cols-3 compact">
            <Metric small label="Tokens 24h" value={number(agent.tokens24h)} detail={agent.cost24h} />
            <Metric small label="Success rate" value={agent.successRate} detail={`${agent.runs.length} recent runs`} />
            <Metric small label="Model" value={agent.model || "—"} detail={agent.runtime} />
          </div>
          <div className="metadata-row">
            <span className="pill">Tools: {agent.tools.join(", ") || "None"}</span>
            <span className="pill">Knowledge: {agent.knowledge.join(", ") || "None"}</span>
            <span className="pill">Memory: {agent.memory}</span>
          </div>

          {!isCrewAI && (
            <>
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
            </>
          )}
        </section>
      </div>

      {/* CrewAI agents: invocation panel replaces the run detail panel */}
      {isCrewAI && <CrewAIInvokePanel agent={agent} />}

      {/* Non-CrewAI: run detail panel */}
      {!isCrewAI && run && (
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
            <Metric small label="Input tokens"  value={number(run.inputTokens)}  detail="Prompt and context" />
            <Metric small label="Output tokens" value={number(run.outputTokens)} detail="Generated answer" />
            <Metric small label="Total tokens"  value={number(run.inputTokens + run.outputTokens)} detail={run.status} />
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
