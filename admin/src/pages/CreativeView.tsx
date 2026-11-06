// Creative view: ad grid sorted by CPR ascending (winners first),
// frequency > 3.5 badged as "Fatigued".

import { useMemo, useState } from "react";
import { useApi } from "../lib/api";
import { presetByKey, type DateRange } from "../lib/dates";
import { fmtNum, fmtPct, fmtRp } from "../lib/format";
import { DateRangePicker } from "../components/DateRangePicker";
import type { Entity } from "../components/EntityTable";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle, StatusBadge } from "../components/ui";

const FATIGUE_FREQUENCY = 3.5;

type SortMode = "cpr" | "spend" | "ctr";

export function CreativeView({ clientId }: { clientId: number }) {
  const [range, setRange] = useState<DateRange>(presetByKey("7d"));
  const [sort, setSort] = useState<SortMode>("cpr");
  const { data, error, loading, reload } = useApi<{ ads: Entity[] }>(
    `/clients/${clientId}/creatives?from=${range.from}&to=${range.to}`
  );

  const ads = useMemo(() => {
    const list = [...(data?.ads ?? [])];
    if (sort === "cpr") list.sort((a, b) => (a.cpr ?? Infinity) - (b.cpr ?? Infinity));
    if (sort === "spend") list.sort((a, b) => b.spend - a.spend);
    if (sort === "ctr") list.sort((a, b) => (b.ctr ?? -1) - (a.ctr ?? -1));
    return list;
  }, [data, sort]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Creatives</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      <SectionTitle
        right={
          <div className="flex items-center gap-1 rounded-lg bg-surface2 p-0.5">
            {(
              [
                ["cpr", "Best CPR"],
                ["spend", "Spend"],
                ["ctr", "CTR"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`rounded-md px-2 py-1 text-xs font-medium ${sort === key ? "bg-surface3 text-ink" : "text-muted hover:text-ink2"}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        Ads ({ads.length})
      </SectionTitle>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <CardSkeleton key={i} lines={4} />
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : ads.length === 0 ? (
        <EmptyState title="No ads with delivery in this period" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {ads.map((ad) => {
            const fatigued = (ad.frequency ?? 0) > FATIGUE_FREQUENCY;
            return (
              <div key={ad.entity_id} className="overflow-hidden rounded-xl border border-border bg-surface">
                <div className="relative aspect-square bg-surface2">
                  {ad.thumbnail_url ? (
                    <img src={ad.thumbnail_url} alt={ad.name ?? ""} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-3xl opacity-30">🖼️</div>
                  )}
                  {fatigued && (
                    <span className="absolute left-2 top-2 rounded-md bg-crit/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Fatigued
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <div className="mb-1.5 flex items-start justify-between gap-1.5">
                    <p className="truncate text-xs font-medium text-ink" title={ad.name ?? ad.entity_id}>
                      {ad.name ?? ad.entity_id}
                    </p>
                    <StatusBadge status={ad.effective_status ?? ad.status} />
                  </div>
                  <dl className="tnum grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                    <div>
                      <dt className="text-muted">CPR</dt>
                      <dd className="font-semibold text-ink">{fmtRp(ad.cpr)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Spend</dt>
                      <dd className="text-ink2">{fmtRp(ad.spend)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Results</dt>
                      <dd className="text-ink2">{fmtNum(ad.results)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">CTR</dt>
                      <dd className="text-ink2">{fmtPct(ad.ctr)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Freq</dt>
                      <dd className={fatigued ? "font-semibold text-crit" : "text-ink2"}>{fmtNum(ad.frequency, 1)}</dd>
                    </div>
                  </dl>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
