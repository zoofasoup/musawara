// A client's Overview. A brand that sells through marketplaces gets the per-platform view (PlatformOverview); everyone else, and the
// read-only share link, gets the Meta view with every number (MetaSections).

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { onAccent } from "../lib/color";
import { fmtDateTime, hoursSince } from "../lib/format";
import { useSharedRange } from "../lib/range";
import { useAuth } from "../context/AuthContext";
import { Callout } from "../components/Callout";
import type { Alert } from "../components/AlertFeed";
import { ClientAvatar } from "../components/Layout";
import { MetaSections, type Meta } from "../components/MetaSections";
import { PlatformOverview } from "../components/PlatformOverview";
import { RangeBar } from "../components/RangeBar";
import { CardSkeleton, ErrorState } from "../components/ui";
import { Btn, useNotify } from "../components/kit";

function StaleBanner({ accounts }: { accounts: Meta["accounts"] }) {
  const stale = accounts.filter((a) => {
    const h = hoursSince(a.last_sync);
    return a.last_sync_status === "failed" || h == null || h > 26;
  });
  if (accounts.length === 0 || stale.length === 0) return null;
  const oldest = stale[0];
  return (
    <Callout tone="warn" className="mb-4">
      Data may be stale: {oldest.account_name ?? "an account"} {oldest.last_sync ? `last synced ${fmtDateTime(oldest.last_sync)}` : "has not synced yet"}
      {oldest.last_sync_status === "failed" ? " and the last sync failed" : ""}.
    </Callout>
  );
}

export function ClientDashboard({ clientId, share = false }: { clientId: number; share?: boolean }) {
  const { user } = useAuth();
  const period = useSharedRange();
  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const alerts = useApi<{ alerts: Alert[] }>(`/clients/${clientId}/alerts`);
  // client users see how many approvals are waiting for them (the API refuses everyone else)
  const pendingApprovals = useApi<{ requests: unknown[] }>(!share && user?.role === "client" ? `/approvals/${clientId}/requests?status=pending` : null);

  // "Sync now" (admins only): pulls this client's Meta ads data. It runs in the background on the
  // server; give it a moment, then reload every panel (the campaign table remounts via syncTick).
  const { notify, node } = useNotify();
  const [syncing, setSyncing] = useState(false);
  const [syncTick, setSyncTick] = useState(0);
  async function syncNow() {
    setSyncing(true);
    try {
      const r = await api<{ ads: boolean; sheet: boolean; orders: boolean }>(`/admin/clients/${clientId}/sync`, { method: "POST", body: {} });
      const what = [r.ads && "ads", r.sheet && "the Google Sheet", r.orders && "Jubelio orders"].filter(Boolean).join(", ");
      notify(`Sync started for ${what}. Numbers refresh in a moment.`);
      setTimeout(() => {
        meta.reload();
        alerts.reload();
        setSyncTick((t) => t + 1);
        setSyncing(false);
      }, 20_000);
    } catch (e: any) {
      notify(e.message ?? "Could not start the sync", "err");
      setSyncing(false);
    }
  }

  const accent = meta.data?.client.brand_color ?? "#7a2de3";
  const lastSync = meta.data?.accounts.map((a) => a.last_sync).filter(Boolean).sort().at(-1) ?? null;

  if (meta.error) return <ErrorState message={meta.error} onRetry={meta.reload} />;

  return (
    <div style={{ ["--accent" as any]: accent, ["--on-accent" as any]: onAccent(accent) }}>
      {node}
      {/* header: the signed-in pages get it from ClientFrame; the public share link has no frame */}
      {share && (
        <div className="mb-3 flex items-center gap-3">
          {meta.data ? (
            <>
              <ClientAvatar name={meta.data.client.name} logoUrl={meta.data.client.logo_url} color={accent} size={10} />
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold leading-tight text-ink">{meta.data.client.name}</h1>
                <p className="tnum text-xs text-muted">
                  {lastSync ? `Updated ${fmtDateTime(lastSync)}` : "Not synced yet"}
                  {" · "}
                  {meta.data.accounts.length} {meta.data.accounts.length === 1 ? "account" : "accounts"}
                </p>
              </div>
            </>
          ) : (
            <div className="h-10 w-48 skeleton" />
          )}
        </div>
      )}

      {/* toolbar: secondary pages on the left, date range on the right */}
      <div className="mb-4 flex flex-col-reverse gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-2">
        <div className="grid grid-cols-2 gap-2 md:flex [&>*]:w-full md:[&>*]:w-auto">
          {!share && user?.role === "admin" && (
            <Btn icon="refresh" loading={syncing} onClick={syncNow}>
              {syncing ? "Syncing…" : "Sync now"}
            </Btn>
          )}
          {!share && (
            <Link to={`/c/${clientId}/report`} className="inline-flex min-h-11 items-center rounded-full border border-border2 bg-surface px-4 text-xs font-medium text-ink hover:bg-surface2 lg:min-h-9">
              Report
            </Link>
          )}
        </div>
        <RangeBar value={period} />
      </div>

      {meta.data && <StaleBanner accounts={meta.data.accounts} />}

      {!share && (alerts.data?.alerts.filter((a) => !a.acknowledged).length ?? 0) > 0 && (
        <Callout tone="crit" to={`/c/${clientId}/alerts`} className="mb-4">
          {(() => { const n = alerts.data!.alerts.filter((a) => !a.acknowledged).length; return n === 1 ? "1 open alert, review it" : `${n} open alerts, review them`; })()}
        </Callout>
      )}

      {(pendingApprovals.data?.requests.length ?? 0) > 0 && (
        <Callout tone="accent" to={`/c/${clientId}/approvals`} className="mb-4">
          {pendingApprovals.data!.requests.length === 1 ? "1 item is" : `${pendingApprovals.data!.requests.length} items are`} waiting for your approval.
        </Callout>
      )}

      {share ? (
        <MetaSections clientId={clientId} period={period} share />
      ) : !meta.data ? (
        <CardSkeleton lines={6} />
      ) : !meta.data.marketplace ? (
        <MetaSections key={syncTick} clientId={clientId} period={period} full />
      ) : (
        <PlatformOverview clientId={clientId} period={period} targetCpa={meta.data?.client.target_cpa ?? null} reloadKey={syncTick} />
      )}
    </div>
  );
}
