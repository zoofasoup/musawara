// The client dashboard — one component for all three surfaces:
// admin drill-in, client viewer login, and the read-only share link.

import { onAccent } from "../lib/color";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { presetByKey, type DateRange } from "../lib/dates";
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
  const query = `from=${range.from}&to=${range.to}`;

  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const summary = useApi<Summary>(`/clients/${clientId}/summary?${query}`);
  const trend = useApi<{ days: TrendDay[]; bucket?: "day" | "week" | "month" }>(`/clients/${clientId}/trend?${query}`);
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
    return [
      { label: "Spend", value: fmtRp(c?.spend), cur: c?.spend, prev: p?.spend, dir: "neutral" as const },
      { label: "Leads", value: fmtNum(c?.leads), cur: c?.leads, prev: p?.leads, dir: "higher-better" as const },
      { label: "Cost / Lead", value: fmtRp(c?.cpl), cur: c?.cpl, prev: p?.cpl, dir: "lower-better" as const },
      { label: "Purchases", value: fmtNum(c?.purchases), cur: c?.purchases, prev: p?.purchases, dir: "higher-better" as const, note: c && c.purchases > 0 ? { text: `${fmtNum(c.purchases_sent)} of ${fmtNum(c.purchases)} sent to Meta`, tone: "muted" as const } : undefined },
      { label: "Purchase value", value: fmtRp(c?.purchase_value), cur: c?.purchase_value, prev: p?.purchase_value, dir: "higher-better" as const },
      { label: "CPA", value: fmtRp(c?.cpa), cur: c?.cpa, prev: p?.cpa, dir: "lower-better" as const, note: cpaNote },
      { label: "ROAS", value: c?.roas != null ? `${fmtNum(c.roas, 1)}x` : "–", cur: c?.roas, prev: p?.roas, dir: "higher-better" as const, note: roasNote },
      { label: "CTR", value: fmtPct(c?.ctr), cur: c?.ctr, prev: p?.ctr, dir: "higher-better" as const },
      { label: "CPM", value: fmtRp(c?.cpm), cur: c?.cpm, prev: p?.cpm, dir: "lower-better" as const },
      { label: "Frequency", value: fmtNum(c?.frequency ?? null, 2), cur: c?.frequency, prev: p?.frequency, dir: "neutral" as const },
      { label: "Reach", value: fmtNum(c?.reach), cur: c?.reach, prev: p?.reach, dir: "higher-better" as const },
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
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {summary.data && (
            <span className="tnum text-[11px] text-muted">
              vs {fmtDay(summary.data.range.prevFrom)} – {fmtDayFull(summary.data.range.prevTo)}
            </span>
          )}
          <DateRangePicker value={range} onChange={setRange} />
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
              note={(k as any).note}
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
          <TrendChart days={trend.data?.days ?? []} bucket={trend.data?.bucket} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <SectionTitle>Campaigns</SectionTitle>
          <EntityTable clientId={clientId} from={range.from} to={range.to} />
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
