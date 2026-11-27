// Campaign table in the Ads Manager layout: delivery, budget, spend, leads,
// cost per lead, link clicks, CPC, CTR, frequency, plus a totals row.
// Drill down campaigns → ad sets → ads (thumbnails); children load lazily.
// Collapses to cards on mobile.

import { Input } from "@/components/ui/input";
import { Segmented } from "./Segmented";
import { Fragment, useMemo, useState } from "react";
import { useApi } from "../lib/api";
import { fmtNum, fmtPct, fmtRp } from "../lib/format";
import { CardSkeleton, Delta, ErrorState, Skeleton, StatusBadge } from "./ui";
import { Empty } from "./kit";

export type Entity = {
  entity_id: string;
  name: string | null;
  level: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  thumbnail_url: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  reach: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
  previous: { spend: number; leads: number; cpl: number | null; ctr: number | null };
};

type SortKey = "name" | "spend" | "leads" | "cpl" | "link_clicks" | "cpc" | "ctr" | "frequency";

const cpcOf = (e: { spend: number; link_clicks: number }) => (e.link_clicks > 0 ? e.spend / e.link_clicks : null);

function sortValue(e: Entity, key: SortKey): number | string | null {
  if (key === "name") return String(e.name ?? "");
  if (key === "cpc") return cpcOf(e);
  return e[key] as number | null;
}

function sortEntities(rows: Entity[], key: SortKey, dir: 1 | -1): Entity[] {
  const lowerBetter = key === "cpl" || key === "cpc";
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key), bv = sortValue(b, key);
    if (key === "name") return dir * String(av).localeCompare(String(bv));
    const x = av == null ? (lowerBetter ? Infinity : -Infinity) : Number(av);
    const y = bv == null ? (lowerBetter ? Infinity : -Infinity) : Number(bv);
    return dir * (x - y);
  });
}

const NEXT_LEVEL: Record<string, "adset" | "ad" | null> = { campaign: "adset", adset: "ad", ad: null };
const COLS = 9;

function budgetText(e: Entity, level: string): string {
  if (e.daily_budget) return `${fmtRp(e.daily_budget)} / day`;
  if (e.lifetime_budget) return `${fmtRp(e.lifetime_budget)} lifetime`;
  return level === "campaign" ? "Ad set budget" : "–";
}

function MetricCells({ e, level }: { e: Entity; level: string }) {
  const cpc = cpcOf(e);
  return (
    <>
      <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-[12px] text-ink2 xl:table-cell">{budgetText(e, level)}</td>
      <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink">{fmtRp(e.spend)}</td>
      <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink">{fmtNum(e.leads)}</td>
      <td className="tnum whitespace-nowrap px-3 py-2.5 text-right">
        <span className="text-ink">{fmtRp(e.cpl)}</span>
        <Delta current={e.cpl} previous={e.previous.cpl} direction="lower-better" className="ml-1.5" />
      </td>
      <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink2 lg:table-cell">{fmtNum(e.link_clicks)}</td>
      <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink2 lg:table-cell">{fmtRp(cpc)}</td>
      <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink2 lg:table-cell">{fmtPct(e.ctr)}</td>
      <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink2 lg:table-cell">{fmtNum(e.frequency, 1)}</td>
    </>
  );
}

