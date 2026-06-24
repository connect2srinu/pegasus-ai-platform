import { useEffect, useState } from "react";
import { api, projectId, titleCase } from "../../utils.js";
import { AGENT_TYPES, SAMPLE_YAML, fallback } from "../../constants.js";

export default function RegisterAgent({ project, refreshAgents, refreshApprovals, setScreen, selectAgent }) {
  const defaults = fallback[project];
  const [form, setForm] = useState({
    name: "Claims Intake Agent",
    agentType: "crewai",
    runtimeTarget: "agentcore",
    modelId: "anthropic.claude-3-5-sonnet",
    description: `Submit a normalized portable agent specification for ${project}.`,
    tools: defaults.tools.slice(0, 2).join(","),
    knowledge: defaults.knowledge[0],
    shortTermMemory: "true",
    longTermMemory: "false",
    ownerUserId: "current-user@example.com",
    version: "0.1.0",
  });
  const [result, setResult] = useState([]);
  const [approvalPreview, setApprovalPreview] = useState([]);
  const [yamlText, setYamlText] = useState(SAMPLE_YAML.replace("claims-operations", projectId(project)).replace("Claims Operations", project));
  const [busy, setBusy] = useState(false);

  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  useEffect(() => {
    setForm((f) => ({ ...f, description: `Submit a normalized portable agent specification for ${project}.`, tools: defaults.tools.slice(0, 2).join(","), knowledge: defaults.knowledge[0] }));
    setYamlText(SAMPLE_YAML.replace("claims-operations", projectId(project)).replace("Claims Operations", project));
  }, [project]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setResult([{ status: "warn", message: `Registering ${form.name}…` }]);
    try {
      const payload = { ...form, projectId: projectId(project), projectName: project, tools: form.tools.split(",").map((x) => x.trim()).filter(Boolean), knowledge: [form.knowledge], shortTermMemory: form.shortTermMemory === "true", longTermMemory: form.longTermMemory === "true", businessUnit: project };
      const response = await api("/api/agents", { method: "POST", body: JSON.stringify(payload) });
      setResult(response.agent.validations || []);
      setApprovalPreview(response.approvalTasks || []);
      await refreshAgents();
      await refreshApprovals();
      selectAgent(response.agent.id);
      setTimeout(() => setScreen("agents"), 500);
    } catch (error) {
      setResult(error.payload?.validations || [{ status: "fail", message: error.message }]);
    } finally {
      setBusy(false);
    }
  }

  async function uploadYaml() {
    setBusy(true);
    setResult([{ status: "warn", message: "Uploading YAML specification and running registry validation…" }]);
    try {
      const response = await api("/api/agents/spec-upload", {
        method: "POST",
        body: JSON.stringify({ yamlText, submittedBy: "current-user@example.com", expectedProjectId: projectId(project) }),
      });
      setResult(response.validations || response.agent.validations || []);
      setApprovalPreview(response.approvalTasks || []);
      await refreshAgents();
      await refreshApprovals();
      selectAgent(response.agent.id);
      setScreen("approvals");
    } catch (error) {
      setResult(error.payload?.validations || [{ status: "fail", message: error.message }]);
      setApprovalPreview([]);
    } finally {
      setBusy(false);
    }
  }

  async function loadYamlFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setYamlText(await file.text());
  }

  return (
    <div className="split">
      <section className="panel">
        <form onSubmit={submit}>
          <div className="stepper">
            {["Basics", "Runtime", "Tools", "Knowledge", "Review"].map((step, i) => (
              <div key={step} className={`step ${i === 0 ? "active" : ""}`}>{step}</div>
            ))}
          </div>
          <div className="form-grid">
            <label className="field">Agent name<input name="name" value={form.name} onChange={update} /></label>
            <label className="field">Agent type<select name="agentType" value={form.agentType} onChange={update}>{Object.entries(AGENT_TYPES).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label>
            <label className="field">Runtime target<select name="runtimeTarget" value={form.runtimeTarget} onChange={update}><option value="agentcore">Amazon Bedrock AgentCore</option><option value="external">External runtime</option></select></label>
            <label className="field">Model<select name="modelId" value={form.modelId} onChange={update}><option value="anthropic.claude-3-5-sonnet">anthropic.claude-3-5-sonnet</option><option value="anthropic.claude-3-5-haiku">anthropic.claude-3-5-haiku</option><option value="amazon.nova-pro">amazon.nova-pro</option></select></label>
            <label className="field full">Description<textarea name="description" value={form.description} onChange={update} /></label>
            <label className="field">Tool access<select name="tools" value={form.tools} onChange={update}><option value={defaults.tools.slice(0, 2).join(",")}>{defaults.tools.slice(0, 2).join(", ")}</option><option value={defaults.tools.join(",")}>{defaults.tools.join(", ")}</option></select></label>
            <label className="field">Knowledge base<select name="knowledge" value={form.knowledge} onChange={update}>{defaults.knowledge.map((kb) => <option value={kb} key={kb}>{kb}</option>)}</select></label>
            <label className="field">Short-term memory<select name="shortTermMemory" value={form.shortTermMemory} onChange={update}><option value="true">Enabled</option><option value="false">Disabled</option></select></label>
            <label className="field">Long-term memory<select name="longTermMemory" value={form.longTermMemory} onChange={update}><option value="false">Disabled</option><option value="true">Requires approval</option></select></label>
            <label className="field">Owner email<input name="ownerUserId" value={form.ownerUserId} onChange={update} /></label>
            <label className="field">Version<input name="version" value={form.version} onChange={update} /></label>
          </div>
          <div className="toolbar" style={{ marginTop: 18, marginBottom: 0 }}>
            <button className="secondary" type="button">Save Draft</button>
            <button className="primary" type="submit" disabled={busy}>{busy ? "Registering…" : "Register And Validate"}</button>
          </div>
        </form>

        <div className="yaml-upload">
          <div className="toolbar">
            <div>
              <h2>YAML Spec Upload</h2>
              <p className="muted">Upload a portable agent spec, then validate project access, tools, knowledge bases, memory, and secret references.</p>
            </div>
            <label className="file-button">Choose YAML<input type="file" accept=".yaml,.yml,text/yaml" onChange={loadYamlFile} /></label>
          </div>
          <textarea className="yaml-editor" value={yamlText} onChange={(e) => setYamlText(e.target.value)} aria-label="Agent YAML specification" />
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="secondary" type="button" onClick={() => setYamlText(SAMPLE_YAML.replace("claims-operations", projectId(project)).replace("Claims Operations", project))}>Reset Sample</button>
            <button className="primary" type="button" onClick={uploadYaml} disabled={busy}>{busy ? "Validating…" : "Upload YAML And Validate"}</button>
          </div>
        </div>
      </section>

      <aside className="panel">
        <h2>Validation Results</h2>
        <div className="validation-list">
          {(result.length ? result : [
            { status: "pass", message: "Portable spec schema is valid." },
            { status: "pass", message: "CrewAI and Strands are supported normalized agent types." },
            { status: "warn", message: "Long-term memory requires retention approval." },
          ]).map((item, i) => (
            <div className={`validation-item ${item.status}`} key={i}>
              <strong>{item.status.toUpperCase()}</strong><span>{item.message}</span>
            </div>
          ))}
        </div>
        {approvalPreview.length > 0 && (
          <div className="approval-preview">
            <h2>Generated Approval Tasks</h2>
            {approvalPreview.map((task) => (
              <div className="approval-chip" key={task.id}>
                <span>{titleCase(task.approverType)}</span>
                <strong>{task.reason}</strong>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
