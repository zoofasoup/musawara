// Agency overview: client cards (this month's performance + sparkline + alert count),
// global alert feed, sync health strip.

import { PageHeader } from "../components/PageHeader";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { fmtDateTime, fmtNum, fmtRp, hoursSince } from "../lib/format";
import { AlertFeed, type Alert } from "../components/AlertFeed";
import { ClientAvatar } from "../components/Layout";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle, Sparkline } from "../components/ui";

type Overview = {
  range: { from: string; to: string };
  clients: Array<{
    id: number;
    name: string;
    logo_url: string | null;
    brand_color: string;
    totals: { spend: number; leads: number; purchases: number; cpl: number | null; cpa: number | null };
    spark: Array<{ date: string; spend: number }>;
    target_cpa: number | null;
    unacknowledged_alerts: number;
  }>;
  alerts: Alert[];
  syncHealth: Array<{
    id: number;
    account_name: string | null;
    client_name: string;
    last_success: string | null;
    last_status: string | null;
    last_error: string | null;
  }>;
};

/** Cost per purchase against the client's target: green on target, amber up to 20% over, red beyond. */
function CpaChip({ cpa, target }: { cpa: number | null; target: number | null }) {
  if (cpa == null) return <span className="rounded-md bg-muted/15 px-1.5 py-0.5 text-xs font-medium text-muted">CPA –</span>;
  let cls = "bg-muted/15 text-ink2";
  if (target && target > 0) {
    const ratio = cpa / target;
    cls = ratio <= 1 ? "bg-good/15 text-good" : ratio <= 1.2 ? "bg-warn/15 text-warn" : "bg-crit/15 text-crit";
  }
  return (
    <span className={`tnum rounded-md px-1.5 py-0.5 text-xs font-medium ${cls}`} title={target ? `Target ${fmtRp(target)}` : "No target set"}>
      CPA {fmtRp(cpa)}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className="truncate text-base font-semibold text-ink">{value}</p>
    </div>
  );
}

export function AdminHome() {
  const { data, error, loading, reload } = useApi<Overview>("/admin/overview");

  if (loading)
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} lines={4} />
        ))}
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const d = data!;

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" subtitle="How each client's ads are doing this month, and what needs attention." />
      {/* sync health strip */}
      <div className="flex flex-wrap items-center gap-2">
        {d.syncHealth.map((s) => {
          const stale = (hoursSince(s.last_success) ?? 99) > 26;
          const failed = s.last_status === "failed";
          return (
            <span
              key={s.id}
              title={failed && s.last_error ? s.last_error : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                failed
                  ? "border-crit/40 bg-crit/10 text-crit"
                  : stale
                    ? "border-warn/40 bg-warn/10 text-warn"
                    : "border-border bg-surface text-ink2"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${failed ? "bg-crit" : stale ? "bg-warn" : "bg-good"}`} />
              {s.client_name} · {s.account_name ?? "account"} · {s.last_success ? fmtDateTime(s.last_success) : "never synced"}
              {failed ? " · last sync FAILED" : ""}
            </span>
          );
        })}
        {d.syncHealth.length === 0 && <span className="text-xs text-muted">No ad accounts connected yet.</span>}
      </div>

      {/* client cards */}
      <div>
        <SectionTitle>Clients · this month</SectionTitle>
        {d.clients.length === 0 ? (
          <EmptyState title="No clients yet" hint="Add your first client in Settings." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.clients.map((c) => {
              const empty = c.totals.spend === 0 && c.totals.leads === 0 && c.totals.purchases === 0;
              return (
                <Link
                  key={c.id}
                  to={`/c/${c.id}`}
                  className="press group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border2 hover:bg-surface2"
                  style={{ ["--accent" as any]: c.brand_color }}
                >
                  <div className="flex items-center gap-2.5">
                    <ClientAvatar name={c.name} logoUrl={c.logo_url} color={c.brand_color} />
                    <span className="mr-auto truncate text-sm font-semibold text-ink">{c.name}</span>
                    {c.unacknowledged_alerts > 0 && (
                      <span className="rounded-full bg-crit/15 px-2 py-0.5 text-xs font-bold text-crit">{c.unacknowledged_alerts} ⚠</span>
                    )}
                    {empty && <span className="text-xs text-muted">No data yet</span>}
                  </div>
                  {!empty && (
                    <>
                      <div className="tnum mt-3 grid grid-cols-[1.6fr_1fr_1fr] gap-2">
                        <Stat label="Spend" value={fmtRp(c.totals.spend)} />
                        <Stat label="Leads" value={fmtNum(c.totals.leads)} />
                        <Stat label="Purchases" value={fmtNum(c.totals.purchases)} />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <CpaChip cpa={c.totals.cpa} target={c.target_cpa} />
                        <span className="tnum text-xs text-muted">{c.totals.cpl != null ? `CPL ${fmtRp(c.totals.cpl)}` : ""}</span>
                      </div>
                      <div className="mt-2">
                        <Sparkline points={c.spark.map((p) => p.spend)} color={c.brand_color} />
                      </div>
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* global alert feed */}
      <div className="max-w-3xl">
        <SectionTitle>Latest alerts · all clients</SectionTitle>
        <AlertFeed
          alerts={d.alerts}
          showClient
          onAck={async (id) => {
            await api(`/admin/alerts/${id}/ack`, { method: "POST", body: {} });
            reload();
          }}
        />
      </div>
    </div>
  );
}
