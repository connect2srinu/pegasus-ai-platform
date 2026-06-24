import { useState } from "react";
import TemplateStep from "./steps/TemplateStep.jsx";
import PromptStep from "./steps/PromptStep.jsx";
import ToolsStep from "./steps/ToolsStep.jsx";
import ConfigStep from "./steps/ConfigStep.jsx";
import ReviewStep from "./steps/ReviewStep.jsx";

const STEPS = [
  { id: "template", label: "Template" },
  { id: "prompt", label: "Prompt" },
  { id: "tools", label: "Tools" },
  { id: "config", label: "Config" },
  { id: "review", label: "Review" },
];

const INITIAL_FORM = {
  templateId: "blank",
  name: "",
  version: "0.1.0",
  framework: "strands",
  role: "standalone",
  modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
  description: "",
  systemPrompt: "",
  selectedTools: [],
  selectedKbs: [],
  shortTermMemory: true,
  longTermMemory: false,
  memoryScope: "user",
  classification: "internal",
  riskTier: "medium",
  maxTokensPerRun: "4096",
  traceLevel: "standard",
  ownerUserId: "current-user@example.com",
  humanApprovalRequired: false,
};

export default function AuthorAgent({ project, tools, knowledge, setScreen, refreshAgents, refreshApprovals }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [form, setForm] = useState(INITIAL_FORM);

  function onChange(updates) {
    setForm((f) => ({ ...f, ...updates }));
  }

  function canAdvance() {
    if (stepIndex === 0) return !!form.templateId;
    if (stepIndex === 1) return !!(form.name?.trim()) && !!(form.systemPrompt?.trim());
    return true;
  }

  async function handlePublished(result) {
    await refreshAgents?.();
    await refreshApprovals?.();
    setTimeout(() => setScreen("approvals"), 1200);
  }

  const stepProps = { form, onChange, project, tools, knowledge };

  return (
    <div className="split">
      <section className="panel author-panel">
        {/* Wizard stepper */}
        <div className="author-stepper">
          {STEPS.map((step, i) => (
            <button
              key={step.id}
              type="button"
              className={`author-step ${i === stepIndex ? "active" : i < stepIndex ? "done" : ""}`}
              onClick={() => i < stepIndex && setStepIndex(i)}
            >
              <span className="author-step-dot">{i < stepIndex ? "✓" : i + 1}</span>
              <span>{step.label}</span>
            </button>
          ))}
        </div>

        {/* Step content */}
        <div className="author-step-content">
          {stepIndex === 0 && <TemplateStep {...stepProps} />}
          {stepIndex === 1 && <PromptStep {...stepProps} />}
          {stepIndex === 2 && <ToolsStep {...stepProps} />}
          {stepIndex === 3 && <ConfigStep {...stepProps} />}
          {stepIndex === 4 && <ReviewStep {...stepProps} onPublished={handlePublished} />}
        </div>

        {/* Navigation */}
        {stepIndex < 4 && (
          <div className="toolbar author-nav">
            <button className="secondary" type="button" onClick={() => stepIndex > 0 ? setStepIndex(stepIndex - 1) : setScreen("workspace")}>
              {stepIndex === 0 ? "Cancel" : "Back"}
            </button>
            <button className="primary" type="button" onClick={() => setStepIndex(stepIndex + 1)} disabled={!canAdvance()}>
              {stepIndex === 3 ? "Review →" : "Next →"}
            </button>
          </div>
        )}
        {stepIndex === 4 && (
          <div className="toolbar author-nav">
            <button className="secondary" type="button" onClick={() => setStepIndex(3)}>Back</button>
            <button className="secondary" type="button" onClick={() => setScreen("workspace")}>Back to Workspace</button>
          </div>
        )}
      </section>

      {/* Sidebar summary */}
      <aside className="panel author-sidebar">
        <h2>Agent Summary</h2>
        <div className="author-summary">
          <div className="summary-row"><span>Name</span><strong>{form.name || <em className="muted">not set</em>}</strong></div>
          <div className="summary-row"><span>Framework</span><strong>{form.framework || "strands"}</strong></div>
          <div className="summary-row"><span>Model</span><strong>{(form.modelId || "").split(".").pop()?.split(":")[0] || "—"}</strong></div>
          <div className="summary-row"><span>Role</span><strong>{form.role || "standalone"}</strong></div>
          <div className="summary-row"><span>Tools</span><strong>{(form.selectedTools || []).length} selected</strong></div>
          <div className="summary-row"><span>Knowledge</span><strong>{(form.selectedKbs || []).length} selected</strong></div>
          <div className="summary-row"><span>Memory</span><strong>{form.shortTermMemory ? "Short-term" : "None"}{form.longTermMemory ? " + Long-term" : ""}</strong></div>
          <div className="summary-row"><span>Risk</span><strong>{form.riskTier || "medium"}</strong></div>
          <div className="summary-row"><span>Classification</span><strong>{form.classification || "internal"}</strong></div>
        </div>

        <div style={{ marginTop: 20 }}>
          <h2>What happens next</h2>
          <ol className="author-steps-list">
            <li>Manifest YAML is generated from your inputs</li>
            <li>Strands agent code is generated and packaged</li>
            <li>Agent is registered in the control plane</li>
            <li>Approval tasks are created for project owner and platform admin</li>
            <li>On approval, agent is deployed to AgentCore Runtime</li>
          </ol>
        </div>

        {form.longTermMemory && (
          <div className="validation-item warn" style={{ marginTop: 16 }}>
            <strong>WARN</strong><span>Long-term memory requires Project Owner approval before deployment.</span>
          </div>
        )}
        {(form.riskTier === "high" || form.riskTier === "critical") && (
          <div className="validation-item warn" style={{ marginTop: 8 }}>
            <strong>WARN</strong><span>{form.riskTier} risk tier requires Platform Admin sign-off for all tools.</span>
          </div>
        )}
      </aside>
    </div>
  );
}
