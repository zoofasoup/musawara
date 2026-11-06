// The client dashboard — one component for all three surfaces:
// admin drill-in, client viewer login, and the read-only share link.

import { onAccent } from "../lib/color";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { compareRange, presetByKey, shiftMonths, type CompareMode, type DateRange } from "../lib/dates";
import { fmtDay, fmtDayFull, fmtDateTime, fmtNum, fmtPct, fmtRp, hoursSince } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { DateRangePicker } from "../components/DateRangePicker";
import { KpiCard } from "../components/KpiCard";
import { TrendChart, type TrendDay } from "../components/TrendChart";
import { EntityTable } from "../components/EntityTable";
import { AlertFeed, type Alert } from "../components/AlertFeed";
import { BudgetPacing, type Pacing } from "../components/BudgetPacing";
import { ClientAvatar } from "../components/Layout";
import { CardSkeleton, ErrorState, SectionTitle } from "../components/ui";

type Meta = {
  client: { id: number; name: string; slug: string; logo_url: string | null; brand_color: string; target_cpa: number | null };
  accounts: Array<{
    id: number;
    account_name: string | null;
    last_sync: string | null;
    last_sync_status: string | null;
  }>;
  resultLabel: string;
  isShare: boolean;
};

type Summary = {
  range: { from: string; to: string; prevFrom: string; prevTo: string };
  current: Totals;
  previous: Totals;
};
type Totals = {
  spend: number;
  results: number;
  leads: number;
  purchases: number;
  purchases_sent: number;
  purchase_value: number;
  reach: number;
  ctr: number | null;
  cpm: number | null;
  cpr: number | null;
  cpl: number | null;
  cpa: number | null;
  roas: number | null;
  frequency: number | null;
};

function StaleBanner({ accounts }: { accounts: Meta["accounts"] }) {
  const stale = accounts.filter((a) => {
    const h = hoursSince(a.last_sync);
    return a.last_sync_status === "failed" || h == null || h > 26;
  });
  if (accounts.length === 0 || stale.length === 0) return null;
  const oldest = stale[0];
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn">
      <span aria-hidden>⚠️</span>
      <span>
        Data may be stale — {oldest.account_name ?? "an account"}{" "}
        {oldest.last_sync ? `last synced ${fmtDateTime(oldest.last_sync)}` : "has not synced yet"}
        {oldest.last_sync_status === "failed" ? " and the last sync failed" : ""}.
      </span>
    </div>
  );
}

