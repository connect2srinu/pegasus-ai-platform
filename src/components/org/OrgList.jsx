import { useState } from "react";
import { Building2, Plus, Users, FolderOpen, ChevronRight } from "lucide-react";
import { Status } from "../shared/index.jsx";

export default function OrgList({ orgs, onSelectOrg, onCreateOrg, currentUser = "platform-admin@example.com" }) {
  const isPlatformAdmin = currentUser === "platform-admin@example.com";

  // Each user sees orgs where they are a member; platform admin sees all
  const visibleOrgs = isPlatformAdmin
    ? orgs
    : orgs.filter((o) => o.members?.some((m) => m.userId === currentUser));

  return (
    <div className="org-list-screen">
      <div className="org-list-header">
        <div>
          <h2>Organizations</h2>
          <p className="muted">
            {isPlatformAdmin
              ? "As Platform Admin you can see and manage all organizations."
              : "Organizations you belong to."}
          </p>
        </div>
        {isPlatformAdmin && (
          <button className="primary" onClick={onCreateOrg}>
            <Plus size={14} style={{ marginRight: 6 }} />Create Organization
          </button>
        )}
      </div>

      {visibleOrgs.length === 0 && (
        <div className="empty-state">
          {isPlatformAdmin ? "No organizations yet. Create the first one." : "You have not been added to any organization yet."}
        </div>
      )}

      <div className="org-card-grid">
        {visibleOrgs.map((org) => {
          const myRole = org.members?.find((m) => m.userId === currentUser)?.role || (isPlatformAdmin ? "platform_admin" : "—");
          const projectCount = org.projects?.length || 0;
          const memberCount = org.members?.length || 0;

          return (
            <article key={org.id} className="org-card" onClick={() => onSelectOrg(org)}>
              <div className="org-card-icon">
                <Building2 size={28} />
              </div>
              <div className="org-card-body">
                <h3>{org.name}</h3>
                <p className="muted">{org.description}</p>
                <div className="org-card-meta">
                  <span><FolderOpen size={13} style={{ marginRight: 4 }} />{projectCount} project{projectCount !== 1 ? "s" : ""}</span>
                  <span><Users size={13} style={{ marginRight: 4 }} />{memberCount} member{memberCount !== 1 ? "s" : ""}</span>
                  <Status>{myRole.replace(/_/g, " ")}</Status>
                </div>
              </div>
              <ChevronRight size={18} className="org-card-chevron" />
            </article>
          );
        })}
      </div>
    </div>
  );
}
