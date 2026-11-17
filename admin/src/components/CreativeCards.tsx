// Creative cards: thumbnail, a verdict against the client's own ads, and the metrics
// that tell a creative's story (cost per lead, link CTR, hook and hold rate, frequency).

import { fmtNum, fmtPct, fmtRp } from "../lib/format";
import { StatusBadge } from "./ui";

export type Creative = {
  entity_id: string;
  name: string | null;
  thumbnail_url: string | null;
  status: string | null;
  effective_status: string | null;
  spend: number;
  impressions: number;
  leads: number;
  cpl: number | null;
  link_ctr: number | null;
  cost_per_link_click: number | null;
  frequency: number | null;
  hook_rate: number | null;
  hold_rate: number | null;
  avg_watch_s: number | null;
  days_active: number;
  quality: string | null;
  engagement: string | null;
  conversion: string | null;
  verdict: "winner" | "ok" | "weak" | "fatigued" | "low_data";
};

const VERDICT: Record<Creative["verdict"], { text: string; cls: string } | null> = {
  winner: { text: "Winner", cls: "bg-good text-white" },
  fatigued: { text: "Fatigued", cls: "bg-crit text-white" },
  weak: { text: "Weak", cls: "bg-warn text-white" },
  low_data: { text: "Low data", cls: "bg-ink/70 text-white" },
  ok: null,
};

const RANK_TEXT: Record<string, string> = { BELOW_AVERAGE_10: "bottom 10%", BELOW_AVERAGE_20: "bottom 20%", BELOW_AVERAGE_35: "bottom 35%" };

function Stat({ label, value, tone }: { label: string; value: string; tone?: "crit" | "good" }) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className={`font-medium ${tone === "crit" ? "text-crit" : tone === "good" ? "text-good" : "text-ink"}`}>{value}</dd>
    </div>
  );
}

export function CreativeCard({ ad }: { ad: Creative }) {
  const v = VERDICT[ad.verdict];
  const isVideo = ad.hook_rate != null;
  const flagged = [
    ["Quality", ad.quality],
    ["Engagement", ad.engagement],
    ["Conversion", ad.conversion],
  ].filter(([, r]) => r && RANK_TEXT[r as string]) as Array<[string, string]>;
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
      <div className="relative aspect-square bg-surface2">
        {ad.thumbnail_url ? (
          <img src={ad.thumbnail_url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">No preview</div>
        )}
        {v && <span className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 text-xs font-semibold ${v.cls}`}>{v.text}</span>}
      </div>
      <div className="p-2.5">
        <div className="mb-2 flex items-start justify-between gap-1.5">
          <p className="truncate text-xs font-medium text-ink" title={ad.name ?? ad.entity_id}>{ad.name ?? ad.entity_id}</p>
          <StatusBadge status={ad.effective_status ?? ad.status} />
        </div>
        <dl className="tnum grid grid-cols-2 gap-x-2 gap-y-1.5 text-xs">
          <Stat label="Cost / Lead" value={fmtRp(ad.cpl)} />
          <Stat label="Spend" value={fmtRp(ad.spend)} />
          <Stat label="Leads" value={fmtNum(ad.leads)} />
          <Stat label="Link CTR" value={fmtPct(ad.link_ctr)} />
          {isVideo && <Stat label="Hook rate" value={fmtPct(ad.hook_rate, 1)} />}
          {isVideo && <Stat label="Hold rate" value={fmtPct(ad.hold_rate, 1)} />}
          <Stat label="Frequency" value={fmtNum(ad.frequency, 1)} tone={ad.verdict === "fatigued" ? "crit" : undefined} />
          <Stat label="Running" value={`${fmtNum(ad.days_active)} d`} />
        </dl>
        {flagged.length > 0 && (
          <p className="mt-2 text-xs text-crit">
            {flagged.map(([k, r]) => `${k} ${RANK_TEXT[r]}`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

export function CreativeGrid({ ads }: { ads: Creative[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {ads.map((ad) => <CreativeCard key={ad.entity_id} ad={ad} />)}
    </div>
  );
}
