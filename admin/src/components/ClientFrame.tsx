// Frame around every page of one client: who it is, when it was last synced, and the client's menu bar.
// The bar lists what the client HAS: Sales for the team, Organic only when an Instagram account is tracked,
// Shopee only when a shop is connected. Working material (approvals, assets, brand, onboarding) sits under "More".
// Pages inside it render underneath and keep their own content only.

import { Suspense } from "react";
import { TONE } from "../lib/tone";
import { NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { ClientScopeOverride } from "../context/ClientScope";
import { ClientAvatar } from "./Layout";
import type { Alert } from "./AlertFeed";
import { CardSkeleton } from "./ui";
import { Icon } from "./icons";
import { useT } from "../context/LangContext";
import { useCan } from "../lib/can";
import { PillNav, pillTabCls } from "./PillNav";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Meta = {
  client: { id: number; name: string; logo_url: string | null; brand_color: string };
  accounts: Array<{ last_sync: string | null }>;
};
type Tab = { to: string; label: string; end?: boolean; badge?: number; tone?: "crit" | "accent" };

function Badge({ tab }: { tab: Tab }) {
  if (!tab.badge) return null;
  return <span className={`tnum rounded-full px-1.5 text-[11px] font-semibold ${tab.tone === "crit" ? TONE.crit.soft : TONE.accent.soft}`}>{tab.badge}</span>;
}

export function ClientFrame() {
  const tr = useT();
  const clientId = Number(useParams().id);
  const { user } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const admin = user?.role === "admin";
  const can = useCan();
  // Each call is made only when this role may use it; the Worker would refuse it otherwise.
  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const alerts = useApi<{ alerts: Alert[] }>(!admin || can("ads") ? `/clients/${clientId}/alerts` : null);
  const pending = useApi<{ requests: unknown[] }>(user?.role === "client" ? `/approvals/${clientId}/requests?status=pending` : null);
  // what this client actually has (team only)
  const organic = useApi<{ accounts: Array<{ client_id: number }> }>(can("content") ? "/admin/organic" : null);
  const shopee = useApi<{ connected: boolean }>(can("sales") ? `/shopee/status?client_id=${clientId}` : null);

  const open = alerts.data?.alerts.filter((a) => !a.acknowledged).length ?? 0;
  const base = `/c/${clientId}`;
  const approvals: Tab = { to: `${base}/approvals`, label: "Approvals", badge: pending.data?.requests.length, tone: "accent" };
  const brand: Tab = { to: `${base}/brand`, label: "Brand knowledge" };
  const hasOrganic = can("content") && !!organic.data?.accounts.some((a) => a.client_id === clientId);
  const hasShopee = can("sales") && !!shopee.data?.connected;
  const tabs: Tab[] = [
    ...(!admin || can("ads") ? [{ to: base, label: "Overview", end: true }, { to: `${base}/creatives`, label: "Ads" }] : []),
    ...(can("sales") ? [{ to: `${base}/sales`, label: "Sales" }] : []),
    ...(hasOrganic ? [{ to: `${base}/organic`, label: "Organic" }] : []),
    ...(hasShopee ? [{ to: `${base}/shopee`, label: "Shopee" }] : []),
    ...(!admin || can("ads") ? [{ to: `${base}/alerts`, label: "Alerts", badge: open, tone: "crit" as const }] : []),
  ];
  // A source this client has not connected yet has no tab of its own; its setup page is reached from here.
  const more: Tab[] = admin
    ? [
        ...(can("approvals") ? [approvals] : []),
        ...(can("content") ? [{ to: `${base}/assets`, label: "Assets" }] : []),
        brand,
        ...(can("settings") ? [{ to: `${base}/onboarding`, label: "Onboarding" }] : []),
        ...(can("content") && !hasOrganic && organic.data ? [{ to: `${base}/organic`, label: "Connect Instagram" }] : []),
        ...(can("sales") && !hasShopee && shopee.data ? [{ to: `${base}/shopee`, label: "Connect Shopee" }] : []),
      ]
    : [];
  const moreOn = more.find((t) => pathname === t.to || pathname.startsWith(t.to + "/"));

  // Client logins already have their own top menu (Layout), so for them this frame is only the scope.
  const lastSync = meta.data?.accounts.map((a) => a.last_sync).filter(Boolean).sort().at(-1) ?? null;
  const accent = meta.data?.client.brand_color ?? "var(--accent)";

  if (!admin) {
    return (
      <ClientScopeOverride clientId={clientId}>
        <Suspense fallback={<CardSkeleton lines={4} />}>
          <Outlet />
        </Suspense>
      </ClientScopeOverride>
    );
  }

  return (
    <ClientScopeOverride clientId={clientId}>
      <div style={{ ["--accent" as any]: accent }}>
        <div className="mb-3 flex items-center gap-3">
          {meta.data ? (
            <>
              <ClientAvatar name={meta.data.client.name} logoUrl={meta.data.client.logo_url} color={accent} size={10} />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold leading-tight text-ink">{meta.data.client.name}</h1>
                <p className="tnum text-xs text-muted">
                  {lastSync ? `${tr("Updated")} ${fmtDateTime(lastSync)}` : tr("Not synced yet")} · {meta.data.accounts.length} {tr(meta.data.accounts.length === 1 ? "account" : "accounts")}
                </p>
              </div>
            </>
          ) : (
            <div className="h-10 w-48 skeleton" />
          )}
        </div>

        <PillNav label="Client menu" className="mb-2">
            {tabs.map((t) => (
              <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => pillTabCls(isActive)}>
                {tr(t.label)}
                <Badge tab={t} />
              </NavLink>
            ))}
            {more.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger className={pillTabCls(!!moreOn)} data-active={!!moreOn} aria-label={tr("More")}>
                  {tr(moreOn ? moreOn.label : "More")}
                  <Icon name="chevronDown" className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {more.map((t) => (
                    <DropdownMenuItem key={t.to} onClick={() => navigate(t.to)} className={pathname === t.to ? "font-medium" : ""}>
                      {tr(t.label)}
                      <span className="ml-auto"><Badge tab={t} /></span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
        </PillNav>

        {/* its own boundary: a page that is still loading must not take the header and menu bar down with it */}
        <div key={pathname} className="swap-in">
          <Suspense fallback={<CardSkeleton lines={4} />}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </ClientScopeOverride>
  );
}
