import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Clock, Server, Rocket, AlertTriangle, RefreshCw } from "lucide-react";
import { titleCase, api } from "../../utils.js";

function LogLine({ line }) {
  const isError   = /error|fail/i.test(line);
  const isSuccess = /ready|active|complete|success|deployed/i.test(line);
  return (
    <div className={`dep-log-line ${isError ? "dep-log-line--error" : isSuccess ? "dep-log-line--success" : ""}`}>
      <code>{line}</code>
    </div>
  );
}

function DeploymentCard({ dep, onRefresh }) {
  const isActive  = dep.deploymentStatus === "ACTIVE";
  const isFailed  = dep.deploymentStatus === "FAILED";
  const isRunning = dep.deploymentStatus === "DEPLOYING";

  const logs = Array.isArray(dep.deploymentLogs)
    ? dep.deploymentLogs
    : dep.deploymentLogs ? [dep.deploymentLogs] : [];

  return (
    <div className={`dep-card ${isActive ? "dep-card--deployed" : isFailed ? "dep-card--failed" : ""}`}>
      <div className="dep-card-header">
        <span className="dep-card-icon"><Server size={16} /></span>
        <div style={{ flex: 1 }}>
          <strong>Bedrock AgentCore Runtime</strong>
          <p className="muted" style={{ margin: 0 }}>
            {isActive  && <><CheckCircle2 size={12} style={{ marginRight: 4, color: "var(--green)" }} />Active — ready to invoke</>}
            {isFailed  && <><AlertTriangle size={12} style={{ marginRight: 4, color: "var(--red)" }} />Deployment failed</>}
            {isRunning && <><RefreshCw size={12} style={{ marginRight: 4, color: "var(--blue)", animation: "spin 1.2s linear infinite" }} />Deploying…</>}
            {!isActive && !isFailed && !isRunning && titleCase(dep.deploymentStatus)}
          </p>
        </div>
        {isRunning && (
          <button className="secondary" style={{ fontSize: 12 }} onClick={onRefresh}>Refresh</button>
        )}
        <span className="dep-card-date">{dep.deployedAt ? new Date(dep.deployedAt).toLocaleString() : (dep.createdAt ? new Date(dep.createdAt).toLocaleString() : "—")}</span>
      </div>

      {/* Real deployment identifiers */}
      {(dep.agentCoreAgentId || dep.runtimeName || dep.s3CodeLocation) && (
        <div className="dep-meta-grid">
          {dep.agentCoreAgentId     && <div className="dep-meta-row"><span>Runtime ID</span>    <code>{dep.agentCoreAgentId}</code></div>}
          {dep.agentCoreAgentArn    && <div className="dep-meta-row"><span>Runtime ARN</span>   <code style={{ fontSize: 10, wordBreak: "break-all" }}>{dep.agentCoreAgentArn}</code></div>}
          {dep.agentCoreEndpointId  && <div className="dep-meta-row"><span>Endpoint ID</span>   <code>{dep.agentCoreEndpointId}</code></div>}
          {dep.agentCoreEndpointArn && <div className="dep-meta-row"><span>Endpoint ARN</span>  <code style={{ fontSize: 10, wordBreak: "break-all" }}>{dep.agentCoreEndpointArn}</code></div>}
          {dep.runtimeName          && <div className="dep-meta-row"><span>Runtime name</span>  <code>{dep.runtimeName}</code></div>}
          {dep.s3CodeLocation       && <div className="dep-meta-row"><span>S3 code</span>       <code style={{ fontSize: 11 }}>{dep.s3CodeLocation}</code></div>}
        </div>
      )}

      {/* Error */}
      {dep.errorMessage && (
        <div className="validation-item fail" style={{ margin: "10px 0 0" }}>
          <AlertTriangle size={13} /><span>{dep.errorMessage}</span>
        </div>
      )}

      {/* Live / final deploy log */}
      {logs.length > 0 && (
        <div className="dep-logs">
          <strong className="dep-logs-title">
            {isRunning ? "Live deployment log" : "Deployment log"}
          </strong>
          {logs.map((line, i) => <LogLine key={i} line={line} />)}
        </div>
      )}
    </div>
  );
}

