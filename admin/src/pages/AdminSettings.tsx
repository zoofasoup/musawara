import { useState } from "react";
import { api, BASE, useApi } from "../lib/api";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";
import { ClientAvatar } from "../components/Layout";

/** Center-crop to a 192px square JPEG data URL (white behind transparent PNGs). */
async function photoToDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 192;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 192, 192);
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 192, 192);
  return canvas.toDataURL("image/jpeg", 0.88);
}

type ClientsState = ReturnType<typeof useApi<{ clients: any[] }>>;

function ClientsSection({ state }: { state: ClientsState }) {
  const { data, loading, error, reload } = state;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api("/admin/clients", { method: "POST", body: { name } });
      setName("");
      setAdding(false);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <button
            onClick={() => setAdding(!adding)}
            className="rounded-lg bg-surface2 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface3"
          >
            {adding ? "Cancel" : "Add Client"}
          </button>
        }
      >
        Clients
      </SectionTitle>

      {adding && (
        <form onSubmit={handleAdd} className="flex gap-2 rounded-xl border border-border bg-surface p-4">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client Name"
            className="flex-1 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
            autoFocus
          />
          <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90">
            Save
          </button>
        </form>
      )}

      {data?.clients.length === 0 ? (
        <EmptyState title="No clients" hint="Add a client to get started." />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {data?.clients.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <div className="flex min-w-0 items-center gap-3">
                <ClientAvatar name={c.name} logoUrl={c.logo_url} color={c.brand_color} size={10} />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{c.name}</p>
                  <p className="text-xs text-muted">
                    {c.account_count} account{c.account_count === 1 ? "" : "s"} · {c.user_count} user{c.user_count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <label className="inline-flex min-h-11 cursor-pointer items-center rounded px-2 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink">
                  {c.logo_url ? "Change photo" : "Add photo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      try {
                        await api(`/admin/clients/${c.id}`, { method: "PUT", body: { logo_url: await photoToDataUrl(file) } });
                        reload();
                      } catch (err: any) {
                        alert(err.message || "Could not use that image");
                      }
                    }}
                  />
                </label>
                {c.logo_url && (
                  <button
                    onClick={async () => {
                      await api(`/admin/clients/${c.id}`, { method: "PUT", body: { logo_url: "" } });
                      reload();
                    }}
                    className="inline-flex min-h-11 items-center rounded px-2 text-xs text-ink2 hover:bg-surface2 hover:text-ink"
                  >
                    Remove
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (confirm(`Delete ${c.name}?`)) {
                      await api(`/admin/clients/${c.id}`, { method: "DELETE" });
                      reload();
                    }
                  }}
                  className="inline-flex min-h-11 items-center rounded px-2 text-xs text-crit hover:bg-crit/10"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AdAccountsSection({ clientsData, reloadClients }: { clientsData: { clients: any[] } | undefined; reloadClients: () => void }) {
  const { data, loading, error, reload } = useApi<{ accounts: any[] }>("/admin/accounts");
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState("");
  const [metaAccountId, setMetaAccountId] = useState("");

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !metaAccountId) return;
    try {
      await api("/admin/accounts", { method: "POST", body: { client_id: Number(clientId), meta_account_id: metaAccountId } });
      setClientId("");
      setMetaAccountId("");
      setAdding(false);
      reload();
      reloadClients();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <button
            onClick={() => setAdding(!adding)}
            className="rounded-lg bg-surface2 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface3"
          >
            {adding ? "Cancel" : "Connect Account"}
          </button>
        }
      >
        Ad Accounts
      </SectionTitle>

      {adding && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex gap-3">
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-1/3 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
            >
              <option value="">Select Client...</option>
              {clientsData?.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={metaAccountId}
              onChange={(e) => setMetaAccountId(e.target.value)}
              placeholder="Meta Account ID (e.g. act_123456)"
              className="flex-1 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
            />
          </div>
          <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90">
            Connect
          </button>
        </form>
      )}

      {data?.accounts.length === 0 ? (
        <EmptyState title="No ad accounts" hint="Connect a Meta ad account to a client." />
      ) : (
        <div className="divide-y divide-border rounded-xl border border-border bg-surface">
          {data?.accounts.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="font-medium text-ink">
                    {a.account_name || a.meta_account_id} <span className="text-muted text-xs">({a.client_name})</span>
                  </p>
                  <p className="text-xs text-muted">
                    {a.status} · Currency: {a.currency} · TZ: {a.timezone}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await api(`/admin/accounts/${a.id}/sync`, { method: "POST" });
                      alert("Sync started!");
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}
                  className="rounded bg-surface2 px-2 py-1 text-xs text-ink hover:bg-surface3"
                >
                  Sync Now
                </button>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                <div>
                  <span className="text-muted">Primary Result: </span>
                  {a.primary_result_label || "Not configured"}
                </div>
                <div>
                  <span className="text-muted">Monthly Budget: </span>
                  {a.monthly_budget_idr ? `Rp ${a.monthly_budget_idr}` : "None"}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsersSection({ clientsData }: { clientsData: { clients: any[] } | undefined }) {
  const { data, loading, error, reload } = useApi<{ users: any[]; invites: any[] }>("/admin/users");
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("client");
  const [clientId, setClientId] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");

  if (loading) return <CardSkeleton />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "client" && !clientId) return;
    try {
      const res = await api<{ token: string; path: string }>("/admin/invites", {
        method: "POST",
        body: { email, role, client_id: role === "client" ? Number(clientId) : null },
      });
      setInviteUrl(window.location.origin + BASE + res.path);
      setEmail("");
      setAdding(false);
      reload();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        right={
          <button
            onClick={() => {
              setAdding(!adding);
              setInviteUrl("");
            }}
            className="rounded-lg bg-surface2 px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface3"
          >
            {adding ? "Cancel" : "Invite User"}
          </button>
        }
      >
        Users & Invites
      </SectionTitle>

      {inviteUrl && (
        <div className="rounded-xl border border-good/30 bg-good/5 p-4">
          <p className="mb-2 text-sm font-medium text-good">Invite created successfully!</p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl}
              className="flex-1 rounded border border-good/20 bg-transparent px-2 py-1 text-sm text-ink outline-none"
            />
            <button
              onClick={() => navigator.clipboard.writeText(inviteUrl)}
              className="rounded bg-good/10 px-3 py-1 text-sm font-medium text-good hover:bg-good/20"
            >
              Copy Link
            </button>
          </div>
        </div>
      )}

      {adding && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <div className="flex gap-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (optional)"
              className="flex-1 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-1/4 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
            >
              <option value="client">Client</option>
              <option value="admin">Admin</option>
            </select>
            {role === "client" && (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-1/3 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
              >
                <option value="">Select Client...</option>
                {clientsData?.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90">
            Generate Invite
          </button>
        </form>
      )}

      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {data?.invites.map((i) => (
          <div key={i.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-ink">
                Pending Invite <span className="text-xs text-muted">({i.role})</span>
              </p>
              <p className="text-xs text-muted">
                {i.email || "No email"} · {i.client_name || "All clients"}
              </p>
            </div>
            <button
              onClick={async () => {
                await api(`/admin/invites/${i.id}`, { method: "DELETE" });
                reload();
              }}
              className="text-xs text-crit hover:underline"
            >
              Revoke
            </button>
          </div>
        ))}
        {data?.users.map((u) => (
          <div key={u.id} className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium text-ink">
                {u.name} <span className="text-xs text-muted">({u.role})</span>
              </p>
              <p className="text-xs text-muted">
                {u.email} · {u.client_name || "All clients"}
              </p>
            </div>
            <button
              onClick={async () => {
                if (confirm(`Delete user ${u.name}?`)) {
                  try {
                    await api(`/admin/users/${u.id}`, { method: "DELETE" });
                    reload();
                  } catch (e: any) {
                    alert(e.message);
                  }
                }
              }}
              className="text-xs text-crit hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        {data?.users.length === 0 && data?.invites.length === 0 && (
          <div className="p-4 text-center text-sm text-muted">No users or invites.</div>
        )}
      </div>
    </div>
  );
}

function MetaTokenSection() {
  const { data, loading, reload } = useApi<{ configured: boolean; source?: string; ok?: boolean; error?: string }>("/admin/token/status");
  const [token, setToken] = useState("");

  if (loading) return <CardSkeleton />;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    try {
      await api("/admin/token", { method: "POST", body: { token } });
      setToken("");
      reload();
      alert("Token saved successfully!");
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="space-y-4">
      <SectionTitle>Meta API Token</SectionTitle>
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-ink">System User Access Token</p>
            <p className="text-xs text-muted">Required to fetch data from the Meta Marketing API.</p>
          </div>
          <div>
            {data?.configured ? (
              <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${data.ok ? "bg-good/15 text-good" : "bg-crit/15 text-crit"}`}>
                {data.ok ? "Valid" : "Invalid"}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-warn/15 px-2 py-1 text-xs font-medium text-warn">
                Not Configured
              </span>
            )}
          </div>
        </div>

        {data?.error && (
          <div className="mb-4 rounded border border-crit/30 bg-crit/5 p-3 text-sm text-crit">
            {data.error}
          </div>
        )}

        <form onSubmit={handleSave} className="flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste new token here..."
            className="flex-1 rounded-lg border border-border2 bg-bg px-3 py-1.5 text-sm outline-none focus:border-ink2"
          />
          <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-sm font-medium text-bg hover:opacity-90">
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

export function AdminSettings() {
  const clients = useApi<{ clients: any[] }>("/admin/clients");
  return (
    <div className="mx-auto max-w-4xl space-y-10 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-muted">Manage agency clients, ad accounts, and team access.</p>
      </div>

      <ClientsSection state={clients} />
      <AdAccountsSection clientsData={clients.data} reloadClients={clients.reload} />
      <UsersSection clientsData={clients.data} />
      <MetaTokenSection />
    </div>
  );
}