function EntityRows({
  clientId,
  level,
  parentId,
  query,
  depth,
  sortKey,
  sortDir,
}: {
  clientId: number;
  level: "adset" | "ad";
  parentId: string;
  query: string;
  depth: number;
  sortKey: SortKey;
  sortDir: 1 | -1;
}) {
  const { data, error, loading, reload } = useApi<{ entities: Entity[] }>(
    `/clients/${clientId}/entities?level=${level}&parent_id=${encodeURIComponent(parentId)}&${query}`
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <tr>
        <td colSpan={COLS} className="px-3 py-2" style={{ paddingLeft: depth * 24 + 12 }}>
          <Skeleton className="h-4 w-1/2" />
        </td>
      </tr>
    );
  }
  if (error) {
    return (
      <tr>
        <td colSpan={COLS} className="px-3 py-2 text-xs text-crit">
          Failed to load: {error}{" "}
          <button className="underline" onClick={reload}>
            retry
          </button>
        </td>
      </tr>
    );
  }
  const rows = sortEntities(data?.entities ?? [], sortKey, sortDir);
  if (rows.length === 0) {
    return (
      <tr>
        <td colSpan={COLS} className="px-3 py-2 text-xs text-muted" style={{ paddingLeft: depth * 24 + 12 }}>
          No delivery in this period.
        </td>
      </tr>
    );
  }
  return (
    <>
      {rows.map((e) => {
        const next = NEXT_LEVEL[level];
        const isOpen = expanded.has(e.entity_id);
        return (
          <Fragment key={e.entity_id}>
            <tr className="border-t border-border/60 bg-surface2/40 hover:bg-surface2">
              <td className="px-3 py-2.5" style={{ paddingLeft: depth * 24 + 12 }}>
                <div className="flex items-center gap-2">
                  {next ? (
                    <button
                      onClick={() =>
                        setExpanded((s) => {
                          const nextSet = new Set(s);
                          nextSet.has(e.entity_id) ? nextSet.delete(e.entity_id) : nextSet.add(e.entity_id);
                          return nextSet;
                        })
                      }
                      className="w-4 shrink-0 text-muted hover:text-ink"
                      aria-label={isOpen ? "Collapse" : "Expand"}
                    >
                      {isOpen ? "▾" : "▸"}
                    </button>
                  ) : e.thumbnail_url ? (
                    <img src={e.thumbnail_url} alt="" className="h-8 w-8 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="w-4" />
                  )}
                  <span className="truncate text-[13px] text-ink" title={e.name ?? e.entity_id}>
                    {e.name ?? e.entity_id}
                  </span>
                </div>
              </td>
              <td className="hidden px-3 py-2.5 md:table-cell">
                <StatusBadge status={e.effective_status ?? e.status} />
              </td>
              <MetricCells e={e} level={level} />
            </tr>
            {isOpen && next && (
              <EntityRows
                clientId={clientId}
                level={next}
                parentId={e.entity_id}
                query={query}
                depth={depth + 1}
                sortKey={sortKey}
                sortDir={sortDir}
              />
            )}
          </Fragment>
        );
      })}
    </>
  );
}

type Show = "all" | "active" | "off";

