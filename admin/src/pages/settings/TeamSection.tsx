import { NativeSelect } from "@/components/ui/native-select";
import { Segmented } from "../../components/Segmented";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { api, homeOrigin, type useApi } from "../../lib/api";
import { Icon } from "../../components/icons";
import { Btn, ConfirmBtn, CopyBtn, Empty, Panel, Pill, Section, type Notify } from "../../components/kit";

type TeamState = ReturnType<typeof useApi<{ users: any[]; invites: any[] }>>;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export function TeamSection({ state, clients, notify }: { state: TeamState; clients: any[]; notify: Notify }) {
  const { data, loading, error, reload } = state;
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"client" | "admin">("client");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "client" && !clientId) return;
    setSaving(true);
    try {
      const res = await api<{ path: string }>("/admin/invites", {
        method: "POST",
        body: { email, role, client_id: role === "client" ? Number(clientId) : null },
      });
      setInviteUrl(homeOrigin(role) + res.path);
      setEmail("");
      setAdding(false);
      reload();
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const users = data?.users ?? [];
  const invites = data?.invites ?? [];

  return (
    <Section
      id="team"
      step={4}
      done={users.length > 0}
      icon="users"
      title="Team and access"
      hint="Admins see everything. Client logins only see their own dashboard."
      action={
        <Btn tone={adding ? "ghost" : "secondary"} icon={adding ? undefined : "mail"} onClick={() => { setAdding(!adding); setInviteUrl(""); }}>
          {adding ? "Cancel" : "Invite someone"}
        </Btn>
      }
    >
      {inviteUrl && (
        <div className="mb-3 rounded-xl border border-good/30 bg-good/5 p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-good">
            <Icon name="checkCircle" className="h-4 w-4" /> Invite ready. Send this link, it works once.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-good/20 bg-surface px-3">
            <Input readOnly value={inviteUrl} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} className="min-h-11 min-w-0 flex-1 bg-transparent font-mono text-xs text-ink outline-none" />
            <CopyBtn text={inviteUrl} label="Copy link" />
          </div>
        </div>
      )}

      {adding && (
        <form onSubmit={create} className="mb-3 space-y-3 rounded-xl border border-[var(--accent)]/30 bg-surface p-3.5">
          <Segmented label="Role" value={role} onChange={setRole} options={[{ value: "client", label: "Client viewer", icon: <Icon name="user" className="h-3.5 w-3.5" /> }, { value: "admin", label: "Admin", icon: <Icon name="shield" className="h-3.5 w-3.5" /> }]} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" aria-label="Email" />
            {role === "client" && (
              <NativeSelect className="w-full" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
                <option value="">Which client can they see?</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
            )}
          </div>
          <Btn type="submit" tone="primary" loading={saving} disabled={role === "client" && !clientId}>
            Create invite link
          </Btn>
        </form>
      )}

      {loading ? (
        <div className="h-24 skeleton rounded-xl" />
      ) : error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : users.length === 0 && invites.length === 0 ? (
        <Empty icon="users" title="No one here yet" hint="Invite teammates or give a client a login to their dashboard." />
      ) : (
        <Panel className="divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 p-3.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface3 text-[13px] font-medium text-ink2">{initials(u.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  <span className="truncate">{u.name}</span>
                  <Pill tone={u.role === "admin" ? "accent" : "neutral"} icon={u.role === "admin" ? "shield" : "user"}>
                    {u.role === "admin" ? "Admin" : "Client"}
                  </Pill>
                </p>
                <p className="truncate text-xs text-muted">{u.email} · {u.client_name || "All clients"}</p>
              </div>
              <ConfirmBtn
                label="Remove"
                confirmLabel="Remove access"
                onConfirm={async () => {
                  try {
                    await api(`/admin/users/${u.id}`, { method: "DELETE" });
                    reload();
                    notify(`${u.name} removed.`);
                  } catch (err: any) {
                    notify(err.message, "err");
                  }
                }}
              />
            </div>
          ))}
          {invites.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 bg-surface2/50 p-3.5">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border2 text-muted">
                <Icon name="mail" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  {i.email || "Invite link"}
                  <Pill tone="warn" icon="clock">Pending</Pill>
                </p>
                <p className="truncate text-xs text-muted">{i.role === "admin" ? "Admin" : "Client viewer"} · {i.client_name || "All clients"}</p>
              </div>
              <Btn
                tone="ghost"
                onClick={async () => {
                  await api(`/admin/invites/${i.id}`, { method: "DELETE" });
                  reload();
                }}
              >
                Revoke
              </Btn>
            </div>
          ))}
        </Panel>
      )}
    </Section>
  );
}
