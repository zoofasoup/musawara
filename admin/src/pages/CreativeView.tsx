// The Ads page: everything for a media buying decision in one period. Meta numbers, trend and campaigns (MetaSections), then every
// ad with delivery and a verdict against the client's own ads, then the Shopee and TikTok totals (their reports have no campaigns).

import { NativeSelect } from "@/components/ui/native-select";
import { useMemo, useState } from "react";
import { useApi } from "../lib/api";
import { fmtNum, fmtRp } from "../lib/format";
import { useSharedRange } from "../lib/range";
import { MetaSections, type Meta } from "../components/MetaSections";
import { PLATFORM_NAME, totalsOf, type Platforms } from "../components/PlatformOverview";
import { RangeBar } from "../components/RangeBar";
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
  const period = useSharedRange();
  const { range } = period;
  const [sort, setSort] = useState("cpl");
  const { user } = useAuth();
  const { data, error, loading, reload } = useApi<{ ads: Creative[] }>(`/clients/${clientId}/creatives?from=${range.from}&to=${range.to}`);
  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const platforms = useApi<Platforms>(meta.data?.marketplace ? `/clients/${clientId}/platforms?from=${range.from}&to=${range.to}` : null);
  const ads = useMemo(() => [...(data?.ads ?? [])].sort(SORTS[sort][1]), [data, sort]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
        <h1 className="text-lg font-semibold text-ink">Ads</h1>
        <RangeBar value={period} />
      </div>
      <MetaSections clientId={clientId} period={period}>
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
      </MetaSections>
      {platforms.data && (
        <Bento title="Shopee and TikTok ads" subtitle="What each platform reports for its own ads. Campaign detail is not stored." className="mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr>{["Platform", "Ad spend", "Sales from its ads", "Purchases", "ROAS", "CPA"].map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-muted ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {(["shopee", "tiktok"] as const).map((key) => {
                  const t = totalsOf(platforms.data!, key);
                  const cells = [PLATFORM_NAME[key], t.spend ? fmtRp(t.spend) : "–", t.sales ? fmtRp(t.sales) : "–", t.count ? fmtNum(t.count) : "–", t.roas == null ? "–" : `${fmtNum(t.roas, 2)}x`, fmtRp(t.cpa)];
                  return <tr key={key} className="border-t border-border">{cells.map((v, i) => <td key={i} className={`whitespace-nowrap px-3 py-2 text-ink ${i ? "tnum text-right" : "font-medium"}`}>{v}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
          {platforms.data.estimated.length > 0 && <p className="mt-3 text-xs text-muted">Monthly totals are spread evenly per day, so parts of a month are estimates.</p>}
        </Bento>
      )}
    </div>
  );
}
