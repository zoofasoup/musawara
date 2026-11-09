// Creative view: every ad with delivery in the range, with the metrics that matter and a
// verdict against the client's own ads. Sort by what you are judging.

import { useMemo, useState } from "react";
import { useApi } from "../lib/api";
import { presetByKey, type DateRange } from "../lib/dates";
import { DateRangePicker } from "../components/DateRangePicker";
import { CreativeGrid, type Creative } from "../components/CreativeCards";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";

const SORTS: Record<string, [string, (a: Creative, b: Creative) => number]> = {
  cpl: ["Best cost / lead", (a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity)],
  spend: ["Spend", (a, b) => b.spend - a.spend],
  hook: ["Hook rate", (a, b) => (b.hook_rate ?? -1) - (a.hook_rate ?? -1)],
  hold: ["Hold rate", (a, b) => (b.hold_rate ?? -1) - (a.hold_rate ?? -1)],
  ctr: ["Link CTR", (a, b) => (b.link_ctr ?? -1) - (a.link_ctr ?? -1)],
};

export function CreativeView({ clientId }: { clientId: number }) {
  const [range, setRange] = useState<DateRange>(presetByKey("30d"));
  const [sort, setSort] = useState("cpl");
  const { data, error, loading, reload } = useApi<{ ads: Creative[] }>(`/clients/${clientId}/creatives?from=${range.from}&to=${range.to}`);
  const ads = useMemo(() => [...(data?.ads ?? [])].sort(SORTS[sort][1]), [data, sort]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Creatives</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      <SectionTitle
        right={
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by" className="min-h-11 rounded-lg border border-border2 bg-bg px-2 text-xs text-ink">
            {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        }
      >
        Ads ({ads.length})
      </SectionTitle>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} lines={4} />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : ads.length === 0 ? (
        <EmptyState title="No ads with delivery in this period" />
      ) : (
        <CreativeGrid ads={ads} />
      )}
    </div>
  );
}
