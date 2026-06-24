import { useState } from "react";
import { ArrowLeft, Building2 } from "lucide-react";
import { api } from "../../utils.js";
import { ORG_ROLES } from "../../constants.js";

export default function CreateOrg({ onBack, onCreated }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    adminEmail: "platform-admin@example.com",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Organization name is required."); return; }
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

      <div className="panel" style={{ maxWidth: 600 }}>
        <form onSubmit={submit}>
          {error && (
            <div className="validation-item fail" style={{ marginBottom: 14 }}>
              <strong>ERROR</strong><span>{error}</span>
            </div>
          )}

          <label className="field">
            Organization name <span style={{ color: "var(--accent)" }}>*</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Acme Health"
              maxLength={80}
            />
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            Description
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of this organization's purpose."
              rows={3}
            />
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            Initial Org Admin email
            <input
              value={form.adminEmail}
              onChange={(e) => set("adminEmail", e.target.value)}
              placeholder="admin@example.com"
            />
            <span className="hint">This user will be granted the Org Admin role and can invite others.</span>
          </label>

          <div className="role-explainer" style={{ marginTop: 20 }}>
            <h4>Role hierarchy</h4>
            <table className="data-table" style={{ marginTop: 8 }}>
              <thead><tr><th>Role</th><th>Can do</th></tr></thead>
              <tbody>
                <tr><td><span className="pill">Platform Admin</span></td><td>Create & delete organizations; manage all orgs and projects</td></tr>
                <tr><td><span className="pill">Org Admin</span></td><td>Create projects; add & remove org members; manage org settings</td></tr>
                <tr><td><span className="pill">Org Member</span></td><td>View organization; access projects they are granted</td></tr>
              </tbody>
            </table>
          </div>

          <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
            <button type="button" className="secondary" onClick={onBack}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Creating…" : "Create Organization"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
