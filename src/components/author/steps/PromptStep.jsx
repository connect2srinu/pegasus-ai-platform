import { FRAMEWORKS } from "../../../constants.js";

export default function PromptStep({ form, onChange }) {
  function update(e) { onChange({ [e.target.name]: e.target.value }); }

  const charCount = (form.systemPrompt || "").length;
  const tokenEst = Math.round(charCount / 4);

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Agent identity &amp; system prompt</h3>
      <p className="muted" style={{ marginBottom: 20 }}>Define what the agent is, what it does, and how it should behave. Be specific — this is the most important configuration.</p>

      <div className="form-grid">
        <label className="field">
          Agent name
          <input name="name" value={form.name || ""} onChange={update} placeholder="e.g. Claims Assistant" />
        </label>
        <label className="field">
          Version
          <input name="version" value={form.version || "0.1.0"} onChange={update} placeholder="0.1.0" />
        </label>
        <label className="field">
          Framework
          <select name="framework" value={form.framework || "strands"} onChange={update}>
            {FRAMEWORKS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className="field">
          Model
          <select name="modelId" value={form.modelId || "anthropic.claude-3-5-sonnet-20241022-v2:0"} onChange={update}>
            <option value="anthropic.claude-3-5-sonnet-20241022-v2:0">Claude 3.5 Sonnet v2</option>
            <option value="anthropic.claude-3-5-haiku-20241022-v1:0">Claude 3.5 Haiku</option>
            <option value="anthropic.claude-3-opus-20240229-v1:0">Claude 3 Opus</option>
            <option value="amazon.nova-pro-v1:0">Amazon Nova Pro</option>
            <option value="amazon.nova-lite-v1:0">Amazon Nova Lite</option>
          </select>
        </label>
        <label className="field full">
          Description
          <input name="description" value={form.description || ""} onChange={update} placeholder="One-line summary of what this agent does." />
        </label>
        <label className="field full">
          <span style={{ display: "flex", justifyContent: "space-between" }}>
            System prompt
            <span className="muted" style={{ fontSize: 12 }}>{charCount} chars ≈ {tokenEst} tokens</span>
          </span>
          <textarea
            name="systemPrompt"
            value={form.systemPrompt || ""}
            onChange={update}
            rows={12}
            placeholder="You are a [role] for the [team/business]. Your job is to [primary function]. Always [key behavior]. Never [restriction]."
            style={{ fontFamily: "monospace", fontSize: 13 }}
          />
        </label>

        <div className="field">
          <span>Agent role</span>
          <div className="agent-type-checks">
            {["standalone", "supervisor", "subagent"].map((r) => (
              <label key={r} className="check-label">
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={(form.role || "standalone") === r}
                  onChange={update}
                />
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
