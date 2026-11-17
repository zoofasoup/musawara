// The client report, one component for the signed-in surfaces and the share link:
// header and period, then the sections that have data (ads, organic, sales), each opened by a
// plain-language sentence computed on the server from the same numbers. Printable to PDF.

import { useEffect, useState } from "react";
import { useApi } from "../../lib/api";
import { presetByKey, type DateRange } from "../../lib/dates";
import { fmtCompact, fmtDay, fmtDayFull, fmtNum, fmtPct, fmtRp } from "../../lib/format";
import { onAccent } from "../../lib/color";
import { DateRangePicker } from "../DateRangePicker";
import { KpiCard } from "../KpiCard";
import { ClientAvatar } from "../Layout";
import { CardSkeleton, ErrorState } from "../ui";
import { Btn, Empty } from "../kit";
import { BarList, Card, MetricStrip, ReportSection, SubTitle, Thumb } from "./ReportSection";
import { ReportTrend } from "./ReportTrend";
import type { ReportDoc } from "../../../worker/lib/report";

type Dir = "higher-better" | "lower-better" | "neutral";
type Ranked = NonNullable<ReportDoc["campaigns"]>["items"][number];

const FORMAT_NAME: Record<string, string> = { reel: "Reel", carousel: "Carousel", image: "Photo", video: "Video" };
const STATUS_NAME: Record<string, string> = { dp: "Down payment", paid: "Paid in full", unknown: "Status not set" };
const x = (v: number | null | undefined) => (v != null ? `${fmtNum(v, 1)}x` : "–");

/** Hides the app chrome and tidies the page when the report is printed or saved as PDF. */
function PrintStyles() {
  return (
    <style>{`
      @media print {
        @page { size: A4; margin: 12mm; }
        html, body { background: #fff !important; }
        header.sticky, nav[aria-label="Main"] { display: none !important; }
        body main { padding: 0 !important; max-width: none !important; }
        .report-card { break-inside: avoid; box-shadow: none !important; }
        .report-keep, .report-section > h2 { break-after: avoid; }
        .report-page { font-size: 12px; }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      }
    `}</style>
  );
}

function Strip({ items, compare, cols }: { items: Array<{ label: string; value: string; cur: number | null; prev: number | null; dir: Dir; prevText?: string }>; compare: boolean; cols?: string }) {
  return (
    <MetricStrip cols={cols}>
      {items.map((k) => (
        <KpiCard key={k.label} flat label={k.label} value={k.value} current={k.cur} previous={k.prev} direction={k.dir} previousText={k.prevText} compare={compare} />
      ))}
    </MetricStrip>
  );
}

