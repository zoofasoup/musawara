// Agency overview, laid out as a bento grid: key totals, spend per day, how many clients are on
// their CPA target, a client table, spend share, then alerts and sync health.

import { useMemo, useState } from "react";
import { Segmented } from "../components/Segmented";
import { Link, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { api, useApi } from "../lib/api";
import { fmtDateTime, fmtNum, fmtRp, hoursSince } from "../lib/format";
import { AlertFeed, type Alert } from "../components/AlertFeed";
import { ClientAvatar } from "../components/Layout";
import { StatTile } from "../components/StatTile";
import { Input } from "@/components/ui/input";
import { DataTable } from "../components/DataTable";
import { Bento, Pill, Empty } from "../components/kit";
import { HatchBars, SegmentGauge, TickBar } from "../components/OverviewWidgets";
import { CardSkeleton, ErrorState } from "../components/ui";

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
  if (cpa == null) return <span className="text-xs text-muted">–</span>;
  const ratio = target && target > 0 ? cpa / target : null;
  const tone = ratio == null ? "neutral" : ratio <= 1 ? "good" : ratio <= 1.2 ? "warn" : "crit";
  return (
    <span title={target ? `Target ${fmtRp(target)}` : "No target set"}>
      <Pill tone={tone} size="sm" dot={false}><span className="tnum">{fmtRp(cpa)}</span></Pill>
    </span>
  );
}

type Row = Overview["clients"][number];
const onTarget = (c: Row) => c.target_cpa != null && c.target_cpa > 0 && c.totals.cpa != null && c.totals.cpa <= c.target_cpa;
const hasTarget = (c: Row) => c.target_cpa != null && c.target_cpa > 0 && c.totals.cpa != null;

