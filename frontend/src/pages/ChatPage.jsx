import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  CircleDot,
  Copy,
  Globe,
  Info,
  MessageCircle,
  Mic,
  PanelLeft,
  Plus,
  Sparkles,
} from "lucide-react";
import Page from "../components/Page";
import Avatar from "../components/Avatar";
import Dropdown from "../components/Dropdown";
import { useToast } from "../context/ToastContext";
import {
  buildLiveReply,
  chatAgents,
  citations,
  comparison,
  liveSuggestions,
  questionOptions,
  workLogEight,
  workLogThree,
} from "../data/chat";

function Cite({ children }) {
  return <span className="cite">{children}</span>;
}

function WorkLog({ count, steps, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="worklog">
      <button
        className="worklog-button"
        onClick={() => setOpen((value) => !value)}
        type="button"
        aria-expanded={open}
      >
        <CircleDot size={12} />
        <span>Work log · {count} steps</span>
        <ChevronRight className={open ? "rotate-90" : ""} size={12} />
      </button>
      {open ? (
        <ol className="worklog-list">
          {steps.map((step, index) => (
            <li key={step}>
              <span className="worklog-index">{index + 1}</span>
              <span>{step}</span>
              <Check size={11} />
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function UserBubble({ children }) {
  return (
    <div className="chat-msg chat-msg--user">
      <div className="chat-bubble">{children}</div>
    </div>
  );
}

function SampleThread() {
  const { toast } = useToast();
  const [selected, setSelected] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [tableOpen, setTableOpen] = useState(true);

  const submitAnswer = () => {
    if (!selected) return;
    setSubmitted(true);
    toast("Answer recorded — folded into AI-251.");
  };

  return (
    <>
      <UserBubble>Growth Analyst, what changed in mobile trial signups?</UserBubble>

      <div className="chat-msg chat-msg--assistant">
        <WorkLog count={8} steps={workLogEight} />
        <p className="chat-p">
          I traced the dip to one product step, then turned it into work:
        </p>
        <ul className="rich-list">
          <li>
            <strong>PostHog</strong> — <span className="mono">connect_data</span>{" "}
            abandons rose 9 points after Tuesday's deploy. Every other step held,
            and web is flat, so this is mobile only.
          </li>
          <li>
            <strong>Brand Profile</strong> — activation depends on the first
            integration succeeding, which makes this one screen the whole funnel.{" "}
            <Cite>K1</Cite>
          </li>
          <li>
            <strong>Funnel events</strong> — 214 mobile trials in the window, 38
            of them stall there. <Cite>K2</Cite>
          </li>
          <li>
            <strong>Stripe</strong> — paid conversion is 18.3% against 18.1% the
            period before, so pricing is not the cause.
          </li>
        </ul>
        <p className="chat-p">
          I opened <strong>AI-251 — Fix mobile onboarding drop-off</strong> and
          moved it into progress: patch the connect-data step, restore mobile form
          recovery, and verify activation lift.
        </p>
        <div className="cite-chips">
          <Cite>K1</Cite>
          <Cite>K2</Cite>
        </div>
      </div>

      <UserBubble>Who picks it up?</UserBubble>

      <div className="chat-msg chat-msg--assistant">
        <p className="chat-p">
          It stays on my queue for the diagnosis, and I logged{" "}
          <strong>Marco Vidal</strong> for review — he owns onboarding this cycle.
          I will re-run the funnel 24 hours after the fix ships and post the
          activation delta in this thread.
        </p>
      </div>

      <UserBubble>What's the fastest way to close that gap?</UserBubble>

      <div className="chat-msg chat-msg--assistant">
        <div className="chat-progress-note">
          <CircleDot size={12} />
          <span>Close the connect-data gap · 2 of 3 steps done</span>
        </div>
        <WorkLog count={3} steps={workLogThree} />

        <div className="web-row">
          <span className="web-chip">
            <span className="favicon">e</span>
            example.com
          </span>
          <span className="web-chip">
            <span className="favicon">e</span>
            example.com
          </span>
          <span className="web-meta">
            <Globe size={11} /> Searched the web
          </span>
          <span className="web-engine">Jina</span>
        </div>

        <div className="source-cards">
          {citations.map((source) => (
            <div className="source-card" key={source.tag}>
              <div className="source-card-title">
                <Cite>{source.tag}</Cite>
                <strong>{source.title}</strong>
              </div>
              <div className="source-card-source">{source.source}</div>
              <p>{source.text}</p>
            </div>
          ))}
        </div>

        <div className="clarification">
          <div className="clarification-head">
            <Info size={12} />
            <strong>Clarification</strong>
            <span>No external action</span>
          </div>
          <p>Two fixes are scoped and costed. Which should ship first?</p>
        </div>

        <div className="ask-card">
          <div className="ask-title">Which fix should ship first?</div>
          <div className="ask-options">
            {questionOptions.map((option) => (
              <button
                aria-pressed={selected === option.id}
                className={`ask-option ${selected === option.id ? "selected" : ""}`}
                disabled={submitted}
                key={option.id}
                onClick={() => setSelected(option.id)}
                type="button"
              >
                <span className="ask-radio" />
                <span>{option.label}</span>
              </button>
            ))}
          </div>
          <div className="ask-foot">
            <button
              className="btn btn--light btn--sm"
              disabled={!selected || submitted}
              onClick={submitAnswer}
              type="button"
            >
              {submitted ? "Answers submitted" : "Submit answers"}
            </button>
          </div>
        </div>

        <p className="chat-p chat-p--after">
          Both patterns hold up against our own funnel too — deferring the
          identity check until after the first success recovers more, a visible
          retry on the same gate recovers less but ships in a day. <Cite>K1</Cite>
          I costed both against the 214 mobile trials in the window. Pick one
          above and I will fold it into AI-251 today.
        </p>
      </div>

      <UserBubble>Show me the math behind that estimate.</UserBubble>

      <div className="chat-msg chat-msg--assistant">
        <WorkLog
          count={2}
          steps={[
            "Modelled each fix against 21 days of mobile trials",
            "Compared recovered connect-data points to paid conversion",
          ]}
        />
        <div className="math-card">
          <div className="math-head">
            <div>
              <strong>{comparison.title}</strong>
              <span>{comparison.subtitle}</span>
            </div>
            <button
              className="math-collapse"
              onClick={() => setTableOpen((value) => !value)}
              type="button"
            >
              {tableOpen ? "Collapse" : "Expand"}
              {tableOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          </div>
          {tableOpen ? (
            <table className="math-table">
              <thead>
                <tr>
                  {comparison.columns.map((column, index) => (
                    <th key={column} className={index > 0 ? "num" : ""}>
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, index) => (
                      <td key={`${row[0]}-${index}`} className={index > 0 ? "num" : ""}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
        <p className="chat-p chat-p--after">
          Deferring verification alone recovers the most for the least
          engineering time — 2 days against an estimated 1.1-point trial-to-paid
          lift. Staging both gets the same recovery on a slower rollout, worth it
          only if you also want the retry safety net. I will start on your pick
          from AI-251 the moment you choose.
        </p>
      </div>
    </>
  );
}

function EmptyChat() {
  return (
    <div className="chat-empty">
      <div className="chat-empty-icon">
        <Sparkles size={18} />
      </div>
      <h2>How can I help, Nim?</h2>
      <p>Ask about the workspace, or hand an agent a job to run.</p>
      <div className="chat-empty-prompts">
        {liveSuggestions.map((prompt) => (
          <span key={prompt}>{prompt}</span>
        ))}
      </div>
    </div>
  );
}

function LiveThread({ messages, sending, agent }) {
  if (!messages.length && !sending) return <EmptyChat />;
  return (
    <div className="live-thread">
      {messages.map((message) =>
        message.role === "user" ? (
          <UserBubble key={message.id}>{message.text}</UserBubble>
        ) : (
          <div className="chat-msg chat-msg--assistant" key={message.id}>
            <WorkLog
              count={message.log?.length ?? 3}
              steps={message.log ?? []}
            />
            <p className="chat-p">{message.intro}</p>
            {message.bullets?.length ? (
              <ul className="rich-list">
                {message.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
            <p className="chat-p">{message.outro}</p>
            <div className="chat-reply-signoff">
              <Avatar
                name={agent.name}
                palette={agent.palette}
                size={18}
                icon={agent.name === "Assistant" ? Sparkles : undefined}
              />
              <span>{agent.name}</span>
            </div>
          </div>
        ),
      )}
      {sending ? (
        <div className="typing" aria-label="Agent is working">
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [mode, setMode] = useState("sample");
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [temporary, setTemporary] = useState(false);
  const [agentName, setAgentName] = useState("Assistant");
  const threadRef = useRef(null);
  const composerRef = useRef(null);
  const replyTimer = useRef(null);
  const lastQuery = useRef(null);

  const agent = chatAgents.find((item) => item.name === agentName) ?? chatAgents[0];
  const composerAgent = mode === "sample" ? chatAgents[1] : agent;

  const queueReply = (prompt) => {
    setSending(true);
    window.clearTimeout(replyTimer.current);
    replyTimer.current = window.setTimeout(() => {
      const reply = buildLiveReply(prompt);
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          ...reply,
        },
      ]);
      setSending(false);
    }, 900);
  };

  useEffect(() => {
    const query = searchParams.get("q");
    if (!query || lastQuery.current === query) return;
    lastQuery.current = query;
    setMode("live");
    setMessages([{ id: `u-${Date.now()}`, role: "user", text: query }]);
    setDraft("");
    queueReply(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (mode !== "live") return;
    const node = threadRef.current;
    if (!node) return;
    requestAnimationFrame(() => {
      node.scrollTop = node.scrollHeight;
    });
  }, [messages, sending, mode]);

  useEffect(() => () => window.clearTimeout(replyTimer.current), []);

  const newChat = () => {
    window.clearTimeout(replyTimer.current);
    setMode("live");
    setMessages([]);
    setDraft("");
    setSending(false);
    lastQuery.current = null;
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const send = () => {
    const text = draft.trim();
    if (!text || sending) return;
    setMode("live");
    setMessages((current) => [
      ...current,
      { id: `u-${Date.now()}`, role: "user", text },
    ]);
    setDraft("");
    queueReply(text);
  };

  const toggleTemporary = () => {
    setTemporary((value) => !value);
    toast(
      temporary
        ? "Temporary chat off — new messages will be kept."
        : "Temporary chat on — this conversation won't be saved.",
    );
  };

  const selectAgent = (nextAgent) => {
    setAgentName(nextAgent.name);
    toast(`${nextAgent.name} is now the active agent.`);
  };

  return (
    <Page
      icon={MessageCircle}
      title="Chat"
      subtitle="Project-wide conversations with your agents."
      flush
    >
      <div className="chat-layout">
        <aside className="chat-side">
          <div className="chat-side-head">
            <span>Chat</span>
            <button className="icon-btn icon-btn--sm" type="button" aria-label="Collapse chat list">
              <PanelLeft />
            </button>
          </div>

          <button className="chat-side-action" onClick={newChat} type="button">
            <Plus size={13} />
            <span>New chat</span>
          </button>
          <button
            className={`chat-side-action ${temporary ? "is-on" : ""}`}
            onClick={toggleTemporary}
            type="button"
          >
            <Copy size={13} />
            <span>Temporary chat</span>
            {temporary ? <span className="chat-temp-dot" /> : null}
          </button>

          <div className="chat-recent">
            <button className="chat-recent-head" type="button">
              <span>Recent chats</span>
              <ChevronUp size={12} />
            </button>
            {mode === "live" && messages.length ? (
              <button className="chat-recent-item active" type="button">
                <MessageCircle size={12} />
                <span className="truncate">
                  {messages.find((message) => message.role === "user")?.text ??
                    "Current chat"}
                </span>
              </button>
            ) : (
              <p className="chat-empty-note">No conversations yet.</p>
            )}
          </div>

          <div className="chat-agent-picker">
            <div className="chat-agent-label">Agents</div>
            <Dropdown
              align="left"
              direction="up"
              trigger={(props) => (
                <button className="agent-select" type="button" {...props}>
                  <Avatar
                    name={agent.name}
                    palette={agent.palette}
                    size={16}
                    icon={agent.name === "Assistant" ? Sparkles : undefined}
                  />
                  <span>{agent.name}</span>
                  <ChevronsUpDown size={12} />
                </button>
              )}
              items={[
                { type: "label", label: "Choose an agent" },
                ...chatAgents.map((item) => ({
                  label: item.name,
                  icon: undefined,
                  onClick: () => selectAgent(item),
                })),
              ]}
            />
          </div>
        </aside>

        <section className="chat-main">
          <div className="chat-thread" ref={threadRef}>
            <div className="chat-thread-inner">
              {mode === "sample" ? (
                <SampleThread />
              ) : (
                <LiveThread messages={messages} sending={sending} agent={agent} />
              )}
            </div>
          </div>

          <div className="chat-composer-wrap">
            <div className="chat-composer">
              {mode === "sample" ? (
                <div className="chat-readonly">This conversation is read-only</div>
              ) : (
                <textarea
                  aria-label="Message agent"
                  className="chat-input"
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  placeholder={`Message ${composerAgent.name}...`}
                  ref={composerRef}
                  rows={1}
                  value={draft}
                />
              )}
              <div className="chat-composer-bar">
                <span className="composer-agent">
                  <Avatar
                    name={composerAgent.name}
                    palette={composerAgent.palette}
                    size={16}
                    icon={composerAgent.name === "Assistant" ? Sparkles : undefined}
                  />
                  <span>{composerAgent.name}</span>
                </span>
                <div className="composer-spacer" />
                <button className="model-btn" type="button">
                  <Sparkles size={11} />
                  GPT-6 Luna
                  <ChevronDown size={11} />
                </button>
                <button className="auto-btn" type="button">
                  Auto
                </button>
                <button className="icon-btn icon-btn--sm" type="button" aria-label="Voice input">
                  <Mic />
                </button>
                <button
                  aria-label="Send message"
                  className="send-btn"
                  disabled={mode === "sample" || !draft.trim() || sending}
                  onClick={send}
                  type="button"
                >
                  <ArrowUp size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Page>
  );
}