function AdsBlock({ doc }: { doc: ReportDoc }) {
  const ads = doc.ads!;
  const { current: c, previous: p } = ads;
  const cmp = ads.previous_has_data;
  const k = (label: string, f: (v: number | null | undefined) => string, key: keyof typeof c, dir: Dir) => ({
    label, dir, value: f(c[key]), cur: c[key], prev: p[key], prevText: f(p[key]),
  });
  return (
    <ReportSection title="Advertising" summary={ads.summary} note="Reach is added up day by day, so people who saw your ads on several days are counted more than once.">
      <Strip
        compare={cmp}
        cols="grid-cols-2 sm:grid-cols-4"
        items={[
          k("Spend", fmtRp, "spend", "neutral"),
          k(doc.resultLabel, fmtNum, "results", "higher-better"),
          k("Cost per result", fmtRp, "cpr", "lower-better"),
          k("Reach", fmtNum, "reach", "higher-better"),
          k("Impressions", fmtNum, "impressions", "higher-better"),
          k("Link clicks", fmtNum, "link_clicks", "higher-better"),
          k("CTR", (v) => fmtPct(v), "ctr", "higher-better"),
          k("CPM", fmtRp, "cpm", "lower-better"),
        ]}
      />
      {doc.trend && (
        <>
          <SubTitle>{doc.trend.bucket === "month" ? "Monthly trend" : doc.trend.bucket === "week" ? "Weekly trend" : "Daily trend"}</SubTitle>
          <ReportTrend trend={doc.trend} resultLabel={doc.resultLabel} showCompare={cmp} />
        </>
      )}
      {doc.campaigns && (
        <>
          <SubTitle>Top campaigns {doc.campaigns.rankedBy === "results" ? `by ${doc.resultLabel.toLowerCase()}` : "by spend"}</SubTitle>
          <Card className="divide-y divide-border">
            {doc.campaigns.items.map((r, i) => <RankedRow key={r.entity_id} rank={i + 1} r={r} />)}
          </Card>
        </>
      )}
      {doc.creatives && (
        <>
          <SubTitle>Top ads {doc.creatives.rankedBy === "results" ? `by ${doc.resultLabel.toLowerCase()}` : "by spend"}</SubTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {doc.creatives.items.map((r) => (
              <Card key={r.entity_id} className="overflow-hidden">
                <div className="aspect-square bg-surface2"><Thumb src={r.thumbnail_url} fallback="No preview" /></div>
                <div className="p-2.5">
                  <p className="mb-1.5 break-words text-xs font-medium text-ink">{r.name ?? r.entity_id}</p>
                  <dl className="tnum grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <Stat label={doc.resultLabel} value={fmtNum(r.results)} />
                    <Stat label="Cost per result" value={fmtRp(r.cpr)} />
                    <Stat label="Spend" value={fmtRp(r.spend)} />
                  </dl>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </ReportSection>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words font-medium text-ink">{value}</dd>
    </div>
  );
}

function RankedRow({ rank, r }: { rank: number; r: Ranked }) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr] gap-x-2 px-3.5 py-2.5 sm:grid-cols-[1.5rem_1fr_auto]">
      <span className="tnum text-xs text-muted">{rank}</span>
      <p className="min-w-0 break-words text-sm text-ink">{r.name ?? r.entity_id}</p>
      <dl className="tnum col-start-2 mt-1 grid grid-cols-3 gap-x-4 text-xs sm:col-start-3 sm:mt-0 sm:min-w-[22rem]">
        <Stat label="Spend" value={fmtRp(r.spend)} />
        <Stat label="Results" value={fmtNum(r.results)} />
        <Stat label="Cost per result" value={fmtRp(r.cpr)} />
      </dl>
    </div>
  );
}

function OrganicBlock({ doc }: { doc: ReportDoc }) {
  const o = doc.organic!;
  const { current: c, previous: p } = o;
  const cmp = o.previous_has_data;
  const k = (label: string, key: "posts" | "stories" | "reach" | "views" | "interactions", f: (v: number | null | undefined) => string = fmtNum) => ({
    label, dir: "higher-better" as Dir, value: f(c[key]), cur: c[key], prev: p[key], prevText: f(p[key]),
  });
  const waiting = c.posts - c.posts_with_insights;
  const handle = o.accounts.map((a) => (a.ig_username ? `@${a.ig_username}` : null)).filter(Boolean).join(", ");
  return (
    <ReportSection
      title={`Instagram, organic${handle ? ` (${handle})` : ""}`}
      summary={o.summary}
      note={`Reach, views and interactions are added up over posts. Stories have no insights, so only their number is shown.${waiting > 0 ? ` ${waiting} ${waiting === 1 ? "post has" : "posts have"} no insights yet.` : ""}`}
    >
      <Strip
        compare={cmp}
        cols="grid-cols-2 sm:grid-cols-5"
        items={[k("Posts", "posts"), k("Stories", "stories"), k("Post reach", "reach"), k("Views", "views"), k("Interactions", "interactions")]}
      />
      {o.top_posts.length > 0 && (
        <>
          <SubTitle>Top posts by reach</SubTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {o.top_posts.map((post) => (
              <Card key={post.media_id} className="overflow-hidden">
                <div className="aspect-square bg-surface2"><Thumb src={post.thumbnail_url} fallback={FORMAT_NAME[post.format] ?? post.format} /></div>
                <div className="p-2.5">
                  <p className="mb-1 text-xs text-muted">{FORMAT_NAME[post.format] ?? post.format} · {fmtDay(post.day)}</p>
                  {post.caption && <p className="mb-1.5 line-clamp-2 break-words text-xs text-ink2">{post.caption}</p>}
                  <dl className="tnum grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                    <Stat label="Reach" value={fmtCompact(post.reach)} />
                    <Stat label="Interactions" value={fmtCompact(post.interactions)} />
                  </dl>
                  {post.permalink && (
                    <a href={post.permalink} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-xs font-medium text-musawara-ink hover:underline print:hidden">
                      View on Instagram
                    </a>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </ReportSection>
  );
}

function SalesBlock({ doc }: { doc: ReportDoc }) {
  const s = doc.sales!;
  const { current: c, previous: p } = s;
  const cmp = s.previous_has_data;
  const item = (label: string, key: "count" | "revenue" | "average", f: (v: number | null | undefined) => string) => ({
    label, dir: "higher-better" as Dir, value: f(key === "count" ? c.count : c[key]), cur: key === "count" ? c.count : c[key], prev: key === "count" ? p.count : p[key], prevText: f(key === "count" ? p.count : p[key]),
  });
  const items = [item("Sales", "count", fmtNum), item("Sales value", "revenue", fmtRp), item("Average sale", "average", fmtRp)];
  const money = fmtRp;
  const rows = (list: typeof c.by_source, name?: (k: string) => string) => list.map((r) => ({ label: name ? name(r.key) : r.key, count: r.count, revenue: r.revenue }));
  return (
    <ReportSection title="Sales" summary={s.summary} note="Sales are the ones recorded for this client by sale date. Cancelled sales are not counted.">
      <Strip compare={cmp} cols="grid-cols-2 sm:grid-cols-3" items={items} />
      {s.vs_ads && (
        <div className="mt-3">
          <MetricStrip cols="grid-cols-2">
            <KpiCard flat label="Ad cost per sale" value={fmtRp(s.vs_ads.cost_per_sale)} current={null} previous={null} direction="lower-better" compare={false} />
            <KpiCard flat label="Sales value per Rp 1 of ads" value={x(s.vs_ads.roas)} current={null} previous={null} direction="higher-better" compare={false} />
          </MetricStrip>
        </div>
      )}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <div className="min-w-0"><SubTitle>Payment status</SubTitle><BarList money={money} rows={rows(c.by_status, (k) => STATUS_NAME[k] ?? k)} /></div>
        {c.by_source.some((r) => r.key !== "Not recorded") && <div className="min-w-0"><SubTitle>Where sales came from</SubTitle><BarList money={money} rows={rows(c.by_source)} /></div>}
        {c.by_package.some((r) => r.key !== "Not recorded") && <div className="min-w-0"><SubTitle>Packages</SubTitle><BarList money={money} rows={rows(c.by_package)} /></div>}
      </div>
    </ReportSection>
  );
}

export function ReportView({ clientId }: { clientId: number; share?: boolean }) {
  // default: the last full calendar month, the period a client report is normally about
  const [range, setRange] = useState<DateRange>(() => presetByKey("lastmonth"));
  const { data, error, reload } = useApi<ReportDoc>(`/report/${clientId}?from=${range.from}&to=${range.to}`);
  const doc = data && data.period.from === range.from && data.period.to === range.to ? data : undefined;
  const accent = doc?.client.brand_color ?? "#7a2de3";

  // the PDF file name comes from the page title
  useEffect(() => {
    if (!doc) return;
    const original = document.title;
    const before = () => { document.title = `Report ${doc.client.name} ${doc.period.from} to ${doc.period.to}`; };
    const after = () => { document.title = original; };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [doc]);

  const left = doc ? ([["Advertising", doc.sections.ads], ["Instagram", doc.sections.organic], ["Sales", doc.sections.sales]] as const).filter(([, on]) => !on).map(([n]) => n) : [];

  return (
    <div className="report-page mx-auto max-w-5xl" style={{ ["--accent" as any]: accent, ["--on-accent" as any]: onAccent(accent) }}>
      <PrintStyles />
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          {doc ? <ClientAvatar name={doc.client.name} logoUrl={doc.client.logo_url} color={accent} size={12} /> : <div className="skeleton h-12 w-12" />}
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Performance report</p>
            <h1 className="break-words text-xl font-bold leading-tight text-ink">{doc?.client.name ?? " "}</h1>
            <p className="tnum text-sm text-ink2">
              {fmtDayFull(range.from)} – {fmtDayFull(range.to)}
              {doc && <span className="text-muted"> · compared with {fmtDayFull(doc.comparison.from)} – {fmtDayFull(doc.comparison.to)}</span>}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <DateRangePicker value={range} onChange={setRange} />
          <Btn tone="primary" onClick={() => window.print()} disabled={!doc || !doc.sections.any}>Print / save as PDF</Btn>
        </div>
      </header>

      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !doc ? (
        <div className="space-y-4"><CardSkeleton lines={4} /><CardSkeleton lines={6} /></div>
      ) : !doc.sections.any ? (
        <Empty icon="chart" title="No data for this period" hint={`Nothing was spent, posted or sold between ${fmtDay(range.from)} and ${fmtDay(range.to)}. Try another period, such as the month before.`} />
      ) : (
        <>
          {left.length > 0 && (
            <p className="report-card mb-6 rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]2 px-3.5 py-2.5 text-xs text-ink2">
              Left out because there is no data for this period: {left.join(", ")}.
            </p>
          )}
          {doc.ads && <AdsBlock doc={doc} />}
          {doc.organic && <OrganicBlock doc={doc} />}
          {doc.sales && <SalesBlock doc={doc} />}
          <p className="mt-6 border-t border-border pt-3 text-xs text-muted">
            Prepared by Musawara Creative · {fmtDayFull(doc.generated_at.slice(0, 10))}
          </p>
        </>
      )}
    </div>
  );
}
