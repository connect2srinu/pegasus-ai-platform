import { BookOpen, Cpu, Users, Zap } from "lucide-react";

const TEMPLATES = [
  {
    id: "blank",
    icon: Zap,
    label: "Blank Agent",
    description: "Start from scratch. You control every setting.",
    framework: "strands",
    preset: {},
  },
  {
    id: "customer-support",
    icon: Users,
    label: "Customer Support",
    description: "Helps users with queries, lookups, and issue resolution using project tools.",
    framework: "strands",
    preset: {
      systemPrompt: "You are a helpful customer support assistant. Help users look up their account information, resolve issues, and answer questions about their service. Always be polite and accurate. If you cannot help, escalate to a human agent.",
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      shortTermMemory: true,
      longTermMemory: false,
    },
  },
  {
    id: "data-analyst",
    icon: BookOpen,
    label: "Data Analyst",
    description: "Queries databases and knowledge bases to answer business questions.",
    framework: "strands",
    preset: {
      systemPrompt: "You are a data analyst assistant. Help users query data, understand trends, and generate insights. Use the available tools to look up accurate information. Always cite your sources and explain your reasoning.",
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      shortTermMemory: true,
      longTermMemory: true,
    },
  },
  {
    id: "multi-agent-supervisor",
    icon: Cpu,
    label: "Multi-Agent Supervisor",
    description: "Routes tasks to specialist subagents. Best for 20+ tools or complex domains.",
    framework: "strands",
    preset: {
      systemPrompt: "You are a supervisor agent. Analyze incoming requests and delegate to the most appropriate specialist agent. Coordinate responses and ensure completeness before replying to the user.",
      modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
      role: "supervisor",
      shortTermMemory: true,
      longTermMemory: false,
    },
  },
];

export default function TemplateStep({ form, onChange }) {
  return (
    <div>
      <h3 style={{ marginBottom: 4 }}>Choose a starting point</h3>
      <p className="muted" style={{ marginBottom: 20 }}>Templates pre-fill the system prompt and configuration. You can customize everything in the next steps.</p>
      <div className="template-grid">
        {TEMPLATES.map((t) => {
          const Icon = t.icon;
          const selected = form.templateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`template-card ${selected ? "selected" : ""}`}
              onClick={() => onChange({ templateId: t.id, framework: t.framework, ...t.preset })}
            >
              <div className="template-icon"><Icon size={22} /></div>
              <strong>{t.label}</strong>
              <p>{t.description}</p>
              {selected && <span className="template-check">✓ Selected</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
