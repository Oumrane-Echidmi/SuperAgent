import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useWorkspace } from "../context/WorkspaceContext";

export default function SignInPage() {
  const { authenticate, notice } = useWorkspace(),
    navigate = useNavigate();
  const [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await authenticate(mode, {
        email: form.get("email"),
        password: form.get("password"),
        ...(mode === "register"
          ? { businessName: form.get("businessName") }
          : {}),
      });
      navigate("/", { replace: true });
    } catch (error) {
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sign-in">
      <div className="sign-in-card">
        <div className="live-brand">
          <img
            className="workspace-brand-logo"
            src="/brand/superagent-logo.png"
            alt="SuperAgent"
          />
        </div>
        <p className="live-eyebrow">YOUR BUSINESS WORKSPACE</p>
        <h1>
          {mode === "login" ? "Welcome back." : "A workspace for your shop."}
        </h1>
        <p className="live-muted">
          {mode === "login"
            ? "Sign in to see your orders and business activity."
            : "Create your business profile and start recording customer orders."}
        </p>
        {notice && (
          <p role="status" className="live-notice">
            {notice}
          </p>
        )}
        <form className="live-form" onSubmit={submit}>
          {mode === "register" && (
            <label>
              Business name
              <input
                name="businessName"
                autoComplete="organization"
                required
                maxLength={120}
              />
            </label>
          )}
          <label>
            Email
            <input
              name="email"
              type="email"
              autoComplete="username"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              required
              minLength={12}
              maxLength={128}
            />
          </label>
          {error && (
            <p role="alert" className="live-error">
              {error}
            </p>
          )}
          <button className="live-primary" disabled={busy}>
            {busy
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : "Create workspace"}
            <ArrowRight size={15} />
          </button>
        </form>
        <button
          className="live-text-button"
          disabled={busy}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError("");
          }}
        >
          {mode === "login"
            ? "New here? Create a workspace"
            : "Already have an account? Sign in"}
        </button>
        <p className="live-footnote">
          Your session stays in memory. Refreshing the page requires signing in
          again.
        </p>
      </div>
    </main>
  );
}
