import { useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Columns3 } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import DeliveryPanel from "../components/DeliveryPanel";
import {
  useMounted,
  useResource,
  useWorkspace,
} from "../context/WorkspaceContext";
import { mad } from "../lib/api";

export default function OrderDetailsPage() {
  const { id } = useParams(),
    { tenant, api } = useWorkspace(),
    path = `/tenants/${tenant.id}/order-attempts/${encodeURIComponent(id)}`,
    attempt = useResource(path),
    plan = useRef(null),
    mounted = useMounted();
  const [evidence, setEvidence] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [outcome, setOutcome] = useState(null);
  const status = outcome?.status ?? attempt.data?.status,
    order = useResource(
      status === "CONFIRMED" ? `/tenants/${tenant.id}/orders/${id}` : null,
    );
  async function decide(decision) {
    if (!evidence.trim()) {
      setError("Record what the customer told you before saving a decision.");
      return;
    }
    plan.current ??= {
      id: crypto.randomUUID(),
      expectedRevision: attempt.data.revision,
      summaryHash: attempt.data.summaryHash,
      decision,
      evidence: evidence.trim(),
    };
    setBusy(true);
    setError("");
    try {
      const result = await api(path + "/decisions", {
        method: "POST",
        body: plan.current,
      });
      if (mounted.current) {
        setOutcome(result);
        plan.current = null;
        setEvidence("");
        attempt.reload();
        order.reload();
      }
    } catch (error) {
      if (mounted.current) {
        setError(error.message);
        if (error.status >= 400 && error.status < 500) {
          plan.current = null;
          attempt.reload();
        }
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const details = attempt.data?.details ?? {},
    summary = [
      ["Customer", details.recipient],
      ["Phone", details.phone],
      ["Item", details.item],
      ["Quantity", details.quantity],
      ["Address", details.address],
      ["Unit price", mad(details.unitAmountMinor)],
      ["Delivery fee", mad(details.deliveryAmountMinor)],
      ["Total", mad(attempt.data?.review.amountMinor)],
    ];
  return (
    <Page icon={Columns3} title="Order details">
      <div className="live-workspace live-narrow">
        <Link className="live-text-button" to="/board">
          ← Back to orders
        </Link>
        <ResourceState resource={attempt} />
        {attempt.data && (
          <>
            <header className="live-hero">
              <p className="live-eyebrow">{status}</p>
              <h1>{details.recipient ?? "Customer order"}</h1>
              <p className="live-muted">
                Review the saved details before recording the customer’s
                decision.
              </p>
            </header>
            <dl className="live-card live-summary">
              {summary.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value ?? "Not collected"}</dd>
                </div>
              ))}
            </dl>
            {status === "PENDING" && (
              <section className="live-card live-form">
                <h2>Record a customer decision</h2>
                <p className="live-muted">
                  This saves your evidence. It does not send the customer a
                  message.
                </p>
                {!attempt.data.review.ready && (
                  <p className="live-notice">
                    Some details or shop prices are missing. Confirm only after
                    the order is complete.
                  </p>
                )}
                <label>
                  Customer decision evidence
                  <textarea
                    rows={3}
                    value={evidence}
                    disabled={busy || Boolean(plan.current)}
                    onChange={(event) => setEvidence(event.target.value)}
                    maxLength={500}
                    placeholder="For example: customer confirmed this summary by phone."
                  />
                </label>
                <div className="live-actions">
                  {[
                    ["CONFIRM", "Confirm order"],
                    ["DECLINE", "Decline order"],
                    ["AMBIGUOUS", "Record unclear response"],
                  ].map(([decision, label]) => (
                    <button
                      key={decision}
                      className={
                        decision === "CONFIRM"
                          ? "live-primary"
                          : "live-secondary"
                      }
                      disabled={
                        busy ||
                        attempt.loading ||
                        (decision === "CONFIRM" &&
                          !attempt.data.review.ready) ||
                        (Boolean(plan.current) &&
                          plan.current.decision !== decision)
                      }
                      onClick={() => decide(decision)}
                    >
                      {plan.current?.decision === decision && error
                        ? "Retry this decision"
                        : label}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {error && (
              <p className="live-error" role="alert">
                {error}
              </p>
            )}
            {status === "CONFIRMED" && (
              <>
                <ResourceState resource={order} />
                {order.data &&
                  (tenant.role === "OWNER" ? (
                    <DeliveryPanel
                      order={order.data}
                      onRefresh={order.reload}
                    />
                  ) : (
                    <p className="live-muted">
                      Spreadsheet delivery:{" "}
                      {order.data.sheetSync?.delivery?.status ?? "not queued"}
                    </p>
                  ))}
              </>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
