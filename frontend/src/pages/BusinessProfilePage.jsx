import { useState } from "react";
import { Settings } from "lucide-react";
import Page from "../components/Page";
import ResourceState from "../components/ResourceState";
import { useResource, useWorkspace } from "../context/WorkspaceContext";
import { useToast } from "../context/ToastContext";

export default function BusinessProfilePage() {
  const { tenant, api, session } = useWorkspace(),
    path = `/tenants/${tenant.id}/profile`,
    profile = useResource(path),
    { toast } = useToast();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(path, {
        method: "PUT",
        body: {
          language: form.get("language"),
          timezone: form.get("timezone"),
          description: form.get("description"),
        },
      });
      profile.reload();
      toast("Business profile saved.");
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Page icon={Settings} title="Business profile">
      <div className="live-workspace live-narrow">
        <header className="live-hero">
          <p className="live-eyebrow">WORKSPACE SETTINGS</p>
          <h1>{tenant.name}</h1>
          <p className="live-muted">
            Signed in as {session.user.email} ·{" "}
            {tenant.role === "OWNER" ? "Owner" : "Staff"}
          </p>
        </header>
        <ResourceState resource={profile} />
        {profile.data && (
          <form
            className="live-form live-card"
            key={profile.data.updatedAt}
            onSubmit={save}
          >
            <fieldset disabled={busy || tenant.role !== "OWNER"}>
              <label>
                Shop language
                <select name="language" defaultValue={profile.data.language}>
                  <option value="fr">Français</option>
                  <option value="darija">Darija</option>
                </select>
              </label>
              <label>
                Timezone
                <input
                  name="timezone"
                  defaultValue={profile.data.timezone}
                  maxLength={100}
                  required
                />
                <span className="live-muted live-small">
                  For example, Africa/Casablanca or Europe/Paris.
                </span>
              </label>
              <label>
                Business description
                <textarea
                  name="description"
                  defaultValue={profile.data.description}
                  rows={6}
                  maxLength={4000}
                />
              </label>
            </fieldset>
            {error && (
              <p className="live-error" role="alert">
                {error}
              </p>
            )}
            {tenant.role === "OWNER" ? (
              <button className="live-primary" disabled={busy}>
                {busy ? "Saving…" : "Save business profile"}
              </button>
            ) : (
              <p className="live-muted">
                Only an owner can change this profile.
              </p>
            )}
          </form>
        )}
      </div>
    </Page>
  );
}
