import { useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  Check,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Database,
  Grip,
  LayoutGrid,
  Layers,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Users,
  Workflow,
  X,
} from "lucide-react";
import Page from "../components/Page";
import Dropdown from "../components/Dropdown";
import Modal from "../components/Modal";
import Tabs from "../components/Tabs";
import { useToast } from "../context/ToastContext";
import {
  initialApprovals,
  initialArchivedWorkflows,
  initialWorkflows,
  runs,
  templates,
  upcoming,
} from "../data/workflows";

const workflowTabs = [
  { id: "workflows", label: "Workflows" },
  { id: "runs", label: "Runs" },
  { id: "upcoming", label: "Upcoming" },
  { id: "templates", label: "Templates" },
];

const filters = [
  { id: "all", label: "All" },
  { id: "autopilots", label: "Autopilots" },
  { id: "workflows", label: "Workflows" },
  { id: "archived", label: "Archived" },
];

const artIcons = {
  database: Database,
  users: Users,
  grid: LayoutGrid,
  grip: Grip,
};

const runStatusClass = {
  Succeeded: "badge--green",
  Failed: "badge--red",
  Running: "badge--blue",
  Waiting: "badge--amber",
  Paused: "badge--plain",
};

function WorkflowMeta({ item }) {
  if (item.type === "scheduled") {
    return (
      <span className="wf-meta wf-meta--scheduled">
        <span className="dot" />
        {item.label}
      </span>
    );
  }
  if (item.type === "pill" || item.type === "trigger") {
    return <span className="wf-meta wf-meta--pill">{item.label}</span>;
  }
  if (item.type === "node") {
    return (
      <span className="wf-meta wf-meta--pill">
        <Layers size={10} />
        {item.label}
      </span>
    );
  }
  if (item.type === "ok") {
    return (
      <span className="wf-meta wf-meta--ok">
        <CircleCheck size={11} />
        {item.label}
      </span>
    );
  }
  if (item.type === "warn") {
    return (
      <span className="wf-meta wf-meta--warn">
        <CircleAlert size={11} />
        {item.label}
      </span>
    );
  }
  if (item.type === "info") {
    return (
      <span className="wf-meta wf-meta--info">
        <Clock size={11} />
        {item.label}
      </span>
    );
  }
  return <span className="wf-meta wf-meta--plain">{item.label}</span>;
}

function WorkflowArt({ item }) {
  const Icon = artIcons[item.icon];
  return (
    <span className={`wf-art wf-art--${item.art}`} aria-hidden="true">
      {Icon ? <Icon size={23} strokeWidth={1.7} /> : null}
    </span>
  );
}

function WorkflowCard({
  workflow,
  onPause,
  onRun,
  onDuplicate,
  onArchive,
  onRestore,
}) {
  const archived = workflow.status === "ARCHIVED";
  const paused = workflow.status === "PAUSED";
  const menuItems = archived
    ? [
        {
          label: "Restore",
          icon: RotateCcw,
          onClick: () => onRestore(workflow),
        },
      ]
    : [
        {
          label: paused ? "Resume workflow" : "Pause workflow",
          icon: paused ? Play : Pause,
          onClick: () => onPause(workflow),
        },
        { label: "Run now", icon: Play, onClick: () => onRun(workflow) },
        { label: "Duplicate", icon: Copy, onClick: () => onDuplicate(workflow) },
        { type: "separator" },
        {
          label: "Archive",
          icon: Archive,
          danger: true,
          onClick: () => onArchive(workflow),
        },
      ];

  return (
    <article className={`wf-card ${paused ? "wf-card--paused" : ""}`}>
      <WorkflowArt item={workflow} />
      <div className="wf-card-main">
        <div className="wf-card-top">
          <h2>{workflow.title}</h2>
          <span className={`wf-status wf-status--${workflow.status.toLowerCase()}`}>
            {workflow.status}
          </span>
          <Dropdown
            trigger={(props) => (
              <button
                aria-label={`Actions for ${workflow.title}`}
                className="icon-btn icon-btn--sm wf-menu"
                {...props}
              >
                <MoreHorizontal />
              </button>
            )}
            items={menuItems}
          />
        </div>
        <p className="wf-description">
          {workflow.fill ? (
            <>
              <em>Fills:</em> {workflow.fill}
            </>
          ) : (
            workflow.description
          )}
        </p>
        {workflow.note ? (
          <p className="wf-note">
            <CircleAlert size={12} />
            {workflow.note}
          </p>
        ) : null}
        <div className="wf-meta-row">
          {workflow.meta.map((item, index) => (
            <WorkflowMeta item={item} key={`${workflow.id}-meta-${index}`} />
          ))}
        </div>
      </div>
    </article>
  );
}

