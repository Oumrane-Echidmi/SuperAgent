import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Grid2X2,
  MessageCircle,
  Inbox,
  Columns3,
  Users,
  FileText,
  BrainCircuit,
  Workflow,
  Palette,
  ChevronsUpDown,
  UserRound,
  Settings,
  LogOut,
  Keyboard,
  CircleHelp,
  Link2,
} from "lucide-react";
import Avatar from "./Avatar";
import Dropdown from "./Dropdown";
import { useToast } from "../context/ToastContext";
import { useWorkspace } from "../context/WorkspaceContext";

const PRIMARY = [
  { to: "/", label: "Home", icon: Grid2X2, end: true },
  { to: "/chat", label: "Chat", icon: MessageCircle, badge: "Preview" },
  { to: "/inbox", label: "Inbox", icon: Inbox, badge: "Preview" },
  { to: "/board", label: "Orders", icon: Columns3 },
];

const WORKSPACE = [
  { to: "/settings", label: "Business profile", icon: Settings },
  { to: "/connections", label: "Connections", icon: Link2 },
  { to: "/builder", label: "Builder", icon: Workflow },
  { to: "/agents", label: "Agents", icon: Users, badge: "Preview" },
  { to: "/docs", label: "Docs", icon: FileText, badge: "Preview" },
  {
    to: "/brain",
    label: "Company Brain",
    icon: BrainCircuit,
    badge: "Preview",
  },
  { to: "/workflows", label: "Workflows", icon: Workflow, badge: "Preview" },
];

const LABS = [
  { to: "/canvas", label: "Canvas", icon: Palette, badge: "Preview" },
];

function NavItem({ item }) {
  const Icon = item.icon;
  return (
    <NavLink
      className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
      end={item.end}
      to={item.to}
      title={item.label}
    >
      <Icon strokeWidth={1.8} />
      <span>{item.label}</span>
      {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
      {item.tag ? <span className="nav-enterprise">{item.tag}</span> : null}
    </NavLink>
  );
}

export default function Sidebar() {
  const { toast } = useToast();
  const { session, tenant, selectTenant, signOut, writes } = useWorkspace(),
    navigate = useNavigate();
  const leave = async () => {
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (error) {
      toast(error.message, { error: true });
    }
  };

  return (
    <aside className="sidebar">
      <Link className="brand" to="/" title={tenant.name}>
        <span className="brand-tile">
          <img src="/logo-mark-light.png" alt="" width={18} height={18} />
        </span>
        <span className="brand-name">{tenant.name}</span>
      </Link>
      <button
        className="live-mobile-signout"
        disabled={Boolean(writes)}
        onClick={leave}
      >
        Sign out
      </button>
      {session.tenants.length > 1 && (
        <label className="live-business-select">
          <span>Business workspace</span>
          <select
            aria-label="Business workspace"
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

      <nav className="side-nav" aria-label="Workspace">
        <div className="nav-group">
          {PRIMARY.map((item) => (
            <NavItem item={item} key={item.to} />
          ))}
        </div>
        <div className="nav-group">
          {WORKSPACE.map((item) => (
            <NavItem item={item} key={item.to} />
          ))}
        </div>
        <div className="nav-group">
          <div className="nav-group-label">Labs</div>
          {LABS.map((item) => (
            <NavItem item={item} key={item.to} />
          ))}
        </div>
      </nav>

      <div className="sidebar-footer">
        <Dropdown
          align="left"
          direction="up"
          trigger={(props) => (
            <button className="user-button" type="button" {...props}>
              <Avatar
                name={session.user.email}
                size={22}
                palette={["#67e8f9", "#22d3ee", "#0e7490"]}
              />
              <span className="user-name">
                {session.user.email.split("@")[0]}
              </span>
              <ChevronsUpDown className="user-chevrons" size={14} />
            </button>
          )}
          items={[
            {
              label: "Profile",
              icon: UserRound,
              onClick: () => navigate("/settings"),
            },
            {
              label: "Preferences",
              icon: Settings,
              onClick: () => navigate("/settings"),
            },
            {
              label: "Keyboard shortcuts",
              icon: Keyboard,
              onClick: () => toast("Press ⌘K to jump anywhere."),
            },
            {
              label: "Help & support",
              icon: CircleHelp,
              onClick: () => toast("Support center is coming soon."),
            },
            { type: "separator" },
            { label: "Sign out", icon: LogOut, danger: true, onClick: leave },
          ]}
        />
      </div>
    </aside>
  );
}
