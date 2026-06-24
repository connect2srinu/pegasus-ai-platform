export default function ConfigStep({ form, onChange }) {
  function update(e) {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    onChange({ [e.target.name]: value });
  }

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Memory, observability &amp; policy</h3>
      <p className="muted" style={{ marginBottom: 20 }}>Configure runtime behavior, memory scope, and platform policy settings.</p>

      <div className="form-grid">
        <div className="field">
          <span>Short-term memory (per session)</span>
          <label className="check-label" style={{ marginTop: 8 }}>
            <input type="checkbox" name="shortTermMemory" checked={form.shortTermMemory ?? true} onChange={update} />
            Enable in-session context retention
          </label>
        </div>

        <div className="field">
          <span>Long-term memory (cross-session)</span>
          <label className="check-label" style={{ marginTop: 8 }}>
            <input type="checkbox" name="longTermMemory" checked={form.longTermMemory ?? false} onChange={update} />
            Enable persistent memory (requires owner approval)
          </label>
        </div>

        <label className="field">
          Memory scope
          <select name="memoryScope" value={form.memoryScope || "user"} onChange={update}>
            <option value="user">Per user</option>
            <option value="conversation">Per conversation</option>
            <option value="project">Project-wide</option>
          </select>
        </label>

        <label className="field">
          Data classification
          <select name="classification" value={form.classification || "internal"} onChange={update}>
            <option value="internal">Internal</option>
            <option value="confidential">Confidential</option>
            <option value="restricted">Restricted</option>
          </select>
        </label>

        <label className="field">
          Risk tier
          <select name="riskTier" value={form.riskTier || "medium"} onChange={update}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label className="field">
          Max tokens per run
          <select name="maxTokensPerRun" value={form.maxTokensPerRun || "4096"} onChange={update}>
            <option value="2048">2,048</option>
            <option value="4096">4,096 (recommended)</option>
            <option value="8192">8,192</option>
            <option value="16384">16,384</option>
          </select>
        </label>

        <label className="field">
          Observability trace level
          <select name="traceLevel" value={form.traceLevel || "standard"} onChange={update}>
            <option value="minimal">Minimal — errors only</option>
            <option value="standard">Standard — steps + errors</option>
            <option value="detailed">Detailed — all tool calls + tokens</option>
          </select>
        </label>

        <label className="field">
          Owner email
          <input name="ownerUserId" value={form.ownerUserId || "current-user@example.com"} onChange={update} placeholder="owner@example.com" />
        </label>

        <div className="field">
          <span>Human approval required</span>
          <label className="check-label" style={{ marginTop: 8 }}>
            <input type="checkbox" name="humanApprovalRequired" checked={form.humanApprovalRequired ?? false} onChange={update} />
            Require human-in-the-loop before final response
          </label>
        </div>
      </div>
    </div>
  );
}
