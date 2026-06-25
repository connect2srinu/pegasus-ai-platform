import { Cloud, Server, AlertTriangle, CheckCircle2 } from "lucide-react";
import { BEDROCK_MODELS } from "../../../constants.js";

function ConfigLine({ label, value }) {
  if (!value) return null;
  return (
    <div className="deploy-config-line">
      <span className="deploy-config-label">{label}</span>
      <code className="deploy-config-value">{value}</code>
    </div>
  );
}

export default function DeployStep({ org }) {
  const cfg = org?.awsConfig;
  const hasConfig = !!(cfg?.modelAccount?.accountId && cfg?.executionAccount?.accountId);

  if (!org) {
    return (
      <div>
        <h3 style={{ marginBottom: 4 }}>Deployment target</h3>
        <div className="validation-item warn" style={{ marginTop: 16 }}>
          <AlertTriangle size={16} />
          <span>No organization selected. Select an organization from the sidebar first — deployment accounts are configured at the org level by the Platform Admin.</span>
        </div>
      </div>
    );
  }

  if (!hasConfig) {
    return (
      <div>
        <h3 style={{ marginBottom: 4 }}>Deployment target</h3>
        <p className="muted" style={{ marginBottom: 16 }}>
          Showing configured AWS accounts for <strong>{org.name}</strong>.
        </p>
        <div className="validation-item warn">
          <AlertTriangle size={16} />
          <span>
            <strong>{org.name}</strong> does not have AWS accounts configured yet.
            Ask your Platform Admin to set up the Bedrock model account and AgentCore execution account
            in the Organizations screen before submitting this agent.
          </span>
        </div>
        <div className="empty-state" style={{ marginTop: 16 }}>
          Your agent will be registered in the control plane and queued for approval,
          but cannot be deployed until the Platform Admin completes AWS account setup for this organization.
        </div>
      </div>
    );
  }

  const ma = cfg.modelAccount;
  const ea = cfg.executionAccount;
  const net = ea.networkConfig || {};
  const allowedLabel = (ma.allowedModelIds || [])
    .map((id) => BEDROCK_MODELS.find((m) => m.id === id)?.label || id)
    .join(", ");

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Deployment target</h3>
      <p className="muted" style={{ marginBottom: 20 }}>
        These settings are pre-configured by your Platform Admin for <strong>{org.name}</strong>.
        You do not need to enter any AWS details — they are applied automatically when the agent is approved.
      </p>

      <div className="validation-item pass" style={{ marginBottom: 20 }}>
        <CheckCircle2 size={15} />
        <span>AWS accounts configured and ready. Deployment is fully automated.</span>
      </div>

      <div className="deploy-account-grid">
        {/* Model account card */}
        <div className="deploy-account-card deploy-account-card--blue">
          <div className="deploy-account-card-header">
            <div className="deploy-account-icon deploy-account-icon--blue"><Cloud size={16} /></div>
            <div>
              <strong>Bedrock Model Account</strong>
              <p className="muted">{ma.label || "Foundation model invocation"}</p>
            </div>
          </div>
          <div className="deploy-config-lines">
            <ConfigLine label="Account ID" value={ma.accountId} />
            <ConfigLine label="Region" value={ma.region} />
            <ConfigLine label="Cross-account role" value={ma.crossAccountRoleArn} />
            {allowedLabel && (
              <div className="deploy-config-line">
                <span className="deploy-config-label">Allowed models</span>
                <span className="deploy-config-value" style={{ fontFamily: "inherit" }}>{allowedLabel}</span>
              </div>
            )}
          </div>
        </div>

        {/* Execution account card */}
        <div className="deploy-account-card deploy-account-card--violet">
          <div className="deploy-account-card-header">
            <div className="deploy-account-icon deploy-account-icon--violet"><Server size={16} /></div>
            <div>
              <strong>AgentCore Execution Account</strong>
              <p className="muted">{ea.label || "Runtime execution environment"}</p>
            </div>
          </div>
          <div className="deploy-config-lines">
            <ConfigLine label="Account ID" value={ea.accountId} />
            <ConfigLine label="Region" value={ea.region} />
            <ConfigLine label="Execution role" value={ea.agentCoreExecutionRoleArn} />
            <ConfigLine label="ECR prefix" value={ea.ecrRepositoryPrefix} />
            <ConfigLine label="S3 bucket" value={ea.s3ArtifactBucket} />
            {net.vpcId && <ConfigLine label="VPC" value={net.vpcId} />}
            {net.subnetIds && <ConfigLine label="Subnets" value={net.subnetIds} />}
          </div>
        </div>
      </div>

      <div className="deploy-flow-explainer">
        <h4>What happens after approval</h4>
        <ol className="author-steps-list">
          <li>Platform Admin gives final approval</li>
          <li>Docker image built and pushed to ECR in account <strong>{ea.accountId}</strong></li>
          <li>AgentCore runtime created in <strong>{ea.region}</strong></li>
          <li>Runtime assumes role <strong>{ma.crossAccountRoleArn?.split("/").pop() || "PegasusBedrockAccess"}</strong> to invoke Bedrock in account <strong>{ma.accountId}</strong></li>
          <li>Agent endpoint published — visible in the Execution Plane</li>
        </ol>
      </div>
    </div>
  );
}
