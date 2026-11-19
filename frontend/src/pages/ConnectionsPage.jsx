import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Link2 } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";
import {
  clearGoogle,
  pendingGoogle,
  rememberConnection,
  rememberCallback,
  spreadsheetIdFrom,
} from "../lib/google";

// Google redirects here with ?code&state. Park them in session storage so the
// in-memory session can sign in again, then remove them from the address bar.
export function CallbackPage() {
  const navigate = useNavigate();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code"),
      state = params.get("state");
    if (code && state) rememberCallback(code, state);
    else clearGoogle();
    navigate("/connections", { replace: true });
  }, [navigate]);
  return <p className="live-state">Finishing Google connection…</p>;
}

export default function ConnectionsPage() {
  const { tenant, api } = useWorkspace(),
    { toast } = useToast(),
    owner = tenant.role === "OWNER",
    base = `/tenants/${tenant.id}`,
    connections = useResource(owner ? `${base}/connections/google` : null),
    destinations = useResource(owner ? `${base}/sheet-destinations` : null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [inspection, setInspection] = useState(null),
    [connectionId, setConnectionId] = useState(""),
    completing = useRef(false);

  useEffect(() => {
    const pending = pendingGoogle();
    if (!owner || !pending.code || !pending.connectionId || completing.current)
      return;
    completing.current = true;
    setBusy(true);
    api(`${base}/connections/google/${pending.connectionId}/complete`, {
      method: "POST",
      body: { state: pending.state, code: pending.code },
    })
      .then(() => toast("Google account connected."))
      .catch((e) => setError(e.message))
      .finally(() => {
        clearGoogle();
        setBusy(false);
        connections.reload();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(action) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const connect = () =>
    run(async () => {
      const result = await api(`${base}/connections/google`, {
        method: "POST",
        body: {},
      });
      rememberConnection(result.connection.id);
      window.location.assign(result.authorizationUrl);
    });
  const disconnect = (id) =>
    run(async () => {
      await api(`${base}/connections/google/${id}`, { method: "DELETE" });
      connections.reload();
      destinations.reload();
      toast("Google account disconnected.");
    });
  function inspect(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      id = form.get("connectionId") || connected[0]?.id,
      spreadsheetId = spreadsheetIdFrom(String(form.get("sheet")));
    if (!spreadsheetId) return setError("Paste a Google Sheets link or ID.");
    run(async () => {
      const result = await api(
        `${base}/connections/google/${id}/spreadsheet-inspections`,
        { method: "POST", body: { spreadsheetId } },
      );
      setConnectionId(id);
      setInspection(result);
    });
  }
  const choose = (tab) =>
    run(async () => {
      await api(`${base}/sheet-destinations`, {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          connectionId,
          spreadsheetId: inspection.spreadsheetId,
          sheetId: tab.sheetId,
        },
      });
      setInspection(null);
      destinations.reload();
      toast("Spreadsheet destination saved.");
    });

  const connected = (connections.data?.data ?? []).filter(
    (c) => c.status === "CONNECTED",
  );
  return (
    <Page icon={Link2} title="Connections">
      <div className="live-workspace live-narrow">
        <header className="live-hero">
          <p className="live-eyebrow">GOOGLE SHEETS</p>
          <h1>Spreadsheet delivery</h1>
          <p className="live-muted">
            Connect Google, then choose the spreadsheet tab that receives
            reviewed orders. SuperAgent only sees files you share with it.
          </p>
        </header>
        {!owner && (
          <p className="live-muted">Only an owner can manage connections.</p>
        )}
        {owner && (
          <>
            {error && (
              <p className="live-error" role="alert">
                {error}
              </p>
            )}
            <ResourceState resource={connections} />
            {connections.data && (
              <section className="live-card">
                <h2>Google accounts</h2>
                {connections.data.data.length === 0 && (
                  <p className="live-muted">No Google account connected.</p>
                )}
                <ul>
                  {connections.data.data.map((c) => (
                    <li key={c.id}>
                      {c.status} · {new Date(c.createdAt).toLocaleString()}{" "}
                      {c.status === "CONNECTED" && (
                        <button
                          className="live-secondary"
                          disabled={busy}
                          onClick={() => disconnect(c.id)}
                        >
                          Disconnect
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  className="live-primary"
                  disabled={busy}
                  onClick={connect}
                >
                  {busy ? "Working…" : "Connect Google account"}
                </button>
              </section>
            )}
            {connected.length > 0 && (
              <form className="live-form live-card" onSubmit={inspect}>
                <h2>Choose a spreadsheet</h2>
                {connected.length > 1 && (
                  <label>
                    Google account
                    <select name="connectionId" disabled={busy}>
                      {connected.map((c) => (
                        <option key={c.id} value={c.id}>
                          {new Date(c.connectedAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Spreadsheet link or ID
                  <input name="sheet" required disabled={busy} />
                </label>
                <button className="live-secondary" disabled={busy}>
                  Check access
                </button>
                {inspection && (
                  <div>
                    <h3>{inspection.title}</h3>
                    {inspection.tabs.map((tab) => (
                      <button
                        type="button"
                        key={tab.sheetId}
                        className="live-secondary"
                        disabled={busy}
                        onClick={() => choose(tab)}
                      >
                        Use tab “{tab.title}”
                      </button>
                    ))}
                  </div>
                )}
              </form>
            )}
            {destinations.data?.data.length > 0 && (
              <section className="live-card">
                <h2>Saved destinations</h2>
                <ul>
                  {destinations.data.data.map((d) => (
                    <li key={d.id}>
                      {d.spreadsheetTitle} / {d.tabTitle} ·{" "}
                      {d.status === "ACCESS_CHECKED"
                        ? "Access checked"
                        : "Connection unavailable"}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
