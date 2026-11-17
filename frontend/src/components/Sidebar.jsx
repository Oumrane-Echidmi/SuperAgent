import { Link, NavLink } from "react-router-dom";
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
  FolderClosed,
  ChevronsUpDown,
  UserRound,
  Settings,
  LogOut,
  Keyboard,
  CircleHelp,
} from "lucide-react";
import Avatar from "./Avatar";
import Dropdown from "./Dropdown";
import { useToast } from "../context/ToastContext";

const PRIMARY = [
  { to: "/", label: "Home", icon: Grid2X2, end: true },
  { to: "/chat", label: "Chat", icon: MessageCircle },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/board", label: "Board", icon: Columns3 },
];

const WORKSPACE = [
  { to: "/agents", label: "Agents", icon: Users },
  { to: "/docs", label: "Docs", icon: FileText },
  { to: "/brain", label: "Company Brain", icon: BrainCircuit, tag: "Enterprise" },
  { to: "/workflows", label: "Workflows", icon: Workflow, badge: "Beta" },
];

const LABS = [{ to: "/canvas", label: "Canvas", icon: Palette, badge: "Beta" }];

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

  return (
    <aside className="sidebar">
      <Link className="brand" to="/" title="Winterfruit workspace">
        <span className="brand-tile">
          <FolderClosed size={15} strokeWidth={1.8} />
        </span>
        <span className="brand-name">Winterfruit</span>
      </Link>

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
              <Avatar name="Nim" size={22} palette={["#67e8f9", "#22d3ee", "#0e7490"]} />
              <span className="user-name">Nim</span>
              <ChevronsUpDown className="user-chevrons" size={14} />
            </button>
          )}
          items={[
            { label: "Profile", icon: UserRound, onClick: () => toast("Profile settings are coming soon.") },
            { label: "Preferences", icon: Settings, onClick: () => toast("Preferences are coming soon.") },
            { label: "Keyboard shortcuts", icon: Keyboard, onClick: () => toast("Press ⌘K to jump anywhere.") },
            { label: "Help & support", icon: CircleHelp, onClick: () => toast("Support center is coming soon.") },
            { type: "separator" },
            { label: "Sign out", icon: LogOut, danger: true, onClick: () => toast("Signed out of the demo workspace.") },
          ]}
        />
      </div>
    </aside>
  );
}
