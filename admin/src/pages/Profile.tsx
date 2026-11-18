// Your own account: name, password, sign out. Same page for the team and for clients.
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "../components/Avatar";
import { PageHeader } from "../components/PageHeader";
import { Btn, Panel, Pill, useNotify } from "../components/kit";
import { FormField as Field } from "../components/FormField";

export function Profile() {
  const { user, client, setSession, logout } = useAuth();
  const { notify, node } = useNotify();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [savingPw, setSavingPw] = useState(false);
  if (!user) return null;

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    try {
      const d = await api<{ user: typeof user }>("/auth/profile", { method: "PATCH", body: { name } });
      setSession(d.user, client);
      setName(d.user.name);
      notify("Name saved.");
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSavingName(false);
    }
  };

  const mismatch = pw.again !== "" && pw.next !== pw.again;
  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    setSavingPw(true);
    try {
      await api("/auth/password", { method: "POST", body: { current: pw.current, next: pw.next } });
      setPw({ current: "", next: "", again: "" });
      notify("Password changed.");
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSavingPw(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-5">
      {node}
      <PageHeader title="Profile" subtitle="Your account on Musawara." />

      <Panel className="flex items-center gap-4 p-5">
        <Avatar name={user.name} size={56} />
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-ink">{user.name}</p>
          <p className="truncate text-sm text-ink2">{user.email}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Pill tone="accent">{user.role === "admin" ? "Team" : "Client"}</Pill>
            {client && <Pill>{client.name}</Pill>}
          </div>
        </div>
      </Panel>

      <Panel className="p-5">
        <form onSubmit={saveName} className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Name</h2>
          <Field label="Display name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" />
          </Field>
          <p className="text-xs text-muted">Your email and role are set by the team and cannot be changed here.</p>
          <Btn tone="primary" type="submit" loading={savingName} disabled={!name.trim() || name.trim() === user.name}>Save name</Btn>
        </form>
      </Panel>

      <Panel className="p-5">
        <form onSubmit={savePassword} className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Password</h2>
          <Field label="Current password">
            <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          </Field>
          <Field label="New password (8 or more characters)">
            <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
          </Field>
          <Field label="New password again">
            <Input type="password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} autoComplete="new-password" aria-invalid={mismatch} />
          </Field>
          {mismatch && <p className="text-xs text-crit">The two new passwords do not match.</p>}
          <Btn tone="primary" type="submit" loading={savingPw} disabled={!pw.current || pw.next.length < 8 || pw.next !== pw.again}>Change password</Btn>
          <p className="text-xs text-muted">Changing it does not sign out other devices yet.</p>
        </form>
      </Panel>

      <Panel className="flex items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-semibold text-ink">Sign out</h2>
          <p className="text-xs text-muted">End this session on this device.</p>
        </div>
        <Btn tone="secondary" onClick={async () => { await logout(); navigate("/login"); }}>Sign out</Btn>
      </Panel>
    </div>
  );
}
