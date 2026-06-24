import { useState } from "react";
import { ArrowLeft, FolderOpen } from "lucide-react";
import { api } from "../../utils.js";

export default function CreateProject({ org, onBack, onCreated }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Project name is required."); return; }
    setBusy(true);
    setError("");
    try {
      const result = await api(`/api/organizations/${org.id}/projects`, {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim(),
          createdBy: "current-user@example.com",
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
          <ArrowLeft size={15} />{org.name}
        </button>
        <div className="org-detail-title">
          <div className="org-detail-icon"><FolderOpen size={24} /></div>
          <div>
            <h2>New Project</h2>
            <p className="muted">Creating a project under <strong>{org.name}</strong>.</p>
          </div>
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 520 }}>
        <form onSubmit={submit}>
          {error && (
            <div className="validation-item fail" style={{ marginBottom: 14 }}>
              <strong>ERROR</strong><span>{error}</span>
            </div>
          )}

          <label className="field">
            Project name <span style={{ color: "var(--accent)" }}>*</span>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Claims Operations"
              maxLength={80}
            />
          </label>

          <label className="field" style={{ marginTop: 12 }}>
            Description
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Brief description of this project's scope and purpose."
              rows={3}
            />
          </label>

          <div className="toolbar" style={{ marginTop: 20, marginBottom: 0 }}>
            <button type="button" className="secondary" onClick={onBack}>Cancel</button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? "Creating…" : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
