import { Input } from "@/components/ui/input";
import { FormField } from "../components/FormField";
import { Callout } from "../components/Callout";
import { Btn } from "../components/kit";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Wordmark } from "../components/Layout";

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(err.message);
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
        <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)]">
          <h1 className="text-base font-semibold text-ink">Sign in</h1>
          <FormField label="Email">
              <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            </FormField>
          <FormField label="Password">
              <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            </FormField>
          {error && <Callout tone="crit" compact>{error}</Callout>}
          <Btn tone="primary" type="submit" loading={busy} className="w-full">
              {busy ? "Signing in…" : "Sign in"}
            </Btn>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Access is by invitation from Musawara Creative.
        </p>
      </div>
    </div>
  );
}
