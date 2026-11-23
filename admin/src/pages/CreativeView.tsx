// Creative view: every ad with delivery in the range, with the metrics that matter and a
// verdict against the client's own ads. Sort by what you are judging.

import { NativeSelect } from "@/components/ui/native-select";
import { useMemo, useState } from "react";
import { useApi } from "../lib/api";
import { presetByKey, type DateRange } from "../lib/dates";
import { DateRangePicker } from "../components/DateRangePicker";
import { CreativeGrid, type Creative } from "../components/CreativeCards";
import { CardSkeleton, ErrorState, SectionTitle } from "../components/ui";
import { Bento, Empty } from "../components/kit";
import { CreativeQuadrant } from "../components/CreativeQuadrant";
import { useAuth } from "../context/AuthContext";

const SORTS: Record<string, [string, (a: Creative, b: Creative) => number]> = {
  cpl: ["Best cost / lead", (a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity)],
  spend: ["Spend", (a, b) => b.spend - a.spend],
  hook: ["Hook rate", (a, b) => (b.hook_rate ?? -1) - (a.hook_rate ?? -1)],
  hold: ["Hold rate", (a, b) => (b.hold_rate ?? -1) - (a.hold_rate ?? -1)],
  // Meta's upload time is not stored; the first day an ad spent is the closest honest signal, and it is what shows new content first.
  recent: ["Recently launched", (a, b) => (b.first_date ?? "").localeCompare(a.first_date ?? "") || b.spend - a.spend],
  ctr: ["Link CTR", (a, b) => (b.link_ctr ?? -1) - (a.link_ctr ?? -1)],
};

export function CreativeView({ clientId }: { clientId: number }) {
  const [range, setRange] = useState<DateRange>(presetByKey("month"));
  const [sort, setSort] = useState("cpl");
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<{ ads: Creative[] }>(`/clients/${clientId}/creatives?from=${range.from}&to=${range.to}`);
  const ads = useMemo(() => [...(data?.ads ?? [])].sort(SORTS[sort][1]), [data, sort]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Creatives</h1>
        <DateRangePicker value={range} onChange={setRange} />
      </div>
      {user?.role === "admin" && !loading && !error && (data?.ads.length ?? 0) >= 3 && (
        <Bento title="Winners and boncos" subtitle="Spend across, cost per lead up. Tap a dot to jump to its card." className="mb-6">
          <CreativeQuadrant
            ads={data!.ads}
            onSelect={(id) => {
              const el = document.getElementById(`creative-${id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
              el?.classList.add("ring-2", "ring-[var(--accent)]");
              window.setTimeout(() => el?.classList.remove("ring-2", "ring-[var(--accent)]"), 1600);
            }}
          />
        </Bento>
      )}
      <SectionTitle
        right={
          <NativeSelect size="sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
            {Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        }
      >
        Ads ({ads.length})
      </SectionTitle>
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} lines={4} />)}</div>
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : ads.length === 0 ? (
        <Empty title="No ads with delivery in this period" />
      ) : (
        <CreativeGrid ads={ads} />
      )}
    </div>
  );
}
