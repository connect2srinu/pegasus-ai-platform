import { useState } from "react";
import { Building2, Plus, FolderOpen, Users, ArrowLeft, ChevronRight, Trash2 } from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api } from "../../utils.js";
import { fallback, ORG_ROLES, PROJECT_ROLES } from "../../constants.js";

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

export default function OrgDetail({ org, onBack, onOpenProject, onCreateProject, refreshOrg, currentUser = "platform-admin@example.com" }) {
  const [activeTab, setActiveTab] = useState("projects");
  const [showAddMember, setShowAddMember] = useState(false);
  const isPlatformAdmin = currentUser === "platform-admin@example.com";
  const myRole = org.members?.find((m) => m.userId === currentUser)?.role || (isPlatformAdmin ? "platform_admin" : null);
  const canCreateProject = isPlatformAdmin || myRole === "org_admin" || myRole === "org_member";
  const canManageMembers = isPlatformAdmin || myRole === "org_admin";

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
        {[["projects", "Projects"], ["members", "Members & Roles"]].map(([id, label]) => (
          <button key={id} className={`org-tab ${activeTab === id ? "active" : ""}`} onClick={() => setActiveTab(id)}>
            {label}
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
    </div>
  );
}
