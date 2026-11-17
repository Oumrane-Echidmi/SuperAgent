import { Link } from "react-router-dom";
import { Grid2X2, ArrowUpRight, Plus } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import { mad } from "../lib/api";

function today(zone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
export default function LiveHomePage() {
  const { tenant, session } = useWorkspace(),
    root = `/tenants/${tenant.id}`;
  const profile = useResource(root + "/profile"),
    date = today(profile.data?.timezone ?? "Africa/Casablanca");
  const outcomes = useResource(
      `${root}/dashboard/outcomes?from=${date}&to=${date}`,
    ),
    values = outcomes.data?.totals;
  const metrics = values
    ? [
        ["Pending orders", values.pending],
        ["Confirmed", values.confirmed],
        ["Declined", values.declined],
        [
          "Confirmation rate",
          values.confirmationRate === null
            ? "—"
            : `${Math.round(values.confirmationRate * 100)}%`,
        ],
        ["Confirmed order value", mad(values.confirmedOrderValueMinor)],
        ["Waiting for sheet sync", values.sheetSyncWaiting],
      ]
    : [];
  return (
    <Page
      icon={Grid2X2}
      title="Home"
      actions={
        <button className="live-secondary" onClick={outcomes.reload}>
          Refresh
        </button>
      }
    >
      <div className="live-workspace">
        <header className="live-hero">
          <p className="live-eyebrow">{tenant.name}</p>
          <h1>Welcome, {session.user.email.split("@")[0]}.</h1>
          <p className="live-muted">Your shop’s activity, in one place.</p>
          <Link className="live-primary" to="/orders/new">
            <Plus size={15} />
            Record an order
          </Link>
        </header>
        <div className="live-section-head">
          <h2>Today at a glance</h2>
          <span>
            {date} · {outcomes.data?.timezone ?? profile.data?.timezone}
          </span>
        </div>
        <ResourceState resource={outcomes} />
        <div className="live-metrics">
          {metrics.map(([label, value]) => (
            <section className="live-card" key={label}>
              <p className="live-muted">{label}</p>
              <strong className="live-metric">{value}</strong>
            </section>
          ))}
        </div>
        <p className="live-muted live-small">
          Current outcomes for orders started today. Confirmed value does not
          mean cash collected.
        </p>
        <div className="live-quick-links">
          <Link className="live-card" to="/board">
            <h2>
              Your order board
              <ArrowUpRight size={17} />
            </h2>
            <p className="live-muted">
              Review details and record customer decisions.
            </p>
          </Link>
          <Link className="live-card" to="/settings">
            <h2>
              Business profile
              <ArrowUpRight size={17} />
            </h2>
            <p className="live-muted">
              Set your shop language, timezone and business description.
            </p>
          </Link>
        </div>
      </div>
    </Page>
  );
}