export function EntityTable({ clientId, from, to, compare, bare }: { clientId: number; from: string; to: string; compare?: { from: string; to: string } | null; bare?: boolean }) {
  const query = `from=${from}&to=${to}${compare ? `&compFrom=${compare.from}&compTo=${compare.to}` : ""}`;
  const { data, error, loading, reload } = useApi<{ entities: Entity[] }>(
    `/clients/${clientId}/entities?level=campaign&${query}`
  );
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [show, setShow] = useState<Show>("all");
  const [search, setSearch] = useState("");

  const all = data?.entities ?? [];
  const campaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = all.filter((e) => {
      const active = (e.effective_status ?? e.status) === "ACTIVE";
      if (show === "active" && !active) return false;
      if (show === "off" && active) return false;
      return !q || (e.name ?? "").toLowerCase().includes(q);
    });
    return sortEntities(rows, sortKey, sortDir);
  }, [all, show, search, sortKey, sortDir]);

  const total = useMemo(() => {
    const t = campaigns.reduce(
      (a, e) => ({
        spend: a.spend + e.spend,
        impressions: a.impressions + e.impressions,
        clicks: a.clicks + e.clicks,
        link_clicks: a.link_clicks + e.link_clicks,
        leads: a.leads + e.leads,
      }),
      { spend: 0, impressions: 0, clicks: 0, link_clicks: 0, leads: 0 }
    );
    return {
      ...t,
      cpl: t.leads > 0 ? t.spend / t.leads : null,
      cpc: t.link_clicks > 0 ? t.spend / t.link_clicks : null,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : null,
    };
  }, [campaigns]);

  if (loading) return <CardSkeleton lines={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (all.length === 0)
    return <Empty title="No campaign activity in this period" hint="Data appears after the first sync." />;

  const activeCount = all.filter((e) => (e.effective_status ?? e.status) === "ACTIVE").length;
  const chips: Array<{ k: Show; l: string; n: number }> = [
    { k: "all", l: "All", n: all.length },
    { k: "active", l: "Active", n: activeCount },
    { k: "off", l: "Off", n: all.length - activeCount },
  ];

  const header = (key: SortKey, label: string, extraClass = "") => (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-right text-xs font-medium text-muted hover:text-ink2 ${extraClass}`}
      onClick={() => {
        if (sortKey === key) setSortDir((d) => (d === 1 ? -1 : 1));
        else {
          setSortKey(key);
          setSortDir(key === "name" ? 1 : -1);
        }
      }}
    >
      {label} {sortKey === key ? (sortDir === -1 ? "↓" : "↑") : ""}
    </th>
  );

  return (
    <div className={bare ? "overflow-hidden rounded-2xl border border-border/70 bg-surface shadow-[var(--shadow-soft)]" : "overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]"}>
      {/* filters, like the Ads Manager tabs + search */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 p-3">
        <Segmented label="Delivery filter" value={show} onChange={setShow} options={chips.map((c) => ({ value: c.k, label: c.l, badge: c.n }))} />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          aria-label="Search campaigns"
          className="min-h-11 min-w-0 flex-1 rounded-full border border-border2 bg-surface px-3 text-xs text-ink placeholder:text-muted lg:min-h-8 sm:max-w-[16rem]"
        />
      </div>

      {campaigns.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted">No campaigns match this filter.</p>
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="bg-surface2">
                  <th
                    className="cursor-pointer select-none px-3 py-2 text-left text-xs font-medium text-muted hover:text-ink2"
                    onClick={() => {
                      if (sortKey === "name") setSortDir((d) => (d === 1 ? -1 : 1));
                      else {
                        setSortKey("name");
                        setSortDir(1);
                      }
                    }}
                  >
                    Campaign {sortKey === "name" ? (sortDir === -1 ? "↓" : "↑") : ""}
                  </th>
                  <th className="hidden px-3 py-2 text-left text-xs font-medium text-muted md:table-cell">
                    Delivery
                  </th>
                  <th className="hidden px-3 py-2 text-right text-xs font-medium text-muted xl:table-cell">Budget</th>
                  {header("spend", "Spend")}
                  {header("leads", "Leads")}
                  {header("cpl", "Cost / Lead · Δ")}
                  {header("link_clicks", "Link clicks", "hidden lg:table-cell")}
                  {header("cpc", "CPC", "hidden lg:table-cell")}
                  {header("ctr", "CTR", "hidden lg:table-cell")}
                  {header("frequency", "Freq", "hidden lg:table-cell")}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const isOpen = expanded.has(c.entity_id);
                  return (
                    <Fragment key={c.entity_id}>
                      <tr className="border-t border-border/70 hover:bg-surface2/50">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                setExpanded((s) => {
                                  const next = new Set(s);
                                  next.has(c.entity_id) ? next.delete(c.entity_id) : next.add(c.entity_id);
                                  return next;
                                })
                              }
                              className="w-4 shrink-0 text-muted hover:text-ink"
                              aria-label={isOpen ? "Collapse" : "Expand"}
                            >
                              {isOpen ? "▾" : "▸"}
                            </button>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-ink" title={c.name ?? c.entity_id}>
                                {c.name ?? c.entity_id}
                              </p>
                              {c.objective && (
                                <p className="text-xs uppercase tracking-wide text-muted">
                                  {c.objective.replace(/^OUTCOME_/, "")}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-3 py-2.5 md:table-cell">
                          <StatusBadge status={c.effective_status ?? c.status} />
                        </td>
                        <MetricCells e={c} level="campaign" />
                      </tr>
                      {isOpen && (
                        <EntityRows
                          clientId={clientId}
                          level="adset"
                          parentId={c.entity_id}
                          query={query}
                          depth={1}
                          sortKey={sortKey}
                          sortDir={sortDir}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border/70 bg-surface2 text-[13px] font-medium">
                  <td className="px-3 py-2.5 text-ink" colSpan={2}>
                    Results from {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}
                  </td>
                  <td className="hidden xl:table-cell" />
                  <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink">{fmtRp(total.spend)}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink">{fmtNum(total.leads)}</td>
                  <td className="tnum whitespace-nowrap px-3 py-2.5 text-right text-ink">{fmtRp(total.cpl)}</td>
                  <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink lg:table-cell">{fmtNum(total.link_clicks)}</td>
                  <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink lg:table-cell">{fmtRp(total.cpc)}</td>
                  <td className="tnum hidden whitespace-nowrap px-3 py-2.5 text-right text-ink lg:table-cell">{fmtPct(total.ctr)}</td>
                  <td className="hidden lg:table-cell" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* mobile cards */}
          <div className="divide-y divide-border sm:hidden">
            {campaigns.map((c) => (
              <div key={c.entity_id} className="p-3">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-ink">{c.name ?? c.entity_id}</p>
                  <StatusBadge status={c.effective_status ?? c.status} />
                </div>
                <div className="tnum grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted">Spend</p>
                    <p className="text-ink">{fmtRp(c.spend)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Leads</p>
                    <p className="text-ink">{fmtNum(c.leads)}</p>
                  </div>
                  <div>
                    <p className="text-muted">Cost / Lead</p>
                    <p className="text-ink">
                      {fmtRp(c.cpl)} <Delta current={c.cpl} previous={c.previous.cpl} direction="lower-better" />
                    </p>
                  </div>
                </div>
                <p className="tnum mt-1.5 text-xs text-muted">
                  {budgetText(c, "campaign")} · {fmtNum(c.link_clicks)} link clicks · CPC {fmtRp(cpcOf(c))}
                </p>
              </div>
            ))}
            <div className="tnum bg-surface2/60 p-3 text-xs font-medium text-ink">
              Results from {campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}: {fmtRp(total.spend)} spend, {fmtNum(total.leads)} leads, {fmtRp(total.cpl)} per lead
            </div>
          </div>
        </>
      )}
    </div>
  );
}
