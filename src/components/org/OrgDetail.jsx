import { useState, useEffect } from "react";
import { Building2, Plus, FolderOpen, Users, ArrowLeft, ChevronRight, Cloud, Server, CheckCircle2, AlertCircle, Pencil, Link2, RefreshCw } from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api } from "../../utils.js";
import { fallback, ORG_ROLES, BEDROCK_MODELS } from "../../constants.js";
import AwsAccountConnectionForm from "./AwsAccountConnectionForm.jsx";
import InventoryCatalog from "./InventoryCatalog.jsx";
import OrgToolRegistry from "./OrgToolRegistry.jsx";
import OrgApprovals from "./OrgApprovals.jsx";

function ProjectCard({ project, onOpen }) {
  const stats = fallback[project.name] || {};
  const summary = stats.summary || {};
  return (
    <article className="project-card">
      <div className="project-card-header">
        <div className="project-card-icon"><FolderOpen size={20} /></div>
        <div>
          <h3>{project.name}</h3>
          <p className="muted">{project.description || "No description."}</p>
        </div>
      </div>
      <div className="project-card-stats">
        {summary.approvedAgents !== undefined && (
          <>
            <div className="project-stat"><strong>{summary.approvedAgents}</strong><span>agents</span></div>
            <div className="project-stat"><strong>{summary.runs24h}</strong><span>runs/24h</span></div>
            <div className="project-stat"><strong>{summary.approvals}</strong><span>pending</span></div>
          </>
        )}
      </div>
      <button className="primary" onClick={() => onOpen(project)}>
        Open Project <ChevronRight size={14} />
      </button>
    </article>
  );
}

function AddMemberForm({ orgId, onAdded, onCancel }) {
  const [form, setForm] = useState({ userId: "", role: "org_member" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!form.userId.trim()) { setError("Email is required."); return; }
    setBusy(true);
    setError("");
    try {
      await api(`/api/organizations/${orgId}/members`, {
        method: "POST",
        body: JSON.stringify(form),
      });
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="inline-form" onSubmit={submit}>
      {error && <div className="validation-item fail"><strong>ERROR</strong><span>{error}</span></div>}
      <div className="form-grid">
        <label className="field">
          User email
          <input name="userId" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} placeholder="user@example.com" />
        </label>
        <label className="field">
          Role
          <select name="role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {Object.entries(ORG_ROLES).filter(([k]) => k !== "platform_admin").map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
        <button className="secondary" type="button" onClick={onCancel}>Cancel</button>
        <button className="primary" type="submit" disabled={busy}>{busy ? "Adding…" : "Add Member"}</button>
      </div>
    </form>
  );
}