export default function DeploymentStatus({ deployments: initialDeployments = [], agent, versionId, onDeployed }) {
  const [deployments, setDeployments] = useState(initialDeployments);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  // Keep local list in sync with parent-supplied list (e.g. first load)
  useEffect(() => { setDeployments(initialDeployments); }, [initialDeployments]);

  // Auto-poll while any deployment is DEPLOYING
  useEffect(() => {
    const hasRunning = deployments.some((d) => d.deploymentStatus === "DEPLOYING");
    if (!hasRunning || !agent?.id) {
      clearInterval(pollRef.current);
      return;
    }
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await api(`/api/agents/${agent.id}/deployments`);
        setDeployments(r.deployments || []);
        const stillRunning = (r.deployments || []).some((d) => d.deploymentStatus === "DEPLOYING");
        if (!stillRunning) {
          clearInterval(pollRef.current);
          onDeployed?.();
        }
      } catch (_) {}
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [deployments, agent?.id]);

  // Authored agents: agent.status === "APPROVED" or "ACTIVE"; CrewAI: agent.lifecycle === "approved"
  const agentStatus = (agent?.status || "").toUpperCase();
  const isApproved  = ["APPROVED", "ACTIVE", "DEPLOY_FAILED", "DEPLOYING"].includes(agentStatus)
    || agent?.lifecycle?.toLowerCase() === "approved";
  const alreadyDeployed = deployments.some(
    (d) => d.deploymentStatus === "ACTIVE" || d.deploymentStatus === "DEPLOYING"
  );
  const hasFailedDeploy = !alreadyDeployed && deployments.some((d) => d.deploymentStatus === "FAILED");
  const canDeploy = isApproved && !alreadyDeployed;

  async function handleDeploy() {
    if (!agent?.id) { setError("Agent ID required."); return; }
    setBusy(true); setError("");
    try {
      let res;
      if (agent.projectId) {
        // Authored agent — project-scoped endpoint (picks DEV env automatically)
        res = await api(`/api/projects/${agent.projectId}/agents/${agent.id}/deploy`, {
          method: "POST",
          body: JSON.stringify({ deployedBy: "platform-admin@example.com" }),
        });
      } else {
        // CrewAI / legacy
        res = await api(`/api/agents/${agent.id}/versions/${versionId}/deploy`, {
          method: "POST",
          body: JSON.stringify({ deployedBy: "platform-admin@example.com" }),
        });
      }
      // Refresh deployment list so the DEPLOYING card appears immediately
      const listR = await api(`/api/agents/${agent.id}/deployments`);
      setDeployments(listR.deployments || []);
      onDeployed?.(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshNow() {
    try {
      const r = await api(`/api/agents/${agent.id}/deployments`);
      setDeployments(r.deployments || []);
    } catch (_) {}
  }

  return (
    <div className="dep-root">
      {/* Deploy action — shown when approved and not yet deploying/deployed */}
      {canDeploy && (
        <div className="dep-action-panel">
          <div className="dep-action-body">
            <Rocket size={18} style={{ color: "var(--green)", flexShrink: 0 }} />
            <div>
              <strong>Ready to deploy</strong>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                Deploy this agent to Bedrock AgentCore Runtime. Code is generated, uploaded to S3,
                and a runtime + public endpoint are created automatically (~3–5 min).
              </p>
            </div>
            <button className="primary" onClick={handleDeploy} disabled={busy} style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
              {busy ? "Starting…" : "Deploy to AgentCore →"}
            </button>
          </div>
          {error && (
            <div className="validation-item fail" style={{ marginTop: 8 }}>
              <AlertTriangle size={14} /><span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Retry panel — shown after a failed deployment */}
      {hasFailedDeploy && (
        <div className="dep-action-panel" style={{ borderColor: "var(--red, #dc2626)" }}>
          <div className="dep-action-body">
            <AlertTriangle size={18} style={{ color: "var(--red, #dc2626)", flexShrink: 0 }} />
            <div>
              <strong>Deployment failed — retry?</strong>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                The previous deployment attempt failed. The agent remains approved — you can retry without re-approval.
              </p>
            </div>
            <button className="primary" onClick={handleDeploy} disabled={busy} style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
              {busy ? "Starting…" : "Retry Deploy →"}
            </button>
          </div>
          {error && (
            <div className="validation-item fail" style={{ marginTop: 8 }}>
              <AlertTriangle size={14} /><span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Waiting for approval */}
      {!isApproved && !deployments.length && (
        <div className="dep-empty">
          <Clock size={16} style={{ marginRight: 6 }} />
          Agent must be <strong>Approved</strong> before deployment. Current status:{" "}
          <strong>{agent?.status || agent?.lifecycle || "unknown"}</strong>
        </div>
      )}

      {/* Deployment cards (one per environment, most recent first) */}
      {deployments.map((dep) => (
        <DeploymentCard key={dep.id} dep={dep} onRefresh={refreshNow} />
      ))}
    </div>
  );
}
