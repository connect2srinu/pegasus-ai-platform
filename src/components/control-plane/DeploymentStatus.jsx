import { useState } from "react";
import { CheckCircle2, Clock, Server, Rocket, AlertTriangle } from "lucide-react";
import { titleCase, api } from "../../utils.js";

function LogLine({ line }) {
  const isError   = /error|fail/i.test(line);
  const isSuccess = /active|success|deployed/i.test(line);
  return (
    <div className={`dep-log-line ${isError ? "dep-log-line--error" : isSuccess ? "dep-log-line--success" : ""}`}>
      <code>{line}</code>
    </div>
  );
}

export default function DeploymentStatus({ deployments = [], agent, versionId, onDeployed }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Derive whether this agent+version is approved and not yet deployed
  const isApproved = agent?.lifecycle?.toLowerCase() === "approved";
  const alreadyDeployed = deployments.some((d) => d.deploymentStatus === "deployed");
  const canDeploy = isApproved && !alreadyDeployed && agent?.agentType === "crewai";

  async function handleDeploy() {
    if (!agent?.id || !versionId) { setError("Agent and version ID required."); return; }
    setBusy(true); setError("");
    try {
      const res = await api(`/api/agents/${agent.id}/versions/${versionId}/deploy`, {
        method: "POST",
        body: JSON.stringify({ deployedBy: "platform-admin@example.com" }),
      });
      onDeployed?.(res.deployment);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dep-root">
      {/* Deploy action panel — shown when approved and not yet deployed */}
      {canDeploy && (
        <div className="dep-action-panel">
          <div className="dep-action-body">
            <Rocket size={18} style={{ color: "var(--green)", flexShrink: 0 }} />
            <div>
              <strong>Ready to deploy</strong>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                This version is approved. Deploy it to Bedrock AgentCore Runtime in the configured execution account.
              </p>
            </div>
            <button className="primary" onClick={handleDeploy} disabled={busy} style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
              {busy ? "Deploying…" : "Deploy to AgentCore →"}
            </button>
          </div>
          {error && (
            <div className="validation-item fail" style={{ marginTop: 8 }}>
              <AlertTriangle size={14} /><span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Lifecycle gate message — agent not yet approved */}
      {!isApproved && !deployments.length && (
        <div className="dep-empty">
          <Clock size={16} style={{ marginRight: 6 }} />
          No deployments yet. Agent must reach <strong>Approved</strong> status before deployment can be triggered.
        </div>
      )}

      {/* Existing deployment records */}
      {deployments.map((dep) => {
        const isDeployed = dep.deploymentStatus === "deployed";
        const isFailed   = dep.deploymentStatus === "failed";
        return (
          <div key={dep.id} className={`dep-card ${isDeployed ? "dep-card--deployed" : isFailed ? "dep-card--failed" : ""}`}>
            <div className="dep-card-header">
              <span className="dep-card-icon"><Server size={16} /></span>
              <div>
                <strong>Bedrock AgentCore Runtime</strong>
                <p className="muted" style={{ margin: 0 }}>
                  {isDeployed
                    ? <><CheckCircle2 size={12} style={{ marginRight: 4, color: "var(--green)" }} />Deployed</>
                    : titleCase(dep.deploymentStatus)}
                </p>
              </div>
              <span className="dep-card-date">{dep.deployedAt ? new Date(dep.deployedAt).toLocaleString() : "—"}</span>
            </div>

            <div className="dep-meta-grid">
              <div className="dep-meta-row"><span>Runtime ARN</span><code>{dep.runtimeArn || "—"}</code></div>
              <div className="dep-meta-row"><span>Runtime ID</span><code>{dep.runtimeId || "—"}</code></div>
              <div className="dep-meta-row"><span>ECR image</span><code>{dep.ecrImageUri || "—"}</code></div>
              <div className="dep-meta-row"><span>Execution account</span><code>{dep.executionAccountId || "—"}</code></div>
              <div className="dep-meta-row"><span>Model account</span><code>{dep.modelAccountId || "—"}</code></div>
              <div className="dep-meta-row"><span>Region</span><code>{dep.region || "—"}</code></div>
              <div className="dep-meta-row"><span>Deployed by</span><code>{dep.deployedBy || "—"}</code></div>
            </div>

            {dep.deploymentLogs?.length > 0 && (
              <div className="dep-logs">
                <strong className="dep-logs-title">Deployment log</strong>
                {dep.deploymentLogs.map((line, i) => <LogLine key={i} line={line} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