function ConfigRow({ label, value, mono = false, hint }) {
  return (
    <div className="aws-config-row">
      <span className="aws-config-label">{label}</span>
      <span className={`aws-config-value ${mono ? "mono" : ""}`}>{value || <em className="muted">not set</em>}</span>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function AccountCard({ icon: Icon, title, color, children, onEdit, canEdit }) {
  return (
    <div className={`aws-account-card aws-account-card--${color}`}>
      <div className="aws-account-card-header">
        <div className={`aws-account-card-icon aws-account-card-icon--${color}`}><Icon size={18} /></div>
        <h4>{title}</h4>
        {canEdit && (
          <button className="secondary icon-only" onClick={onEdit} title="Edit" style={{ marginLeft: "auto", padding: "4px 8px" }}>
            <Pencil size={14} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function AwsConfigTab({ org, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cfg = org.awsConfig;

  function startEdit() {
    const blank = {
      modelAccount: { accountId: "", region: "us-east-1", label: "", crossAccountRoleArn: "", allowedModelIds: [] },
      executionAccount: { accountId: "", region: "us-east-1", label: "", agentCoreExecutionRoleArn: "", ecrRepositoryPrefix: "", s3ArtifactBucket: "", networkConfig: { vpcId: "", subnetIds: "", securityGroupIds: "" } },
    };
    setDraft(cfg ? JSON.parse(JSON.stringify(cfg)) : blank);
    setEditing(true);
    setError("");
  }

  function setModel(field, value) {
    setDraft((d) => ({ ...d, modelAccount: { ...d.modelAccount, [field]: value } }));
  }
  function setExec(field, value) {
    setDraft((d) => ({ ...d, executionAccount: { ...d.executionAccount, [field]: value } }));
  }
  function setNet(field, value) {
    setDraft((d) => ({ ...d, executionAccount: { ...d.executionAccount, networkConfig: { ...d.executionAccount.networkConfig, [field]: value } } }));
  }
  function toggleModel(id) {
    const cur = draft.modelAccount.allowedModelIds || [];
    setModel("allowedModelIds", cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]);
  }

  async function save() {
    if (!draft.modelAccount.accountId.trim() || !draft.modelAccount.crossAccountRoleArn.trim()) {
      setError("Model account ID and cross-account role ARN are required."); return;
    }
    if (!draft.executionAccount.accountId.trim() || !draft.executionAccount.agentCoreExecutionRoleArn.trim()) {
      setError("Execution account ID and role ARN are required."); return;
    }
    setBusy(true); setError("");
    try {
      await api(`/api/organizations/${org.id}/aws-config`, {
        method: "PUT",
        body: JSON.stringify({ awsConfig: draft, updatedBy: "platform-admin@example.com" }),
      });
      setEditing(false);
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (editing && draft) {
    return (
      <section className="panel">
        <div className="toolbar">
          <h2>Edit AWS Configuration</h2>
          <div className="filters">
            <button className="secondary" onClick={() => setEditing(false)}>Cancel</button>
            <button className="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
        {error && <div className="validation-item fail" style={{ marginBottom: 12 }}><strong>ERROR</strong><span>{error}</span></div>}

        <h3 className="section-label" style={{ marginTop: 0 }}>Bedrock Model Account</h3>
        <div className="form-grid">
          <label className="field">Account ID <span className="required">*</span>
            <input value={draft.modelAccount.accountId} onChange={(e) => setModel("accountId", e.target.value)} placeholder="123456789012" />
          </label>
          <label className="field">Region
            <select value={draft.modelAccount.region} onChange={(e) => setModel("region", e.target.value)}>
              {["us-east-1","us-west-2","eu-west-1","ap-southeast-1"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Friendly label
          <input value={draft.modelAccount.label} onChange={(e) => setModel("label", e.target.value)} placeholder="Acme Health – Bedrock Model Account" />
        </label>
        <label className="field">Cross-account role ARN <span className="required">*</span>
          <input value={draft.modelAccount.crossAccountRoleArn} onChange={(e) => setModel("crossAccountRoleArn", e.target.value)} placeholder="arn:aws:iam::123456789012:role/PegasusBedrockAccess" className="arn-input" />
          <span className="hint">Must allow <code>bedrock:InvokeModel</code> and trust the execution role.</span>
        </label>
        <div className="field">
          <span>Allowed models</span>
          <div className="model-checklist">
            {BEDROCK_MODELS.map((m) => (
              <label key={m.id} className="check-label">
                <input type="checkbox" checked={(draft.modelAccount.allowedModelIds || []).includes(m.id)} onChange={() => toggleModel(m.id)} />
                {m.label}
              </label>
            ))}
          </div>
        </div>

        <h3 className="section-label">AgentCore Execution Account</h3>
        <div className="form-grid">
          <label className="field">Account ID <span className="required">*</span>
            <input value={draft.executionAccount.accountId} onChange={(e) => setExec("accountId", e.target.value)} placeholder="123456789012" />
          </label>
          <label className="field">Region
            <select value={draft.executionAccount.region} onChange={(e) => setExec("region", e.target.value)}>
              {["us-east-1","us-west-2","eu-west-1","ap-southeast-1"].map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Friendly label
          <input value={draft.executionAccount.label} onChange={(e) => setExec("label", e.target.value)} placeholder="Acme Health – AgentCore Execution Account" />
        </label>
        <label className="field">AgentCore execution role ARN <span className="required">*</span>
          <input value={draft.executionAccount.agentCoreExecutionRoleArn} onChange={(e) => setExec("agentCoreExecutionRoleArn", e.target.value)} placeholder="arn:aws:iam::123456789012:role/AgentCoreExecutionRole" className="arn-input" />
          <span className="hint">This role must be able to assume the model account role above via STS.</span>
        </label>
        <div className="form-grid">
          <label className="field">ECR repository prefix
            <input value={draft.executionAccount.ecrRepositoryPrefix} onChange={(e) => setExec("ecrRepositoryPrefix", e.target.value)} placeholder="123456789012.dkr.ecr.us-east-1.amazonaws.com/pegasus" className="arn-input" />
          </label>
          <label className="field">S3 artifact bucket
            <input value={draft.executionAccount.s3ArtifactBucket} onChange={(e) => setExec("s3ArtifactBucket", e.target.value)} placeholder="pegasus-agent-artifacts-123456789012" />
          </label>
        </div>
        <p className="field-label" style={{ marginTop: 12 }}>Network configuration <span className="muted">(optional)</span></p>
        <div className="form-grid">
          <label className="field">VPC ID <input value={draft.executionAccount.networkConfig.vpcId} onChange={(e) => setNet("vpcId", e.target.value)} placeholder="vpc-0abc1234" /></label>
          <label className="field">Subnet IDs (comma-sep) <input value={draft.executionAccount.networkConfig.subnetIds} onChange={(e) => setNet("subnetIds", e.target.value)} placeholder="subnet-aaa, subnet-bbb" /></label>
          <label className="field">Security group IDs (comma-sep) <input value={draft.executionAccount.networkConfig.securityGroupIds} onChange={(e) => setNet("securityGroupIds", e.target.value)} placeholder="sg-abc123" /></label>
        </div>
      </section>
    );
  }

  if (!cfg) {
    return (
      <section className="panel">
        <div className="empty-state" style={{ border: "1px dashed var(--amber)" }}>
          <AlertCircle size={24} style={{ color: "var(--amber)", marginBottom: 10 }} />
          <strong>AWS accounts not configured</strong>
          <p className="muted" style={{ marginTop: 6 }}>
            Agents authored under this organization cannot be deployed until a Platform Admin configures the Bedrock model account and AgentCore execution account.
          </p>
          {canEdit && (
            <button className="primary" style={{ marginTop: 14 }} onClick={startEdit}>
              Configure AWS Accounts
            </button>
          )}
        </div>
      </section>
    );
  }

  const ma = cfg.modelAccount;
  const ea = cfg.executionAccount;
  const net = ea.networkConfig || {};

  return (
    <div className="aws-config-view">
      <div className="aws-config-status">
        <CheckCircle2 size={16} style={{ color: "var(--green)" }} />
        <span>AWS accounts configured. Agents in this org deploy automatically using these settings.</span>
        {canEdit && (
          <button className="secondary" style={{ marginLeft: "auto" }} onClick={startEdit}>
            <Pencil size={13} style={{ marginRight: 4 }} />Edit
          </button>
        )}
      </div>

      <div className="aws-account-cards">
        <AccountCard icon={Cloud} title="Bedrock Model Account" color="blue" canEdit={false}>
          <ConfigRow label="Account ID" value={ma.accountId} mono />
          <ConfigRow label="Region" value={ma.region} />
          {ma.label && <ConfigRow label="Label" value={ma.label} />}
          <ConfigRow label="Cross-account role ARN" value={ma.crossAccountRoleArn} mono hint="Allows bedrock:InvokeModel; trusts the execution role" />
          <div className="aws-config-row">
            <span className="aws-config-label">Allowed models</span>
            <div className="model-pills">
              {(ma.allowedModelIds || []).map((id) => {
                const label = BEDROCK_MODELS.find((m) => m.id === id)?.label || id;
                return <span key={id} className="pill">{label}</span>;
              })}
            </div>
          </div>
        </AccountCard>

        <AccountCard icon={Server} title="AgentCore Execution Account" color="violet" canEdit={false}>
          <ConfigRow label="Account ID" value={ea.accountId} mono />
          <ConfigRow label="Region" value={ea.region} />
          {ea.label && <ConfigRow label="Label" value={ea.label} />}
          <ConfigRow label="Execution role ARN" value={ea.agentCoreExecutionRoleArn} mono hint="AgentCore assumes this role; must be able to assume the model role" />
          <ConfigRow label="ECR prefix" value={ea.ecrRepositoryPrefix} mono />
          <ConfigRow label="S3 artifact bucket" value={ea.s3ArtifactBucket} mono />
          {(net.vpcId || net.subnetIds) && (
            <>
              <ConfigRow label="VPC ID" value={net.vpcId} mono />
              <ConfigRow label="Subnet IDs" value={net.subnetIds} mono />
              <ConfigRow label="Security groups" value={net.securityGroupIds} mono />
            </>
          )}
        </AccountCard>
      </div>

      <div className="trust-explainer" style={{ marginTop: 20 }}>
        <h4>Cross-account trust flow</h4>
        <div className="trust-flow">
          <div className="trust-node trust-node--blue">
            <Cloud size={14} /><span>Model Account<br /><small>{ma.accountId}</small></span>
          </div>
          <div className="trust-arrow">← assumes role →</div>
          <div className="trust-node trust-node--violet">
            <Server size={14} /><span>Execution Account<br /><small>{ea.accountId}</small></span>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          AgentCore in the execution account assumes <code>{ma.crossAccountRoleArn || "…"}</code> via STS to invoke Bedrock models in the model account.
          No Bedrock credentials are stored in this platform.
        </p>
      </div>
    </div>
  );
}

function ConnectedAccountsTab({ org }) {
  const [connections, setConnections] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedConn, setSelectedConn] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadConnections(); }, [org.id]);

  async function loadConnections() {
    setLoading(true);
    try {
      const r = await api(`/api/organizations/${org.id}/account-connections`);
      const conns = r.connections || [];
      setConnections(conns);
      if (conns.length && !selectedConn) setSelectedConn(conns[0]);
    } catch { /* offline */ }
    finally { setLoading(false); }
  }

  async function handleConnected(conn) {
    setShowForm(false);
    await loadConnections();
    setSelectedConn(conn);
    // Trigger initial scan
    try {
      await api(`/api/organizations/${org.id}/account-connections/${conn.id}/sync`, { method: "POST" });
      const r2 = await api(`/api/organizations/${org.id}/account-connections`);
      setConnections(r2.connections || []);
    } catch { /* */ }
  }

  if (showForm) {
    return <AwsAccountConnectionForm orgId={org.id} onSuccess={handleConnected} onCancel={() => setShowForm(false)} />;
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Connected Business Unit Accounts</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Connect AWS accounts from business units to enable resource discovery.
            Guardian assumes cross-account roles — no credentials are stored.
          </p>
        </div>
        <button className="primary" onClick={() => setShowForm(true)}>
          <Link2 size={13} style={{ marginRight: 6 }} />Connect Account
        </button>
      </div>

      {loading && <p className="muted">Loading connections…</p>}

      {!loading && connections.length === 0 && (
        <div className="empty-state" style={{ border: "1px dashed var(--border)" }}>
          <Link2 size={24} style={{ marginBottom: 10, opacity: 0.4 }} />
          <strong>No accounts connected</strong>
          <p className="muted">Connect a BU AWS account to discover APIs, Lambda functions, and knowledge bases for this organization.</p>
        </div>
      )}

      {connections.length > 0 && (
        <div className="conn-layout">
          {/* Connection list sidebar */}
          <div className="conn-sidebar">
            {connections.map((conn) => (
              <button
                key={conn.id}
                className={`conn-card ${selectedConn?.id === conn.id ? "conn-card--active" : ""}`}
                onClick={() => setSelectedConn(conn)}
              >
                <div className="conn-card-header">
                  <div className={`conn-status-dot conn-status-dot--${conn.status === "CONNECTED" ? "green" : "amber"}`} />
                  <strong>{conn.accountName || conn.awsAccountId}</strong>
                </div>
                <code className="muted" style={{ fontSize: 11 }}>{conn.awsAccountId}</code>
                <span className="muted" style={{ fontSize: 11 }}>{conn.environment} · {conn.enabledRegions?.join(", ")}</span>
                <span className={`pill ${conn.status === "CONNECTED" ? "pill--green" : "pill--amber"}`} style={{ marginTop: 4, fontSize: 10 }}>{conn.status}</span>
              </button>
            ))}
          </div>

          {/* Inventory catalog for selected connection */}
          <div style={{ flex: 1 }}>
            {selectedConn && (
              <InventoryCatalog
                orgId={org.id}
                connection={selectedConn}
                onAddToProject={() => {}}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrgDetail({ org, onBack, onOpenProject, onCreateProject, refreshOrg, currentUser = "platform-admin@example.com" }) {
  const [activeTab, setActiveTab] = useState("projects");
  const [showAddMember, setShowAddMember] = useState(false);
  const [orgPendingCount, setOrgPendingCount] = useState(0);
  const isPlatformAdmin = currentUser === "platform-admin@example.com";
  const myRole = org.members?.find((m) => m.userId === currentUser)?.role || (isPlatformAdmin ? "platform_admin" : null);
  const canCreateProject = isPlatformAdmin || myRole === "org_admin" || myRole === "org_member";
  const canManageMembers = isPlatformAdmin || myRole === "org_admin";

  // Load pending count for the Approvals tab badge
  useEffect(() => {
    api(`/api/approvals?organizationId=${org.id}&scope=org&status=pending`)
      .then((r) => setOrgPendingCount((r.approvalTasks || []).length))
      .catch(() => {});
  }, [org.id, activeTab]);

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="org-detail-header">
        <button className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />Organizations
        </button>
        <div className="org-detail-title">
          <div className="org-detail-icon"><Building2 size={24} /></div>
          <div>
            <h2>{org.name}</h2>
            <p className="muted">{org.description}</p>
          </div>
          <div className="filters" style={{ marginLeft: "auto" }}>
            <span className="pill">{ORG_ROLES[myRole] || "Platform Admin"}</span>
            {canCreateProject && (
              <button className="primary" onClick={onCreateProject}>
                <Plus size={14} style={{ marginRight: 6 }} />New Project
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="org-tabs">
        {[
          ["projects", "Projects"],
          ["tool-registry", "Tool Registry"],
          ["approvals", "Approvals"],
          ["members", "Members & Roles"],
          ["accounts", "Connected Accounts"],
          ["aws", "Platform AWS Config"],
        ].map(([id, label]) => (
          <button key={id} className={`org-tab ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>
            {label}
            {id === "approvals" && orgPendingCount > 0 && (
              <span className="tab-count-badge">{orgPendingCount}</span>
            )}
            {id === "aws" && !org.awsConfig && (
              <span className="tab-warn-dot" title="AWS accounts not configured" />
            )}
          </button>
        ))}
      </div>

      {/* Projects tab */}
      {activeTab === "projects" && (
        <>
          {org.projects?.length === 0 && (
            <div className="empty-state">
              No projects yet.{canCreateProject ? " Click New Project to create one." : ""}
            </div>
          )}
          <div className="project-card-grid">
            {(org.projects || []).map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={onOpenProject} />
            ))}
          </div>
        </>
      )}

      {/* Members tab */}
      {activeTab === "members" && (
        <section className="panel">
          <div className="toolbar">
            <h2>Members</h2>
            {canManageMembers && (
              <button className="primary" onClick={() => setShowAddMember((v) => !v)}>
                <Plus size={14} style={{ marginRight: 4 }} />{showAddMember ? "Cancel" : "Add Member"}
              </button>
            )}
          </div>

          {showAddMember && (
            <AddMemberForm
              orgId={org.id}
              onAdded={() => { setShowAddMember(false); refreshOrg?.(); }}
              onCancel={() => setShowAddMember(false)}
            />
          )}

          <Table headers={["User", "Role", "Access"]}>
            {(org.members || []).map((m) => (
              <tr key={m.userId}>
                <td>{m.userId}</td>
                <td><span className="pill">{ORG_ROLES[m.role] || m.role}</span></td>
                <td>
                  {m.role === "org_admin" && "Create projects, manage members"}
                  {m.role === "org_member" && "View org, access granted projects"}
                  {m.role === "platform_admin" && "Full platform access"}
                </td>
              </tr>
            ))}
          </Table>
        </section>
      )}

      {/* Tool Registry tab */}
      {activeTab === "tool-registry" && (
        <section className="panel">
          <OrgToolRegistry org={org} />
        </section>
      )}

      {/* Org Approvals tab */}
      {activeTab === "approvals" && (
        <section className="panel">
          <OrgApprovals org={org} />
        </section>
      )}

      {/* Connected Accounts tab */}
      {activeTab === "accounts" && (
        <section className="panel">
          <ConnectedAccountsTab org={org} />
        </section>
      )}

      {/* AWS Configuration tab */}
      {activeTab === "aws" && (
        <AwsConfigTab org={org} canEdit={canManageMembers} onSaved={refreshOrg} />
      )}
    </div>
  );
}