export function ClientDashboard({ clientId, share = false }: { clientId: number; share?: boolean }) {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(presetByKey("7d"));
  // "Compare to": the default is the previous equal-length period (chosen by the server)
  const [mode, setMode] = useState<CompareMode>("prev");
  const [custom, setCustom] = useState<DateRange>(() => {
    const r = presetByKey("7d");
    return { key: "custom", label: "Custom", from: shiftMonths(r.from, -1), to: shiftMonths(r.to, -1) };
  });
  const compareOn = mode !== "off";
  const cmp = compareRange(range, mode, mode === "custom" ? custom : null);
  const query = `from=${range.from}&to=${range.to}${cmp ? `&compFrom=${cmp.from}&compTo=${cmp.to}` : ""}`;

  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const summary = useApi<Summary>(`/clients/${clientId}/summary?${query}`);
  const trend = useApi<{ days: TrendDay[]; compare?: TrendDay[]; bucket?: "day" | "week" | "month" }>(`/clients/${clientId}/trend?${query}`);
  const alerts = useApi<{ alerts: Alert[] }>(`/clients/${clientId}/alerts`);
  const pacing = useApi<{ pacing: Pacing[] }>(`/clients/${clientId}/pacing`);

  const resultLabel = meta.data?.resultLabel ?? "Results";
  const accent = meta.data?.client.brand_color ?? "#7a2de3";
  const lastSync = meta.data?.accounts.map((a) => a.last_sync).filter(Boolean).sort().at(-1) ?? null;

  const kpis = useMemo(() => {
    const c = summary.data?.current;
    const p = summary.data?.previous;
    // Target CPA is the most one sale may cost. ROAS needed to break even = average
    // sale value / target CPA, so it follows the real (varying) package prices.
    const target = meta.data?.client.target_cpa ?? null;
    const avgSale = c && c.purchases > 0 ? c.purchase_value / c.purchases : null;
    const needRoas = target && avgSale ? avgSale / target : null;
    const cpaNote: { text: string; tone?: "good" | "crit" | "muted" } | undefined = !target
      ? undefined
      : c?.cpa == null
        ? { text: `Target ${fmtRp(target)}`, tone: "muted" }
        : c.cpa <= target
          ? { text: `On target (${fmtRp(target)})`, tone: "good" }
          : { text: `${Math.round((c.cpa / target - 1) * 100)}% over target ${fmtRp(target)}`, tone: "crit" };
    const roasNote: { text: string; tone?: "good" | "crit" | "muted" } | undefined = needRoas
      ? c?.roas != null && c.roas >= needRoas
        ? { text: `Above the ${fmtNum(needRoas, 1)}x needed`, tone: "good" }
        : { text: `Needs ${fmtNum(needRoas, 1)}x to break even`, tone: c?.roas != null ? "crit" : "muted" }
      : undefined;
    // Leads and purchases are the numbers that matter. Purchases are real sales
    // uploaded as offline conversions; Meta's own purchase counts are not used.
    const pct = (n: number | null | undefined) => fmtPct(n);
    const x = (n: number | null | undefined) => (n != null ? `${fmtNum(n, 1)}x` : "–");
    const f2 = (n: number | null | undefined) => fmtNum(n ?? null, 2);
    type K = Exclude<keyof Totals, never>;
    const item = (label: string, fmt: (n: number | null | undefined) => string, key: K, dir: "higher-better" | "lower-better" | "neutral", note?: { text: string; tone?: "good" | "crit" | "muted" }) => ({
      label, dir, note,
      value: fmt(c?.[key] as number | null | undefined),
      cur: c?.[key] as number | null | undefined,
      prev: p?.[key] as number | null | undefined,
      prevText: p ? fmt(p[key] as number | null | undefined) : undefined,
    });
    return [
      item("Spend", fmtRp, "spend", "neutral"),
      item("Leads", fmtNum, "leads", "higher-better"),
      item("Cost / Lead", fmtRp, "cpl", "lower-better"),
      item("Purchases", fmtNum, "purchases", "higher-better", c && c.purchases > 0 ? { text: `${fmtNum(c.purchases_sent)} of ${fmtNum(c.purchases)} sent to Meta`, tone: "muted" } : undefined),
      item("Purchase value", fmtRp, "purchase_value", "higher-better"),
      item("CPA", fmtRp, "cpa", "lower-better", cpaNote),
      item("ROAS", x, "roas", "higher-better", roasNote),
      item("CTR", pct, "ctr", "higher-better"),
      item("CPM", fmtRp, "cpm", "lower-better"),
      item("Frequency", f2, "frequency", "neutral"),
      item("Reach", fmtNum, "reach", "higher-better"),
    ];
  }, [summary.data, meta.data]);

  if (meta.error) return <ErrorState message={meta.error} onRetry={meta.reload} />;

  return (
    <div style={{ ["--accent" as any]: accent, ["--on-accent" as any]: onAccent(accent) }}>
      {/* header */}
      <div className="mb-3 flex items-center gap-3">
        {meta.data ? (
          <>
            <ClientAvatar name={meta.data.client.name} logoUrl={meta.data.client.logo_url} color={accent} size={10} />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight text-ink">{meta.data.client.name}</h1>
              <p className="tnum text-xs text-muted">
                {lastSync ? `Updated ${fmtDateTime(lastSync)}` : "Not synced yet"}
                {" · "}
                {meta.data.accounts.length} {meta.data.accounts.length === 1 ? "account" : "accounts"}
              </p>
            </div>
          </>
        ) : (
          <div className="h-10 w-48 skeleton" />
        )}
      </div>

      {/* toolbar: secondary pages on the left, date range on the right */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {!share && user?.role === "admin" && (
            <>
              <Link to={`/c/${clientId}/brand`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-medium text-ink2 hover:bg-surface hover:text-ink">
                Brand knowledge
              </Link>
              <Link to={`/c/${clientId}/onboarding`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-medium text-ink2 hover:bg-surface hover:text-ink">
                Onboarding
              </Link>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
          <DateRangePicker value={range} onChange={setRange} />
          <label className="flex items-center gap-1.5 text-[11px] text-muted">
            Compare
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as CompareMode)}
              aria-label="Compare to"
              className="min-h-11 rounded-lg border border-border2 bg-surface px-2 text-xs text-ink lg:min-h-9"
            >
              <option value="prev">Previous period</option>
              <option value="month">Previous month</option>
              <option value="year">Previous year</option>
              <option value="custom">Custom range…</option>
              <option value="off">Off</option>
            </select>
          </label>
          {mode === "custom" && <DateRangePicker value={custom} onChange={setCustom} />}
          {compareOn && summary.data && (
            <span className="tnum w-full text-right text-[11px] text-muted">
              vs {fmtDayFull(summary.data.range.prevFrom)} – {fmtDayFull(summary.data.range.prevTo)}
            </span>
          )}
        </div>
      </div>

      {meta.data && <StaleBanner accounts={meta.data.accounts} />}

      {/* metrics strip */}
      <div className="mb-5 overflow-hidden rounded-xl border border-border bg-surface">
        <div className="-mb-px -mr-px grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
          {kpis.map((k) => (
            <KpiCard
              key={k.label}
              flat
              label={k.label}
              value={k.value}
              current={k.cur}
              previous={k.prev}
              direction={k.dir}
              note={k.note}
              previousText={k.prevText}
              compare={compareOn}
              loading={summary.loading}
            />
          ))}
        </div>
      </div>
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}

      {/* trend */}
      <div className="mb-6">
        <SectionTitle>{trend.data?.bucket === "month" ? "Monthly trend" : trend.data?.bucket === "week" ? "Weekly trend" : "Daily trend"}</SectionTitle>
        {trend.loading ? (
          <CardSkeleton lines={5} />
        ) : trend.error ? (
          <ErrorState message={trend.error} onRetry={trend.reload} />
        ) : (
          <TrendChart days={trend.data?.days ?? []} compare={compareOn ? trend.data?.compare : undefined} bucket={trend.data?.bucket} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SectionTitle>Campaigns</SectionTitle>
          <EntityTable clientId={clientId} from={range.from} to={range.to} compare={cmp} />
        </div>
        <div className="space-y-6">
          {(pacing.data?.pacing?.length ?? 0) > 0 && (
            <div>
              <SectionTitle>Budget pacing</SectionTitle>
              <BudgetPacing pacing={pacing.data!.pacing} />
            </div>
          )}
          <div>
            <SectionTitle>Alerts</SectionTitle>
            {alerts.loading ? (
              <CardSkeleton lines={4} />
            ) : alerts.error ? (
              <ErrorState message={alerts.error} onRetry={alerts.reload} />
            ) : (
              <AlertFeed
                alerts={alerts.data?.alerts ?? []}
                onAck={
                  !share && user?.role === "admin"
                    ? async (id) => {
                        await api(`/admin/alerts/${id}/ack`, { method: "POST", body: {} });
                        alerts.reload();
                      }
                    : undefined
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
