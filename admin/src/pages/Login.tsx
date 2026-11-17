import { Input } from "@/components/ui/input";
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
        <form onSubmit={submit} className="space-y-3 rounded-2xl border border-border bg-surface p-6">
          <h1 className="text-base font-semibold text-ink">Sign in</h1>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Email</span>
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-border2 bg-surface px-3 text-sm text-ink outline-none focus:border-musawara"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink2">Password</span>
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 w-full rounded-lg border border-border2 bg-surface px-3 text-sm text-ink outline-none focus:border-musawara"
            />
          </label>
          {error && <p className="text-xs text-crit">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="min-h-11 w-full rounded-lg bg-musawara text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-muted">
          Access is by invitation from Musawara Creative.
        </p>
      </div>
    </div>
  );
}
