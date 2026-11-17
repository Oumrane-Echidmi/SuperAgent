import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock,
  Grid2X2,
  Mic,
  Plus,
  Sparkles,
} from "lucide-react";
import Page from "../components/Page";
import Avatar from "../components/Avatar";
import { useToast } from "../context/ToastContext";
import { gettingStarted, needs, recentlyDone, suggestions, todos } from "../data/home";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [todoList, setTodoList] = useState(todos);
  const [todoText, setTodoText] = useState("");
  const [doneOpen, setDoneOpen] = useState(() => new Set(gettingStarted.slice(0, 4).map((item) => item.id)));
  const inputRef = useRef(null);

  const openChat = (text) => {
    navigate(`/chat?q=${encodeURIComponent(text)}`);
  };

  const submit = (event) => {
    event?.preventDefault();
    const text = prompt.trim();
    if (!text) {
      inputRef.current?.focus();
      return;
    }
    openChat(text);
  };

  const addTodo = (event) => {
    event.preventDefault();
    const text = todoText.trim();
    if (!text) return;
    setTodoList((current) => [
      ...current,
      { id: `t-${Date.now()}`, label: text },
    ]);
    setTodoText("");
    toast("Todo captured.");
  };

  const toggleTodo = (id) => {
    setTodoList((current) =>
      current.map((item) =>
        item.id === id ? { ...item, done: !item.done } : item,
      ),
    );
  };

  const removeTodo = (id) => {
    setTodoList((current) => current.filter((item) => item.id !== id));
  };

  const progress = useMemo(() => {
    const total = gettingStarted.length;
    const complete = doneOpen.size;
    return { total, complete, label: `${complete} of ${total} done` };
  }, [doneOpen]);

  const completeStep = (id) => {
    setDoneOpen((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
    toast(progress.complete + 1 >= progress.total ? "Setup complete — nice work." : "Step completed.");
  };

  return (
    <Page icon={Grid2X2} title="Home">
      <div className="home">
        <div className="home-hero">
          <h1 className="home-greeting">
            {greeting()}, <span>Nim</span>
          </h1>

          <form className="hero-composer" onSubmit={submit}>
            <textarea
              aria-label="Message Assistant"
              className="hero-input"
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) submit(event);
              }}
              placeholder="Message Assistant..."
              ref={inputRef}
              rows={2}
              value={prompt}
            />
            <div className="composer-bar">
              <button aria-label="Add attachment" className="composer-add" type="button">
                <Plus size={14} />
              </button>
              <span className="composer-agent">
                <Avatar
                  icon={Sparkles}
                  name="Assistant"
                  palette={["#f0abfc", "#d946ef", "#a21caf"]}
                  size={16}
                />
                <span>Assistant</span>
              </span>
              <div className="composer-spacer" />
              <button className="model-btn" type="button">
                <Sparkles size={12} />
                GPT-6 Luna
                <ChevronDown size={12} />
              </button>
              <button className="auto-btn" type="button">
                Auto
              </button>
              <button aria-label="Voice input" className="icon-btn icon-btn--sm" type="button">
                <Mic />
              </button>
              <button
                aria-label="Send message"
                className="send-btn"
                disabled={!prompt.trim()}
                type="submit"
              >
                <ArrowUp size={15} />
              </button>
            </div>
          </form>

          <div className="suggestions">
            <div className="suggestions-label">Suggested next steps</div>
            {suggestions.map((item) => (
              <button
                className="suggestion"
                key={item}
                onClick={() => openChat(item)}
                type="button"
              >
                <span>{item}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          </div>
        </div>

        <section className="widgets">
          <div className="widgets-label">Widgets</div>

          <div className="widgets-top">
            <section className="widget">
              <header className="widget-head">
                <h2 className="widget-title">Todo</h2>
                <button className="widget-link" onClick={() => navigate("/board")} type="button">
                  <ArrowUpRight size={15} />
                </button>
              </header>
              <form className="todo-add" onSubmit={addTodo}>
                <input
                  aria-label="Capture a todo"
                  onChange={(event) => setTodoText(event.target.value)}
                  placeholder="Capture a todo..."
                  value={todoText}
                />
                <button aria-label="Add todo" type="submit">
                  <Plus size={14} />
                </button>
              </form>
              <div className="todo-list">
                {todoList.map((item) => (
                  <div
                    className={`todo-item ${item.done ? "done" : ""}`}
                    key={item.id}
                  >
                    <button
                      aria-label={item.done ? "Mark todo incomplete" : "Complete todo"}
                      className={`todo-check ${item.done ? "checked" : ""}`}
                      onClick={() => toggleTodo(item.id)}
                      type="button"
                    >
                      {item.done ? <Check size={11} /> : null}
                    </button>
                    <span className="todo-label">{item.label}</span>
                    <button
                      aria-label="Remove todo"
                      className="todo-remove"
                      onClick={() => removeTodo(item.id)}
                      type="button"
                    >
                      <Plus className="rotate-45" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="widget">
              <header className="widget-head">
                <h2 className="widget-title">Needs to know</h2>
                <button className="widget-link" onClick={() => navigate("/inbox")} type="button">
                  <ArrowUpRight size={15} />
                </button>
              </header>
              <div className="need-list">
                {needs.map((item) => (
                  <button
                    className="need-row"
                    key={item.id}
                    onClick={() => navigate(`/inbox?mail=${item.id}`)}
                    type="button"
                  >
                    <Avatar name={item.name} size={28} />
                    <span className="need-copy">
                      <span className="need-line">
                        <strong>{item.name}</strong>
                      </span>
                      <span className="need-text">{item.text}</span>
                    </span>
                    <span className="need-meta">
                      {item.flagged ? <span className="need-flag">⚑</span> : null}
                      <span>{item.time}</span>
                      {item.unread ? <span className="need-unread" /> : null}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="widgets-bottom">
            <section className="widget">
              <header className="widget-head">
                <h2 className="widget-title">Recently done</h2>
                <button className="widget-link" onClick={() => navigate("/board")} type="button">
                  <ArrowUpRight size={15} />
                </button>
              </header>
              <div className="done-list">
                {recentlyDone.map((item) => (
                  <button
                    className={`done-item ${item.status === "done" ? "done-item--complete" : ""}`}
                    key={item.id}
                    onClick={() => toast(item.text)}
                    type="button"
                  >
                    <span className="done-icon">
                      {item.status === "done" ? <Check size={11} /> : <Clock size={11} />}
                    </span>
                    <span className="done-copy">
                      <span className="done-text">{item.text}</span>
                      <span className="done-meta">
                        <span className="chip">{item.meta}</span>
                        <span>{item.time}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <button
              className="insight"
              onClick={() =>
                openChat(
                  "Stalled trials go quiet fast — ping day-3 signups who haven't connected a tool yet.",
                )
              }
              type="button"
            >
              <p>
                Stalled trials go quiet fast — ping day-3 signups who haven't
                connected a tool yet. Wait past day 5 and they're gone for good.
              </p>
            </button>

            <section className="widget">
              <header className="widget-head">
                <h2 className="widget-title">Getting started</h2>
                <ArrowUpRight size={15} className="widget-link-static" />
              </header>
              <div className="getting-progress">{progress.label}</div>
              <div className="getting-list">
                {gettingStarted.map((item, index) => {
                  const complete = doneOpen.has(item.id);
                  return (
                    <div
                      className={`getting-item ${complete ? "is-complete" : ""}`}
                      key={item.id}
                    >
                      <button
                        aria-label={complete ? "Completed" : `Complete ${item.label}`}
                        className={`getting-check ${complete ? "" : "pending"}`}
                        onClick={() => (complete ? null : completeStep(item.id))}
                        type="button"
                      >
                        <Check size={11} />
                      </button>
                      <span>{item.label}</span>
                      {!complete && index === gettingStarted.length - 1 ? (
                        <button
                          className="getting-skip"
                          onClick={() => completeStep(item.id)}
                          type="button"
                        >
                          Skip
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </section>
      </div>
    </Page>
  );
}
