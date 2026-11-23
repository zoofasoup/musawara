import { Input } from "@/components/ui/input";
import { FormField } from "../components/FormField";
import { Callout } from "../components/Callout";
import { Btn } from "../components/kit";
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
          <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)]">
            <h1 className="text-base font-semibold text-ink">Create your account</h1>
            <p className="text-xs text-ink2">
              {data!.invite.client_name
                ? `You've been invited to view the ${data!.invite.client_name} dashboard.`
                : "You've been invited to Musawara."}
            </p>
            <FormField label="Your name">
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </FormField>
            <FormField label="Email">
              <Input
                type="email"
                required={!data!.invite.email}
                disabled={Boolean(data!.invite.email)}
                value={data!.invite.email ?? email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </FormField>
            <FormField label="Password (8+ characters)">
              <Input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </FormField>
            {submitError && <Callout tone="crit" compact>{submitError}</Callout>}
            <Btn tone="primary" type="submit" loading={busy} className="w-full">
              {busy ? "Creating…" : "Create account"}
            </Btn>
          </form>
        )}
      </div>
    </div>
  );
}
