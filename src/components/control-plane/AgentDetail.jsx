import { useState, useEffect } from "react";
import { Metric, Table, Status, LifecycleStepper } from "../shared/index.jsx";
import { titleCase, api } from "../../utils.js";
import { PACKAGE_SOURCE_TYPES } from "../../constants.js";
import PackageValidationResults from "./PackageValidationResults.jsx";
import DeploymentStatus from "./DeploymentStatus.jsx";
import { PromoteToProductionPanel } from "./Tools.jsx";

function AgentInvokePanel({ agent }) {
  const [input, setInput]     = useState("");
  const [output, setOutput]   = useState(null);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState("");
  const [history, setHistory] = useState([]);

  async function invoke() {
    if (!input.trim()) return;
    setBusy(true); setError(""); setOutput(null);
    try {
      const res = await api(`/api/agents/${agent.id}/invoke`, {
        method: "POST",
        body: JSON.stringify({ message: input }),
      });
      setOutput(res);
      setHistory((h) => [{ input, output: res.output, latencyMs: res.latencyMs }, ...h].slice(0, 10));
      setInput("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h2>Test / Invoke</h2>
      <p className="muted" style={{ marginBottom: 14 }}>Send a message to the deployed agent and see its response.</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          style={{ flex: 1, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }}
          placeholder="Type a message to the agent…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && invoke()}
          disabled={busy}
        />
        <button className="primary" onClick={invoke} disabled={busy || !input.trim()}>
          {busy ? "Invoking…" : "Send →"}
        </button>
      </div>

      {error && (
        <div className="validation-item fail" style={{ marginBottom: 10 }}>
          <strong>ERROR</strong><span>{error}</span>
        </div>
      )}

      {output && (
        <div className="dep-card dep-card--deployed" style={{ marginBottom: 16 }}>
          <div className="dep-meta-grid">
            <div className="dep-meta-row"><span>Response</span><span style={{ whiteSpace: "pre-wrap" }}>{output.output}</span></div>
            <div className="dep-meta-row"><span>Latency</span><code>{output.latencyMs} ms</code></div>
            <div className="dep-meta-row"><span>Model</span><code>{output.model}</code></div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          <h3 style={{ marginTop: 16, marginBottom: 8, fontSize: 13 }}>Recent invocations</h3>
          {history.map((h, i) => (
            <div key={i} style={{ borderLeft: "3px solid var(--border)", paddingLeft: 12, marginBottom: 10 }}>
              <p style={{ margin: "0 0 2px", fontSize: 12, color: "var(--text-muted)" }}>
                <strong>You:</strong> {h.input}
              </p>
              <p style={{ margin: "0 0 2px", fontSize: 12 }}>
                <strong>Agent:</strong> {h.output}
              </p>
              <span className="muted" style={{ fontSize: 11 }}>{h.latencyMs} ms</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function MetaRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="pkg-meta-row">
      <span className="pkg-meta-label">{label}</span>
      <code className="pkg-meta-value">{value}</code>
    </div>
  );
}

function PackageInfoPanel({ version }) {
  if (!version?.package) {
    return <p className="muted">No package information available for this agent version.</p>;
  }
  const pkg = version.package;
  const sourceLabel = PACKAGE_SOURCE_TYPES[pkg.packageSourceType]?.label || pkg.packageSourceType || "—";

  return (
    <div className="pkg-info-panel">
      <div className="pkg-info-block">
        <h3>Package source</h3>
        <MetaRow label="Source type"  value={sourceLabel} />
        <MetaRow label="Location"     value={pkg.packageLocation} />
        <MetaRow label="Checksum"     value={pkg.checksum} />
        <MetaRow label="Uploaded at"  value={pkg.uploadedAt ? new Date(pkg.uploadedAt).toLocaleString() : null} />
      </div>
      <div className="pkg-info-block">
        <h3>Runtime</h3>
        <MetaRow label="Entry point"     value={pkg.entryPoint} />
        <MetaRow label="Entry function"  value={pkg.entryFunction} />
        <MetaRow label="Runtime command" value={pkg.runtimeCommand} />
        <MetaRow label="Python version"  value={pkg.pythonVersion ? `Python ${pkg.pythonVersion}` : null} />
        <MetaRow label="Dependency file" value={pkg.dependencyFile} />
      </div>
      {pkg.declaredDependencies?.length > 0 && (
        <div className="pkg-info-block">
          <h3>Declared dependencies ({pkg.declaredDependencies.length})</h3>
          <div className="dep-list">
            {pkg.declaredDependencies.map((d, i) => <div key={i} className="dep-item"><code>{d}</code></div>)}
          </div>
        </div>
      )}
      {(pkg.envVars?.length > 0 || pkg.secretRefs?.length > 0) && (
        <div className="pkg-info-block">
          <h3>Environment &amp; secrets</h3>
          {pkg.envVars?.map((e, i) => <MetaRow key={i} label={e.key} value={e.value || "(declared)"} />)}
          {pkg.secretRefs?.map((s, i) => <MetaRow key={`s${i}`} label="Secret ref" value={s.name || s} />)}
        </div>
      )}
      {version.generatedAgentCoreSpec && (
        <div className="pkg-info-block">
          <h3>AgentCore spec</h3>
          <MetaRow label="Effective entry point" value={version.generatedAgentCoreSpec.effectiveEntryPoint} />
          <MetaRow label="Wrapper generated"     value={version.generatedAgentCoreSpec.wrapperGenerated ? "Yes — agentcore_wrapper.py" : "No (AgentCore-native entry point)"} />
          <MetaRow label="Memory"                value={version.generatedAgentCoreSpec.runtimeConfig?.memoryMb ? `${version.generatedAgentCoreSpec.runtimeConfig.memoryMb} MB` : null} />
          <MetaRow label="Timeout"               value={version.generatedAgentCoreSpec.runtimeConfig?.timeoutSeconds ? `${version.generatedAgentCoreSpec.runtimeConfig.timeoutSeconds}s` : null} />
        </div>
      )}
    </div>
  );
}

export default function AgentDetail({ agent, setScreen, setPlane }) {
  const [tab, setTab] = useState("overview");
  const [version, setVersion] = useState(null);
  const [validationResults, setValidationResults] = useState([]);
  const [validationStatus, setValidationStatus] = useState(null);
  const [deployments, setDeployments] = useState([]);
  const [loadingExtra, setLoadingExtra] = useState(false);

  const isCrewAI    = agent?.agentType === "crewai";
  const isAuthored  = !!(agent?.authoredVia || agent?.status); // agents from new DB always have status

  // Derive the latest version ID from the agent summary (format: ver-<agentId>-v<version digits>)
  const latestVersionId = agent?.id
    ? `ver-${agent.id}-v${(agent.version || "1.0.0").replace(/\./g, "")}`
    : null;

  function loadDeployments(agentId) {
    setLoadingExtra(true);
    api(`/api/agents/${agentId}/deployments`)
      .then((res) => setDeployments(res?.deployments || []))
      .catch(() => setDeployments([]))
      .finally(() => setLoadingExtra(false));
  }

  useEffect(() => {
    if (!agent) return;
    setTab("overview");
    setVersion(null);
    setValidationResults([]);
    setValidationStatus(null);
    setDeployments([]);

    if (agent.id) {
      loadDeployments(agent.id);
    }
  }, [agent?.id]);

  if (!agent) {
    return <section className="panel"><div className="empty-state">Select an agent from the registry to view details.</div></section>;
  }

  const tabs = [
    { key: "overview",   label: "Overview" },
    ...(isCrewAI ? [{ key: "validation", label: "Validation" }] : []),
    ...(isCrewAI || isAuthored ? [{ key: "deployment", label: "Deployment" }] : []),
    ...((agent?.status === "ACTIVE" || agent?.deployment === "Deployed") ? [{ key: "invoke", label: "Test / Invoke" }] : []),
  ];

  return (
    <div className="split">
      <section className="panel">
        <div className="detail-header inline">
          <div>
            <p className="eyebrow">Agent Registry Detail</p>
            <h2>{agent.name}</h2>
            <p>{agent.description || "No description provided."}</p>
            {isCrewAI && (
              <span className="pill" style={{ background: "var(--blue-light, #eff6ff)", color: "var(--blue, #2563eb)", marginTop: 4, display: "inline-block" }}>
                CrewAI · External package
              </span>
            )}
          </div>
          <div className="filters">
            <button className="secondary" onClick={() => setScreen("agents")}>Back To Registry</button>
            <button className="primary" onClick={() => setPlane("execution")}>View Runs</button>
          </div>
        </div>

        <LifecycleStepper lifecycle={agent.lifecycle} />

        {tabs.length > 1 && (
          <div className="org-tabs" style={{ marginTop: 16 }}>
            {tabs.map(({ key, label }) => (
              <button key={key} className={`org-tab ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {tab === "overview" && (
          <>
            <div className="grid cols-3 compact" style={{ marginTop: 16 }}>
              <Metric small label="Lifecycle" value={agent.lifecycle} detail={agent.deployment} />
              <Metric small label="Risk" value={agent.risk} detail={agent.runtime} />
              <Metric small label="Version" value={agent.version} detail={agent.model || "—"} />
            </div>
            <div className="metadata-row">
              <span className="pill">Owner: {agent.owner}</span>
              <span className="pill">Project: {agent.projectId}</span>
              <span className="pill">Memory: {agent.memory}</span>
            </div>
            <h2 style={{ marginTop: 18 }}>Resources</h2>
            <Table headers={["Type", "Requested", "Registry Policy"]}>
              <tr><td>Tools</td><td>{(agent.tools || []).join(", ") || "None"}</td><td>Must exist in the selected project tool catalog before submission.</td></tr>
              <tr><td>Knowledge Bases</td><td>{(agent.knowledge || []).join(", ") || "None"}</td><td>Must be attached to the selected project before submission.</td></tr>
            </Table>
          </>
        )}

        {tab === "validation" && (
          <>
            <h2 style={{ marginTop: 16 }}>Package validation results</h2>
            <PackageValidationResults
              validationResults={(agent.validations || []).map((v, i) => ({
                id: `v-${i}`,
                validationType: "structure",
                status: v.status,
                severity: v.status === "fail" ? "blocking" : v.status === "warn" ? "warning" : "info",
                message: v.message,
                checkedAt: agent.updatedAt,
              }))}
              validationStatus={
                (agent.validations || []).some((v) => v.status === "fail") ? "failed"
                : (agent.validations || []).some((v) => v.status === "warn") ? "passed_with_warnings"
                : (agent.validations || []).length ? "passed" : null
              }
            />
          </>
        )}

        {tab === "deployment" && (
          <>
            <h2 style={{ marginTop: 16 }}>Deployment</h2>
            {loadingExtra
              ? <p className="muted">Loading…</p>
              : <DeploymentStatus
                  deployments={deployments}
                  agentName={agent.name}
                  agent={agent}
                  versionId={latestVersionId}
                  onDeployed={() => agent.id && loadDeployments(agent.id)}
                />
            }
            {version && version.lifecycleState === "approved" && version.lifecycleState !== "promoted" && (
              <PromoteToProductionPanel
                agent={agent}
                version={version}
                onPromoted={() => agent.id && loadDeployments(agent.id)}
              />
            )}
          </>
        )}

        {tab === "invoke" && (
          <AgentInvokePanel agent={agent} />
        )}
      </section>

      <aside className="panel">
        <h2>Validation Findings</h2>
        <div className="validation-list">
          {(agent.validations || []).map((item, index) => (
            <div className={`validation-item ${item.status}`} key={index}>
              <strong>{item.status.toUpperCase()}</strong><span>{item.message}</span>
            </div>
          ))}
          {!(agent.validations?.length) && <p className="muted">No validation findings.</p>}
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