export function AdminHome() {
  const { data, error, loading, reload } = useApi<Overview>("/admin/overview");
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [only, setOnly] = useState<"all" | "attention">("all");

  const d = data;
  const m = useMemo(() => {
    const clients = d?.clients ?? [];
    const spend = clients.reduce((a, c) => a + c.totals.spend, 0);
    const leads = clients.reduce((a, c) => a + c.totals.leads, 0);
    const purchases = clients.reduce((a, c) => a + c.totals.purchases, 0);
    const alerts = clients.reduce((a, c) => a + c.unacknowledged_alerts, 0);
    const byDate = new Map<string, number>();
    for (const c of clients) for (const p of c.spark) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.spend);
    const days = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, value]) => ({ date, value }));
    const peak = days.reduce<{ date: string; value: number } | null>((p, x) => (!p || x.value > p.value ? x : p), null);
    const targeted = clients.filter(hasTarget);
    const good = targeted.filter(onTarget).length;
    const attention = clients.filter((c) => c.unacknowledged_alerts > 0 || (hasTarget(c) && !onTarget(c)));
    const share = [...clients].filter((c) => c.totals.spend > 0).sort((a, b) => b.totals.spend - a.totals.spend);
    return { clients, spend, leads, purchases, alerts, days, peak, targeted, good, attention, share };
  }, [d]);

  if (loading)
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} lines={3} />
        ))}
      </div>
    );
  if (error || !d) return <ErrorState message={error ?? "No data"} onRetry={reload} />;

  const q = search.trim().toLowerCase();
  const rows = m.clients.filter((c) => (only === "all" || m.attention.includes(c)) && (!q || c.name.toLowerCase().includes(q)));
  const pctOf = (c: Row) => (m.spend ? (c.totals.spend / m.spend) * 100 : 0);
  const top = m.share.slice(0, 3);
  const dense = fmtRp(m.spend).length > 10 || fmtNum(m.leads).length > 8;
  const palette = ["var(--color-chart-1)", "var(--color-chart-4)", "var(--color-chart-2)"];

  return (
    <div>
      <PageHeader title="Overview" subtitle="How each client's ads are doing this month, and what needs attention." />

      {m.clients.length === 0 ? (
        <Empty title="No clients yet" hint="Add your first client in Settings." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-12">
          {/* four key totals */}
          <div className="grid grid-cols-2 gap-4 xl:col-span-5">
            <StatTile dense={dense} label="Total spend" icon="spend" value={fmtRp(m.spend)}>{`across ${m.clients.length} client${m.clients.length === 1 ? "" : "s"}`}</StatTile>
            <StatTile dense={dense} label="Leads" icon="users" value={fmtNum(m.leads)}>{m.leads > 0 ? `avg ${fmtRp(m.spend / m.leads)} per lead` : "no leads yet"}</StatTile>
            <StatTile dense={dense} label="Purchases" icon="chart" value={fmtNum(m.purchases)}>{m.purchases > 0 ? `avg ${fmtRp(m.spend / m.purchases)} per purchase` : "no purchases yet"}</StatTile>
            <StatTile dense={dense} label="Open alerts" icon="alert" value={fmtNum(m.alerts)}>{m.alerts ? `${m.clients.filter((c) => c.unacknowledged_alerts > 0).length} client(s) affected` : "all clear"}</StatTile>
          </div>

          {/* spend per day */}
          <Bento
            title="Spend overview"
            subtitle="All clients, this month"
            className="xl:col-span-4"
            right={m.peak && <span className="tnum shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,white)] px-2.5 py-1 text-xs font-medium text-musawara-ink">Peak {fmtRp(m.peak.value)}</span>}
          >
            <p className="tnum mb-3 text-2xl font-semibold text-ink">{fmtRp(m.spend)}</p>
            {m.days.length === 0 ? <p className="py-10 text-center text-xs text-muted">Numbers appear after the first sync.</p> : <HatchBars days={m.days} />}
          </Bento>

          {/* clients on target */}
          <Bento title="On target" subtitle="Clients at or under their CPA target" className="xl:col-span-3">
            {m.targeted.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted">Set a CPA target on a client to see this.</p>
            ) : (
              <>
                <SegmentGauge value={(m.good / m.targeted.length) * 100} label={`${m.good} of ${m.targeted.length} clients`} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-surface2 p-3">
                    <p className="text-xs text-muted">Need attention</p>
                    <p className="tnum mt-1 text-lg font-semibold text-ink">{m.attention.length}</p>
                  </div>
                  <div className="rounded-2xl bg-surface2 p-3">
                    <p className="text-xs text-muted">No target</p>
                    <p className="tnum mt-1 text-lg font-semibold text-ink">{m.clients.length - m.targeted.length}</p>
                  </div>
                </div>
              </>
            )}
          </Bento>

          {/* client table */}
          <Bento className="xl:col-span-8">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Clients</h2>
                <p className="mt-0.5 text-xs text-muted">This month, tap a row to open the dashboard</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  aria-label="Search clients"
                  className="min-h-11 w-36 rounded-full px-4 text-xs lg:min-h-9"
                />
                <Segmented label="Client filter" value={only} onChange={setOnly} options={[{ value: "all", label: "All" }, { value: "attention", label: "Needs attention", badge: m.attention.length }]} />
              </div>
            </header>
            <DataTable
              rows={rows}
              getKey={(c) => c.id}
              onRowClick={(c) => nav(`/c/${c.id}`)}
              empty="No clients match."
              columns={[
                {
                  key: "client",
                  header: "Client",
                  cell: (c) => (
                    <Link to={`/c/${c.id}`} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2.5 font-medium text-ink">
                      <ClientAvatar name={c.name} logoUrl={c.logo_url} color={c.brand_color} />
                      <span className="truncate">{c.name}</span>
                      {c.unacknowledged_alerts > 0 && <span className="shrink-0" title="Open alerts"><Pill tone="crit" size="sm" dot={false}>{c.unacknowledged_alerts}</Pill></span>}
                    </Link>
                  ),
                },
                { key: "spend", header: "Spend", numeric: true, cell: (c) => (c.totals.spend ? fmtRp(c.totals.spend) : "–") },
                { key: "leads", header: "Leads", numeric: true, hideBelow: "md", cell: (c) => (c.totals.leads ? fmtNum(c.totals.leads) : "–") },
                { key: "purchases", header: "Purchases", numeric: true, hideBelow: "md", cell: (c) => (c.totals.purchases ? fmtNum(c.totals.purchases) : "–") },
                { key: "cpa", header: "CPA", className: "whitespace-nowrap", cell: (c) => <CpaChip cpa={c.totals.cpa} target={c.target_cpa} /> },
              ]}
            />
          </Bento>

          {/* spend share */}
          <Bento title="Spend share" subtitle="Of this month's total" className="xl:col-span-4">
            {top.length === 0 ? (
              <p className="py-10 text-center text-xs text-muted">Numbers appear after the first sync.</p>
            ) : (
              <>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${top.length}, minmax(0, 1fr))` }}>
                  {top.map((c, i) => (
                    <div key={c.id} className="min-w-0">
                      <p className="truncate text-xs text-ink2" title={c.name}><span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: palette[i] }} />{c.name}</p>
                      <p className="tnum mt-1 text-xl font-semibold text-ink">{pctOf(c).toFixed(pctOf(c) < 10 ? 1 : 0)}%</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-4" style={{ gridTemplateColumns: `repeat(${top.length}, minmax(0, 1fr))` }}>
                  {top.map((c, i) => <TickBar key={c.id} pct={pctOf(c)} color={palette[i]} />)}
                </div>
                <table className="mt-5 w-full text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr><th className="pb-2 font-medium">Client</th><th className="pb-2 text-right font-medium">Share</th><th className="pb-2 text-right font-medium">Spend</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {m.share.slice(0, 5).map((c) => (
                      <tr key={c.id}>
                        <td className="max-w-[8rem] truncate py-2.5 text-ink">{c.name}</td>
                        <td className="tnum py-2.5 text-right text-ink2">{pctOf(c).toFixed(0)}%</td>
                        <td className="tnum py-2.5 text-right text-ink">{fmtRp(c.totals.spend)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </Bento>

          {/* alerts + sync health */}
          <Bento title="Latest alerts" subtitle="All clients" className="xl:col-span-8">
            <AlertFeed
              alerts={d.alerts}
              showClient
              inCard
              onAck={async (id) => {
                await api(`/admin/alerts/${id}/ack`, { method: "POST", body: {} });
                reload();
              }}
            />
          </Bento>
          <Bento title="Sync health" subtitle="Last successful sync per ad account" className="xl:col-span-4">
            {d.syncHealth.length === 0 ? (
              <p className="text-xs text-muted">No ad accounts connected yet.</p>
            ) : (
              <ul className="divide-y divide-border/70">
                {d.syncHealth.map((s) => {
                  const stale = (hoursSince(s.last_success) ?? 99) > 26;
                  const failed = s.last_status === "failed";
                  return (
                    <li key={s.id} title={failed && s.last_error ? s.last_error : undefined} className="flex items-start gap-2.5 py-2.5 text-sm">
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${failed ? "bg-crit" : stale ? "bg-warn" : "bg-good"}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{s.client_name} · {s.account_name ?? "account"}</span>
                        <span className={`block text-xs ${failed ? "text-crit" : stale ? "text-warn" : "text-muted"}`}>
                          {s.last_success ? fmtDateTime(s.last_success) : "never synced"}{failed ? " · last sync failed" : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Bento>
        </div>
      )}
    </div>
  );
}
