import { useState } from "react";
import { Workflow } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";

function DraftDetail({ base, id, owner, onChanged }) {
  const { api } = useWorkspace(),
    { toast } = useToast(),
    draft = useResource(`${base}/${id}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function act(action, label) {
    setBusy(true);
    setError("");
    try {
      await api(`${base}/${id}/${action}`, {
        method: "POST",
        body: { expectedRevision: draft.data.revision },
      });
      toast(label);
      draft.reload();
      onChanged();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!draft.data) return <ResourceState resource={draft} />;
  const d = draft.data,
    report = d.simulation;
  return (
    <section className="live-card">
      <h2>{d.content.name}</h2>
      <p className="live-muted">
        Revision {d.revision} · {d.content.language === "fr" ? "Français" : "Darija"}
      </p>
      <p>{d.content.goal}</p>
      <p>
        <strong>Simulation:</strong>{" "}
        {!report ? "Not run yet" : report.valid ? "Passed" : "Failed"}
        {" · "}
        <strong>Approval:</strong>{" "}
        {d.approval ? "Approved" : "Not approved"}
      </p>
      {report && !report.valid && (
        <pre className="live-small">{JSON.stringify(report, null, 2)}</pre>
      )}
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      {owner && (
        <>
          <button
            className="live-secondary"
            disabled={busy}
            onClick={() => act("simulations", "Simulation finished.")}
          >
            Simulate this revision
          </button>{" "}
          <button
            className="live-primary"
            disabled={busy || !report?.valid || Boolean(d.approval)}
            onClick={() => act("approve", "Draft approved.")}
          >
            Approve this revision
          </button>
        </>
      )}
    </section>
  );
}

function BuilderChat({ base, owner }) {
  const { api } = useWorkspace(),
    sessions = useResource(`${base}/builder/sessions`),
    [active, setActive] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  const session = useResource(
    active ? `${base}/builder/sessions/${active}` : null,
  );
  async function run(fn) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const start = (language) =>
    run(async () => {
      const id = crypto.randomUUID();
      await api(`${base}/builder/sessions`, {
        method: "POST",
        body: { id, language, consentToOpenAI: true },
      });
      sessions.reload();
      setActive(id);
    });
  const send = (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      text = new FormData(form).get("text");
    run(async () => {
      await api(`${base}/builder/sessions/${active}/messages`, {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          expectedRevision: session.data.revision,
          text,
        },
      });
      form.reset();
      session.reload();
    });
  };
  const pending = session.data?.turns.some(
    (t) => t.status === "QUEUED" || t.status === "RUNNING",
  );
  return (
    <section className="live-card">
      <h2>Builder chat</h2>
      <p className="live-muted">
        Messages are sent to OpenAI to match your goal with a released
        scenario. Requires the Builder service to be enabled.
      </p>
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      {sessions.data?.data.length > 0 && !active && (
        <ul>
          {sessions.data.data.map((s) => (
            <li key={s.id}>
              <button className="live-secondary" onClick={() => setActive(s.id)}>
                Session {s.id.slice(0, 8)} · {s.revision} messages
              </button>
            </li>
          ))}
        </ul>
      )}
      {!active && owner && (
        <>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            I agree to send my messages to OpenAI.
          </label>
          <p>
            <button
              className="live-primary"
              disabled={busy || !consent}
              onClick={() => start("fr")}
            >
              New session (Français)
            </button>{" "}
            <button
              className="live-primary"
              disabled={busy || !consent}
              onClick={() => start("darija")}
            >
              New session (Darija)
            </button>
          </p>
        </>
      )}
      {active && session.data && (
        <>
          <button className="live-secondary" onClick={() => setActive(null)}>
            Back to sessions
          </button>
          {session.data.turns.map((t) => (
            <div key={t.id}>
              <p>
                <strong>You:</strong> {t.text}
              </p>
              <p>
                <strong>Builder:</strong>{" "}
                {t.status === "SUCCEEDED"
                  ? t.result?.message ?? JSON.stringify(t.result)
                  : t.status === "FAILED"
                    ? "Could not answer. Try again."
                    : "Working…"}
              </p>
            </div>
          ))}
          {pending && (
            <button className="live-secondary" onClick={session.reload}>
              Refresh reply
            </button>
          )}
          {owner && (
            <form onSubmit={send}>
              <textarea name="text" required maxLength={2000} rows={3} />
              <button className="live-primary" disabled={busy || pending}>
                Send
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}


function Generator({ base, owner }) {
  const { api } = useWorkspace(),
    { toast } = useToast(),
    list = useResource(`${base}/generated-workflows`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false);
  async function run(fn, message) {
    setBusy(true);
    setError("");
    try {
      await fn();
      toast(message);
      list.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function create(event) {
    event.preventDefault();
    const form = event.currentTarget,
      data = new FormData(form);
    run(async () => {
      await api(`${base}/generated-workflows`, {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          goal: data.get("goal"),
          language: data.get("language"),
          consentToOpenAI: true,
        },
      });
      form.reset();
      setConsent(false);
    }, "Workflow generated. Review it before approving.");
  }
  const approve = (id) =>
    run(
      () => api(`${base}/generated-workflows/${id}/approve`, { method: "POST", body: {} }),
      "Workflow approved.",
    );
  return (
    <section className="live-card">
      <h2>Describe a new workflow</h2>
      <p className="live-muted">
        No ready-made scenario fits? Describe what you want and the assistant
        builds a workflow from the registered steps. It is simulated
        automatically and never goes live without your approval. Generated
        workflows cannot confirm or decline orders.
      </p>
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      {owner && (
        <form className="live-form" onSubmit={create}>
          <label>
            What should it do?
            <textarea name="goal" required maxLength={1000} rows={3} />
          </label>
          <label>
            Language of replies
            <select name="language">
              <option value="fr">Français</option>
              <option value="darija">Darija</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            I agree to send this description to OpenAI.
          </label>
          <button className="live-primary" disabled={busy || !consent}>
            {busy ? "Generating…" : "Generate workflow"}
          </button>
        </form>
      )}
      <ul>
        {list.data?.data.map((g) => (
          <li key={g.id}>
            <strong>{g.status === "READY" ? "Passed simulation" : "Failed checks"}</strong>
            {g.approvedAt ? " · Approved" : ""} — {g.goal}
            {g.status === "READY" && (
              <details>
                <summary>Review steps and replies</summary>
                <ol>
                  {g.workflow.nodes.map((n) => (
                    <li key={n.id}>
                      {n.capability.name}
                      {n.inputs.text?.kind === "literal" && `: “${n.inputs.text.value}”`}
                      {n.inputs.reason?.kind === "literal" && `: ${n.inputs.reason.value}`}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {g.status === "INVALID" && (
              <pre className="live-small">{JSON.stringify(g.report.issues, null, 2)}</pre>
            )}
            {owner && g.status === "READY" && !g.approvedAt && (
              <button className="live-secondary" disabled={busy} onClick={() => approve(g.id)}>
                Approve
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Publishing({ base, owner }) {
  const { api } = useWorkspace(),
    { toast } = useToast(),
    drafts = useResource(`${base}/drafts`),
    generated = useResource(`${base}/generated-workflows`),
    numbers = useResource(`${base}/whatsapp-numbers`),
    publications = useResource(`${base}/publications`),
    runs = useResource(`${base}/workflow-runs`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function run(fn, message) {
    setBusy(true);
    setError("");
    try {
      await fn();
      toast(message);
      publications.reload();
      runs.reload();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function publish(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      [kind, id] = String(form.get("draft")).split(":"),
      draft = drafts.data?.data.find((d) => d.id === id);
    run(
      () =>
        api(`${base}/publications`, {
          method: "POST",
          body: {
            id: crypto.randomUUID(),
            ...(kind === "gen"
              ? { generatedWorkflowId: id }
              : { draftId: draft.id, expectedRevision: draft.revision }),
            whatsappNumberId: form.get("number"),
          },
        }),
      "Workflow published.",
    );
  }
  const toggle = (p) =>
    run(
      () =>
        api(`${base}/publications/${p.id}/${p.status === "ACTIVE" ? "pause" : "resume"}`, {
          method: "POST",
          body: {},
        }),
      p.status === "ACTIVE" ? "Workflow paused." : "Workflow resumed.",
    );
  return (
    <section className="live-card">
      <h2>Publish and monitor</h2>
      <p className="live-muted">
        A published workflow answers WhatsApp replies on one number. Publish
        only a draft whose latest revision you approved. WhatsApp must be
        enabled on the server and the workflow runner started.
      </p>
      {error && (
        <p className="live-error" role="alert">
          {error}
        </p>
      )}
      {owner && numbers.data?.data.length > 0 && (drafts.data?.data.length > 0 || generated.data?.data.some((g) => g.approvedAt)) && (
        <form className="live-form" onSubmit={publish}>
          <label>
            Draft
            <select name="draft">
              {drafts.data?.data.map((d) => (
                <option key={d.id} value={`draft:${d.id}`}>
                  {d.name} · rev. {d.revision}
                </option>
              ))}
              {generated.data?.data
                .filter((g) => g.approvedAt)
                .map((g) => (
                  <option key={g.id} value={`gen:${g.id}`}>
                    Generated: {g.goal.slice(0, 50)}
                  </option>
                ))}
            </select>
          </label>
          <label>
            WhatsApp number
            <select name="number">
              {numbers.data.data.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.displayName}
                </option>
              ))}
            </select>
          </label>
          <button className="live-primary" disabled={busy}>
            Publish approved draft
          </button>
        </form>
      )}
      {owner && numbers.data?.data.length === 0 && (
        <p className="live-muted">
          Register a WhatsApp number on the WhatsApp page first.
        </p>
      )}
      <h3>Live workflows</h3>
      {publications.data?.data.length === 0 && (
        <p className="live-muted">Nothing is published yet.</p>
      )}
      <ul>
        {publications.data?.data.map((p) => (
          <li key={p.id}>
            {p.status} · draft rev. {p.draftRevision}{" "}
            {owner && (
              <button className="live-secondary" disabled={busy} onClick={() => toggle(p)}>
                {p.status === "ACTIVE" ? "Pause" : "Resume"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <h3>Recent runs</h3>
      <button className="live-secondary" onClick={runs.reload}>
        Refresh
      </button>
      {runs.data?.data.length === 0 && (
        <p className="live-muted">No customer messages processed yet.</p>
      )}
      <ul>
        {runs.data?.data.map((r) => (
          <li key={r.id}>
            {new Date(r.createdAt).toLocaleString()} · {r.status}
            {r.reason ? ` · ${r.reason}` : ""}
            {r.errorCode ? ` · ${r.errorCode}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function BuilderPage() {
  const { tenant, api } = useWorkspace(),
    { toast } = useToast(),
    owner = tenant.role === "OWNER",
    base = `/tenants/${tenant.id}`,
    scenarios = useResource("/scenarios"),
    drafts = useResource(`${base}/drafts`),
    [open, setOpen] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function create(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      [scenarioId, revision] = String(form.get("scenario")).split(":");
    setBusy(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      await api(`${base}/drafts`, {
        method: "POST",
        body: {
          id,
          scenarioId,
          scenarioRevision: Number(revision),
          content: {
            name: form.get("name"),
            goal: form.get("goal"),
            language: form.get("language"),
          },
        },
      });
      toast("Draft created.");
      drafts.reload();
      setOpen(id);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page icon={Workflow} title="Builder">
      <div className="live-workspace live-narrow">
        <header className="live-hero">
          <p className="live-eyebrow">WORKFLOW BUILDER</p>
          <h1>Scenarios and drafts</h1>
          <p className="live-muted">
            Pick a released scenario, review a draft, simulate it with sample
            data, then approve the exact revision. Approved drafts can be published to a WhatsApp number below.
          </p>
        </header>
        <ResourceState resource={scenarios} />
        {scenarios.data && (
          <section className="live-card">
            <h2>Scenario catalog</h2>
            {scenarios.data.data.length === 0 && (
              <p className="live-muted">No scenario has been released yet.</p>
            )}
            <ul>
              {scenarios.data.data.map((s) => (
                <li key={`${s.scenarioId}:${s.revision}`}>
                  <strong>{s.name}</strong> (rev. {s.revision}) — {s.description}
                </li>
              ))}
            </ul>
          </section>
        )}
        {owner && scenarios.data?.data.length > 0 && (
          <form className="live-form live-card" onSubmit={create}>
            <h2>New draft</h2>
            <fieldset disabled={busy}>
              <label>
                Scenario
                <select name="scenario">
                  {scenarios.data.data.map((s) => (
                    <option
                      key={`${s.scenarioId}:${s.revision}`}
                      value={`${s.scenarioId}:${s.revision}`}
                    >
                      {s.name} (rev. {s.revision})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Draft name
                <input name="name" required maxLength={120} />
              </label>
              <label>
                Goal
                <textarea name="goal" required maxLength={4000} rows={3} />
              </label>
              <label>
                Language
                <select name="language">
                  <option value="fr">Français</option>
                  <option value="darija">Darija</option>
                </select>
              </label>
            </fieldset>
            {error && (
              <p className="live-error" role="alert">
                {error}
              </p>
            )}
            <button className="live-primary" disabled={busy}>
              {busy ? "Creating…" : "Create draft"}
            </button>
          </form>
        )}
        <ResourceState resource={drafts} />
        {drafts.data && (
          <section className="live-card">
            <h2>Your drafts</h2>
            {drafts.data.data.length === 0 && (
              <p className="live-muted">No drafts yet.</p>
            )}
            <ul>
              {drafts.data.data.map((d) => (
                <li key={d.id}>
                  <button className="live-secondary" onClick={() => setOpen(d.id)}>
                    {d.name} · rev. {d.revision}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {open && (
          <DraftDetail
            key={open}
            base={`${base}/drafts`}
            id={open}
            owner={owner}
            onChanged={drafts.reload}
          />
        )}
        <Generator base={base} owner={owner} />
        <Publishing base={base} owner={owner} />
        <BuilderChat base={base} owner={owner} />
      </div>
    </Page>
  );
}
