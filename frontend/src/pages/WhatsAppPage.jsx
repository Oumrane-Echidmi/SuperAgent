import { useState } from "react";
import { MessageCircle } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";

export default function WhatsAppPage() {
  const { tenant, api } = useWorkspace(),
    { toast } = useToast(),
    owner = tenant.role === "OWNER",
    base = `/tenants/${tenant.id}`,
    numbers = useResource(`${base}/whatsapp-numbers`),
    messages = useResource(`${base}/whatsapp-messages`),
    outbox = useResource(`${base}/whatsapp-outbox`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function register(event) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api(`${base}/whatsapp-numbers`, {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          phoneNumberId: String(data.get("phoneNumberId")).trim(),
          displayName: String(data.get("displayName")).trim(),
        },
      });
      form.reset();
      numbers.reload();
      toast("WhatsApp number registered.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const refresh = () => {
    messages.reload();
    outbox.reload();
  };
  return (
    <Page icon={MessageCircle} title="WhatsApp">
      <div className="live-workspace live-narrow">
        <header className="live-hero">
          <p className="live-eyebrow">WHATSAPP BUSINESS</p>
          <h1>Numbers, messages and replies</h1>
          <p className="live-muted">
            Register the WhatsApp Business phone number ID from your Meta
            dashboard, then publish a workflow to it on the Builder page.
            Customer messages and the replies SuperAgent sent appear below.
          </p>
        </header>
        <ResourceState resource={numbers} />
        {numbers.data && (
          <section className="live-card">
            <h2>Numbers</h2>
            {numbers.data.data.length === 0 && (
              <p className="live-muted">No number registered yet.</p>
            )}
            <ul>
              {numbers.data.data.map((n) => (
                <li key={n.id}>
                  {n.displayName} · ID {n.phoneNumberId}
                </li>
              ))}
            </ul>
            {owner && (
              <form className="live-form" onSubmit={register}>
                <label>
                  Display name
                  <input name="displayName" required maxLength={100} />
                </label>
                <label>
                  Phone number ID (digits from Meta)
                  <input name="phoneNumberId" required pattern="[0-9]{5,32}" />
                </label>
                {error && (
                  <p className="live-error" role="alert">
                    {error}
                  </p>
                )}
                <button className="live-primary" disabled={busy}>
                  Register number
                </button>
              </form>
            )}
          </section>
        )}
        <section className="live-card">
          <h2>Inbound messages</h2>
          <button className="live-secondary" onClick={refresh}>
            Refresh
          </button>
          {messages.data?.data.length === 0 && (
            <p className="live-muted">No messages received yet.</p>
          )}
          <ul>
            {messages.data?.data.map((m) => (
              <li key={m.id}>
                {new Date(m.receivedAt).toLocaleString()} · +{m.customerPhone}:{" "}
                {m.body ?? `(${m.type})`}
              </li>
            ))}
          </ul>
        </section>
        <section className="live-card">
          <h2>Replies sent by workflows</h2>
          <p className="live-muted">
            Queued replies are delivered when the server has WHATSAPP_ACCESS_TOKEN
            configured.
          </p>
          {outbox.data?.data.length === 0 && (
            <p className="live-muted">No replies yet.</p>
          )}
          <ul>
            {outbox.data?.data.map((m) => (
              <li key={m.id}>
                {m.status}
                {m.errorCode ? ` (${m.errorCode})` : ""} · to +{m.to}: {m.body}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}
