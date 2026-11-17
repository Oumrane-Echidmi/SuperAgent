import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import {
  useMounted,
  useResource,
  useWorkspace,
} from "../context/WorkspaceContext";
import { moneyMinor } from "../lib/api";

export default function NewOrderPage() {
  const { tenant, api } = useWorkspace(),
    root = `/tenants/${tenant.id}`,
    profile = useResource(root + "/profile"),
    navigate = useNavigate(),
    plan = useRef(null),
    ids = useRef({
      id: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
    });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [locked, setLocked] = useState(false),
    mounted = useMounted();
  async function save(event) {
    event.preventDefault();
    if (busy || !profile.data) return;
    setError("");
    try {
      if (!plan.current) {
        const form = new FormData(event.currentTarget);
        plan.current = {
          ...ids.current,
          language: profile.data.language,
          details: {
            recipient: form.get("recipient").trim(),
            item: form.get("item").trim(),
            quantity: Number(form.get("quantity")),
            phone: form.get("phone").trim(),
            address: form.get("address").trim(),
            unitAmountMinor: moneyMinor(form.get("unitPrice")),
            deliveryAmountMinor: moneyMinor(form.get("deliveryPrice")),
          },
        };
      }
      setBusy(true);
      setLocked(true);
      const input = plan.current;
      await api(root + "/conversations", {
        method: "POST",
        body: {
          id: input.conversationId,
          customerReference: `Manual order ${input.id}`,
          language: input.language,
        },
      });
      if (!mounted.current) return;
      await api(root + "/order-attempts", {
        method: "POST",
        body: {
          id: input.id,
          conversationId: input.conversationId,
          details: input.details,
        },
      });
      if (mounted.current) navigate(`/orders/${input.id}`, { replace: true });
    } catch (error) {
      if (mounted.current) {
        setError(error.message);
        if (error.status === 422 || !plan.current) {
          plan.current = null;
          setLocked(false);
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <Page icon={Plus} title="Record order">
      <div className="live-workspace live-narrow">
        <Link className="live-text-button" to="/board">
          ← Back to orders
        </Link>
        <header className="live-hero">
          <h1>A new customer order.</h1>
          <p className="live-muted">
            Save the details, then review the summary before recording a
            decision.
          </p>
        </header>
        <ResourceState resource={profile} />
        <form className="live-form live-card" onSubmit={save}>
          <fieldset disabled={busy || locked || !profile.data}>
            <div className="live-form-grid">
              <label>
                Customer name
                <input
                  name="recipient"
                  required
                  maxLength={120}
                  autoComplete="name"
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  type="tel"
                  required
                  pattern="\+[1-9][0-9]{7,14}"
                  placeholder="+212612345678"
                  autoComplete="tel"
                />
              </label>
              <label>
                Item
                <input name="item" required maxLength={200} />
              </label>
              <label>
                Quantity
                <input
                  name="quantity"
                  type="number"
                  required
                  min={1}
                  max={1000}
                  step={1}
                  defaultValue={1}
                />
              </label>
              <label>
                Unit price (MAD)
                <input
                  name="unitPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="125.50"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                />
              </label>
              <label>
                Delivery fee (MAD)
                <input
                  name="deliveryPrice"
                  type="text"
                  inputMode="decimal"
                  defaultValue="0.00"
                  required
                  pattern="[0-9]+(\.[0-9]{1,2})?"
                />
              </label>
            </div>
            <label>
              Delivery address
              <textarea
                name="address"
                required
                maxLength={500}
                rows={3}
                autoComplete="street-address"
              />
            </label>
          </fieldset>
          {error && (
            <p className="live-error" role="alert">
              {error}
            </p>
          )}
          {locked && error && (
            <p className="live-muted">
              The same order reference will be reused when you retry.
            </p>
          )}
          <button className="live-primary" disabled={busy || !profile.data}>
            {busy
              ? "Saving order…"
              : locked
                ? "Retry saving this order"
                : "Save order details"}
          </button>
        </form>
      </div>
    </Page>
  );
}
