import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Database,
  GitBranch,
  Grid2X2,
  KeyRound,
  ListChecks,
  PenLine,
  PlayCircle,
  Settings,
  Wrench,
} from "lucide-react";

import { PROJECTS, PLATFORM_NAME, PLATFORM_MARK } from "./constants.js";
import { api, projectId, normalizeAgent } from "./utils.js";
import { PlaneTabs, ApiBanner } from "./components/shared/index.jsx";
import Workspace from "./components/control-plane/Workspace.jsx";
import AgentRegistry from "./components/control-plane/AgentRegistry.jsx";
import AgentDetail from "./components/control-plane/AgentDetail.jsx";
import RegisterAgent from "./components/control-plane/RegisterAgent.jsx";
import Approvals from "./components/control-plane/Approvals.jsx";
import { Tools, Knowledge } from "./components/control-plane/Tools.jsx";
import Secrets from "./components/control-plane/Secrets.jsx";
import SettingsScreen from "./components/control-plane/SettingsScreen.jsx";
import ExecutionPlane from "./components/execution-plane/ExecutionPlane.jsx";
import BusinessPlane from "./components/business-plane/BusinessPlane.jsx";
import AuthorAgent from "./components/author/AuthorAgent.jsx";

export default function App() {
  const [project, setProject] = useState(PROJECTS[0]);
  const [plane, setPlane] = useState("control");
  const [screen, setScreen] = useState("workspace");
  const [agentsByProject, setAgentsByProject] = useState({});
  const [approvalTasksByProject, setApprovalTasksByProject] = useState({});
  const [toolsByProject, setToolsByProject] = useState({});
  const [knowledgeByProject, setKnowledgeByProject] = useState({});
  const [apiStatus, setApiStatus] = useState("loading");
  const [apiMessage, setApiMessage] = useState("Connecting to Control Plane API");
  const [selectedAgentId, setSelectedAgentId] = useState("claims-assistant");
  const [selectedRunId, setSelectedRunId] = useState("run-claims-001");

  const agents = useMemo(() => (agentsByProject[project] || []).map(normalizeAgent), [agentsByProject, project]);
  const approvalTasks = approvalTasksByProject[project] || [];
  const tools = toolsByProject[project] || [];
  const knowledge = knowledgeByProject[project] || [];
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  async function refreshAgents(target = project) {
    try {
      const payload = await api(`/api/projects/${projectId(target)}/agents`);
      setAgentsByProject((prev) => ({ ...prev, [target]: payload.agents || [] }));
      setApiStatus("connected");
      setApiMessage("Control Plane API connected");
    } catch (err) {
      setApiStatus("offline");
      setApiMessage(`Using fallback data: ${err.message}`);
    }
  }

  async function refreshApprovals(target = project) {
    try {
      const payload = await api(`/api/approvals?projectId=${projectId(target)}`);
      setApprovalTasksByProject((prev) => ({ ...prev, [target]: payload.approvalTasks || [] }));
    } catch {
      setApiStatus("offline");
      setApiMessage("Approval queue unavailable");
    }
  }

  async function refreshTools(target = project) {
    try {
      const payload = await api(`/api/projects/${projectId(target)}/tools`);
      setToolsByProject((prev) => ({ ...prev, [target]: payload.tools || [] }));
    } catch {}
  }

  async function refreshKnowledge(target = project) {
    try {
      const payload = await api(`/api/projects/${projectId(target)}/knowledge`);
      setKnowledgeByProject((prev) => ({ ...prev, [target]: payload.knowledge || [] }));
    } catch {}
  }

  useEffect(() => {
    refreshAgents(project);
    refreshApprovals(project);
    refreshTools(project);
    refreshKnowledge(project);
  }, [project]);

  useEffect(() => {
    if (agents.length && !agents.some((a) => a.id === selectedAgentId)) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  useEffect(() => { document.title = `${PLATFORM_NAME} AI Platform`; }, []);

  function chooseScreen(nextScreen) {
    setScreen(nextScreen);
    setPlane(nextScreen === "runs" ? "execution" : "control");
  }

  const nav = [
    ["workspace", "Workspace", Grid2X2],
    ["agents", "Agents", GitBranch],
    ["author", "Author", PenLine],
    ["register", "Register", ListChecks],
    ["approvals", "Approvals", CheckCircle2],
    ["tools", "Tools", Wrench],
    ["knowledge", "Knowledge", Database],
    ["secrets", "Secrets", KeyRound],
    ["runs", "Runs", PlayCircle],
    ["settings", "Settings", Settings],
  ];

  const screenTitle = {
    workspace: "Project Workspace",
    agents: "Agent Registry",
    agentDetail: "Agent Detail",
    author: "Author Agent",
    register: "Register Agent",
    approvals: "Approval Queue",
    tools: "Tool Catalog",
    knowledge: "Knowledge Bases",
    secrets: "Secret Policies",
    runs: "Run Trace",
    settings: "Project Settings",
  };

  const title = plane === "control"
    ? (screenTitle[screen] || screen)
    : plane === "execution" ? "Execution Plane" : "Business User Plane";

  const sharedProps = { project, tools, knowledge, agents, approvalTasks, setScreen };
  const refreshProps = { refreshAgents, refreshApprovals, refreshTools, refreshKnowledge };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{PLATFORM_MARK}</div>
          <div><strong>{PLATFORM_NAME} AI</strong><span>Agent governance</span></div>
        </div>
        <nav className="nav" aria-label="Primary">
          {nav.map(([id, label, Icon]) => (
            <button
              className={`nav-item ${plane === "control" && (screen === id || (id === "agents" && screen === "agentDetail")) ? "active" : ""}`}
              key={id}
              onClick={() => chooseScreen(id)}
              title={label}
            >
              <span className="icon"><Icon size={18} /></span><span>{label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">{plane === "control" ? "Control Plane" : plane === "execution" ? "Execution Plane" : "Business User Plane"}</p>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            <label className="project-picker">
              <span>Project</span>
              <select value={project} onChange={(e) => setProject(e.target.value)}>
                {PROJECTS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <button className="icon-button" title="Notifications" aria-label="Notifications"><Bell size={18} /></button>
            <div className="avatar" title="Platform Admin">PA</div>
          </div>
        </header>

        <section className="screen">
          <PlaneTabs plane={plane} setPlane={setPlane} />
          <ApiBanner status={apiStatus} message={apiMessage} />

          {plane === "execution" ? (
            <ExecutionPlane {...sharedProps} selectedAgentId={selectedAgentId} setSelectedAgentId={setSelectedAgentId} selectedRunId={selectedRunId} setSelectedRunId={setSelectedRunId} />
          ) : plane === "business" ? (
            <BusinessPlane {...sharedProps} setPlane={setPlane} setSelectedAgentId={setSelectedAgentId} />
          ) : screen === "workspace" ? (
            <Workspace {...sharedProps} />
          ) : screen === "agents" ? (
            <AgentRegistry {...sharedProps} selectAgent={setSelectedAgentId} />
          ) : screen === "agentDetail" ? (
            <AgentDetail agent={selectedAgent} setScreen={setScreen} setPlane={setPlane} />
          ) : screen === "author" ? (
            <AuthorAgent {...sharedProps} {...refreshProps} />
          ) : screen === "register" ? (
            <RegisterAgent {...sharedProps} {...refreshProps} selectAgent={setSelectedAgentId} />
          ) : screen === "approvals" ? (
            <Approvals approvalTasks={approvalTasks} {...refreshProps} />
          ) : screen === "tools" ? (
            <Tools project={project} tools={tools} {...refreshProps} />
          ) : screen === "knowledge" ? (
            <Knowledge project={project} knowledge={knowledge} {...refreshProps} />
          ) : screen === "secrets" ? (
            <Secrets />
          ) : (
            <SettingsScreen project={project} />
          )}
        </section>
      </main>
    </div>
  );
}
