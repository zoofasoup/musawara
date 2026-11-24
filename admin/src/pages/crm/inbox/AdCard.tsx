// The ad that brought this person to WhatsApp (Click-to-WhatsApp), shown at the top of the first conversation. WhatsApp tells the
// gateway the Meta ad id plus its headline and a small picture; the platform adds our own ad, ad set and campaign names and the
// full creative picture when that ad is one of this brand's synced ads.
import { ExternalLink, Megaphone } from "lucide-react";
import { useApi } from "../../../lib/api";
import { statusTone, TONE } from "../../../lib/tone";
import { fmtClock, fmtDayLabel, type ThreadAd } from "./util";

type Known = { found: boolean; ad?: string | null; status?: string | null; thumbnail_url?: string | null; adset?: string | null; campaign?: string | null };

export function AdCard({ ad, account }: { ad: ThreadAd; account: number | null }) {
  const known = useApi<Known>(ad.source_id && account ? `/crm-ads?account=${account}&id=${ad.source_id}` : null, { key: String(account) });
  const mine = known.data?.found ? known.data : null;
  const picture = mine?.thumbnail_url || ad.thumbnail;
  const title = mine?.ad || ad.title || "Ad";
  const trail = mine ? [mine.campaign, mine.adset].filter(Boolean).join(" › ") : "";
  const link = ad.source_url && /^https?:\/\//i.test(ad.source_url) ? ad.source_url : null;
  return (
    <section aria-label="Ad this contact came from" className="mx-auto flex max-w-md gap-3 rounded-2xl bg-surface p-2.5 shadow-[var(--shadow-soft)]">
      {picture ? (
        <img src={picture} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-surface3 text-muted"><Megaphone className="h-6 w-6" aria-hidden /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          <Megaphone className="h-3.5 w-3.5" aria-hidden />Came from an ad
          {mine?.status && <span className={`rounded-lg px-1.5 py-0.5 text-[11px] normal-case tracking-normal ${TONE[statusTone(mine.status)].soft}`}>{mine.status.toLowerCase()}</span>}
        </p>
        <p className="mt-0.5 truncate text-sm font-semibold text-ink">{title}</p>
        {trail && <p className="truncate text-xs text-ink2">{trail}</p>}
        {ad.title && mine && ad.title !== mine.ad && <p className="truncate text-xs text-ink2">"{ad.title}"</p>}
        {ad.body && <p className="mt-0.5 line-clamp-2 text-xs text-ink2">{ad.body}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted">
          <span>{fmtDayLabel(ad.ts)}, {fmtClock(ad.ts)}</span>
          {link && <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center gap-1 text-ink2 underline">Open ad <ExternalLink className="h-3 w-3" aria-hidden /></a>}
        </p>
      </div>
    </section>
  );
}
