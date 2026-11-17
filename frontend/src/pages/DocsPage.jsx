import { useMemo, useState } from "react";
import {
  Building2,
  File,
  FileSpreadsheet,
  FileText,
  Flame,
  Globe,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import Page from "../components/Page";
import Modal from "../components/Modal";
import Tabs from "../components/Tabs";
import { useToast } from "../context/ToastContext";
import { competitors, csvs, sources as seedSources, tables } from "../data/docs";

const docTabs = [
  { id: "all", label: "All" },
  { id: "sources", label: "Sources" },
  { id: "tables", label: "Tables" },
  { id: "competitors", label: "Competitors" },
];

const typeMeta = {
  manual: { label: "manual", icon: Flame, className: "doc-type--manual" },
  website: { label: "website", icon: Globe, className: "doc-type--website" },
  file: { label: "file", icon: File, className: "doc-type--file" },
  connection: { label: "connection", icon: Plug, className: "doc-type--connection" },
};

const tableSourceMeta = {
  scheduled: { label: "scheduled", icon: RefreshCw, className: "table-source--scheduled" },
  manual: { label: "manual", icon: Flame, className: "table-source--manual" },
  agent: { label: "agent", icon: Sparkles, className: "table-source--agent" },
};

const sourceTypeOptions = [
  { value: "manual", label: "Manual note" },
  { value: "website", label: "Website" },
  { value: "file", label: "File upload" },
  { value: "connection", label: "Connection" },
];

function StatusPill({ status }) {
  const indexing = status === "Indexing";
  return (
    <span className={`doc-status ${indexing ? "doc-status--indexing" : ""}`}>
      <span className="dot" />
      {status}
    </span>
  );
}

function SectionHead({ icon: Icon, title }) {
  return (
    <div className="doc-section-head">
      <Icon size={17} strokeWidth={1.8} />
      <h2>{title}</h2>
    </div>
  );
}

export default function DocsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("all");
  const [sources, setSources] = useState(seedSources);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "manual",
    description: "",
  });

  const total = sources.length + csvs.length + tables.length + competitors.length;
  const needle = query.trim().toLowerCase();

  const match = (...values) =>
    !needle || values.some((value) => String(value ?? "").toLowerCase().includes(needle));

  const shownSources = useMemo(
    () =>
      sources.filter((source) =>
        match(source.name, source.description, source.type, source.status),
      ),
    [sources, needle],
  );
  const shownCsvs = useMemo(
    () => csvs.filter((csv) => match(csv.name)),
    [needle],
  );
  const shownTables = useMemo(
    () => tables.filter((table) => match(table.name, table.source)),
    [needle],
  );
  const shownCompetitors = useMemo(
    () => competitors.filter((competitor) => match(competitor.name, competitor.url)),
    [needle],
  );

  const showSources = tab === "all" || tab === "sources";
  const showCsVs = tab === "all" || tab === "sources";
  const showTables = tab === "all" || tab === "tables";
  const showCompetitors = tab === "all" || tab === "competitors";

  const hasResults =
    (showSources && shownSources.length) ||
    (showCsVs && shownCsvs.length) ||
    (showTables && shownTables.length) ||
    (showCompetitors && shownCompetitors.length);

  const addSource = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setSources((current) => [
      {
        id: `s-${Date.now()}`,
        name,
        description:
          form.description.trim() ||
          "Added by Nim · your agents can cite this source.",
        type: form.type,
        status: "Ready",
        updated: "just now",
      },
      ...current,
    ]);
    setForm({ name: "", type: "manual", description: "" });
    setAddOpen(false);
    setTab("sources");
    toast(`${name} added to Docs.`);
  };

  return (
    <Page
      icon={FileText}
      title="Docs"
      count={total}
      subtitle="Sources, CSVs, and competitors your agents can cite."
      actions={
        <button className="btn btn--light" onClick={() => setAddOpen(true)} type="button">
          <Plus size={13} />
          Add source
        </button>
      }
    >
      <div className="docs-toolbar">
        <Tabs items={docTabs} onChange={setTab} value={tab} />
        <div className="docs-toolbar-right">
          {searching ? (
            <div className="search-field docs-search">
              <Search />
              <input
                autoFocus
                onChange={(event) => setQuery(event.target.value)}
                onBlur={() => {
                  if (!query) setSearching(false);
                }}
                placeholder="Search docs..."
                value={query}
              />
              <button
                aria-label="Close search"
                className="docs-search-close"
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
              aria-label="Search docs"
              className="icon-btn"
              onClick={() => setSearching(true)}
              type="button"
            >
              <Search />
            </button>
          )}
        </div>
      </div>

      <div className="docs-content">
        {!hasResults ? (
          <div className="empty-state docs-empty">
            <Search />
            <strong>No documents match</strong>
            <p>Try a different name, type, or keyword. Sources your agents can cite will appear here.</p>
            <button
              className="btn btn--subtle btn--sm"
              onClick={() => {
                setQuery("");
                setTab("all");
              }}
              type="button"
            >
              Clear search
            </button>
          </div>
        ) : null}

        {showSources && shownSources.length ? (
          <section className="doc-section">
            <SectionHead icon={FileText} title="Sources" />
            <div className="doc-table">
              <div className="doc-table-head doc-grid doc-grid--sources">
                <span>Name</span>
                <span>Type</span>
                <span>Status</span>
                <span>Updated</span>
              </div>
              {shownSources.map((source) => {
                const meta = typeMeta[source.type];
                const Icon = meta.icon;
                return (
                  <div className="doc-row doc-grid doc-grid--sources" key={source.id}>
                    <div className="doc-name-cell">
                      <strong>{source.name}</strong>
                      <span>{source.description}</span>
                    </div>
                    <div className={`doc-type ${meta.className}`}>
                      <Icon size={12} />
                      {meta.label}
                    </div>
                    <div>
                      <StatusPill status={source.status} />
                    </div>
                    <div className="doc-updated">{source.updated}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {showCsVs && shownCsvs.length ? (
          <section className="doc-section">
            <SectionHead icon={FileSpreadsheet} title="CSVs" />
            <div className="doc-table">
              <div className="doc-table-head doc-grid doc-grid--csvs">
                <span>Name</span>
                <span>Rows</span>
                <span>Updated</span>
              </div>
              {shownCsvs.map((csv) => (
                <div className="doc-row doc-grid doc-grid--csvs" key={csv.id}>
                  <div className="doc-name-cell">
                    <strong>{csv.name}</strong>
                  </div>
                  <div className="doc-rows">{csv.rows.toLocaleString("en-US")} rows</div>
                  <div className="doc-updated">{csv.updated}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {showTables && shownTables.length ? (
          <section className="doc-section">
            <SectionHead icon={Table2} title="Tables" />
            <div className="doc-table">
              <div className="doc-table-head doc-grid doc-grid--tables">
                <span>Name</span>
                <span>Rows</span>
                <span>Source</span>
                <span>Updated</span>
              </div>
              {shownTables.map((table) => {
                const meta = tableSourceMeta[table.source];
                const Icon = meta.icon;
                return (
                  <div className="doc-row doc-grid doc-grid--tables" key={table.id}>
                    <div className="doc-name-cell">
                      <strong>{table.name}</strong>
                    </div>
                    <div className="doc-rows">{table.rows.toLocaleString("en-US")} rows</div>
                    <div className={`table-source ${meta.className}`}>
                      <Icon size={12} />
                      {meta.label}
                    </div>
                    <div className="doc-updated">{table.updated}</div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {showCompetitors && shownCompetitors.length ? (
          <section className="doc-section">
            <SectionHead icon={Building2} title="Competitors" />
            <div className="doc-table doc-table--competitors">
              <div className="doc-table-head doc-grid doc-grid--competitors">
                <span>Name</span>
                <span>Updated</span>
              </div>
              {shownCompetitors.map((competitor) => (
                <div className="doc-row doc-grid doc-grid--competitors" key={competitor.id}>
                  <div className="doc-name-cell">
                    <strong>{competitor.name}</strong>
                    <span className="doc-url">{competitor.url}</span>
                  </div>
                  <div className="doc-updated">{competitor.updated}</div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <Modal
        description="Anything you add here becomes citable context for every agent in the workspace."
        footer={
          <>
            <button className="btn btn--subtle" onClick={() => setAddOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="btn btn--light"
              disabled={!form.name.trim()}
              form="add-source-form"
              type="submit"
            >
              Add source
            </button>
          </>
        }
        onClose={() => setAddOpen(false)}
        open={addOpen}
        title="Add source"
      >
        <form className="docs-form" id="add-source-form" onSubmit={addSource}>
          <div className="field">
            <label htmlFor="source-name">Name</label>
            <input
              autoFocus
              className="input"
              id="source-name"
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="e.g. Pricing objection notes"
              value={form.name}
            />
          </div>
          <div className="field">
            <label htmlFor="source-type">Source type</label>
            <select
              className="select"
              id="source-type"
              onChange={(event) =>
                setForm((current) => ({ ...current, type: event.target.value }))
              }
              value={form.type}
            >
              {sourceTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="source-description">Description</label>
            <textarea
              className="textarea"
              id="source-description"
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              placeholder="What should agents know about this source?"
              value={form.description}
            />
            <span className="hint">A short note is enough — the brain reads the full source.</span>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
