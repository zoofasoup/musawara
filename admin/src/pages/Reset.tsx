// Choose a new password with a one-time link an Owner handed over.
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { FormField } from "../components/FormField";
import { Callout } from "../components/Callout";
import { Btn } from "../components/kit";
import { Wordmark } from "../components/Layout";

export function Reset() {
  const { token } = useParams();
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/auth/reset", { body: { token, password } });
      setDone(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <Wordmark />
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-[var(--shadow-soft)]">
        <h1 className="text-base font-semibold text-ink">Choose a new password</h1>
        {done ? (
          <>
            <Callout tone="good">Your password is changed. Every device was signed out.</Callout>
            <Link to="/login" className="inline-flex min-h-11 items-center text-sm font-medium text-musawara-ink hover:underline">Sign in</Link>
          </>
        ) : (
          <>
            <FormField label="New password" hint="At least 8 characters.">
              <Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </FormField>
            {error && <Callout tone="crit" compact>{error}</Callout>}
            <Btn tone="primary" type="submit" loading={busy} className="w-full">Save password</Btn>
          </>
        )}
      </form>
    </main>
  );
}
