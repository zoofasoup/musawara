// Admin settings: a setup checklist in dependency order (Meta token, clients,
// ad accounts, team) with a status strip on top that doubles as navigation.

import { useApi } from "../lib/api";
import { Icon, type IconName } from "../components/icons";
import { AccountsSection, accountHealth } from "./settings/AccountsSection";
import { ClientsSection } from "./settings/ClientsSection";
import { MetaSection, type TokenStatus } from "./settings/MetaSection";
import { TeamSection } from "./settings/TeamSection";
import { useNotify, type Tone } from "../components/kit";

const TILE_TONE: Record<Tone, string> = {
  good: "bg-good/12 text-good",
  warn: "bg-warn/12 text-warn",
  crit: "bg-crit/10 text-crit",
  neutral: "bg-surface3 text-ink2",
  accent: "bg-surface3 text-ink2",
};

function Tile({ href, icon, label, value, sub, tone }: { href: string; icon: IconName; label: string; value: string; sub: string; tone: Tone }) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        document.querySelector(href)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      }}
      className="group flex min-h-11 items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:border-border2 hover:bg-surface2"
    >
      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TILE_TONE[tone]}`}>
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium uppercase tracking-wider text-muted">{label}</span>
        <span className="block truncate text-sm font-medium text-ink">{value}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
    </a>
  );
}

export function AdminSettings() {
  const clients = useApi<{ clients: any[] }>("/admin/clients");
  const accounts = useApi<{ accounts: any[] }>("/admin/accounts");
  const team = useApi<{ users: any[]; invites: any[] }>("/admin/users");
  const token = useApi<TokenStatus>("/admin/token/status");
  const { notify, node } = useNotify();

  const clientList = clients.data?.clients ?? [];
  const accountList = accounts.data?.accounts ?? [];
  const tokenOk = Boolean(token.data?.configured && token.data.ok);
  const needAttention = accountList.filter((a) => accountHealth(a).key !== "ok").length;

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-muted">Set up in order: connect Meta, add clients, link their ad accounts, then invite people.</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          href="#meta"
          icon="key"
          label="Meta"
          value={token.loading ? "Checking…" : tokenOk ? "Connected" : token.data?.configured ? "Token rejected" : "Not connected"}
          sub={tokenOk ? "One token for all Meta" : "Needs a token"}
          tone={token.loading ? "neutral" : tokenOk ? "good" : token.data?.configured ? "crit" : "warn"}
        />
        <Tile href="#clients" icon="building" label="Clients" value={String(clientList.length)} sub={clientList.length ? "with own dashboards" : "None yet"} tone={clientList.length ? "good" : "neutral"} />
        <Tile
          href="#accounts"
          icon="chart"
          label="Ad accounts"
          value={String(accountList.length)}
          sub={accountList.length === 0 ? "None connected" : needAttention ? `${needAttention} need attention` : "All up to date"}
          tone={accountList.length === 0 ? "neutral" : needAttention ? "warn" : "good"}
        />
        <Tile href="#team" icon="users" label="Team" value={String(team.data?.users.length ?? 0)} sub={team.data?.invites.length ? `${team.data.invites.length} pending invite${team.data.invites.length === 1 ? "" : "s"}` : "people with access"} tone="neutral" />
      </div>

      <div className="space-y-10">
        <MetaSection state={token} notify={notify} />
        <ClientsSection state={clients} notify={notify} />
        <AccountsSection accounts={accounts} clients={clientList} tokenOk={tokenOk} reloadClients={clients.reload} notify={notify} />
        <TeamSection state={team} clients={clientList} notify={notify} />
      </div>
      {node}
    </div>
  );
}
