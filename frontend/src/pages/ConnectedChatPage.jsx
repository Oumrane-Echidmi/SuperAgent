import { useRef, useState } from "react";
import { MessageCircle, Plus, ArrowUp } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import {
  useMounted,
  useResource,
  useWorkspace,
} from "../context/WorkspaceContext";
import { ModelSelect, Pagination } from "./WorkspaceRecordsPage";

function Thread({ record }) {
  const { tenant, api } = useWorkspace(),
    mounted = useMounted(),
    pending = useRef(null);
  const [model, setModel] = useState(record.content.model),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false),
    [page, setPage] = useState(1);
  const base = `/tenants/${tenant.id}/workspace-records/${record.id}/messages`,
    history = useResource(`${base}?page=${page}&pageSize=30`);
  async function send(e) {
    e.preventDefault();
    if (busy) return;
    if (!pending.current)
      pending.current = { id: crypto.randomUUID(), model, text };
    setBusy(true);
    setError("");
    try {
      await api(base, { method: "POST", body: pending.current });
      if (mounted.current) {
        pending.current = null;
        setText("");
        setUncertain(false);
        setPage(1);
        history.reload();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        setUncertain(!failure.status || failure.status >= 500);
        if (failure.status && failure.status < 500) pending.current = null;
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="connected-thread">
      <h2>{record.title}</h2>
      <p className="provider-note">
        Provider connection pending. Messages are saved to your business. They
        have not been sent to a model and will not be sent automatically later.
      </p>
      <ResourceState resource={history} />
      <div className="connected-messages" aria-live="polite">
        {history.data?.data.map((message) => (
          <article key={message.id} className="connected-message">
            <div>
              <strong>You</strong>
              <small>
                {message.model} · {new Date(message.createdAt).toLocaleString()}
              </small>
            </div>
            <p>{message.text}</p>
            <span className="message-state">Saved · awaiting provider</span>
          </article>
        ))}
        {history.data && !history.data.data.length && (
          <p className="record-empty">
            Start a conversation. Your selected model is saved with each
            message.
          </p>
        )}
      </div>
      <Pagination
        pagination={history.data?.pagination}
        page={page}
        onPage={setPage}
      />
      <form className="live-form chat-compose" onSubmit={send}>
        <ModelSelect
          value={model}
          onChange={setModel}
          disabled={busy || uncertain}
        />
        <label>
          Message
          <textarea
            required
            maxLength={12000}
            rows={4}
            value={text}
            disabled={busy || uncertain}
            onChange={(e) => setText(e.target.value)}
            placeholder="What would you like to work on?"
          />
        </label>
        {error && (
          <p role="alert" className="live-error">
            {error}
            {uncertain && " Retry to check and save this same message."}
          </p>
        )}
        <button
          className="live-primary"
          disabled={busy || (!uncertain && !text.trim())}
        >
          <ArrowUp size={15} />
          {busy ? "Saving…" : uncertain ? "Retry message" : "Save message"}
        </button>
      </form>
    </div>
  );
}
export default function ConnectedChatPage() {
  const { tenant, api } = useWorkspace(),
    mounted = useMounted(),
    pending = useRef(null);
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState(null),
    [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(""),
    [model, setModel] = useState("opus"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const chats = useResource(
    `/tenants/${tenant.id}/workspace-records?kind=chat&page=${page}&pageSize=25`,
  );
  async function create(e) {
    e.preventDefault();
    if (busy) return;
    if (!pending.current)
      pending.current = {
        id: crypto.randomUUID(),
        kind: "chat",
        title,
        content: { model },
      };
    setBusy(true);
    setError("");
    try {
      const saved = await api(`/tenants/${tenant.id}/workspace-records`, {
        method: "POST",
        body: pending.current,
      });
      if (mounted.current) {
        pending.current = null;
        setUncertain(false);
        setCreating(false);
        setTitle("");
        setSelected(saved);
        chats.reload();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        setUncertain(!failure.status || failure.status >= 500);
        if (failure.status && failure.status < 500) pending.current = null;
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Page
      bodyClassName="workspace-content"
      icon={MessageCircle}
      title="Chat"
      actions={
        <button
          className="live-primary"
          disabled={busy}
          onClick={() => setCreating(true)}
        >
          <Plus size={14} /> New chat
        </button>
      }
    >
      <div className="connected-chat">
        <aside className="chat-history" aria-label="Saved chats">
          <h2>Your conversations</h2>
          <ResourceState resource={chats} />
          {chats.data?.data.map((chat) => (
            <button
              key={chat.id}
              aria-pressed={selected?.id === chat.id && !creating}
              onClick={() => {
                setSelected(chat);
                setCreating(false);
              }}
            >
              {chat.title}
              <small>{chat.content.model}</small>
            </button>
          ))}
          {chats.data && !chats.data.data.length && (
            <p className="live-muted">No saved chats yet.</p>
          )}
          <Pagination
            pagination={chats.data?.pagination}
            page={page}
            onPage={setPage}
          />
        </aside>
        {creating ? (
          <form className="live-form connected-thread" onSubmit={create}>
            <h2>New chat</h2>
            <label>
              Chat title
              <input
                required
                maxLength={120}
                value={title}
                disabled={busy || uncertain}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <ModelSelect
              value={model}
              onChange={setModel}
              disabled={busy || uncertain}
            />
            <p className="live-muted">
              Choose Opus, Sonnet, Astra or Sol. You can connect the provider
              later.
            </p>
            {error && <p role="alert">{error}</p>}
            <button className="live-primary" disabled={busy}>
              {uncertain ? "Retry create chat" : "Create chat"}
            </button>
          </form>
        ) : selected ? (
          <Thread key={selected.id} record={selected} />
        ) : (
          <div className="record-empty">
            <MessageCircle size={32} />
            <h2>What are we working on?</h2>
            <p>Create a chat or open a saved conversation.</p>
          </div>
        )}
      </div>
    </Page>
  );
}
