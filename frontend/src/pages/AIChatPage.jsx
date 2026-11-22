import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ListChecks,
  Menu,
  MessageCircle,
  MessageSquare,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import ResourceState from "../components/ResourceState";
import AIChatSidebar from "../components/AIChatSidebar";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import "../styles/ai-chat.css";

const suggestions = [
  {
    icon: ShoppingBag,
    title: "Confirm my orders",
    text: "Help me set up an assistant to confirm cash-on-delivery orders in Darija.",
  },
  {
    icon: MessageSquare,
    title: "Answer product questions",
    text: "I want an assistant that answers customer questions about my products in French.",
  },
  {
    icon: ListChecks,
    title: "Organize customer requests",
    text: "Help me organize incoming customer requests and identify what needs my attention.",
  },
];

export default function AIChatPage() {
  const { tenant, api, signOut } = useWorkspace();
  const base = `/tenants/${tenant.id}/builder`;
  const models = useResource(`${base}/models`);
  const sessions = useResource(`${base}/sessions`);
  const [activeId, setActiveId] = useState("");
  const thread = useResource(activeId ? `${base}/sessions/${activeId}` : null);
  const [model, setModel] = useState("");
  const [draft, setDraft] = useState("");
  const [language, setLanguage] = useState("fr");
  const [consent, setConsent] = useState(false);
  const [mcpConsent, setMcpConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const attempt = useRef(null);
  const mounted = useRef(true);
  const messageInput = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const turns = thread.data?.turns ?? [];
  const latest = turns.at(-1);
  const available = models.data?.data ?? [];
  const preferred = model || latest?.model || models.data?.defaultModel || "";
  const selectedModel = available.some((item) => item.id === preferred)
    ? preferred
    : models.data?.defaultModel || "";
  const pending = turns.some((turn) =>
    ["QUEUED", "RUNNING"].includes(turn.status),
  );
  const owner = tenant.role === "OWNER";
  const canSend =
    owner &&
    models.data?.enabled &&
    selectedModel &&
    (!activeId || Boolean(thread.data));
  const mcpServers = models.data?.mcpServers ?? [];
  const locked = sending || Boolean(attempt.current);

  useEffect(() => {
    if (!activeId || !pending || thread.loading || thread.error)
      return undefined;
    const timer = window.setTimeout(thread.reload, 1500);
    return () => window.clearTimeout(timer);
  }, [activeId, pending, thread.loading, thread.error, thread.reload]);

  function chooseConversation(id) {
    setActiveId(id);
    setModel("");
    setDraft("");
    setError("");
    setConsent(false);
    setMcpConsent(false);
    attempt.current = null;
    setSidebarOpen(false);
  }

  async function send(event) {
    event?.preventDefault();
    if (
      sending ||
      !canSend ||
      (!attempt.current &&
        (pending || !draft.trim() || (!activeId && !consent)))
    )
      return;
    if (!attempt.current) {
      const id = activeId || crypto.randomUUID();
      attempt.current = {
        sessionId: id,
        create: activeId
          ? null
          : { id, language, consentToOpenAI: true, consentToMcp: mcpConsent },
        message: {
          id: crypto.randomUUID(),
          expectedRevision: thread.data?.revision ?? 0,
          text: draft.trim(),
          model: selectedModel,
        },
      };
    }
    const intent = attempt.current;
    setSending(true);
    setError("");
    try {
      if (intent.create)
        await api(`${base}/sessions`, { method: "POST", body: intent.create });
      if (!mounted.current) return;
      setActiveId(intent.sessionId);
      await api(`${base}/sessions/${intent.sessionId}/messages`, {
        method: "POST",
        body: intent.message,
      });
      if (!mounted.current) return;
      attempt.current = null;
      setDraft("");
      thread.reload();
      sessions.reload();
    } catch (failure) {
      if (mounted.current) {
        if (
          [
            "MODEL_NOT_ALLOWED",
            "STALE_REVISION",
            "TURN_PENDING",
            "SESSION_LIMIT",
            "BUILDER_LIMIT",
            "BUILDER_AI_DISABLED",
            "FORBIDDEN",
          ].includes(failure.code)
        ) {
          attempt.current = null;
          thread.reload();
          if (failure.code === "MODEL_NOT_ALLOWED") {
            setModel("");
            models.reload();
          }
        }
        setError(failure.message);
      }
    } finally {
      if (mounted.current) setSending(false);
    }
  }

  return (
    <div className="ai-chat-shell">
      <AIChatSidebar
        sessions={sessions}
        activeId={activeId}
        currentTitle={turns[0]?.text}
        busy={locked}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onChoose={chooseConversation}
        onSignOut={() =>
          signOut().catch((failure) => setError(failure.message))
        }
      />
      <section className="ai-chat-stage" aria-label="AI chat">
        <header className="ai-stage-header">
          <button
            className="ai-mobile-toggle"
            aria-label="Open chat navigation"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>
          <span className="ai-stage-title">
            Chat <span>/</span> {tenant.name}
          </span>
          <span className="ai-stage-caption">Your business assistant</span>
        </header>
        <div className={`ai-chat-scroll ${!activeId ? "is-welcome" : ""}`}>
          <div className="ai-chat-content">
            <ResourceState resource={models} />
            {sessions.error && <ResourceState resource={sessions} />}
            {activeId && <ResourceState resource={thread} />}
            {models.data && !activeId && (
              <div className="ai-welcome">
                <img
                  className="ai-welcome-logo"
                  src="/brand/superagent-logo.png"
                  alt="SuperAgent"
                />
                <p className="ai-welcome-kicker">Welcome to SuperAgent</p>
                <h1>How can I help you?</h1>
                <p className="ai-welcome-description">
                  Turn your business goals into an assistant that works for you.
                </p>
                <div className="ai-prompt-cards">
                  {suggestions.map(({ icon: Icon, title, text }) => (
                    <button
                      key={title}
                      type="button"
                      disabled={!canSend || locked}
                      onClick={() => {
                        setDraft(text);
                        messageInput.current?.focus();
                      }}
                    >
                      <span>{title}</span>
                      <Icon size={19} strokeWidth={1.5} />
                      <span className="ai-card-arrow">↗</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div
              className="ai-chat-messages"
              role="log"
              aria-label="Conversation messages"
              aria-live="polite"
            >
              {turns.map((turn) => (
                <article className="ai-chat-turn" key={turn.id}>
                  <div className="ai-chat-message ai-chat-message--user">
                    <span className="ai-chat-author">You</span>
                    <p dir="auto">{turn.text}</p>
                  </div>
                  <div className="ai-chat-message">
                    <span className="ai-chat-author">
                      <Sparkles size={15} />
                      SuperAgent{" "}
                      <span>
                        {turn.provider?.model || turn.model || "Default model"}
                      </span>
                    </span>
                    {turn.status === "SUCCEEDED" ? (
                      <p dir="auto">{turn.result?.reply}</p>
                    ) : turn.status === "FAILED" ? (
                      <p className="live-error" role="status">
                        This reply could not be completed ({turn.errorCode}).
                        You can send a new message.
                      </p>
                    ) : (
                      <p className="live-muted" role="status">
                        {turn.status === "QUEUED"
                          ? "Waiting for the assistant…"
                          : "Assistant is working…"}
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
        <div className="ai-composer-dock">
          {models.data && (
            <>
              {!models.data.enabled && (
                <p className="ai-service-notice" role="status">
                  AI is not configured for this workspace yet.
                </p>
              )}
              <form className="ai-chat-composer" onSubmit={send}>
                <div className="ai-composer-input">
                  <Sparkles size={20} strokeWidth={1.5} />
                  <textarea
                    ref={messageInput}
                    aria-label="Message assistant"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={2000}
                    rows={2}
                    disabled={!canSend || locked || pending}
                    placeholder="Ask anything, or describe your assistant…"
                  />
                </div>
                {!activeId && (
                  <div className="ai-consent-options">
                    <label>
                      <input
                        type="checkbox"
                        checked={consent}
                        disabled={!owner || locked}
                        onChange={(event) => setConsent(event.target.checked)}
                      />
                      Share this setup conversation with OpenAI
                    </label>
                    {mcpServers.length > 0 && (
                      <div>
                        <label>
                          <input
                            type="checkbox"
                            checked={mcpConsent}
                            disabled={!owner || locked}
                            onChange={(event) =>
                              setMcpConsent(event.target.checked)
                            }
                          />
                          Allow reference tools for this conversation
                        </label>
                        <p>
                          Setup messages may be shared with{" "}
                          {mcpServers
                            .map(
                              (server) =>
                                `${server.label} (${new URL(server.url).hostname})`,
                            )
                            .join(", ")}
                          .
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {error && (
                  <div role="alert" className="live-error">
                    <p>{error}</p>
                    {attempt.current && (
                      <button
                        className="live-secondary"
                        type="button"
                        onClick={() => send()}
                        disabled={sending}
                      >
                        Retry same message
                      </button>
                    )}
                  </div>
                )}
                <div className="ai-composer-toolbar">
                  <div className="ai-toolbar-left">
                    <MessageCircle size={16} />
                    <span>Assistant</span>
                    {!activeId && (
                      <label className="ai-language-control">
                        <span className="ai-visually-hidden">
                          Reply language
                        </span>
                        <select
                          aria-label="Reply language"
                          value={language}
                          onChange={(event) => setLanguage(event.target.value)}
                          disabled={locked}
                        >
                          <option value="fr">Français</option>
                          <option value="darija">Darija</option>
                        </select>
                      </label>
                    )}
                  </div>
                  <div className="ai-toolbar-right">
                    <label className="ai-model-control">
                      <span className="ai-model-indicator" />
                      <span className="ai-visually-hidden">AI model</span>
                      <select
                        aria-label="AI model"
                        value={selectedModel}
                        disabled={
                          !owner || locked || pending || !available.length
                        }
                        onChange={(event) => setModel(event.target.value)}
                      >
                        {!available.length && (
                          <option value="">No models available</option>
                        )}
                        {available.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="ai-send-button"
                      aria-label="Send message"
                      disabled={
                        !canSend ||
                        locked ||
                        pending ||
                        !draft.trim() ||
                        (!activeId && !consent)
                      }
                    >
                      <ArrowUp size={20} />
                    </button>
                  </div>
                </div>
              </form>
              <p className="ai-composer-footnote">
                {owner
                  ? "SuperAgent can make mistakes. Review suggestions before putting them to work."
                  : "Only an owner can send messages."}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
