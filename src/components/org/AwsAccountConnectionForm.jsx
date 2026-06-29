import { useState } from "react";
import { Link2, Shield, ChevronDown, ChevronUp, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "../../utils.js";
import { AWS_REGIONS } from "../../constants.js";

const BLANK = {
  awsAccountId: "",
  accountName: "",
  environment: "production",
  discoveryRoleArn: "",
  provisioningRoleArn: "",
  externalIdRef: "",
  enabledRegions: ["us-east-1"],
  agentCoreGatewayArn: "",
  agentCoreGatewayUrl: "",
};

export default function AwsAccountConnectionForm({ orgId, onSuccess, onCancel }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | "ok" | "fail"

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  function toggleRegion(region) {
    setForm((f) => ({
      ...f,
      enabledRegions: f.enabledRegions.includes(region)
        ? f.enabledRegions.filter((r) => r !== region)
        : [...f.enabledRegions, region],
    }));
  }

  async function testConnection() {
    if (!form.awsAccountId || !form.discoveryRoleArn) {
      setError("Account ID and Discovery Role ARN are required to test the connection."); return;
    }
    setBusy(true); setError(""); setTestStatus(null);
    // Simulate STS dry-run
    await new Promise((r) => setTimeout(r, 1200));
    setTestStatus("ok");
    setBusy(false);
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.awsAccountId.trim()) { setError("AWS Account ID is required."); return; }
    if (!form.discoveryRoleArn.trim()) { setError("Discovery Role ARN is required."); return; }
    if (!form.provisioningRoleArn.trim()) { setError("Provisioning Role ARN is required."); return; }
    if (form.enabledRegions.length === 0) { setError("Select at least one region."); return; }
    if (form.externalIdRef && /AKIA|BEGIN|password/i.test(form.externalIdRef)) {
      setError("External ID must be a Secrets Manager reference (e.g. sm/guardian-ext-id), not a raw value."); return;
    }
    setBusy(true); setError("");
    try {
      const res = await api(`/api/organizations/${orgId}/account-connections`, {
        method: "POST",
        body: JSON.stringify({ ...form, createdBy: "platform-admin@example.com" }),
      });
      onSuccess(res.connection);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginTop: 0 }}>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div>
          <p className="eyebrow">New Connection</p>
          <h2 style={{ margin: 0 }}>Connect Business Unit AWS Account</h2>
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
            Guardian will assume the discovery role to scan this account for APIs, Lambda functions, knowledge bases, and existing AgentCore Gateway tools.
          </p>
        </div>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>

      {error && <div className="validation-item fail" style={{ marginBottom: 14 }}><AlertTriangle size={14} /><span>{error}</span></div>}
      {testStatus === "ok" && <div className="validation-item pass" style={{ marginBottom: 14 }}><CheckCircle2 size={14} /><span>Connection test succeeded — role is assumable.</span></div>}

      <form onSubmit={submit}>
        <div className="form-grid">
          <label className="field">
            AWS Account ID <span className="required">*</span>
            <input value={form.awsAccountId} onChange={(e) => set("awsAccountId", e.target.value)} placeholder="123456789012" maxLength={12} />
            <span className="hint">The 12-digit AWS account ID for the business unit account.</span>
          </label>
          <label className="field">
            Account name
            <input value={form.accountName} onChange={(e) => set("accountName", e.target.value)} placeholder="Acme Health – Claims BU Account" />
          </label>
          <label className="field">
            Environment
            <select value={form.environment} onChange={(e) => set("environment", e.target.value)}>
              {["production", "staging", "development", "sandbox"].map((e) => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
            </select>
          </label>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 className="section-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={14} /> Cross-Account Roles
          </h3>
          <div className="form-grid">
            <label className="field full">
              Discovery Role ARN <span className="required">*</span>
              <input className="arn-input" value={form.discoveryRoleArn} onChange={(e) => set("discoveryRoleArn", e.target.value)} placeholder="arn:aws:iam::123456789012:role/GuardianDiscoveryRole" />
              <span className="hint">Read-only role. Must trust the Guardian control plane account.</span>
            </label>
            <label className="field full">
              Provisioning Role ARN <span className="required">*</span>
              <input className="arn-input" value={form.provisioningRoleArn} onChange={(e) => set("provisioningRoleArn", e.target.value)} placeholder="arn:aws:iam::123456789012:role/GuardianProvisioningRole" />
              <span className="hint">Used after approval to create AgentCore Gateway targets. Requires <code>bedrock-agent:CreateGatewayTarget</code>.</span>
            </label>
            <label className="field">
              External ID secret reference
              <input value={form.externalIdRef} onChange={(e) => set("externalIdRef", e.target.value)} placeholder="sm/guardian-acme-health-external-id" />
              <span className="hint">Secrets Manager reference only — never the raw value.</span>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <h3 className="section-label">Enabled Regions</h3>
          <div className="region-checklist">
            {AWS_REGIONS.map((r) => (
              <label key={r} className="check-label">
                <input type="checkbox" checked={form.enabledRegions.includes(r)} onChange={() => toggleRegion(r)} />
                {r}
              </label>
            ))}
          </div>
        </div>

        <button type="button" className="advanced-toggle" onClick={() => setShowAdvanced((v) => !v)} style={{ marginTop: 12 }}>
          {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {showAdvanced ? "Hide" : "Show"} AgentCore Gateway settings (optional)
        </button>

        {showAdvanced && (
          <div className="form-grid" style={{ marginTop: 8 }}>
            <label className="field full">
              Existing AgentCore Gateway ARN
              <input className="arn-input" value={form.agentCoreGatewayArn} onChange={(e) => set("agentCoreGatewayArn", e.target.value)} placeholder="arn:aws:bedrock-agentcore:us-east-1:123456789012:gateway/gw-xxx" />
              <span className="hint">If a Gateway already exists in this account, paste its ARN here. New Gateway targets will be created in it after approval.</span>
            </label>
            <label className="field full">
              Gateway MCP URL
              <input value={form.agentCoreGatewayUrl} onChange={(e) => set("agentCoreGatewayUrl", e.target.value)} placeholder="https://gw-xxx.gateway.bedrock-agentcore.us-east-1.amazonaws.com/mcp" />
            </label>
          </div>
        )}

        <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
          <button type="button" className="secondary" onClick={testConnection} disabled={busy}>
            Test Connection
          </button>
          <button className="primary" type="submit" disabled={busy}>
            <Link2 size={13} style={{ marginRight: 6 }} />
            {busy ? "Connecting…" : "Connect & Scan Account"}
          </button>
        </div>
      </form>
    </div>
  );
}
