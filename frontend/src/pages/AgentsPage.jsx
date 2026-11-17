import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  Database,
  Eye,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pause,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import Page from "../components/Page";
import Avatar from "../components/Avatar";
import Dropdown from "../components/Dropdown";
import Modal from "../components/Modal";
import Tabs from "../components/Tabs";
import { useToast } from "../context/ToastContext";
import {
  connections,
  initialAgents,
  initialArchivedAgents,
  skills,
  squads,
} from "../data/agents";

const agentTabs = [
  { id: "agents", label: "Agents" },
  { id: "squads", label: "Squads" },
  { id: "skills", label: "Skills" },
  { id: "connections", label: "Connections" },
];

const palettes = [
  ["#5eead4", "#14b8a6", "#0f766e"],
  ["#fda4af", "#f43f5e", "#9f1239"],
  ["#93c5fd", "#3b82f6", "#1d4ed8"],
  ["#fdba74", "#f97316", "#9a3412"],
  ["#c4b5fd", "#8b5cf6", "#5b21b6"],
];

const connectionIcon = {
  mail: Mail,
  analytics: Database,
  billing: Zap,
  sheet: FileSpreadsheet,
  chat: MessageSquare,
};

export default function AgentsPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState("agents");
  const [scope, setScope] = useState("active");
  const [agents, setAgents] = useState(initialAgents);
  const [archived, setArchived] = useState(initialArchivedAgents);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });
  const [detailAgent, setDetailAgent] = useState(null);

  const source = scope === "active" ? agents : archived;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(
      (agent) =>
        agent.name.toLowerCase().includes(needle) ||
        agent.description.toLowerCase().includes(needle),
    );
  }, [source, query]);

  const openChat = (agent) => {
    setDetailAgent(null);
    navigate(
      `/chat?q=${encodeURIComponent(
        `${agent.name}, give me a short update on what you have handled this week.`,
      )}`,
    );
  };

  const archiveAgent = (agent) => {
    setAgents((current) => current.filter((item) => item.name !== agent.name));
    setArchived((current) => [
      { ...agent, status: "archived", archivedAt: "just now" },
      ...current,
    ]);
    toast(`${agent.name} archived.`);
  };

  const restoreAgent = (agent) => {
    setArchived((current) => current.filter((item) => item.name !== agent.name));
    setAgents((current) => [
      { ...agent, status: "idle", archivedAt: undefined, workload: "0/1" },
      ...current,
    ]);
    toast(`${agent.name} restored.`);
  };

  const createAgent = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if ([...agents, ...archived].some((agent) => agent.name.toLowerCase() === name.toLowerCase())) {
      toast("An agent with that name already exists.", { error: true });
      return;
    }
    setAgents((current) => [
      {
        name,
        description: form.description.trim() || "A new workspace agent.",
        status: "idle",
        workload: "0/1",
        activity: [3, 5, 4, 7, 5, 6, 4, 8, 5, 6],
        runs: 0,
        palette: palettes[current.length % palettes.length],
        prompt:
          "Describe this agent's job, the tools it may use, and when it must ask a human before acting.",
      },
      ...current,
    ]);
    setForm({ name: "", description: "" });
    setNewOpen(false);
    setTab("agents");
    setScope("active");
    toast(`${name} created.`);
  };

  const toolbarRight =
    tab === "agents" ? (
      <div className="agents-toolbar-right">
        <div className="agent-scope">
          <button
            className={`agent-scope-btn ${scope === "active" ? "active" : ""}`}
            onClick={() => setScope("active")}
            type="button"
          >
            Active
          </button>
          <button
            className={`agent-scope-btn ${scope === "archived" ? "active" : ""}`}
            onClick={() => setScope("archived")}
            type="button"
          >
            Archived <span>{archived.length}</span>
          </button>
        </div>
        {searching ? (
          <div className="search-field agent-search">
            <Search />
            <input
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
              onBlur={() => {
                if (!query) setSearching(false);
              }}
              placeholder="Search agents..."
              value={query}
            />
          </div>
        ) : (
          <button
            aria-label="Search agents"
            className="icon-btn"
            onClick={() => setSearching(true)}
            type="button"
          >
            <Search />
          </button>
        )}
      </div>
    ) : null;

  return (
    <Page
      icon={Users}
      title="Agents"
      count={agents.length}
      subtitle="Agents that turn approved work into updates, comments, and status changes."
      actions={
        <button className="btn btn--light" onClick={() => setNewOpen(true)} type="button">
          <Plus size={13} />
          New agent
        </button>
      }
    >
      <div className="agents-body">
        <div className="agents-toolbar">
          <Tabs items={agentTabs} onChange={setTab} value={tab} />
          {toolbarRight}
        </div>

        {tab === "agents" ? (
          <div className="agents-table">
            <div className="agent-table-head">
              <span>Agent</span>
              <span>Status</span>
              <span>Workload</span>
              <span>Activity 7d</span>
              <span>Runs</span>
              <span />
            </div>

            {filtered.length ? (
              filtered.map((agent) => (
                <div
                  className={`agent-row ${
                    agent.name === "Assistant" && scope === "active" ? "is-highlight" : ""
                  } ${scope === "archived" ? "is-archived" : ""}`}
                  key={agent.name}
                >
                  <div className="agent-main">
                    <Avatar
                      icon={agent.system ? Sparkles : undefined}
                      name={agent.name}
                      palette={agent.palette}
                      size={28}
                    />
                    <div className="agent-meta">
                      <div className="agent-name-line">
                        <span className="agent-name">{agent.name}</span>
                        {agent.system ? <span className="agent-system">system</span> : null}
                        {agent.archivedAt ? (
                          <span className="agent-archived-at">Archived {agent.archivedAt}</span>
                        ) : null}
                      </div>
                      <p>{agent.description}</p>
                    </div>
                  </div>
                  <div className="agent-status">
                    <span className="agent-status-dot" />
                  </div>
                  <div className="agent-workload">{agent.workload}</div>
                  <div className="agent-activity" aria-label="Weekly activity">
                    {agent.activity.map((height, index) => (
                      <span key={index} style={{ height: `${height + 4}px` }} />
                    ))}
                  </div>
                  <div className="agent-runs">{agent.runs.toLocaleString()}</div>
                  <div className="agent-more">
                    <Dropdown
                      align="right"
                      items={[
                        {
                          label: "Start a chat",
                          icon: MessageCircle,
                          onClick: () => openChat(agent),
                        },
                        {
                          label: "View details",
                          icon: Eye,
                          onClick: () => setDetailAgent(agent),
                        },
                        {
                          label: "Pause agent",
                          icon: Pause,
                          onClick: () => toast(`${agent.name} paused.`),
                        },
                        { type: "separator" },
                        scope === "active"
                          ? {
                              label: "Archive agent",
                              icon: Archive,
                              onClick: () => archiveAgent(agent),
                            }
                          : {
                              label: "Restore agent",
                              icon: RotateCcw,
                              onClick: () => restoreAgent(agent),
                            },
                      ]}
                      trigger={(props) => (
                        <button
                          aria-label={`${agent.name} actions`}
                          className="icon-btn"
                          type="button"
                          {...props}
                        >
                          <MoreHorizontal />
                        </button>
                      )}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state agents-empty">
                <Users />
                <strong>{query ? "No agents match" : "No archived agents"}</strong>
                <p>
                  {query
                    ? "Try another name or clear the search."
                    : "Archived agents keep their history and can be restored at any time."}
                </p>
                {query ? (
                  <button
                    className="btn btn--subtle btn--sm"
                    onClick={() => setQuery("")}
                    type="button"
                  >
                    Clear search
                  </button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {tab === "squads" ? (
          <div className="squad-grid">
            {squads.map((squad) => (
              <article className="squad-card" key={squad.name}>
                <div className="squad-icon">
                  <Users size={18} />
                </div>
                <div className="squad-copy">
                  <h3>{squad.name}</h3>
                  <p>{squad.description}</p>
                  <div className="squad-members">
                    <div className="avatar-stack">
                      {squad.members.map((member) => (
                        <Avatar key={member} name={member} size={20} />
                      ))}
                    </div>
                    <span>{squad.members.join(" + ")}</span>
                  </div>
                </div>
                <div className="squad-stats">
                  <strong>{squad.runs}</strong>
                  <span>runs · 7d</span>
                  <button
                    className="btn btn--subtle btn--sm"
                    onClick={() => toast(`${squad.name} workspace is coming soon.`)}
                    type="button"
                  >
                    Open squad
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {tab === "skills" ? (
          <div className="skills-card">
            <div className="skills-head">
              <span>Skill</span>
              <span>Owner</span>
              <span>Uses</span>
            </div>
            {skills.map((skill) => (
              <div className="skill-row" key={skill.name}>
                <span className="skill-name">
                  <span className="skill-icon">
                    <Zap size={12} />
                  </span>
                  {skill.name}
                </span>
                <span className="skill-owner">
                  <Avatar name={skill.agent} size={18} />
                  {skill.agent}
                </span>
                <span className="skill-uses">{skill.uses}</span>
              </div>
            ))}
          </div>
        ) : null}

        {tab === "connections" ? (
          <div className="connections-card">
            {connections.map((connection) => {
              const Icon = connectionIcon[connection.kind] ?? Database;
              const statusClass =
                connection.status === "Connected"
                  ? "badge--green"
                  : connection.status === "Needs attention"
                    ? "badge--amber"
                    : "";
              return (
                <div className="connection-row" key={connection.name}>
                  <span className="connection-icon">
                    <Icon size={15} />
                  </span>
                  <span className="connection-copy">
                    <strong>{connection.name}</strong>
                    <span>{connection.detail}</span>
                  </span>
                  <span className={`badge ${statusClass}`}>
                    <span className="dot" />
                    {connection.status}
                  </span>
                  <button
                    className="btn btn--subtle btn--sm"
                    onClick={() =>
                      toast(
                        connection.status === "Missing"
                          ? `Connect ${connection.name} from preferences.`
                          : `${connection.name} settings are coming soon.`,
                      )
                    }
                    type="button"
                  >
                    Manage
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <Modal
        description="Create a scoped agent with its own job, tools and approval rules. You can refine the instructions after it runs once."
        footer={
          <>
            <button className="btn btn--subtle" onClick={() => setNewOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="btn btn--light"
              disabled={!form.name.trim()}
              form="new-agent-form"
              type="submit"
            >
              Create agent
            </button>
          </>
        }
        onClose={() => setNewOpen(false)}
        open={newOpen}
        title="New agent"
      >
        <form className="agent-form" id="new-agent-form" onSubmit={createAgent}>
          <div className="field">
            <label htmlFor="agent-name">Name</label>
            <input
              autoFocus
              className="input"
              id="agent-name"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g. Renewal Watcher"
              value={form.name}
            />
          </div>
          <div className="field">
            <label htmlFor="agent-description">What should it do?</label>
            <textarea
              className="textarea"
              id="agent-description"
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Watch renewal dates, flag accounts with low usage, and draft an owner note."
              value={form.description}
            />
            <span className="hint">
              The agent runs inside the published workspace and asks before taking external action.
            </span>
          </div>
        </form>
      </Modal>

      <Modal
        description={detailAgent?.description}
        footer={
          <>
            <button className="btn btn--subtle" onClick={() => setDetailAgent(null)} type="button">
              Close
            </button>
            <button
              className="btn btn--light"
              onClick={() => detailAgent && openChat(detailAgent)}
              type="button"
            >
              <MessageCircle size={13} />
              Start a chat
            </button>
          </>
        }
        onClose={() => setDetailAgent(null)}
        open={Boolean(detailAgent)}
        title={
          detailAgent ? (
            <span className="agent-detail-title">
              {detailAgent.name}
              {detailAgent.system ? <span className="agent-system">system</span> : null}
            </span>
          ) : (
            ""
          )
        }
      >
        {detailAgent ? (
          <>
            <div className="agent-detail-head">
              <Avatar
                icon={detailAgent.system ? Sparkles : undefined}
                name={detailAgent.name}
                palette={detailAgent.palette}
                size={48}
              />
              <div className="agent-stat-grid">
                <div>
                  <span>Runs</span>
                  <strong>{detailAgent.runs.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Workload</span>
                  <strong>{detailAgent.workload}</strong>
                </div>
                <div>
                  <span>7d activity</span>
                  <strong>
                    {detailAgent.activity.reduce((sum, value) => sum + value, 0)}
                  </strong>
                </div>
              </div>
            </div>
            <div className="agent-prompt-card">
              <span>Operating instructions</span>
              <p>{detailAgent.prompt}</p>
            </div>
            <p className="agent-detail-note">
              This agent can read workspace data and draft work. External actions wait
              for an owner approval.
            </p>
          </>
        ) : null}
      </Modal>
    </Page>
  );
}
