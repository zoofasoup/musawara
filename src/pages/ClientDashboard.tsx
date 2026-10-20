// The client dashboard — one component for all three surfaces:
// admin drill-in, client viewer login, and the read-only share link.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { presets, type DateRange } from "../lib/dates";
import { fmtDayFull, fmtDateTime, fmtNum, fmtPct, fmtRp, hoursSince } from "../lib/format";
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
  client: { id: number; name: string; slug: string; logo_url: string | null; brand_color: string };
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
  reach: number;
  ctr: number | null;
  cpm: number | null;
  cpr: number | null;
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
  const [range, setRange] = useState<DateRange>(presets()[0]);
  const query = `from=${range.from}&to=${range.to}`;

  const meta = useApi<Meta>(`/clients/${clientId}/meta`);
  const summary = useApi<Summary>(`/clients/${clientId}/summary?${query}`);
  const trend = useApi<{ days: TrendDay[] }>(`/clients/${clientId}/trend?${query}`);
  const alerts = useApi<{ alerts: Alert[] }>(`/clients/${clientId}/alerts`);
  const pacing = useApi<{ pacing: Pacing[] }>(`/clients/${clientId}/pacing`);

  const resultLabel = meta.data?.resultLabel ?? "Results";
  const accent = meta.data?.client.brand_color ?? "#d4a24e";

  const kpis = useMemo(() => {
    const c = summary.data?.current;
    const p = summary.data?.previous;
    const singular = resultLabel.replace(/s$/, "");
    return [
      { label: "Spend", value: fmtRp(c?.spend), cur: c?.spend, prev: p?.spend, dir: "neutral" as const },
      { label: resultLabel, value: fmtNum(c?.results), cur: c?.results, prev: p?.results, dir: "higher-better" as const },
      { label: `Cost / ${singular}`, value: fmtRp(c?.cpr), cur: c?.cpr, prev: p?.cpr, dir: "lower-better" as const },
      { label: "CTR", value: fmtPct(c?.ctr), cur: c?.ctr, prev: p?.ctr, dir: "higher-better" as const },
      { label: "CPM", value: fmtRp(c?.cpm), cur: c?.cpm, prev: p?.cpm, dir: "lower-better" as const },
      { label: "Frequency", value: fmtNum(c?.frequency ?? null, 2), cur: c?.frequency, prev: p?.frequency, dir: "neutral" as const },
      { label: "Reach", value: fmtNum(c?.reach), cur: c?.reach, prev: p?.reach, dir: "higher-better" as const },
    ];
  }, [summary.data, resultLabel]);

  if (meta.error) return <ErrorState message={meta.error} onRetry={meta.reload} />;

  return (
    <div style={{ ["--accent" as any]: accent }}>
      {/* header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        {meta.data ? (
          <>
            <ClientAvatar name={meta.data.client.name} logoUrl={meta.data.client.logo_url} color={accent} size={10} />
            <div className="mr-auto">
              <h1 className="text-lg font-semibold leading-tight text-ink">{meta.data.client.name}</h1>
              <p className="tnum text-xs text-muted">
                {fmtDayFull(range.from)} – {fmtDayFull(range.to)}
                {summary.data && (
                  <span> · vs {fmtDayFull(summary.data.range.prevFrom)} – {fmtDayFull(summary.data.range.prevTo)}</span>
                )}
              </p>
            </div>
          </>
        ) : (
          <div className="mr-auto h-10 w-48 skeleton" />
        )}
        {!share && user?.role === "admin" && (
          <div className="flex gap-2">
            <Link to={`/c/${clientId}/brand`} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink">
              Brand knowledge
            </Link>
            <Link to={`/c/${clientId}/onboarding`} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink">
              Onboarding
            </Link>
          </div>
        )}
        <DateRangePicker value={range} onChange={setRange} />
      </div>

      {meta.data && <StaleBanner accounts={meta.data.accounts} />}

      {/* KPI row */}
      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={k.value}
            current={k.cur}
            previous={k.prev}
            direction={k.dir}
            loading={summary.loading}
          />
        ))}
      </div>
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}

      {/* trend */}
      <div className="mb-6">
        <SectionTitle>Daily trend</SectionTitle>
        {trend.loading ? (
          <CardSkeleton lines={5} />
        ) : trend.error ? (
          <ErrorState message={trend.error} onRetry={trend.reload} />
        ) : (
          <TrendChart days={trend.data?.days ?? []} resultLabel={resultLabel} />
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
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
