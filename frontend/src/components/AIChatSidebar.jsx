import { Link, NavLink } from "react-router-dom";
import {
  ArrowLeft,
  LogOut,
  MessageCircle,
  Plus,
  Settings,
  X,
} from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";

export default function AIChatSidebar({
  sessions,
  activeId,
  currentTitle,
  busy,
  open,
  onClose,
  onChoose,
  onSignOut,
}) {
  const { tenant, session, writes, selectTenant } = useWorkspace();
  const recent = [...(sessions.data?.data ?? [])].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  return (
    <>
      {open && (
        <button
          className="ai-rail-backdrop"
          aria-label="Close chat navigation"
          onClick={onClose}
        />
      )}
      <aside
        className={`ai-rail ${open ? "is-open" : ""}`}
        aria-label="Chat navigation"
      >
        <div className="ai-rail-brand">
          <Link to="/" aria-label="SuperAgent home">
            <img
              src="/brand/superagent-logo.png"
              alt="SuperAgent"
              className="ai-brand-logo"
            />
          </Link>
          <button
            className="ai-mobile-toggle"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <button
          type="button"
          className="ai-new-chat"
          disabled={busy}
          onClick={() => onChoose("")}
        >
          <Plus size={17} />
          New chat
        </button>
        <nav className="ai-rail-nav" aria-label="Workspace">
          <NavLink to="/chat">
            <MessageCircle size={17} />
            Chat
          </NavLink>
          <Link to="/">
            <ArrowLeft size={17} />
            Workspace
          </Link>
          <Link to="/settings">
            <Settings size={17} />
            Settings
          </Link>
        </nav>
        <div className="ai-history-heading">
          Recent conversations <span>{recent.length || ""}</span>
        </div>
        <div className="ai-history">
          {!recent.length && (
            <p className="ai-history-empty">
              Your conversations will appear here.
            </p>
          )}
          {recent.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`ai-history-item ${activeId === item.id ? "is-active" : ""}`}
              disabled={busy}
              onClick={() => onChoose(item.id)}
              aria-current={activeId === item.id ? "true" : undefined}
            >
              <MessageCircle size={15} />
              <span>
                {activeId === item.id && currentTitle
                  ? currentTitle
                  : `${item.language === "fr" ? "French" : "Darija"} assistant`}
                <small>
                  {new Date(item.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </small>
              </span>
            </button>
          ))}
        </div>
        <footer className="ai-rail-footer">
          {session.tenants.length > 1 && (
            <label className="ai-workspace-switch">
              Workspace
              <select
                value={tenant.id}
                disabled={Boolean(writes)}
                onChange={(event) => selectTenant(event.target.value)}
              >
                {session.tenants.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="ai-profile">
            <span className="ai-profile-avatar">{tenant.name.slice(0, 1)}</span>
            <span>
              <strong>{tenant.name}</strong>
              <small>{session.user.email}</small>
            </span>
            <button
              aria-label="Sign out"
              disabled={Boolean(writes)}
              onClick={onSignOut}
            >
              <LogOut size={16} />
            </button>
          </div>
        </footer>
      </aside>
    </>
  );
}
