// Frame around every page of one client: who it is, when it was last synced, and the client's menu bar
// (overview, creatives, alerts, approvals, report, brand knowledge, assets, onboarding).
// Pages inside it render underneath and keep their own content only.

import { NavLink, Outlet, useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { ClientAvatar } from "./Layout";
import type { Alert } from "./AlertFeed";

type Meta = {
  client: { id: number; name: string; logo_url: string | null; brand_color: string };
  accounts: Array<{ last_sync: string | null }>;
};

export function ClientFrame() {
  const clientId = Number(useParams().id);
  const { user } = useAuth();
  const admin = user?.role === "admin";
  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const alerts = useApi<{ alerts: Alert[] }>(`/clients/${clientId}/alerts`);
  const pending = useApi<{ requests: unknown[] }>(user?.role === "client" ? `/approvals/${clientId}/requests?status=pending` : null);

  const open = alerts.data?.alerts.filter((a) => !a.acknowledged).length ?? 0;
  const tabs: Array<{ to: string; label: string; end?: boolean; badge?: number; tone?: "crit" | "accent" }> = [
    { to: `/c/${clientId}`, label: "Overview", end: true },
    { to: `/c/${clientId}/creatives`, label: "Creatives" },
    { to: `/c/${clientId}/alerts`, label: "Alerts", badge: open, tone: "crit" },
    { to: `/c/${clientId}/approvals`, label: "Approvals", badge: pending.data?.requests.length, tone: "accent" },
    { to: `/c/${clientId}/report`, label: "Report" },
    { to: `/c/${clientId}/brand`, label: "Brand knowledge" },
    ...(admin ? [{ to: `/c/${clientId}/assets`, label: "Assets" }, { to: `/c/${clientId}/onboarding`, label: "Onboarding" }] : []),
  ];
  const lastSync = meta.data?.accounts.map((a) => a.last_sync).filter(Boolean).sort().at(-1) ?? null;
  const accent = meta.data?.client.brand_color ?? "var(--accent)";

  return (
    <div style={{ ["--accent" as any]: accent }}>
      <div className="mb-3 flex items-center gap-3">
        {meta.data ? (
          <>
            <ClientAvatar name={meta.data.client.name} logoUrl={meta.data.client.logo_url} color={accent} size={10} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-ink">{meta.data.client.name}</h1>
              <p className="tnum text-xs text-muted">
                {lastSync ? `Updated ${fmtDateTime(lastSync)}` : "Not synced yet"} · {meta.data.accounts.length} {meta.data.accounts.length === 1 ? "account" : "accounts"}
              </p>
            </div>
          </>
        ) : (
          <div className="h-10 w-48 skeleton" />
        )}
      </div>

      <nav aria-label="Client menu" className="mb-5 overflow-x-auto pb-1">
        <div className="inline-flex min-w-max gap-0.5 rounded-full bg-surface3 p-0.5">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-medium lg:min-h-9 ${isActive ? "bg-surface text-ink shadow-sm" : "text-ink2 hover:text-ink"}`
              }
            >
              {t.label}
              {!!t.badge && (
                <span className={`tnum rounded-full px-1.5 text-[11px] font-semibold ${t.tone === "crit" ? "bg-crit/12 text-crit" : "bg-[color-mix(in_srgb,var(--accent)_14%,white)] text-musawara-ink"}`}>{t.badge}</span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      <Outlet />
    </div>
  );
}
