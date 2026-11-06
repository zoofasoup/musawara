// Campaign table with drill-down: campaigns → ad sets → ads (thumbnails).
// Sortable columns; children fetched lazily on expand. Collapses to cards on mobile.

import { Fragment, useMemo, useState } from "react";
import { useApi } from "../lib/api";
import { fmtNum, fmtPct, fmtRp } from "../lib/format";
import { CardSkeleton, Delta, EmptyState, ErrorState, Skeleton, StatusBadge } from "./ui";

export type Entity = {
  entity_id: string;
  name: string | null;
  level: string;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  thumbnail_url: string | null;
  spend: number;
  leads: number;
  cpl: number | null;
  ctr: number | null;
  frequency: number | null;
  previous: { spend: number; leads: number; cpl: number | null; ctr: number | null };
};

type SortKey = "name" | "spend" | "leads" | "cpl" | "ctr" | "frequency";

function sortEntities(rows: Entity[], key: SortKey, dir: 1 | -1): Entity[] {
  return [...rows].sort((a, b) => {
    if (key === "name") return dir * String(a.name ?? "").localeCompare(String(b.name ?? ""));
    const av = a[key] ?? (key === "cpl" ? Infinity : -Infinity);
    const bv = b[key] ?? (key === "cpl" ? Infinity : -Infinity);
    return dir * (Number(av) - Number(bv));
  });
}

const NEXT_LEVEL: Record<string, "adset" | "ad" | null> = { campaign: "adset", adset: "ad", ad: null };

function MetricCells({ e }: { e: Entity }) {
  return (
    <>
      <td className="tnum px-3 py-2.5 text-right text-ink">{fmtRp(e.spend)}</td>
      <td className="tnum px-3 py-2.5 text-right text-ink">{fmtNum(e.leads)}</td>
      <td className="tnum px-3 py-2.5 text-right">
        <span className="text-ink">{fmtRp(e.cpl)}</span>
        <Delta current={e.cpl} previous={e.previous.cpl} direction="lower-better" className="ml-1.5" />
      </td>
      <td className="tnum hidden px-3 py-2.5 text-right text-ink2 lg:table-cell">{fmtPct(e.ctr)}</td>
      <td className="tnum hidden px-3 py-2.5 text-right text-ink2 lg:table-cell">{fmtNum(e.frequency, 1)}</td>
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
        <td colSpan={6} className="px-3 py-2" style={{ paddingLeft: depth * 24 + 12 }}>
          <Skeleton className="h-4 w-1/2" />
        </td>
      </tr>
    );
  }
  if (error) {
    return (
      <tr>
        <td colSpan={6} className="px-3 py-2 text-xs text-crit">
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
        <td colSpan={6} className="px-3 py-2 text-xs text-muted" style={{ paddingLeft: depth * 24 + 12 }}>
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
              <MetricCells e={e} />
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

export function EntityTable({ clientId, from, to }: { clientId: number; from: string; to: string }) {
  const query = `from=${from}&to=${to}`;
  const { data, error, loading, reload } = useApi<{ entities: Entity[] }>(
    `/clients/${clientId}/entities?level=campaign&${query}`
  );
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const campaigns = useMemo(() => sortEntities(data?.entities ?? [], sortKey, sortDir), [data, sortKey, sortDir]);

  if (loading) return <CardSkeleton lines={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (campaigns.length === 0)
    return <EmptyState title="No campaign activity in this period" hint="Data appears after the first sync." />;

  const header = (key: SortKey, label: string, extraClass = "") => (
    <th
      className={`cursor-pointer select-none px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink2 ${extraClass}`}
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
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {/* desktop table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="bg-surface2/60">
              <th
                className="cursor-pointer select-none px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink2"
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
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-muted md:table-cell">
                Status
              </th>
              {header("spend", "Spend")}
              {header("leads", "Leads")}
              {header("cpl", "Cost / Lead · Δ")}
              {header("ctr", "CTR", "hidden lg:table-cell")}
              {header("frequency", "Freq", "hidden lg:table-cell")}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const isOpen = expanded.has(c.entity_id);
              return (
                <Fragment key={c.entity_id}>
                  <tr className="border-t border-border hover:bg-surface2/60">
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
                            <p className="text-[10px] uppercase tracking-wide text-muted">
                              {c.objective.replace(/^OUTCOME_/, "")}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <StatusBadge status={c.effective_status ?? c.status} />
                    </td>
                    <MetricCells e={c} />
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
          </div>
        ))}
      </div>
    </div>
  );
}
