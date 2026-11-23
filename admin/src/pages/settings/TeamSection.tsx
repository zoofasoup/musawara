import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { CLIENT_HINT, CLIENT_LABEL, CLIENT_ROLES, STAFF_HINT, STAFF_LABEL, STAFF_ROLES, type ClientRole, type StaffRole } from "../../../shared/permissions";
import { Segmented } from "../../components/Segmented";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { api, homeOrigin, type useApi } from "../../lib/api";
import { Icon } from "../../components/icons";
import { RolePill, ROLE_LOOK, type AnyRole } from "../../lib/roles";
import { Btn, ConfirmBtn, CopyBtn, Empty, Panel, Pill, Section, type Notify } from "../../components/kit";

type TeamState = ReturnType<typeof useApi<{ users: any[]; invites: any[] }>>;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

/** Which clients a team member sees, as one line. Owners see all. */
const reach = (role: string | null, ids: number[] | null, clients: any[]) =>
  role === "owner" || ids === null ? "All clients" : ids.length === 0 ? "No clients assigned" : ids.map((id) => clients.find((c) => c.id === id)?.name ?? `#${id}`).join(", ");

/** Role and client assignment for a team member: used both to invite someone and to change a role later. */
function AccessFields({ role, setRole, ids, setIds, clients }: { role: StaffRole; setRole: (r: StaffRole) => void; ids: number[]; setIds: (v: number[]) => void; clients: any[] }) {
  return (
    <div className="space-y-2">
      <NativeSelect className="w-full" value={role} onChange={(e) => setRole(e.target.value as StaffRole)} aria-label="Team role">
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>{STAFF_LABEL[r]}</option>
        ))}
      </NativeSelect>
      <p className="flex items-start gap-2 text-xs text-muted"><RolePill role={role} size="sm" /><span className="pt-0.5">{STAFF_HINT[role]}</span></p>
      {role !== "owner" && (
        <fieldset className="rounded-lg border border-border p-2">
          <legend className="px-1 text-xs font-medium text-muted">Which clients can they see?</legend>
          <div className="grid gap-0.5 sm:grid-cols-2">
            {clients.map((c) => (
              <label key={c.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm text-ink hover:bg-surface2">
                <Checkbox checked={ids.includes(c.id)} onCheckedChange={(on) => setIds(on ? [...ids, c.id] : ids.filter((x) => x !== c.id))} />
                <span className="min-w-0 truncate">{c.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function TeamSection({ state, clients, notify }: { state: TeamState; clients: any[]; notify: Notify }) {
  const { data, loading, error, reload } = state;
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState<"team" | "client">("team");
  const [staffRole, setStaffRole] = useState<StaffRole>("ads");
  const [ids, setIds] = useState<number[]>([]);
  const [clientRole, setClientRole] = useState<ClientRole>("approver");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  // editing an existing team member's access
  const [editing, setEditing] = useState<number | null>(null);
  const [editRole, setEditRole] = useState<StaffRole>("ads");
  const [editIds, setEditIds] = useState<number[]>([]);

  const needsClients = audience === "team" && staffRole !== "owner" && ids.length === 0;
  const blocked = audience === "client" ? !clientId : needsClients;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (blocked) return;
    setSaving(true);
    try {
      const res = await api<{ path: string }>("/admin/invites", {
        method: "POST",
        body:
          audience === "client"
            ? { email, audience: "client", client_role: clientRole, client_id: Number(clientId) }
            : { email, audience: "team", staff_role: staffRole, client_ids: staffRole === "owner" ? [] : ids },
      });
      setInviteUrl(homeOrigin(audience === "client" ? "client" : "admin") + res.path);
      setEmail("");
      setAdding(false);
      reload();
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const saveAccess = async (id: number) => {
    try {
      await api(`/admin/users/${id}`, { method: "PUT", body: { staff_role: editRole, client_ids: editRole === "owner" ? [] : editIds } });
      setEditing(null);
      reload();
      notify("Access updated. It applies on their next click.");
    } catch (err: any) {
      notify(err.message, "err");
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
      hint="Each team role opens its own areas, and everyone but Owners sees only the clients assigned to them. Client logins see only their own client."
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
          <Segmented label="Who" value={audience} onChange={setAudience} options={[{ value: "team", label: "Team member", icon: <Icon name="shield" className="h-3.5 w-3.5" /> }, { value: "client", label: "Client login", icon: <Icon name="user" className="h-3.5 w-3.5" /> }]} />
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" aria-label="Email" />
          {audience === "team" ? (
            <AccessFields role={staffRole} setRole={setStaffRole} ids={ids} setIds={setIds} clients={clients} />
          ) : (
            <div className="space-y-2">
              <NativeSelect className="w-full" value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client">
                <option value="">Which client can they see?</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
              <Segmented label="Client role" value={clientRole} onChange={setClientRole} options={CLIENT_ROLES.map((r) => ({ value: r, label: CLIENT_LABEL[r] }))} />
              <p className="flex items-start gap-2 text-xs text-muted"><RolePill role={clientRole} size="sm" /><span className="pt-0.5">{CLIENT_HINT[clientRole]}</span></p>
            </div>
          )}
          <Btn type="submit" tone="primary" loading={saving} disabled={blocked}>
            Create invite link
          </Btn>
        </form>
      )}

      <ul aria-label="Roles" className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {(["owner", "ads", "content", "crm", "approver", "viewer"] as AnyRole[]).map((r) => (
          <li key={r} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${ROLE_LOOK[r].dot}`} aria-hidden />{ROLE_LOOK[r].label}</li>
        ))}
      </ul>

      {loading ? (
        <div className="h-24 skeleton rounded-xl" />
      ) : error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : users.length === 0 && invites.length === 0 ? (
        <Empty icon="users" title="No one here yet" hint="Invite teammates or give a client a login to their dashboard." />
      ) : (
        <Panel className="divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="p-3.5">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface3 text-[13px] font-medium text-ink2">{initials(u.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                    <span className="truncate">{u.name}</span>
                    <RolePill role={u.role === "admin" ? u.staff_role : u.client_role} />
                  </p>
                  <p className="truncate text-xs text-muted">{u.email} · {u.role === "admin" ? reach(u.staff_role, u.client_ids, clients) : u.client_name}</p>
                </div>
                {u.role === "client" && (
                  <NativeSelect
                    className="w-32"
                    value={u.client_role ?? ""}
                    aria-label={`Role for ${u.name}`}
                    onChange={async (e) => {
                      try {
                        await api(`/admin/users/${u.id}`, { method: "PUT", body: { client_role: e.target.value } });
                        reload();
                        notify(`${u.name} is now ${CLIENT_LABEL[e.target.value as ClientRole]}.`);
                      } catch (err: any) {
                        notify(err.message, "err");
                      }
                    }}
                  >
                    {!u.client_role && <option value="">No role</option>}
                    {CLIENT_ROLES.map((r) => (
                      <option key={r} value={r}>{CLIENT_LABEL[r]}</option>
                    ))}
                  </NativeSelect>
                )}
                {u.role === "admin" && (
                  <Btn tone="ghost" onClick={() => { if (editing === u.id) { setEditing(null); return; } setEditing(u.id); setEditRole(u.staff_role ?? "ads"); setEditIds(u.client_ids ?? []); }}>
                    {editing === u.id ? "Cancel" : "Edit access"}
                  </Btn>
                )}
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
              {editing === u.id && (
                <div className="mt-3 space-y-3 rounded-xl border border-[var(--accent)]/30 bg-surface p-3.5">
                  <AccessFields role={editRole} setRole={setEditRole} ids={editIds} setIds={setEditIds} clients={clients} />
                  <Btn tone="primary" disabled={editRole !== "owner" && editIds.length === 0} onClick={() => saveAccess(u.id)}>Save access</Btn>
                </div>
              )}
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
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <RolePill role={i.role === "admin" ? i.staff_role : i.client_role} size="sm" />
                  <span className="truncate">{i.role === "admin" ? reach(i.staff_role, i.client_ids, clients) : i.client_name}</span>
                </p>
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