function RunsView({ query, onToast }) {
  const needle = query.trim().toLowerCase();
  const shown = runs.filter(
    (run) =>
      !needle ||
      run.workflow.toLowerCase().includes(needle) ||
      run.status.toLowerCase().includes(needle) ||
      run.trigger.toLowerCase().includes(needle),
  );

  return (
    <div className="wf-view">
      <div className="wf-section-head">
        <div>
          <h2>Recent runs</h2>
          <p>Every trigger, retry, and manual replay from the last seven days.</p>
        </div>
        <span className="wf-section-note">{shown.length} runs</span>
      </div>
      {shown.length ? (
        <div className="wf-run-table">
          <div className="wf-run-grid wf-run-head">
            <span>Workflow</span>
            <span>Status</span>
            <span>Started</span>
            <span>Duration</span>
            <span>Trigger</span>
          </div>
          {shown.map((run) => (
            <button
              className="wf-run-grid wf-run-row"
              key={run.id}
              onClick={() => onToast(`${run.workflow} · ${run.status} · ${run.duration}`)}
              type="button"
            >
              <span className="wf-run-name">{run.workflow}</span>
              <span>
                <span className={`badge ${runStatusClass[run.status] || ""}`}>
                  <span className="dot" />
                  {run.status}
                </span>
              </span>
              <span className="wf-run-muted">{run.started}</span>
              <span className="wf-run-muted">{run.duration}</span>
              <span className="wf-run-trigger">{run.trigger}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Search />
          <strong>No runs match that search</strong>
          <p>Try a workflow name, status, or trigger type.</p>
        </div>
      )}
    </div>
  );
}

function UpcomingView({ query }) {
  const needle = query.trim().toLowerCase();
  const groups = upcoming
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !needle ||
          item.title.toLowerCase().includes(needle) ||
          item.meta.toLowerCase().includes(needle),
      ),
    }))
    .filter((group) => group.items.length);

  return (
    <div className="wf-view">
      <div className="wf-section-head">
        <div>
          <h2>Scheduled next</h2>
          <p>What runs without you, and when it reaches for a human.</p>
        </div>
        <span className="wf-section-note">All times UTC</span>
      </div>
      {groups.length ? (
        <div className="wf-upcoming">
          {groups.map((group) => (
            <section className="wf-upcoming-group" key={group.day}>
              <div className="wf-upcoming-day">
                <h3>{group.day}</h3>
                <span>{group.items.length} scheduled</span>
              </div>
              <div className="wf-upcoming-list">
                {group.items.map((item) => (
                  <div className="wf-upcoming-row" key={item.id}>
                    <span className={`wf-upcoming-time ${item.time.includes(":") ? "" : "wf-upcoming-time--wide"}`}>
                      {item.time}
                    </span>
                    <span className="wf-upcoming-icon">
                      <Clock size={14} />
                    </span>
                    <span className="wf-upcoming-copy">
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </span>
                    <span className="wf-trigger-pill">{item.trigger}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Clock />
          <strong>Nothing scheduled matches</strong>
          <p>Clear the search to see the full schedule.</p>
        </div>
      )}
    </div>
  );
}

function TemplatesView({ query, onUse }) {
  const needle = query.trim().toLowerCase();
  const shown = templates.filter(
    (template) =>
      !needle ||
      template.title.toLowerCase().includes(needle) ||
      template.description.toLowerCase().includes(needle) ||
      template.category.toLowerCase().includes(needle),
  );

  return (
    <div className="wf-view">
      <div className="wf-section-head">
        <div>
          <h2>Templates</h2>
          <p>Start with a proven shape. Every template can be changed before it runs.</p>
        </div>
      </div>
      {shown.length ? (
        <div className="wf-template-grid">
          {shown.map((template) => (
            <article className="wf-template" key={template.id}>
              <div className="wf-template-top">
                <WorkflowArt item={template} />
                <span className="wf-template-category">{template.category}</span>
              </div>
              <h3>{template.title}</h3>
              <p>{template.description}</p>
              <div className="wf-template-foot">
                <span>
                  {template.nodes} nodes
                  <span className="wf-foot-dot">·</span>
                  {template.cadence}
                </span>
                <button
                  className="btn btn--subtle btn--sm"
                  onClick={() => onUse(template)}
                  type="button"
                >
                  Use template
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <LayoutGrid />
          <strong>No templates match</strong>
          <p>Try a different category or workflow name.</p>
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("workflows");
  const [filter, setFilter] = useState("all");
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [archived, setArchived] = useState(initialArchivedWorkflows);
  const [approvals, setApprovals] = useState(initialApprovals);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    description: "",
    trigger: "Daily schedule",
  });

  const needle = query.trim().toLowerCase();

  const filteredWorkflows = useMemo(() => {
    const source = filter === "archived" ? archived : workflows;
    const byKind =
      filter === "autopilots"
        ? source.filter((workflow) => workflow.kind === "autopilot")
        : filter === "workflows"
          ? source.filter((workflow) => workflow.kind === "workflow")
          : source;
    if (!needle) return byKind;
    return byKind.filter(
      (workflow) =>
        workflow.title.toLowerCase().includes(needle) ||
        (workflow.description || workflow.fill || "").toLowerCase().includes(needle),
    );
  }, [archived, filter, needle, workflows]);

  const showApprovals =
    tab === "workflows" && filter === "all" && !needle && approvals.length > 0;

  const changeTab = (next) => {
    setTab(next);
    setQuery("");
    setSearching(false);
  };

  const decideApproval = (item, approved) => {
    setApprovals((current) => current.filter((approval) => approval.id !== item.id));
    toast(approved ? item.success : `${item.title} rejected — nothing was sent.`);
  };

  const togglePause = (workflow) => {
    const paused = workflow.status === "PAUSED";
    setWorkflows((current) =>
      current.map((item) =>
        item.id === workflow.id
          ? { ...item, status: paused ? "ACTIVE" : "PAUSED" }
          : item,
      ),
    );
    toast(`${workflow.title} ${paused ? "resumed" : "paused"}.`);
  };

  const runNow = (workflow) => {
    setWorkflows((current) =>
      current.map((item) =>
        item.id === workflow.id
          ? {
              ...item,
              meta: [
                ...item.meta.slice(0, -1),
                { type: "info", label: "just now" },
              ],
            }
          : item,
      ),
    );
    toast(`${workflow.title} started.`);
  };

  const duplicateWorkflow = (workflow) => {
    const copy = {
      ...workflow,
      id: `${workflow.id}-copy-${Date.now()}`,
      title: `${workflow.title} copy`,
      status: "PAUSED",
      meta: [
        ...workflow.meta.slice(0, -1),
        { type: "plain", label: "Not run yet" },
      ],
    };
    setWorkflows((current) => [copy, ...current]);
    toast(`${workflow.title} duplicated as a paused workflow.`);
  };

  const archiveWorkflow = (workflow) => {
    setWorkflows((current) => current.filter((item) => item.id !== workflow.id));
    setArchived((current) => [
      {
        ...workflow,
        status: "ARCHIVED",
        archivedAt: "just now",
        meta: [
          ...workflow.meta.slice(0, -1),
          { type: "warn", label: "Archived just now" },
        ],
      },
      ...current,
    ]);
    toast(`${workflow.title} archived.`);
  };

  const restoreWorkflow = (workflow) => {
    setArchived((current) => current.filter((item) => item.id !== workflow.id));
    setWorkflows((current) => [
      {
        ...workflow,
        status: "PAUSED",
        archivedAt: undefined,
        meta: [
          ...workflow.meta.slice(0, -1),
          { type: "plain", label: "Restored just now" },
        ],
      },
      ...current,
    ]);
    setFilter("all");
    setTab("workflows");
    toast(`${workflow.title} restored.`);
  };

  const useTemplate = (template) => {
    const newWorkflow = {
      id: `template-${template.id}-${Date.now()}`,
      title: template.title,
      description: template.description,
      art: template.art,
      icon: template.icon,
      status: "ACTIVE",
      kind: "workflow",
      meta: [
        { type: "node", label: `${template.nodes} nodes` },
        { type: "trigger", label: template.cadence },
        { type: "plain", label: "From template" },
      ],
    };
    setWorkflows((current) => [newWorkflow, ...current]);
    setTab("workflows");
    setFilter("all");
    setQuery("");
    setSearching(false);
    toast(`${template.title} added from a template.`);
  };

  const createWorkflow = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    const schedule =
      form.trigger === "Daily schedule"
        ? [{ type: "scheduled", label: "Scheduled" }, { type: "pill", label: "Daily at 8:00 AM UTC" }]
        : form.trigger === "Weekly schedule"
          ? [{ type: "scheduled", label: "Scheduled" }, { type: "pill", label: "Weekly Mon 8:00 AM UTC" }]
          : [{ type: "plain", label: form.trigger }];
    setWorkflows((current) => [
      {
        id: `workflow-${Date.now()}`,
        title: name,
        description:
          form.description.trim() ||
          "A new workflow. Open it to add steps and choose what needs approval.",
        art: "green",
        icon: null,
        status: "ACTIVE",
        kind: form.trigger.includes("schedule") ? "autopilot" : "workflow",
        meta: [...schedule, { type: "plain", label: "Not run yet" }],
      },
      ...current,
    ]);
    setForm({ name: "", description: "", trigger: "Daily schedule" });
    setNewOpen(false);
    setTab("workflows");
    setFilter("all");
    toast(`${name} created.`);
  };

  const rightToolbar = (
    <div className="wf-toolbar-right">
      {tab === "workflows" ? (
        <div className="wf-filters">
          {filters.map((item) => (
            <button
              className={`filter-tab ${filter === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => setFilter(item.id)}
              type="button"
            >
              {item.label}
              {item.id === "archived" ? (
                <span className="count">{archived.length}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      {searching ? (
        <div className="search-field wf-search">
          <Search />
          <input
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => {
              if (!query) setSearching(false);
            }}
            placeholder={`Search ${tab}...`}
            value={query}
          />
          <button
            aria-label="Close search"
            className="wf-search-clear"
            onClick={() => {
              setQuery("");
              setSearching(false);
            }}
            type="button"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <button
          aria-label="Search workflows"
          className="icon-btn"
          onClick={() => setSearching(true)}
          type="button"
        >
          <Search />
        </button>
      )}
    </div>
  );

  return (
    <Page
      actions={
        <button className="btn btn--light" onClick={() => setNewOpen(true)} type="button">
          <Plus size={13} />
          New
        </button>
      }
      count={workflows.length}
      icon={Workflow}
      subtitle="Reusable automations your agents can run on schedule or on demand."
      title="Workflows"
    >
      <div className="wf-toolbar">
        <Tabs items={workflowTabs} onChange={changeTab} value={tab} />
        {rightToolbar}
      </div>

      <div className="wf-content">
        {tab === "workflows" ? (
          <>
            {showApprovals ? (
              <section className="wf-approvals">
                <div className="wf-approvals-head">
                  <AlertCircle size={14} />
                  <h2>Approvals waiting</h2>
                  <span className="wf-approvals-count">{approvals.length}</span>
                </div>
                <div className="wf-approvals-list">
                  {approvals.map((item) => (
                    <div className="wf-approval" key={item.id}>
                      <div className="wf-approval-copy">
                        <div className="wf-approval-title">
                          <strong>{item.title}</strong>
                          <span>{item.time}</span>
                        </div>
                        <p>{item.description}</p>
                      </div>
                      <div className="wf-approval-actions">
                        <button
                          className="btn btn--subtle btn--sm"
                          onClick={() => decideApproval(item, false)}
                          type="button"
                        >
                          <X size={12} />
                          Reject
                        </button>
                        <button
                          className="btn btn--light btn--sm"
                          onClick={() => decideApproval(item, true)}
                          type="button"
                        >
                          <Check size={12} />
                          Approve
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {filteredWorkflows.length ? (
              <div className="wf-grid">
                {filteredWorkflows.map((workflow) => (
                  <WorkflowCard
                    key={workflow.id}
                    onArchive={archiveWorkflow}
                    onDuplicate={duplicateWorkflow}
                    onPause={togglePause}
                    onRestore={restoreWorkflow}
                    onRun={runNow}
                    workflow={workflow}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search />
                <strong>
                  {filter === "archived" ? "No archived workflows" : "No workflows match"}
                </strong>
                <p>
                  {needle
                    ? "Try a different name or clear the search."
                    : "Create a workflow or start from a template."}
                </p>
                <button
                  className="btn btn--subtle btn--sm"
                  onClick={() => {
                    setQuery("");
                    setSearching(false);
                    setFilter("all");
                  }}
                  type="button"
                >
                  Show all workflows
                </button>
              </div>
            )}
          </>
        ) : null}

        {tab === "runs" ? <RunsView onToast={toast} query={query} /> : null}
        {tab === "upcoming" ? <UpcomingView query={query} /> : null}
        {tab === "templates" ? <TemplatesView onUse={useTemplate} query={query} /> : null}
      </div>

      <Modal
        description="Pick a trigger and a name. You can add steps and approvals after it exists."
        footer={
          <>
            <button className="btn btn--subtle" onClick={() => setNewOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="btn btn--light"
              disabled={!form.name.trim()}
              form="new-workflow-form"
              type="submit"
            >
              Create workflow
            </button>
          </>
        }
        onClose={() => setNewOpen(false)}
        open={newOpen}
        title="New workflow"
      >
        <form className="wf-form" id="new-workflow-form" onSubmit={createWorkflow}>
          <div className="field">
            <label htmlFor="workflow-name">Name</label>
            <input
              autoFocus
              className="input"
              id="workflow-name"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g. Renewal risk digest"
              value={form.name}
            />
          </div>
          <div className="field">
            <label htmlFor="workflow-description">What should it do?</label>
            <textarea
              className="textarea"
              id="workflow-description"
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="Describe the job in plain language."
              value={form.description}
            />
          </div>
          <div className="field">
            <label htmlFor="workflow-trigger">When should it run?</label>
            <select
              className="select"
              id="workflow-trigger"
              onChange={(event) =>
                setForm((current) => ({ ...current, trigger: event.target.value }))
              }
              value={form.trigger}
            >
              <option>Daily schedule</option>
              <option>Weekly schedule</option>
              <option>Webhook trigger</option>
              <option>On demand</option>
            </select>
            <span className="hint">
              Anything that writes externally will ask for approval first.
            </span>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
