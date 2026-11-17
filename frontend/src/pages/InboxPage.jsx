import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Archive,
  Check,
  ChevronDown,
  ChevronUp,
  Flag,
  Inbox,
  Mail,
  MoreHorizontal,
  Search,
  Send,
  SlidersHorizontal,
  Ticket,
  X,
} from "lucide-react";
import Page from "../components/Page";
import Avatar from "../components/Avatar";
import Dropdown from "../components/Dropdown";
import Tabs from "../components/Tabs";
import { useToast } from "../context/ToastContext";
import { filterTabs, initialEmails } from "../data/inbox";

const GROUP_ORDER = ["Today", "Yesterday", "This week"];

function PropsSection({ title, open, onToggle, children }) {
  return (
    <section className="props-section">
      <button className="props-section-head" onClick={onToggle} type="button">
        <span>{title}</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open ? <div className="props-section-body">{children}</div> : null}
    </section>
  );
}

function PropsRow({ label, children }) {
  return (
    <div className="props-row">
      <span className="props-label">{label}</span>
      <span className="props-value">{children}</span>
    </div>
  );
}

export default function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [emails, setEmails] = useState(initialEmails);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState({});
  const [replies, setReplies] = useState({});
  const [ticketed, setTicketed] = useState(() => new Set());
  const [openEarlier, setOpenEarlier] = useState({});
  const [sections, setSections] = useState({ properties: true, details: true });

  const selectedId = searchParams.get("mail") ?? "m-tom";
  const selected =
    emails.find((email) => email.id === selectedId) ??
    emails.find((email) => email.id === "m-tom");

  const unread = emails.filter((email) => email.unread).length;

  useEffect(() => {
    if (!selected) return;
    setEmails((current) =>
      current.map((email) =>
        email.id === selected.id && email.unread
          ? { ...email, unread: false }
          : email,
      ),
    );
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setOpenEarlier({});
  }, [selected?.id]);

  const visible = useMemo(() => {
    let list = emails;
    if (filter === "flagged") list = list.filter((email) => email.flagged);
    if (filter === "archived" || filter === "snoozed") list = [];
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      list = list.filter(
        (email) =>
          email.name.toLowerCase().includes(needle) ||
          email.subject.toLowerCase().includes(needle) ||
          email.preview.toLowerCase().includes(needle),
      );
    }
    return list;
  }, [emails, filter, query]);

  const groups = GROUP_ORDER.map((name) => ({
    name,
    items: visible.filter((email) => email.group === name),
  })).filter((group) => group.items.length);

  const selectMail = (email) => {
    setSearchParams({ mail: email.id }, { replace: true });
  };

  const draft = drafts[selected.id] ?? selected.draft;
  const replyState = replies[selected.id] ?? "draft";
  const isTicketed = ticketed.has(selected.id);

  const sendReply = () => {
    setReplies((current) => ({ ...current, [selected.id]: "sent" }));
    toast(`Reply sent to ${selected.name}.`);
  };

  const rejectReply = () => {
    setReplies((current) => ({ ...current, [selected.id]: "rejected" }));
    toast("Draft rejected. Nothing was sent.");
  };

  const restartReply = () => {
    setReplies((current) => ({ ...current, [selected.id]: "draft" }));
    setDrafts((current) => ({ ...current, [selected.id]: selected.draft }));
  };

  const createTicket = () => {
    setTicketed((current) => {
      const next = new Set(current);
      if (next.has(selected.id)) next.delete(selected.id);
      else next.add(selected.id);
      return next;
    });
    toast(isTicketed ? "Ticket removed." : "Ticket created for the whole team.");
  };

  const markAllRead = () => {
    setEmails((current) => current.map((email) => ({ ...email, unread: false })));
    toast("Inbox marked as read.");
  };

  return (
    <Page
      icon={Inbox}
      title="Inbox"
      count={unread}
      flush
      actions={
        <>
          <button className="gmail-pill" type="button">
            <Mail size={12} />
            <span>Gmail</span>
            <span className="gmail-dot" />
            <span>1</span>
          </button>
          <Dropdown
            trigger={(props) => (
              <button
                aria-label="Inbox actions"
                className="icon-btn"
                type="button"
                {...props}
              >
                <MoreHorizontal />
              </button>
            )}
            items={[
              { label: "Mark all as read", icon: Check, onClick: markAllRead },
              { label: "Archive all", icon: Archive, onClick: () => toast("All messages archived.") },
              { label: "Snooze all", icon: SlidersHorizontal, onClick: () => toast("All messages snoozed until tomorrow.") },
              { type: "separator" },
              { label: "Inbox settings", onClick: () => toast("Inbox settings are coming soon.") },
            ]}
          />
        </>
      }
    >
      <div className="inbox-layout">
        <section className="mail-list">
          <div className="mail-list-top">
            <Tabs
              className="pill-tabs mail-tabs"
              items={filterTabs}
              onChange={setFilter}
              value={filter}
            />
            <div className="mail-search-row">
              <div className="search-field">
                <Search />
                <input
                  aria-label="Search inbox"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search, or from: subject:is:unread"
                  value={query}
                />
              </div>
              <button className="icon-btn" type="button" aria-label="Filter inbox">
                <SlidersHorizontal />
              </button>
            </div>
          </div>

          <div className="mail-scroll">
            {groups.length ? (
              groups.map((group) => (
                <div className="mail-group" key={group.name}>
                  <div className="mail-group-label">{group.name}</div>
                  {group.items.map((email) => {
                    const active = email.id === selected.id;
                    return (
                      <button
                        className={`mail-item ${active ? "active" : ""}`}
                        key={email.id}
                        onClick={() => selectMail(email)}
                        type="button"
                      >
                        <Avatar
                          name={email.name}
                          size={28}
                          palette={email.agent ? ["#fde68a", "#f59e0b", "#c2410c"] : undefined}
                        />
                        <span className="mail-copy">
                          <span className="mail-item-top">
                            <span className="mail-name">{email.name}</span>
                            <span className="mail-time">{email.time}</span>
                            {email.flagged ? (
                              <span className="mail-flag">
                                <Flag size={9} fill="currentColor" />
                              </span>
                            ) : null}
                            {email.unread ? <span className="mail-dot" /> : null}
                          </span>
                          <span className="mail-subject">{email.subject}</span>
                          <span className="mail-preview">{email.preview}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            ) : (
              <div className="empty-state mail-empty">
                <Archive />
                <strong>
                  {filter === "archived"
                    ? "Nothing archived"
                    : filter === "snoozed"
                      ? "Nothing snoozed"
                      : "No messages match"}
                </strong>
                <p>
                  {filter === "archived" || filter === "snoozed"
                    ? "Messages you archive or snooze will wait here."
                    : "Try a different search or switch back to All."}
                </p>
                <button
                  className="btn btn--subtle btn--sm"
                  onClick={() => {
                    setFilter("all");
                    setQuery("");
                  }}
                  type="button"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="mail-detail">
          <div className="mail-detail-scroll">
            <button
              className="earlier-head"
              onClick={() =>
                setOpenEarlier((current) => ({
                  ...current,
                  __all: !current.__all,
                }))
              }
              type="button"
            >
              <span>Earlier in this conversation</span>
              <ChevronDown size={12} />
            </button>

            <div className="earlier-list">
              {selected.thread.map((entry, index) => {
                const key = `${selected.id}-${index}`;
                const isOpen = openEarlier.__all || openEarlier[key];
                return (
                  <div className="earlier-item" key={key}>
                    <button
                      className="earlier-row"
                      onClick={() =>
                        setOpenEarlier((current) => ({
                          ...current,
                          [key]: !current[key],
                        }))
                      }
                      type="button"
                    >
                      <ChevronDown
                        className={isOpen ? "rotate-180" : ""}
                        size={11}
                      />
                      <span>
                        {entry.time}, {entry.who} wrote:
                      </span>
                    </button>
                    {isOpen ? <p className="earlier-text">{entry.text}</p> : null}
                  </div>
                );
              })}
            </div>

            <div className="mail-sender">
              <Avatar name={selected.name} size={32} />
              <div className="mail-sender-copy">
                <strong>{selected.name}</strong>
                <span>{selected.email}</span>
              </div>
              <div className="mail-sender-meta">
                <span className="mail-detail-time">{selected.time}</span>
                <span className="badge">Read</span>
              </div>
            </div>

            <div className="reply-card">
              <div className="reply-top">
                <span className="reply-to">
                  to {selected.to}
                  {replyState === "sent" ? (
                    <span className="badge badge--green">sent</span>
                  ) : (
                    <span className="reply-pending">pending</span>
                  )}
                </span>
                <span className="reply-subject">{selected.subject}</span>
                <button className="reply-link" type="button">
                  Edit subject
                </button>
              </div>
              <div className="reply-subrow">
                <button className="reply-link" type="button">
                  Add Co/Bcc
                </button>
              </div>

              <textarea
                aria-label="Reply draft"
                className="mail-body-input"
                onChange={(event) =>
                  setDrafts((current) => ({
                    ...current,
                    [selected.id]: event.target.value,
                  }))
                }
                readOnly={replyState === "sent"}
                value={draft}
              />

              {replyState === "rejected" ? (
                <div className="reply-rejected">
                  <span>Draft rejected — nothing was sent.</span>
                  <button className="reply-link" onClick={restartReply} type="button">
                    Write a new reply
                  </button>
                </div>
              ) : (
                <textarea
                  aria-label="Reason for rejecting"
                  className="reject-reason"
                  placeholder="Reason for rejecting (optional)"
                />
              )}

              <div className="reply-actions">
                {replyState === "sent" ? (
                  <>
                    <span className="reply-sent-note">
                      <Check size={12} /> Reply sent to {selected.name}
                    </span>
                    <button className="btn btn--subtle" onClick={restartReply} type="button">
                      Write another
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn--ghost"
                      onClick={() => toast("Draft saved.")}
                      type="button"
                    >
                      Save edits
                    </button>
                    <div className="reply-actions-right">
                      <button
                        className="btn btn--subtle"
                        onClick={rejectReply}
                        type="button"
                      >
                        <X size={12} />
                        Reject
                      </button>
                      <button className="btn btn--green" onClick={sendReply} type="button">
                        <Send size={12} />
                        Send reply
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="mail-props">
          <div className="mail-props-inner">
            <button
              className={`btn btn--outline btn--block create-ticket ${isTicketed ? "is-created" : ""}`}
              onClick={createTicket}
              type="button"
            >
              {isTicketed ? <Check size={13} /> : <Ticket size={13} />}
              {isTicketed ? "Ticket created" : "Create ticket"}
            </button>
            <p className="create-ticket-note">
              Creating a ticket makes this message visible to the whole team.
            </p>

            <PropsSection
              onToggle={() =>
                setSections((current) => ({
                  ...current,
                  properties: !current.properties,
                }))
              }
              open={sections.properties}
              title="Properties"
            >
              <PropsRow label="Status">
                <span className="props-status">{selected.status}</span>
              </PropsRow>
              <PropsRow label="Channel">
                <span className="props-channel">
                  <Mail size={11} /> {selected.channel}
                </span>
              </PropsRow>
              <PropsRow label="From">
                <span>
                  {selected.name}
                  <br />
                  <span className="props-muted">&lt;{selected.email}&gt;</span>
                </span>
              </PropsRow>
              <PropsRow label="To">
                <span className="props-muted">{selected.to}</span>
              </PropsRow>
              <PropsRow label="Connection">
                <span className="props-muted">{selected.connection}</span>
              </PropsRow>
            </PropsSection>

            <PropsSection
              onToggle={() =>
                setSections((current) => ({
                  ...current,
                  details: !current.details,
                }))
              }
              open={sections.details}
              title="Details"
            >
              <PropsRow label="Received">
                <span className="props-muted">{selected.received}</span>
              </PropsRow>
              <PropsRow label="Thread">
                <span className="props-muted">{selected.threadId}</span>
              </PropsRow>
            </PropsSection>
          </div>
        </aside>
      </div>
    </Page>
  );
}
