import { useEffect, useRef, useState } from "react";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import ResourceState from "./ResourceState";

export default function DeliveryPanel({ order, onRefresh }) {
  const { tenant, api } = useWorkspace(),
    root = `/tenants/${tenant.id}`,
    path = root + `/orders/${order.id}/sheet-delivery`,
    delivery = order.sheetSync?.delivery;
  const destinations = useResource(root + "/sheet-destinations?limit=100"),
    jobs = useResource(path + "/jobs?limit=10"),
    jobId = useRef(null);
  const preview = useResource(delivery ? path : null),
    selected = useResource(
      delivery ? root + "/sheet-destinations/" + delivery.destinationId : null,
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = jobs.data?.data.some((job) =>
    ["QUEUED", "RUNNING"].includes(job.status),
  );
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => {
      jobs.reload();
      onRefresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [active, jobs.reload, onRefresh]);
  async function action(kind, event) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (kind === "bind") {
        const form = new FormData(event.currentTarget);
        await api(path, {
          method: "POST",
          body: { destinationId: form.get("destinationId") },
        });
      }
      if (kind === "queue") {
        jobId.current ??= crypto.randomUUID();
        await api(path + "/jobs", {
          method: "POST",
          body: { id: jobId.current },
        });
        jobId.current = null;
      }
      if (kind === "reconcile")
        await api(path + "/reconcile", { method: "POST", body: {} });
      onRefresh();
      jobs.reload();
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="live-card live-delivery">
      <div className="live-section-head">
        <h2>Spreadsheet delivery</h2>
        <button
          className="live-text-button"
          onClick={() => {
            onRefresh();
            jobs.reload();
          }}
        >
          Refresh delivery status
        </button>
      </div>
      <p className="live-muted">
        {delivery
          ? `Delivery status: ${delivery.status.replaceAll("_", " ").toLowerCase()}`
          : "No spreadsheet destination selected."}
      </p>
      {delivery && (
        <>
          <ResourceState resource={selected} />
          {selected.data && (
            <p className="live-destination">
              <strong>{selected.data.spreadsheetTitle}</strong> ·{" "}
              {selected.data.tabTitle}
            </p>
          )}
          <ResourceState resource={preview} />
          {preview.data && (
            <details className="live-row-preview" open>
              <summary>Review the spreadsheet row</summary>
              <dl>
                {preview.data.headers.map((header, index) => (
                  <div key={header}>
                    <dt>
                      {{
                        operationKey: "Tracking reference",
                        orderId: "Order reference",
                        item: "Item",
                        quantity: "Quantity",
                        recipient: "Customer",
                        phone: "Phone",
                        address: "Address",
                        unitAmountMinor: "Unit price (centimes)",
                        deliveryAmountMinor: "Delivery fee (centimes)",
                        amountMad: "Total (MAD)",
                        currency: "Currency",
                        status: "Order status",
                      }[header] ?? header}
                    </dt>
                    <dd>{preview.data.rowPreview[index]}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
        </>
      )}
      {!delivery && destinations.data?.data.length > 0 && (
        <form className="live-form" onSubmit={(event) => action("bind", event)}>
          <label>
            Destination
            <select name="destinationId" required>
              {destinations.data.data.map((item) => (
                <option
                  key={item.id}
                  value={item.id}
                  disabled={item.status !== "ACCESS_CHECKED"}
                >
                  {item.spreadsheetTitle} · {item.tabTitle}
                </option>
              ))}
            </select>
          </label>
          <button className="live-secondary" disabled={busy}>
            Use this destination
          </button>
        </form>
      )}
      {!delivery && destinations.data?.data.length === 0 && (
        <p className="live-muted live-small">
          A connected Google spreadsheet is required. Account and file setup
          will be available in a later update.
        </p>
      )}
      {destinations.error && (
        <p className="live-error" role="alert">
          {destinations.error.message}
        </p>
      )}
      {delivery && ["READY", "BLOCKED"].includes(delivery.status) && (
        <button
          className="live-primary"
          disabled={
            busy ||
            active ||
            !preview.data ||
            !selected.data ||
            selected.data.status !== "ACCESS_CHECKED"
          }
          onClick={() => action("queue")}
        >
          {busy
            ? "Please wait…"
            : active
              ? "Delivery queued"
              : "Queue spreadsheet delivery"}
        </button>
      )}
      {delivery?.status === "UNKNOWN" && (
        <>
          <p className="live-muted live-small">
            The row may already exist. Checking its status will not send it
            again.
          </p>
          <button
            className="live-secondary"
            disabled={busy}
            onClick={() => action("reconcile")}
          >
            Check spreadsheet for this order
          </button>
        </>
      )}
      {jobs.data?.data.length > 0 && (
        <ul className="live-job-list">
          {jobs.data.data.map((job) => (
            <li key={job.id}>
              <span>{job.status.replaceAll("_", " ").toLowerCase()}</span>
              <time>{new Date(job.createdAt).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
      {jobs.error && (
        <p className="live-error" role="alert">
          {jobs.error.message}
        </p>
      )}
      {error && (
        <p role="alert" className="live-error">
          {error}
        </p>
      )}
    </section>
  );
}
