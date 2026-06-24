import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
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

import { PROJECTS, PLATFORM_NAME, PLATFORM_MARK, FALLBACK_ORGS, ORG_PROJECTS } from "./constants.js";
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
import OrgList from "./components/org/OrgList.jsx";
import OrgDetail from "./components/org/OrgDetail.jsx";
import CreateOrg from "./components/org/CreateOrg.jsx";
import CreateProject from "./components/org/CreateProject.jsx";

const CURRENT_USER = "platform-admin@example.com";

export default function App() {
  // Org state
  const [orgs, setOrgs] = useState(FALLBACK_ORGS);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [orgScreen, setOrgScreen] = useState(null); // null | "orgList" | "orgDetail" | "createOrg" | "createProject"

  // Project state
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

  // Projects available in the selected org (or all if no org chosen)
  const orgProjectNames = selectedOrg
    ? (selectedOrg.projects || []).map((p) => p.name).filter((n) => PROJECTS.includes(n))
    : PROJECTS;
  const visibleProjects = orgProjectNames.length > 0 ? orgProjectNames : PROJECTS;

  async function refreshOrgs() {
    try {
      const payload = await api("/api/organizations");
      setOrgs(payload.organizations || FALLBACK_ORGS);
    } catch {
      setOrgs(FALLBACK_ORGS);
    }
  }

  async function refreshSingleOrg(orgId) {
    try {
      const payload = await api(`/api/organizations/${orgId}`);
      setOrgs((prev) => prev.map((o) => (o.id === orgId ? payload.organization : o)));
      if (selectedOrg?.id === orgId) setSelectedOrg(payload.organization);
    } catch {}
  }

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
    refreshOrgs();
  }, []);

  useEffect(() => {
    if (agents.length && !agents.some((a) => a.id === selectedAgentId)) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  useEffect(() => { document.title = `${PLATFORM_NAME} AI Platform`; }, []);

  function chooseScreen(nextScreen) {
    setOrgScreen(null);
    setScreen(nextScreen);
    setPlane(nextScreen === "runs" ? "execution" : "control");
  }

  function openOrgs() {
    setOrgScreen("orgList");
  }

  function handleSelectOrg(org) {
    setSelectedOrg(org);
    setOrgScreen("orgDetail");
    // Auto-pick first project in this org that exists in our project list
    const firstProject = (org.projects || []).find((p) => PROJECTS.includes(p.name));
    if (firstProject) setProject(firstProject.name);
  }

  function handleOpenProject(project) {
    setOrgScreen(null);
    setProject(project.name);
    setScreen("workspace");
    setPlane("control");
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

  const title = orgScreen === "orgList" ? "Organizations"
    : orgScreen === "orgDetail" ? selectedOrg?.name || "Organization"
    : orgScreen === "createOrg" ? "Create Organization"
    : orgScreen === "createProject" ? "New Project"
    : plane === "control" ? (screenTitle[screen] || screen)
    : plane === "execution" ? "Execution Plane" : "Business User Plane";

  const sharedProps = { project, tools, knowledge, agents, approvalTasks, setScreen };
  const refreshProps = { refreshAgents, refreshApprovals, refreshTools, refreshKnowledge };

  const isPlatformAdmin = CURRENT_USER === "platform-admin@example.com";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{PLATFORM_MARK}</div>
          <div><strong>{PLATFORM_NAME} AI</strong><span>Agent governance</span></div>
        </div>

        {/* Org switcher in sidebar */}
        <button
          className={`org-switcher ${orgScreen ? "active" : ""}`}
          onClick={openOrgs}
          title="Switch organization"
        >
          <Building2 size={14} />
          <span className="org-switcher-name">{selectedOrg ? selectedOrg.name : "All Orgs"}</span>
          <ChevronRight size={13} className="org-switcher-chevron" />
        </button>

        <nav className="nav" aria-label="Primary">
          {nav.map(([id, label, Icon]) => (
            <button
              className={`nav-item ${!orgScreen && plane === "control" && (screen === id || (id === "agents" && screen === "agentDetail")) ? "active" : ""}`}
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
          <div className="topbar-breadcrumb">
            {selectedOrg && (
              <>
                <button className="breadcrumb-link" onClick={openOrgs}>{selectedOrg.name}</button>
                <ChevronRight size={14} className="breadcrumb-sep" />
              </>
            )}
            <p className="eyebrow">{orgScreen ? "Organizations" : plane === "control" ? "Control Plane" : plane === "execution" ? "Execution Plane" : "Business User Plane"}</p>
            <h1>{title}</h1>
          </div>
          <div className="top-actions">
            {!orgScreen && (
              <label className="project-picker">
                <span>Project</span>
                <select value={project} onChange={(e) => setProject(e.target.value)}>
                  {visibleProjects.map((p) => <option key={p}>{p}</option>)}
                </select>
              </label>
            )}
            <button className="icon-button" title="Notifications" aria-label="Notifications"><Bell size={18} /></button>
            <div className="avatar" title="Platform Admin">PA</div>
          </div>
        </header>

        <section className="screen">
          {orgScreen ? (
            // Org management screens — no plane tabs
            orgScreen === "orgList" ? (
              <OrgList
                orgs={orgs}
                currentUser={CURRENT_USER}
                onSelectOrg={handleSelectOrg}
                onCreateOrg={() => setOrgScreen("createOrg")}
              />
            ) : orgScreen === "createOrg" ? (
              <CreateOrg
                onBack={() => setOrgScreen("orgList")}
                onCreated={(result) => {
                  refreshOrgs();
                  setSelectedOrg(result.organization);
                  setOrgScreen("orgDetail");
                }}
              />
            ) : orgScreen === "orgDetail" && selectedOrg ? (
              <OrgDetail
                org={selectedOrg}
                currentUser={CURRENT_USER}
                onBack={() => setOrgScreen("orgList")}
                onOpenProject={handleOpenProject}
                onCreateProject={() => setOrgScreen("createProject")}
                refreshOrg={() => refreshSingleOrg(selectedOrg.id)}
              />
            ) : orgScreen === "createProject" && selectedOrg ? (
              <CreateProject
                org={selectedOrg}
                onBack={() => setOrgScreen("orgDetail")}
                onCreated={(result) => {
                  refreshSingleOrg(selectedOrg.id);
                  setOrgScreen("orgDetail");
                }}
              />
            ) : null
          ) : (
            <>
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
            </>
          )}
        </section>
      </main>
    </div>
  );
}
