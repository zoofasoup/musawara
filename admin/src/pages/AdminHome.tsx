// Agency overview: client cards (7-day performance + sparkline + alert count),
// global alert feed, sync health strip.

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
    totals: { spend: number; results: number; cpr: number | null };
    spark: Array<{ date: string; spend: number }>;
    cpr_target: number | null;
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

function CprChip({ cpr, target }: { cpr: number | null; target: number | null }) {
  if (cpr == null) return <span className="rounded-md bg-muted/15 px-1.5 py-0.5 text-[11px] font-semibold text-muted">CPR –</span>;
  let cls = "bg-muted/15 text-ink2";
  if (target && target > 0) {
    const ratio = cpr / target;
    cls = ratio <= 1 ? "bg-good/15 text-good" : ratio <= 1.2 ? "bg-warn/15 text-warn" : "bg-crit/15 text-crit";
  }
  return (
    <span className={`tnum rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${cls}`} title={target ? `Target ${fmtRp(target)}` : "No target set"}>
      CPR {fmtRp(cpr)}
    </span>
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
      {/* sync health strip */}
      <div className="flex flex-wrap items-center gap-2">
        {d.syncHealth.map((s) => {
          const stale = (hoursSince(s.last_success) ?? 99) > 26;
          const failed = s.last_status === "failed";
          return (
            <span
              key={s.id}
              title={failed && s.last_error ? s.last_error : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
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
        <SectionTitle>Clients · last 7 days</SectionTitle>
        {d.clients.length === 0 ? (
          <EmptyState title="No clients yet" hint="Add your first client in Settings." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.clients.map((c) => (
              <Link
                key={c.id}
                to={`/c/${c.id}`}
                className="group rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border2 hover:bg-surface2"
                style={{ ["--accent" as any]: c.brand_color }}
              >
                <div className="mb-3 flex items-center gap-2.5">
                  <ClientAvatar name={c.name} logoUrl={c.logo_url} color={c.brand_color} />
                  <span className="mr-auto truncate text-sm font-semibold text-ink">{c.name}</span>
                  {c.unacknowledged_alerts > 0 && (
                    <span className="rounded-full bg-crit/15 px-2 py-0.5 text-[11px] font-bold text-crit">
                      {c.unacknowledged_alerts} ⚠
                    </span>
                  )}
                </div>
                <div className="tnum mb-2 flex items-baseline justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted">Spend</p>
                    <p className="text-base font-semibold text-ink">{fmtRp(c.totals.spend)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted">Results</p>
                    <p className="text-base font-semibold text-ink">{fmtNum(c.totals.results)}</p>
                  </div>
                  <CprChip cpr={c.totals.cpr} target={c.cpr_target} />
                </div>
                <Sparkline points={c.spark.map((p) => p.spend)} color={c.brand_color} />
              </Link>
            ))}
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
