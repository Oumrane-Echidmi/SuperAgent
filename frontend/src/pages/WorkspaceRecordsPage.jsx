import { useEffect, useRef, useState } from "react";
import {
  FileText,
  BrainCircuit,
  Users,
  Workflow,
  Plus,
  ArrowLeft,
} from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import WorkflowGraph, { emptyGraph } from "../components/WorkflowGraph";
import {
  useMounted,
  useResource,
  useWorkspace,
} from "../context/WorkspaceContext";

const configs = {
  document: {
    title: "Docs",
    singular: "document",
    icon: FileText,
    description: "Write and save documents for your business.",
  },
  knowledge: {
    title: "Company Brain",
    singular: "knowledge note",
    icon: BrainCircuit,
    description:
      "Save business facts and policies for your team. These notes are not automatically shared with AI.",
  },
  agent: {
    title: "Agents",
    singular: "agent",
    icon: Users,
    description:
      "Save assistant instructions and choose a model. Your agent configurations are stored securely in this business.",
  },
  workflow: {
    title: "Workflows",
    singular: "workflow",
    icon: Workflow,
    description:
      "Create and save workflow drafts. Saving a draft does not activate automation.",
  },
};
function initialContent(kind) {
  return kind === "workflow"
    ? emptyGraph()
    : kind === "agent"
      ? { instructions: "", model: "" }
      : { body: "" };
}
export function Pagination({ pagination, page, onPage }) {
  return pagination && pagination.totalPages > 1 ? (
    <div className="record-pagination">
      <button
        className="live-secondary"
        disabled={page === 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {pagination.totalPages}
      </span>
      <button
        className="live-secondary"
        disabled={page >= pagination.totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  ) : null;
}
export function ModelSelect({ value, onChange, disabled = false }) {
  const { tenant } = useWorkspace();
  const models = useResource(`/tenants/${tenant.id}/builder/models`);
  useEffect(() => {
    if (!value && models.data?.defaultModel) onChange(models.data.defaultModel);
  }, [value, models.data, onChange]);
  return (
    <label>
      Model
      <select
        aria-label="Model"
        required
        value={value}
        disabled={disabled || !models.data}
        onChange={(e) => onChange(e.target.value)}
      >
        {!value && <option value="">Choose a model</option>}
        {value &&
          models.data &&
          !models.data.data.some((model) => model.id === value) && (
            <option value={value}>{value} · unavailable</option>
          )}
        {models.data?.data.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
      </select>
      {models.error && (
        <span role="alert">
          {models.error.message}
          <button type="button" onClick={models.reload}>
            Retry models
          </button>
        </span>
      )}
    </label>
  );
}
function Editor({ kind, record, onSaved, onBack }) {
  const { tenant, api } = useWorkspace(),
    mounted = useMounted(),
    intent = useRef(null);
  const [title, setTitle] = useState(record?.title ?? ""),
    [content, setContent] = useState(record?.content ?? initialContent(kind));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const owner = tenant.role === "OWNER",
    config = configs[kind];
  async function save(archived = false) {
    if (busy) return;
    if (!intent.current)
      intent.current = record
        ? {
            method: "PUT",
            path: `/${record.id}`,
            body: {
              expectedRevision: record.revision,
              title,
              content,
              archived,
            },
          }
        : {
            method: "POST",
            path: "",
            body: { id: crypto.randomUUID(), kind, title, content },
          };
    setBusy(true);
    setError("");
    try {
      const request = intent.current;
      await api(
        `/tenants/${tenant.id}/workspace-records${request.path}`,
        request,
      );
      if (mounted.current) onSaved();
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        setUncertain(!failure.status || failure.status >= 500);
        if (failure.status && failure.status < 500) intent.current = null;
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const frozen = busy || uncertain || !owner;
  return (
    <div className="record-editor">
      <button
        type="button"
        className="live-secondary"
        disabled={busy}
        onClick={onBack}
      >
        <ArrowLeft size={14} /> Back to {config.title}
      </button>
      <p className="live-muted">
        {record
          ? `Saved draft · revision ${record.revision}`
          : `New ${config.singular}`}
      </p>
      {!owner && (
        <p className="live-muted">
          Only business owners can edit these records.
        </p>
      )}
      <form
        className="live-form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label>
          Title
          <input
            required
            maxLength={120}
            value={title}
            disabled={frozen}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        {kind === "workflow" ? (
          <WorkflowGraph
            value={content}
            onChange={setContent}
            readOnly={frozen}
          />
        ) : kind === "agent" ? (
          <>
            <ModelSelect
              value={content.model}
              disabled={frozen}
              onChange={(model) => setContent({ ...content, model })}
            />
            <label>
              Instructions
              <textarea
                aria-label="Instructions"
                rows={12}
                maxLength={12000}
                value={content.instructions}
                disabled={frozen}
                onChange={(e) =>
                  setContent({ ...content, instructions: e.target.value })
                }
              />
            </label>
          </>
        ) : (
          <label>
            {kind === "knowledge" ? "Business knowledge" : "Content"}
            <textarea
              aria-label={
                kind === "knowledge" ? "Business knowledge" : "Content"
              }
              rows={14}
              maxLength={20000}
              value={content.body}
              disabled={frozen}
              onChange={(e) => setContent({ body: e.target.value })}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="live-error">
            {error}
            {uncertain &&
              " The result is uncertain. Retry the same request, or return to the list and check the saved record."}
          </p>
        )}
        {owner && (
          <div className="record-actions">
            <button
              className="live-primary"
              disabled={busy || (kind === "agent" && !content.model)}
            >
              {busy ? "Saving…" : uncertain ? "Retry save" : "Save draft"}
            </button>
            {record && (
              <button
                type="button"
                className="live-secondary"
                disabled={busy || uncertain}
                onClick={() => save(true)}
              >
                Archive
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
export default function WorkspaceRecordsPage({ kind }) {
  const { tenant } = useWorkspace(),
    config = configs[kind],
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(null);
  const resource = useResource(
    `/tenants/${tenant.id}/workspace-records?kind=${kind}&page=${page}&pageSize=24`,
  );
  function back() {
    setSelected(null);
    resource.reload();
  }
  return (
    <Page
      bodyClassName="workspace-content"
      title={config.title}
      icon={config.icon}
      count={resource.data?.pagination?.totalItems}
      actions={
        !selected &&
        tenant.role === "OWNER" && (
          <button
            className="live-primary"
            onClick={() => setSelected({ new: true })}
          >
            <Plus size={14} /> New {config.singular}
          </button>
        )
      }
    >
      <p className="live-muted record-intro">{config.description}</p>
      {selected ? (
        <Editor
          key={selected.id ?? "new"}
          kind={kind}
          record={selected.new ? null : selected}
          onSaved={back}
          onBack={back}
        />
      ) : (
        <>
          <ResourceState resource={resource} />
          {resource.data && (
            <>
              <div className="record-grid">
                {resource.data.data.map((record) => (
                  <button
                    className="record-card"
                    key={record.id}
                    onClick={() => setSelected(record)}
                  >
                    <span className="record-card-icon">
                      <config.icon size={19} />
                    </span>
                    <strong>{record.title}</strong>
                    <span>
                      {kind === "workflow"
                        ? `${record.content.nodes.length} nodes · ${record.content.edges.length} connections`
                        : kind === "agent"
                          ? record.content.instructions.slice(0, 140) ||
                            "No instructions yet"
                          : record.content.body.slice(0, 180) ||
                            "Empty document"}
                    </span>
                    <small>
                      Draft · revision {record.revision} ·{" "}
                      {new Date(record.updatedAt).toLocaleDateString()}
                    </small>
                  </button>
                ))}
              </div>
              {!resource.data.data.length && (
                <div className="record-empty">
                  <config.icon size={30} />
                  <h2>No {config.title.toLowerCase()} yet</h2>
                  <p>
                    Create your first {config.singular} to start building your
                    workspace.
                  </p>
                </div>
              )}
              <Pagination
                pagination={resource.data.pagination}
                page={page}
                onPage={setPage}
              />
            </>
          )}
        </>
      )}
    </Page>
  );
}
