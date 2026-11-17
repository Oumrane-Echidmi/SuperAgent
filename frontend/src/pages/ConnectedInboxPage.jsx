import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Inbox } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import {
  useMounted,
  useResource,
  useWorkspace,
} from "../context/WorkspaceContext";
import { Pagination } from "./WorkspaceRecordsPage";

export function ConversationPage() {
  const { id } = useParams(),
    { tenant } = useWorkspace(),
    [page, setPage] = useState(1);
  const conversation = useResource(`/tenants/${tenant.id}/conversations/${id}`);
  const orders = useResource(
    `/tenants/${tenant.id}/order-attempts?conversationId=${encodeURIComponent(id)}&page=${page}&pageSize=25`,
  );
  return (
    <Page
      bodyClassName="workspace-content"
      title="Conversation"
      icon={Inbox}
      actions={
        <Link className="live-secondary" to="/inbox">
          Back to inbox
        </Link>
      }
    >
      <ResourceState resource={conversation} />
      {conversation.data && (
        <div className="record-intro">
          <h2>{conversation.data.customerReference}</h2>
          <p className="live-muted">
            {conversation.data.channel} · {conversation.data.language} ·{" "}
            {conversation.data.ownership}
          </p>
        </div>
      )}
      <h2>Order history</h2>
      <ResourceState resource={orders} />
      <div className="record-grid">
        {orders.data?.data.map((order) => (
          <Link
            className="record-card"
            key={order.id}
            to={`/orders/${order.id}`}
          >
            <strong>{order.details.item || "Order in progress"}</strong>
            <span>{order.status}</span>
            <small>Revision {order.revision}</small>
          </Link>
        ))}
      </div>
      {orders.data && !orders.data.data.length && (
        <p className="record-empty">
          No orders recorded for this conversation.
        </p>
      )}
      <Pagination
        pagination={orders.data?.pagination}
        page={page}
        onPage={setPage}
      />
    </Page>
  );
}

export default function ConnectedInboxPage() {
  const { tenant, api } = useWorkspace(),
    mounted = useMounted(),
    pending = useRef(null);
  const [page, setPage] = useState(1),
    [reference, setReference] = useState(""),
    [language, setLanguage] = useState("darija"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [uncertain, setUncertain] = useState(false);
  const resource = useResource(
    `/tenants/${tenant.id}/conversations?page=${page}&pageSize=25`,
  );
  async function create(e) {
    e.preventDefault();
    if (busy) return;
    if (!pending.current)
      pending.current = {
        id: crypto.randomUUID(),
        customerReference: reference,
        language,
      };
    setBusy(true);
    setError("");
    try {
      await api(`/tenants/${tenant.id}/conversations`, {
        method: "POST",
        body: pending.current,
      });
      if (mounted.current) {
        pending.current = null;
        setUncertain(false);
        setReference("");
        setPage(1);
        resource.reload();
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
      title="Inbox"
      icon={Inbox}
      count={resource.data?.pagination.totalItems}
      actions={
        <Link className="live-primary" to="/orders/new">
          New order
        </Link>
      }
    >
      <p className="live-muted record-intro">
        Actual customer conversations from your business. WhatsApp message
        delivery will be available after its integration is connected.
      </p>
      <form className="live-form inbox-create" onSubmit={create}>
        <label>
          Customer reference
          <input
            required
            maxLength={200}
            value={reference}
            disabled={busy || uncertain}
            onChange={(e) => setReference(e.target.value)}
          />
        </label>
        <label>
          Language
          <select
            value={language}
            disabled={busy || uncertain}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="darija">Darija</option>
            <option value="fr">French</option>
          </select>
        </label>
        <button className="live-secondary" disabled={busy}>
          {uncertain ? "Retry conversation" : "Add conversation"}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
      <ResourceState resource={resource} />
      <div className="record-grid">
        {resource.data?.data.map((item) => (
          <article key={item.id} className="record-card">
            <strong>{item.customerReference}</strong>
            <span>
              {item.channel} · {item.language} · {item.ownership}
            </span>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
            <Link to={`/inbox/${item.id}`}>Open conversation</Link>
          </article>
        ))}
      </div>
      {resource.data && !resource.data.data.length && (
        <p className="record-empty">
          No customer conversations yet. Add one here or create your first
          order.
        </p>
      )}
      <Pagination
        pagination={resource.data?.pagination}
        page={page}
        onPage={setPage}
      />
    </Page>
  );
}
