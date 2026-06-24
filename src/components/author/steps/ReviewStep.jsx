import { useState } from "react";
import { api, projectId, slugify } from "../../../utils.js";
import { PLATFORM_SLUG } from "../../../constants.js";

function buildManifest(form, project) {
  const pid = projectId(project);
  const agentId = slugify(form.name || "my-agent");

  const tools = (form.selectedTools || []).map((toolId) => ({ toolId, version: "latest" }));
  const knowledge = (form.selectedKbs || []).map((kbId) => ({ knowledgeBaseId: kbId }));

  return `schemaVersion: ${PLATFORM_SLUG}.agent/v1
id: ${agentId}
name: ${form.name || "My Agent"}
version: ${form.version || "0.1.0"}
projectId: ${pid}
authoringMode: form
role: ${form.role || "standalone"}
owner:
  userId: ${form.ownerUserId || "current-user@example.com"}
  businessUnit: ${project}

runtime:
  target: agentcore
  framework: ${form.framework || "strands"}
  entrypoint: agent.py

model:
  provider: bedrock
  modelId: ${form.modelId || "anthropic.claude-3-5-sonnet-20241022-v2:0"}
  maxTokens: ${form.maxTokensPerRun || 4096}

systemPrompt: |
${(form.systemPrompt || "You are a helpful AI assistant.")
  .split("\n")
  .map((line) => `  ${line}`)
  .join("\n")}
${tools.length > 0 ? `
tools:
${tools.map((t) => `  - toolId: ${t.toolId}\n    version: ${t.version}`).join("\n")}` : "tools: []"}
${knowledge.length > 0 ? `
knowledge:
${knowledge.map((k) => `  - knowledgeBaseId: ${k.knowledgeBaseId}`).join("\n")}` : "knowledge: []"}

memory:
  shortTerm: ${form.shortTermMemory ?? true}
  longTerm: ${form.longTermMemory ?? false}
  sessionScope: ${form.memoryScope || "user"}

observability:
  arizeProject: ${PLATFORM_SLUG}-${pid}
  traceLevel: ${form.traceLevel || "standard"}

policies:
  maxTokensPerRun: ${form.maxTokensPerRun || 4096}
  humanApprovalRequired: ${form.humanApprovalRequired ?? false}
  dataClassification: ${form.classification || "internal"}
  riskTier: ${form.riskTier || "medium"}`;
}

export default function ReviewStep({ form, project, onPublished }) {
  const [activeTab, setActiveTab] = useState("manifest");
  const [generatedCode, setGeneratedCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [error, setError] = useState("");
  const [publishResult, setPublishResult] = useState(null);

  const manifest = buildManifest(form, project);

  async function generateCode() {
    setBusy(true);
    setError("");
    try {
      const result = await api("/api/agents/generate", {
        method: "POST",
        body: JSON.stringify({ manifest, projectId: projectId(project), form }),
      });
      setGeneratedCode(result.files);
      setActiveTab("code");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setPublishBusy(true);
    setError("");
    try {
      const result = await api("/api/agents/publish", {
        method: "POST",
        body: JSON.stringify({ manifest, projectId: projectId(project), form, submittedBy: form.ownerUserId || "current-user@example.com" }),
      });
      setPublishResult(result);
      onPublished?.(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Review &amp; submit</h3>
      <p className="muted" style={{ marginBottom: 16 }}>
        Review the generated manifest and code before submitting for approval.
        Submitting registers the agent in the control plane and opens the approval workflow.
      </p>

      {error && <div className="validation-item fail" style={{ marginBottom: 14 }}><strong>ERROR</strong><span>{error}</span></div>}

      {publishResult && (
        <div className="validation-item pass" style={{ marginBottom: 14 }}>
          <strong>SUBMITTED</strong>
          <span>
            Agent registered with ID <code>{publishResult.agentId}</code>.
            {publishResult.prUrl && <> PR: <a href={publishResult.prUrl} target="_blank" rel="noreferrer">{publishResult.prUrl}</a></>}
            {" "}Approval tasks created — check the Approvals queue.
          </span>
        </div>
      )}

      <div className="code-tabs">
        <button className={activeTab === "manifest" ? "primary" : "secondary"} onClick={() => setActiveTab("manifest")}>manifest.yaml</button>
        <button className={activeTab === "code" ? "primary" : "secondary"} onClick={() => { if (!generatedCode) generateCode(); else setActiveTab("code"); }}>
          {busy ? "Generating…" : "agent.py"}
        </button>
        {generatedCode?.["tools.py"] && (
          <button className={activeTab === "tools" ? "primary" : "secondary"} onClick={() => setActiveTab("tools")}>tools.py</button>
        )}
        {generatedCode?.["Dockerfile"] && (
          <button className={activeTab === "docker" ? "primary" : "secondary"} onClick={() => setActiveTab("docker")}>Dockerfile</button>
        )}
      </div>

      <pre className="code-preview">
        <code>
          {activeTab === "manifest" && manifest}
          {activeTab === "code" && (generatedCode?.["agent.py"] || "Click 'agent.py' tab to generate code.")}
          {activeTab === "tools" && generatedCode?.["tools.py"]}
          {activeTab === "docker" && generatedCode?.["Dockerfile"]}
        </code>
      </pre>

      <div className="toolbar" style={{ marginTop: 16, justifyContent: "space-between" }}>
        <div className="filters">
          <button className="secondary" type="button" onClick={generateCode} disabled={busy}>
            {busy ? "Generating…" : "Preview Generated Code"}
          </button>
          <button className="secondary" type="button" onClick={() => navigator.clipboard?.writeText(manifest)}>
            Copy Manifest
          </button>
        </div>
        <button className="primary" type="button" onClick={publish} disabled={publishBusy || !!publishResult}>
          {publishBusy ? "Submitting…" : publishResult ? "Submitted ✓" : "Submit for Approval"}
        </button>
      </div>
    </div>
  );
}
