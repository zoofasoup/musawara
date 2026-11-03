import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Wordmark } from "../components/Layout";
import { CardSkeleton, ErrorState } from "../components/ui";

export function Invite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const { data, error, loading } = useApi<{ invite: { email: string | null; role: string; client_name: string | null } }>(
    `/auth/invites/${token}`
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSubmitError("");
    try {
      const d = await api<{ user: any }>(`/auth/invites/${token}/accept`, { body: { name, email, password } });
      setSession(d.user);
      navigate(d.user.role === "admin" ? "/" : `/c/${d.user.client_id}`, { replace: true });
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Wordmark />
        </div>
        {loading ? (
          <CardSkeleton lines={5} />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-6">
            <h1 className="text-base font-semibold text-ink">Create your account</h1>
            <p className="text-xs text-ink2">
              {data!.invite.client_name
                ? `You've been invited to view the ${data!.invite.client_name} dashboard.`
                : "You've been invited to Musawara Ads Intelligence."}
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Your name</span>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border2 bg-surface px-3 text-sm text-ink outline-none focus:border-musawara"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Email</span>
              <input
                type="email"
                required={!data!.invite.email}
                disabled={Boolean(data!.invite.email)}
                value={data!.invite.email ?? email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border2 bg-surface px-3 text-sm text-ink outline-none focus:border-musawara disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink2">Password (8+ characters)</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded-lg border border-border2 bg-surface px-3 text-sm text-ink outline-none focus:border-musawara"
              />
            </label>
            {submitError && <p className="text-xs text-crit">{submitError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="min-h-11 w-full rounded-lg bg-musawara text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Creating…" : "Create account"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
