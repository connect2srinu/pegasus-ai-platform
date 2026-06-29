import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, AlertTriangle, Wrench, Zap, Globe, Database, ChevronDown, ChevronRight } from "lucide-react";
import { Table, Status } from "../shared/index.jsx";
import { api, projectId, titleCase } from "../../utils.js";
import { KB_TYPES, SIDE_EFFECT_LEVELS, PROJECT_TOOL_STATUS } from "../../constants.js";

const SOURCE_ICONS = {
  LAMBDA:      <Zap size={13} style={{ color: "var(--amber)" }} />,
  API_GATEWAY: <Globe size={13} style={{ color: "var(--blue)" }} />,
  BEDROCK_KB:  <Database size={13} style={{ color: "#7c3aed" }} />,
  MCP:         <Wrench size={13} style={{ color: "var(--muted)" }} />,
};
const SIDE_COLOR = { READ_ONLY: "green", WRITE: "amber", DESTRUCTIVE: "red" };

// ── Available org tools panel ─────────────────────────────────────────────────

function AvailableOrgTools({ pid, onEnabled }) {
  const [tools, setTools]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(null);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api(`/api/projects/${pid}/available-org-tools`);
      setTools(r.availableTools || []);
    } catch { setTools([]); }
    finally { setLoading(false); }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  async function enable(ltd) {
    setEnabling(ltd.id);
    try {
      await api(`/api/projects/${pid}/enable-org-tool`, {
        method: "POST",
        body: JSON.stringify({ logicalToolDefinitionId: ltd.id }),
      });
      await load();
      onEnabled?.(ltd);
    } catch (err) {
      alert(err.message);
    } finally {
      setEnabling(null);
    }
  }

  if (loading || tools.length === 0) return null;

  return (
    <div style={{ marginTop: 24, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", background: "var(--surface-soft)", border: "none",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 8,
          cursor: "pointer", textAlign: "left",
        }}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <strong style={{ fontSize: 13 }}>Available from Org Registry</strong>
        <span className="pill pill--blue" style={{ fontSize: 10, padding: "1px 7px" }}>{tools.length}</span>
        <span className="muted" style={{ fontSize: 12, marginLeft: 4 }}>
          Approved tools ready to enable for development
        </span>
      </button>

      {expanded && (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-soft)" }}>
              {["Tool", "Source", "Side Effect", "Owner", ""].map((h) => (
                <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tools.map((ltd) => (
              <tr key={ltd.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: "10px 14px" }}>
                  <strong style={{ fontSize: 13 }}>{ltd.displayName}</strong>
                  <br /><code className="muted" style={{ fontSize: 10 }}>{ltd.toolKey}</code>
                  {ltd.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{ltd.description}</span></>}
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {SOURCE_ICONS[ltd.sourceType]}
                    <span className="muted" style={{ fontSize: 12 }}>{ltd.sourceType?.replace(/_/g, " ")}</span>
                  </span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span className={`pill pill--${SIDE_COLOR[ltd.sideEffectLevel] || "muted"}`} style={{ fontSize: 10 }}>
                    {ltd.sideEffectLevel?.replace(/_/g, " ")}
                  </span>
                </td>
                <td style={{ padding: "10px 14px", fontSize: 12, color: "var(--muted)" }}>{ltd.businessOwner}</td>
                <td style={{ padding: "10px 14px", textAlign: "right" }}>
                  <button
                    className="primary"
                    style={{ fontSize: 11, padding: "4px 14px" }}
                    onClick={() => enable(ltd)}
                    disabled={enabling === ltd.id}
                  >
                    {enabling === ltd.id ? "Enabling…" : "Enable for Dev"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Promote to PROD panel (exported for use in AgentDetail) ───────────────────

export function PromoteToProductionPanel({ agent, version, onPromoted }) {
  const [busy, setBusy]     = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState("");

  async function promote() {
    setBusy(true); setError("");
    try {
      const r = await api(`/api/agents/${agent.id}/versions/${version.id}/promote`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setResult(r);
      onPromoted?.(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="validation-item pass" style={{ marginTop: 16 }}>
        <CheckCircle2 size={14} style={{ flexShrink: 0 }} />
        <div>
          <strong>Promoted to {result.promotedEnvironment?.name}</strong>
          <p style={{ margin: "4px 0 0", fontSize: 12 }}>{result.summary}</p>
          {result.promotedTools?.length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, fontSize: 12 }}>
              {result.promotedTools.map((t) => (
                <li key={t.ltdId}>
                  <code>{t.toolKey}</code>
                  {t.derivedProdArn && (
                    <span className="muted"> → <code style={{ fontSize: 10 }}>{t.derivedProdArn}</code></span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 16, padding: "14px 16px", background: "var(--surface-soft)", borderRadius: 8, border: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13 }}>Promote to Production</strong>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 12 }}>
            All tools enabled for this project in DEV will be auto-deployed to the PROD account.
            ARNs are derived by convention — same resource name, PROD account ID.
            The agent version will be marked as promoted.
          </p>
          {error && (
            <div className="validation-item fail" style={{ marginTop: 8 }}>
              <AlertTriangle size={13} /><span>{error}</span>
            </div>
          )}
        </div>
        <button className="primary" onClick={promote} disabled={busy} style={{ flexShrink: 0, whiteSpace: "nowrap" }}>
          {busy ? "Promoting…" : "Promote to PROD"}
        </button>
      </div>
    </div>
  );
}

// ── Main Tools screen ─────────────────────────────────────────────────────────

export function Tools({ project, tools, refreshTools, refreshApprovals }) {
  const [projectTools, setProjectTools] = useState([]);
  const pid = projectId(project);

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/projects/${pid}/project-tools`);
      setProjectTools(r.projectTools || []);
    } catch { setProjectTools([]); }
  }, [pid]);

  useEffect(() => { load(); }, [load]);

  const orgGrantedTools = projectTools.filter((t) => t.sourceType === "ORG_TOOL_GRANT");
  const directTools     = projectTools.filter((t) => t.sourceType !== "ORG_TOOL_GRANT");

  return (
    <section className="panel">
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Project Tools</h2>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
            Tools enabled here are available to agents in this project during development.
            When an approved agent is promoted to PROD, its tools are automatically deployed to the production account.
          </p>
        </div>
      </div>

      {/* Org-granted / enabled tools */}
      {orgGrantedTools.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            <CheckCircle2 size={12} style={{ marginRight: 5, color: "var(--green)", verticalAlign: "middle" }} />
            Enabled Org Tools ({orgGrantedTools.length})
          </h3>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
            <thead>
              <tr style={{ background: "var(--surface-soft)" }}>
                {["Tool", "MCP Name", "Source", "Side Effect", "Status"].map((h) => (
                  <th key={h} style={{ padding: "8px 14px", fontSize: 11, color: "var(--muted)", fontWeight: 600, textAlign: "left", borderBottom: "1px solid var(--border)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orgGrantedTools.map((t) => {
                const se  = SIDE_EFFECT_LEVELS[t.sideEffectLevel] || {};
                const ts  = PROJECT_TOOL_STATUS[t.toolStatus] || { label: t.toolStatus, cls: "pass" };
                const src = t.ltdSourceType || t.sourceType;
                return (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "10px 14px" }}>
                      <strong style={{ fontSize: 13 }}>{t.displayName || t.mcpToolName}</strong>
                      {t.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{t.description}</span></>}
                      <br /><span className="muted" style={{ fontSize: 10 }}>from Org Registry</span>
                    </td>
                    <td style={{ padding: "10px 14px" }}><code style={{ fontSize: 11 }}>{t.mcpToolName}</code></td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        {SOURCE_ICONS[src]}
                        <span className="muted" style={{ fontSize: 11 }}>{src?.replace(/_/g, " ")}</span>
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span className={`pill pill--${SIDE_COLOR[t.sideEffectLevel] || "muted"}`} style={{ fontSize: 10 }}>
                        {se.label || t.sideEffectLevel?.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      <span className={`pill validation-${ts.cls}`}>{ts.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {/* Direct project tools */}
      {directTools.length > 0 && (
        <>
          <h3 style={{ margin: "0 0 8px", fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Direct Project Tools ({directTools.length})
          </h3>
          <Table headers={["Tool", "MCP Name", "Gateway Target", "Side Effect", "Status"]}>
            {directTools.map((t) => {
              const se = SIDE_EFFECT_LEVELS[t.sideEffectLevel] || {};
              const ts = PROJECT_TOOL_STATUS[t.toolStatus] || { label: t.toolStatus, cls: "pass" };
              return (
                <tr key={t.id}>
                  <td>
                    <strong>{t.displayName || t.mcpToolName || t.name}</strong>
                    {t.description && <><br /><span className="muted" style={{ fontSize: 11 }}>{t.description}</span></>}
                  </td>
                  <td><code style={{ fontSize: 11 }}>{t.mcpToolName || "—"}</code></td>
                  <td><code style={{ fontSize: 10 }}>{t.gatewayTargetId || "—"}</code></td>
                  <td>
                    <span className={`pill pill--${SIDE_COLOR[t.sideEffectLevel] || "muted"}`} style={{ fontSize: 10 }}>
                      {se.label || t.sideEffectLevel?.replace(/_/g, " ") || "—"}
                    </span>
                  </td>
                  <td><span className={`pill validation-${ts.cls}`}>{ts.label}</span></td>
                </tr>
              );
            })}
          </Table>
        </>
      )}

      {orgGrantedTools.length === 0 && directTools.length === 0 && (
        <div className="empty-state">
          <Wrench size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p>No tools enabled for this project yet.</p>
          <p className="muted" style={{ fontSize: 12 }}>
            Enable tools from the org registry below. Org admins register and approve tools from the Connected Accounts page.
          </p>
        </div>
      )}

      {/* Enable more org tools */}
      <AvailableOrgTools pid={pid} onEnabled={() => load()} />
    </section>
  );
}

// ── Knowledge screen ──────────────────────────────────────────────────────────

export function Knowledge({ project, knowledge }) {
  const rows = knowledge || [];

  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h2>Project Knowledge Attachments</h2>
          <p className="muted">Knowledge bases must be registered and approved before agents can access them.</p>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-state">
          <Database size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p>No knowledge bases attached.</p>
        </div>
      ) : (
        <Table headers={["Knowledge Base", "Type", "Source", "Classification", "Status"]}>
          {rows.map((kb) => (
            <tr key={kb.id || kb.name}>
              <td><strong>{kb.name || kb.id}</strong>{kb.description && <><br /><span className="muted">{kb.description}</span></>}</td>
              <td>{KB_TYPES?.[kb.kbType] || "Bedrock KB"}</td>
              <td><span className="muted">{kb.source || "—"}</span></td>
              <td>{titleCase(kb.classification || "internal")}</td>
              <td><Status>{titleCase(kb.status || "approved")}</Status></td>
            </tr>
          ))}
        </Table>
      )}
    </section>
  );
}
