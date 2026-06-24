import { TOOL_TYPES, KB_TYPES, fallback } from "../../../constants.js";

export default function ToolsStep({ form, onChange, project, tools, knowledge }) {
  const projectTools = tools.length > 0
    ? tools
    : fallback[project]?.tools.map((name) => ({ id: name, name, toolType: "mcp", status: "approved" })) || [];

  const projectKbs = knowledge.length > 0
    ? knowledge
    : fallback[project]?.knowledge.map((name) => ({ id: name, name, kbType: "bedrock_kb", status: "approved" })) || [];

  function toggleTool(toolId) {
    const current = form.selectedTools || [];
    onChange({ selectedTools: current.includes(toolId) ? current.filter((t) => t !== toolId) : [...current, toolId] });
  }

  function toggleKb(kbId) {
    const current = form.selectedKbs || [];
    onChange({ selectedKbs: current.includes(kbId) ? current.filter((k) => k !== kbId) : [...current, kbId] });
  }

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Tools &amp; knowledge bases</h3>
      <p className="muted" style={{ marginBottom: 20 }}>
        Select from approved project resources. Only tools and knowledge bases that have passed the approval workflow are shown.
        Need a new tool? <button className="link-button" style={{ fontSize: 13 }}>Register a tool first</button>.
      </p>

      <div className="split">
        <div>
          <h4 style={{ marginBottom: 10 }}>Tools ({projectTools.length} available)</h4>
          {projectTools.length === 0 && <p className="muted">No approved tools in this project yet.</p>}
          <div className="resource-checklist">
            {projectTools.map((tool) => {
              const checked = (form.selectedTools || []).includes(tool.id || tool.name);
              return (
                <label key={tool.id || tool.name} className={`resource-check-item ${checked ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleTool(tool.id || tool.name)}
                  />
                  <div>
                    <strong>{tool.name}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{TOOL_TYPES[tool.toolType] || tool.toolType || "MCP"}</span>
                    {tool.description && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{tool.description}</p>}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <h4 style={{ marginBottom: 10 }}>Knowledge bases ({projectKbs.length} available)</h4>
          {projectKbs.length === 0 && <p className="muted">No approved knowledge bases in this project yet.</p>}
          <div className="resource-checklist">
            {projectKbs.map((kb) => {
              const checked = (form.selectedKbs || []).includes(kb.id || kb.name);
              return (
                <label key={kb.id || kb.name} className={`resource-check-item ${checked ? "checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleKb(kb.id || kb.name)}
                  />
                  <div>
                    <strong>{kb.name}</strong>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{KB_TYPES[kb.kbType] || kb.kbType || "Bedrock KB"}</span>
                    {kb.description && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-muted)" }}>{kb.description}</p>}
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="author-summary-row" style={{ marginTop: 16 }}>
        <span className="pill">{(form.selectedTools || []).length} tools selected</span>
        <span className="pill">{(form.selectedKbs || []).length} knowledge bases selected</span>
      </div>
    </div>
  );
}
