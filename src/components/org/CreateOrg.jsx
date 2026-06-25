import { useState } from "react";
import { ArrowLeft, Building2, ChevronDown, ChevronRight, Cloud, Server } from "lucide-react";
import { api } from "../../utils.js";
import { BEDROCK_MODELS } from "../../constants.js";

const EMPTY_AWS_CONFIG = {
  modelAccount: {
    accountId: "",
    region: "us-east-1",
    label: "",
    crossAccountRoleArn: "",
    allowedModelIds: ["anthropic.claude-3-5-sonnet-20241022-v2:0"],
  },
  executionAccount: {
    accountId: "",
    region: "us-east-1",
    label: "",
    agentCoreExecutionRoleArn: "",
    ecrRepositoryPrefix: "",
    s3ArtifactBucket: "",
    networkConfig: {
      vpcId: "",
      subnetIds: "",
      securityGroupIds: "",
    },
  },
};

function FieldHint({ children }) {
  return <span className="hint">{children}</span>;
}

function SectionHeader({ icon: Icon, title, subtitle, open, onToggle }) {
  return (
    <button type="button" className="aws-section-header" onClick={onToggle}>
      <div className="aws-section-icon"><Icon size={18} /></div>
      <div className="aws-section-title">
        <strong>{title}</strong>
        <span className="muted">{subtitle}</span>
      </div>
      {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
    </button>
  );
}

export default function CreateOrg({ onBack, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    adminEmail: "platform-admin@example.com",
  });
  const [awsConfig, setAwsConfig] = useState(EMPTY_AWS_CONFIG);
  const [awsOpen, setAwsOpen] = useState({ model: true, execution: true });
  const [configureAws, setConfigureAws] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setModel(field, value) {
    setAwsConfig((c) => ({ ...c, modelAccount: { ...c.modelAccount, [field]: value } }));
  }

  function setExecution(field, value) {
    setAwsConfig((c) => ({ ...c, executionAccount: { ...c.executionAccount, [field]: value } }));
  }

  function setNetwork(field, value) {
    setAwsConfig((c) => ({
      ...c,
      executionAccount: {
        ...c.executionAccount,
        networkConfig: { ...c.executionAccount.networkConfig, [field]: value },
      },
    }));
  }

  function toggleModel(modelId) {
    const current = awsConfig.modelAccount.allowedModelIds || [];
    const next = current.includes(modelId)
      ? current.filter((m) => m !== modelId)
      : [...current, modelId];
    setModel("allowedModelIds", next);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Organization name is required."); return; }
    if (configureAws) {
      if (!awsConfig.modelAccount.accountId.trim()) { setError("Model account ID is required when configuring AWS."); return; }
      if (!awsConfig.modelAccount.crossAccountRoleArn.trim()) { setError("Bedrock cross-account role ARN is required."); return; }
      if (!awsConfig.executionAccount.accountId.trim()) { setError("Execution account ID is required when configuring AWS."); return; }
      if (!awsConfig.executionAccount.agentCoreExecutionRoleArn.trim()) { setError("AgentCore execution role ARN is required."); return; }
    }
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          createdBy: "platform-admin@example.com",
          initialAdmin: form.adminEmail.trim(),
          awsConfig: configureAws ? awsConfig : null,
        }),
      });
      onCreated?.(result);
    } catch (err) {
      setError(err.message === "Failed to fetch"
        ? "Cannot reach the API server. Make sure it is running (npm run api)."
        : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="org-detail-header">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />Organizations
        </button>
        <div className="org-detail-title">
          <div className="org-detail-icon"><Building2 size={24} /></div>
          <div>
            <h2>Create Organization</h2>
            <p className="muted">Only Platform Admins can create organizations.</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="create-org-form">
        {error && (
          <div className="validation-item fail" style={{ marginBottom: 16 }}>
            <strong>ERROR</strong><span>{error}</span>
          </div>
        )}

        {/* ── Basic details ── */}
        <section className="panel" style={{ marginBottom: 16 }}>
          <h3 className="section-label">Organization Details</h3>

          <label className="field">
            Organization name <span className="required">*</span>
            <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. Acme Health" maxLength={80} />
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            Description
            <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} placeholder="Brief description of this organization's purpose." rows={3} />
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            Initial Org Admin email
            <input value={form.adminEmail} onChange={(e) => setField("adminEmail", e.target.value)} placeholder="admin@example.com" />
            <FieldHint>This user is granted Org Admin and can invite others and create projects.</FieldHint>
          </label>
        </section>

        {/* ── AWS Account Configuration ── */}
        <section className="panel" style={{ marginBottom: 16 }}>
          <div className="aws-config-header">
            <div>
              <h3 className="section-label" style={{ marginBottom: 4 }}>AWS Account Configuration</h3>
              <p className="muted" style={{ fontSize: 13 }}>
                Configure the two AWS accounts that agents in this organization will use.
                Users never need to enter these — they are applied automatically at deployment time.
              </p>
            </div>
            <label className="check-label">
              <input type="checkbox" checked={configureAws} onChange={(e) => setConfigureAws(e.target.checked)} />
              Configure now
            </label>
          </div>

          {configureAws && (
            <div className="aws-config-body">

              {/* Model Account */}
              <div className="aws-account-block">
                <SectionHeader
                  icon={Cloud}
                  title="Bedrock Model Account"
                  subtitle="The AWS account where Amazon Bedrock foundation models are enabled."
                  open={awsOpen.model}
                  onToggle={() => setAwsOpen((s) => ({ ...s, model: !s.model }))}
                />
                {awsOpen.model && (
                  <div className="aws-account-fields">
                    <div className="form-grid">
                      <label className="field">
                        AWS Account ID <span className="required">*</span>
                        <input value={awsConfig.modelAccount.accountId} onChange={(e) => setModel("accountId", e.target.value)} placeholder="123456789012" maxLength={12} />
                        <FieldHint>12-digit AWS account number where Bedrock is enabled.</FieldHint>
                      </label>
                      <label className="field">
                        Region
                        <select value={awsConfig.modelAccount.region} onChange={(e) => setModel("region", e.target.value)}>
                          {["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"].map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      Friendly label
                      <input value={awsConfig.modelAccount.label} onChange={(e) => setModel("label", e.target.value)} placeholder="e.g. Acme Health – Bedrock Model Account" />
                    </label>
                    <label className="field">
                      Bedrock cross-account role ARN <span className="required">*</span>
                      <input
                        value={awsConfig.modelAccount.crossAccountRoleArn}
                        onChange={(e) => setModel("crossAccountRoleArn", e.target.value)}
                        placeholder="arn:aws:iam::123456789012:role/PegasusBedrockAccess"
                        className="arn-input"
                      />
                      <FieldHint>
                        IAM role in the model account that allows <code>bedrock:InvokeModel</code>.
                        Trust policy must allow the AgentCore execution role to assume it.
                      </FieldHint>
                    </label>
                    <div className="field">
                      <span>Allowed foundation models</span>
                      <div className="model-checklist">
                        {BEDROCK_MODELS.map((m) => (
                          <label key={m.id} className="check-label">
                            <input
                              type="checkbox"
                              checked={(awsConfig.modelAccount.allowedModelIds || []).includes(m.id)}
                              onChange={() => toggleModel(m.id)}
                            />
                            {m.label}
                          </label>
                        ))}
                      </div>
                      <FieldHint>Authors can only pick from these models when creating agents under this org.</FieldHint>
                    </div>
                  </div>
                )}
              </div>

              {/* Execution Account */}
              <div className="aws-account-block">
                <SectionHeader
                  icon={Server}
                  title="AgentCore Execution Account"
                  subtitle="The AWS account where AgentCore runtimes run and agents are deployed."
                  open={awsOpen.execution}
                  onToggle={() => setAwsOpen((s) => ({ ...s, execution: !s.execution }))}
                />
                {awsOpen.execution && (
                  <div className="aws-account-fields">
                    <div className="form-grid">
                      <label className="field">
                        AWS Account ID <span className="required">*</span>
                        <input value={awsConfig.executionAccount.accountId} onChange={(e) => setExecution("accountId", e.target.value)} placeholder="123456789012" maxLength={12} />
                        <FieldHint>12-digit AWS account number for AgentCore runtime.</FieldHint>
                      </label>
                      <label className="field">
                        Region
                        <select value={awsConfig.executionAccount.region} onChange={(e) => setExecution("region", e.target.value)}>
                          {["us-east-1", "us-west-2", "eu-west-1", "ap-southeast-1"].map((r) => <option key={r}>{r}</option>)}
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      Friendly label
                      <input value={awsConfig.executionAccount.label} onChange={(e) => setExecution("label", e.target.value)} placeholder="e.g. Acme Health – AgentCore Execution Account" />
                    </label>
                    <label className="field">
                      AgentCore execution role ARN <span className="required">*</span>
                      <input
                        value={awsConfig.executionAccount.agentCoreExecutionRoleArn}
                        onChange={(e) => setExecution("agentCoreExecutionRoleArn", e.target.value)}
                        placeholder="arn:aws:iam::123456789012:role/AgentCoreExecutionRole"
                        className="arn-input"
                      />
                      <FieldHint>
                        IAM role that AgentCore assumes to run agents. Must have permission to assume the Bedrock cross-account role above.
                      </FieldHint>
                    </label>
                    <div className="form-grid">
                      <label className="field">
                        ECR repository prefix
                        <input value={awsConfig.executionAccount.ecrRepositoryPrefix} onChange={(e) => setExecution("ecrRepositoryPrefix", e.target.value)} placeholder="123456789012.dkr.ecr.us-east-1.amazonaws.com/pegasus" className="arn-input" />
                        <FieldHint>Agent container images are pushed here at deployment time.</FieldHint>
                      </label>
                      <label className="field">
                        S3 artifact bucket
                        <input value={awsConfig.executionAccount.s3ArtifactBucket} onChange={(e) => setExecution("s3ArtifactBucket", e.target.value)} placeholder="pegasus-agent-artifacts-123456789012" />
                        <FieldHint>Bucket for deployment packages and manifests.</FieldHint>
                      </label>
                    </div>
                    <div className="aws-network-section">
                      <p className="field-label">Network configuration <span className="muted">(optional — leave blank for default VPC)</span></p>
                      <div className="form-grid">
                        <label className="field">
                          VPC ID
                          <input value={awsConfig.executionAccount.networkConfig.vpcId} onChange={(e) => setNetwork("vpcId", e.target.value)} placeholder="vpc-0abc1234def56789a" />
                        </label>
                        <label className="field">
                          Subnet IDs <span className="muted">(comma-separated)</span>
                          <input value={awsConfig.executionAccount.networkConfig.subnetIds} onChange={(e) => setNetwork("subnetIds", e.target.value)} placeholder="subnet-aaa, subnet-bbb" />
                        </label>
                        <label className="field">
                          Security group IDs <span className="muted">(comma-separated)</span>
                          <input value={awsConfig.executionAccount.networkConfig.securityGroupIds} onChange={(e) => setNetwork("securityGroupIds", e.target.value)} placeholder="sg-0abc123def456789a" />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Trust relationship explainer */}
              <div className="trust-explainer">
                <h4>Required IAM trust relationship</h4>
                <p className="muted">The Bedrock role in the model account must trust the execution role:</p>
                <pre className="code-preview" style={{ fontSize: 11, maxHeight: 160 }}>{`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "${awsConfig.executionAccount.agentCoreExecutionRoleArn || "arn:aws:iam::EXEC_ACCOUNT:role/AgentCoreExecutionRole"}"
    },
    "Action": "sts:AssumeRole"
  }]
}`}</pre>
              </div>
            </div>
          )}
        </section>

        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button type="button" className="secondary" onClick={onBack}>Cancel</button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Creating…" : "Create Organization"}
          </button>
        </div>
      </form>
    </div>
  );
}
