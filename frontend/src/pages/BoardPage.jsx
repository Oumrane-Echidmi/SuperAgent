import { useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  Calendar,
  Columns3,
  LayoutGrid,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import Page from "../components/Page";
import Avatar from "../components/Avatar";
import Dropdown from "../components/Dropdown";
import Modal from "../components/Modal";
import Tabs from "../components/Tabs";
import { useToast } from "../context/ToastContext";
import { boardViews, initialColumns, tagColors } from "../data/board";

const assignees = [
  "Nim",
  "Marco Vidal",
  "Jordan Lee",
  "Growth Analyst",
  "Inbox Concierge",
  "Revenue Watch",
];

export default function BoardPage() {
  const { toast } = useToast();
  const [columns, setColumns] = useState(initialColumns);
  const [view, setView] = useState("work");
  const [scope, setScope] = useState("active");
  const [banner, setBanner] = useState(true);
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [addingColumn, setAddingColumn] = useState(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: "",
    column: "todo",
    assignee: "Nim",
    tags: "",
  });
  const nextId = useRef(272);

  const total = useMemo(
    () => columns.reduce((sum, column) => sum + column.cards.length, 0),
    [columns],
  );

  const share = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      toast("Board link copied to the clipboard.");
    } catch {
      toast("Share link ready — copy it from the address bar.");
    }
  };

  const moveCard = (cardId, columnId) => {
    setColumns((current) => {
      const source = current.find((column) =>
        column.cards.some((card) => card.id === cardId),
      );
      if (!source || source.id === columnId) return current;
      const card = source.cards.find((item) => item.id === cardId);
      const target = current.find((column) => column.id === columnId);
      toast(`${card.id} moved to ${target.name}.`);
      return current.map((column) => {
        if (column.id === columnId) {
          return { ...column, cards: [card, ...column.cards] };
        }
        if (column.id === source.id) {
          return {
            ...column,
            cards: column.cards.filter((item) => item.id !== cardId),
          };
        }
        return column;
      });
    });
  };

  const createCard = (columnId, title, extra = {}) => {
    const card = {
      id: `AI-${nextId.current}`,
      title,
      tags: extra.tags ?? [],
      assignee: extra.assignee ?? "Nim",
      date: "Just now",
    };
    nextId.current += 1;
    setColumns((current) =>
      current.map((column) =>
        column.id === columnId
          ? { ...column, cards: [card, ...column.cards] }
          : column,
      ),
    );
    return card;
  };

  const submitInline = (event, columnId) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    const card = createCard(columnId, title);
    setDraftTitle("");
    setAddingColumn(null);
    toast(`${card.id} added.`);
  };

  const submitTask = (event) => {
    event.preventDefault();
    const title = taskForm.title.trim();
    if (!title) return;
    const tags = taskForm.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const card = createCard(taskForm.column, title, {
      tags,
      assignee: taskForm.assignee,
    });
    setTaskOpen(false);
    setTaskForm({ title: "", column: "todo", assignee: "Nim", tags: "" });
    toast(`${card.id} added to the board.`);
  };

  const activeView = scope === "archived" || view !== "work";

  return (
    <Page
      icon={Columns3}
      title="Board"
      count={total}
      subtitle="Track and manage your team's work."
      flush
      actions={
        <>
          <button className="btn btn--outline" onClick={share} type="button">
            <Share2 size={12} />
            Share
          </button>
          <button
            className="btn btn--light"
            onClick={() => setTaskOpen(true)}
            type="button"
          >
            <Plus size={13} />
            New task
          </button>
        </>
      }
    >
      <div className="board-page">
        <div className="board-toolbar">
          <Tabs
            className="pill-tabs board-view-tabs"
            items={boardViews}
            onChange={setView}
            value={view}
          />
          <div className="board-toolbar-right">
            <div className="filter-tabs board-scope">
              <button
                className={`filter-tab ${scope === "active" ? "active" : ""}`}
                onClick={() => setScope("active")}
                type="button"
              >
                Active
              </button>
              <button
                className={`filter-tab ${scope === "archived" ? "active" : ""}`}
                onClick={() => setScope("archived")}
                type="button"
              >
                Archived <span className="count">3</span>
              </button>
            </div>
            <button
              className="icon-btn"
              onClick={() => toast("Filters are coming soon.")}
              title="Filter"
              type="button"
            >
              <SlidersHorizontal />
            </button>
            <Dropdown
              align="right"
              items={[
                { label: "Newest first", onClick: () => toast("Sorted by newest first.") },
                { label: "Oldest first", onClick: () => toast("Sorted by oldest first.") },
                { label: "Priority", onClick: () => toast("Sorted by priority.") },
              ]}
              trigger={(props) => (
                <button className="icon-btn" title="Sort" type="button" {...props}>
                  <ArrowUpDown />
                </button>
              )}
            />
            <button
              className="icon-btn"
              onClick={() => toast("Board layout options are coming soon.")}
              title="Layout"
              type="button"
            >
              <LayoutGrid />
            </button>
            <Dropdown
              align="right"
              items={[
                { label: "Board settings", onClick: () => toast("Board settings are coming soon.") },
                { label: "Manage members", onClick: () => toast("Member management is coming soon.") },
                { type: "separator" },
                { label: "Hide archived work", onClick: () => setScope("active") },
              ]}
              trigger={(props) => (
                <button className="icon-btn" title="More" type="button" {...props}>
                  <MoreHorizontal />
                </button>
              )}
            />
          </div>
        </div>

        {banner && !activeView ? (
          <div className="board-banner">
            <span className="board-banner-icon">
              <Sparkles size={13} />
            </span>
            <div className="board-banner-copy">
              <strong>1 starter suggestion from your signup</strong>
              <p>
                AI Agent drafted this from your website so the board was not
                empty. It is a suggestion, not your own work — keep what fits, or
                clear the board.
              </p>
            </div>
            <button
              aria-label="Dismiss suggestion"
              className="icon-btn icon-btn--sm"
              onClick={() => setBanner(false)}
              type="button"
            >
              <X />
            </button>
          </div>
        ) : null}

        {activeView ? (
          <div className="board-empty">
            <div className="board-empty-icon">
              <Columns3 />
            </div>
            <strong>
              {scope === "archived"
                ? "No archived work"
                : `${boardViews.find((item) => item.id === view)?.label} view is being set up`}
            </strong>
            <p>
              {scope === "archived"
                ? "Archived tasks will wait here without cluttering the active board."
                : "This view will group the same work by project, member, or agent. Switch back to Work to keep moving."}
            </p>
            <button
              className="btn btn--subtle btn--sm"
              onClick={() => {
                setScope("active");
                setView("work");
              }}
              type="button"
            >
              Back to Work
            </button>
          </div>
        ) : (
          <div className="board-scroll">
            <div className="board-columns">
              {columns.map((column) => (
                <section
                  className={`board-column ${dragOver === column.id ? "drag-over" : ""}`}
                  key={column.id}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOver(column.id);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(event) => {
                    event.preventDefault();
                    const cardId =
                      event.dataTransfer.getData("text/plain") || dragging;
                    if (cardId) moveCard(cardId, column.id);
                    setDragOver(null);
                    setDragging(null);
                  }}
                >
                  <header className="board-column-head">
                    <span className="board-column-dot" style={{ background: column.dot }} />
                    <span className="board-column-name">{column.name}</span>
                    <span className="board-column-count">{column.cards.length}</span>
                    <div className="board-column-actions">
                      <button
                        aria-label={`Add task to ${column.name}`}
                        className="icon-btn icon-btn--sm"
                        onClick={() => {
                          setAddingColumn(column.id);
                          setDraftTitle("");
                        }}
                        type="button"
                      >
                        <Plus />
                      </button>
                      <Dropdown
                        align="right"
                        items={[
                          {
                            label: "Add task",
                            icon: Plus,
                            onClick: () => {
                              setAddingColumn(column.id);
                              setDraftTitle("");
                            },
                          },
                          {
                            label: "Sort by newest",
                            onClick: () => toast(`Sorted ${column.name} by newest.`),
                          },
                          {
                            label: "Column settings",
                            onClick: () => toast("Column settings are coming soon."),
                          },
                        ]}
                        trigger={(props) => (
                          <button
                            aria-label={`${column.name} options`}
                            className="icon-btn icon-btn--sm"
                            type="button"
                            {...props}
                          >
                            <MoreHorizontal />
                          </button>
                        )}
                      />
                    </div>
                  </header>

                  {addingColumn === column.id ? (
                    <form
                      className="card-add-form"
                      onSubmit={(event) => submitInline(event, column.id)}
                    >
                      <input
                        autoFocus
                        onChange={(event) => setDraftTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setAddingColumn(null);
                        }}
                        placeholder="Task title..."
                        value={draftTitle}
                      />
                      <button className="btn btn--light btn--sm" type="submit">
                        Add
                      </button>
                    </form>
                  ) : null}

                  {column.cards.map((card) => (
                    <article
                      className="board-card"
                      draggable
                      key={card.id}
                      onDragEnd={() => {
                        setDragging(null);
                        setDragOver(null);
                      }}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", card.id);
                        event.dataTransfer.effectAllowed = "move";
                        setDragging(card.id);
                      }}
                    >
                      <div className="board-card-head">
                        <span className="board-card-spark">
                          <Sparkles size={9} />
                        </span>
                        <span className="board-card-id">{card.id}</span>
                        {card.needsYou ? (
                          <span className="board-needs">Needs you</span>
                        ) : null}
                      </div>
                      <h3 className="board-card-title">{card.title}</h3>
                      {card.tags.length ? (
                        <div className="board-tags">
                          {card.tags.map((tag) => (
                            <span className="board-tag" key={tag}>
                              <span
                                className="tag-dot"
                                style={{ background: tagColors[tag] ?? "#a8a29e" }}
                              />
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="board-card-foot">
                        <Avatar name={card.assignee} size={16} />
                        <span className="board-assignee">{card.assignee}</span>
                        <span className="board-date">
                          <Calendar size={9} />
                          {card.date}
                        </span>
                        {card.comments ? (
                          <span className="board-comments">
                            <MessageSquare size={9} />
                            {card.comments}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </section>
              ))}
            </div>
          </div>
        )}
      </div>

      <Modal
        description="Add a card to the board. Agents can pick it up once it is assigned."
        footer={
          <>
            <button className="btn btn--subtle" onClick={() => setTaskOpen(false)} type="button">
              Cancel
            </button>
            <button
              className="btn btn--light"
              disabled={!taskForm.title.trim()}
              form="new-task-form"
              type="submit"
            >
              Create task
            </button>
          </>
        }
        onClose={() => setTaskOpen(false)}
        open={taskOpen}
        title="New task"
      >
        <form className="board-task-form" id="new-task-form" onSubmit={submitTask}>
          <div className="field">
            <label htmlFor="task-title">Title</label>
            <input
              autoFocus
              className="input"
              id="task-title"
              onChange={(event) =>
                setTaskForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="What needs to move forward?"
              value={taskForm.title}
            />
          </div>
          <div className="board-form-grid">
            <div className="field">
              <label htmlFor="task-column">Column</label>
              <select
                className="select"
                id="task-column"
                onChange={(event) =>
                  setTaskForm((current) => ({ ...current, column: event.target.value }))
                }
                value={taskForm.column}
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="task-assignee">Assignee</label>
              <select
                className="select"
                id="task-assignee"
                onChange={(event) =>
                  setTaskForm((current) => ({ ...current, assignee: event.target.value }))
                }
                value={taskForm.assignee}
              >
                {assignees.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="task-tags">Tags</label>
            <input
              className="input"
              id="task-tags"
              onChange={(event) =>
                setTaskForm((current) => ({ ...current, tags: event.target.value }))
              }
              placeholder="Customer, Billing"
              value={taskForm.tags}
            />
            <span className="hint">Comma separated. Colors are assigned automatically.</span>
          </div>
        </form>
      </Modal>
    </Page>
  );
}
