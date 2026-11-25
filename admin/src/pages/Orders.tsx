// A brand's orders from Jubelio, per month and per sales channel, next to what was spent on ads that month. Ad spend comes from
// the platform (Meta syncs by itself; Shopee, TikTok and Tokopedia are typed in on the Spend page). No buyer details are stored.
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { fmtDateTime, fmtNum, fmtRp } from "../lib/format";
import { CardSkeleton, ErrorState } from "../components/ui";
import { Btn, Empty, Panel, useNotify } from "../components/kit";
import { Callout } from "../components/Callout";
import { PageHeader } from "../components/PageHeader";
import { NeedsClient } from "../components/NeedsClient";
import { useClientScope } from "../context/ClientScope";

type Month = { month: string; orders: number; value: number; canceled: number; channels: Record<string, { orders: number; value: number }>; spend: Record<string, number>; spend_total: number };
type Report = { connected: boolean; channels: string[]; sources: string[]; months: Month[]; last_sync_at: string | null; last_error: string | null };

const CHANNEL: Record<string, string> = { SHOPEE: "Shopee", TOKOPEDIA: "Tokopedia", "Shop | Tokopedia": "TikTok / Tokopedia Shop", INTERNAL: "Manual (internal)" };
const SOURCE: Record<string, string> = { meta: "Meta", shopee: "Shopee", tiktok: "TikTok", tokopedia: "Tokopedia", other: "Other" };
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{head.map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-muted ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r[0]} className="border-t border-border">{r.map((c, i) => <td key={i} className={`whitespace-nowrap px-3 py-2 ${i ? "tnum text-right text-ink" : "font-medium text-ink"}`}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Orders() {
  const { notify, node } = useNotify();
  const { clientId } = useClientScope();
  const report = useApi<Report>(clientId ? `/jubelio/report?client_id=${clientId}` : null);
  const [busy, setBusy] = useState(false);
  if (!clientId) return <NeedsClient />;
  if (report.error) return <ErrorState message={report.error} onRetry={report.reload} />;
  const d = report.data;

  const sync = async () => {
    setBusy(true);
    try { const r = await api<{ orders: number }>("/jubelio/sync", { method: "POST", body: { client_id: clientId } }); notify(`${fmtNum(r.orders)} orders read from Jubelio.`); report.reload(); }
    catch (e: any) { notify(e.message, "err"); }
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      {node}
      <PageHeader title="Orders" subtitle="From Jubelio, every sales channel. Buyer details are never stored. Months follow Asia/Jakarta." />
      {!d ? <CardSkeleton /> : (
        <>
          {d.connected ? (
            <div className="flex flex-wrap items-center gap-3">
              <Btn tone="secondary" size="sm" icon="refresh" loading={busy} onClick={() => void sync()}>Sync now</Btn>
              <span className="text-xs text-muted">{d.last_sync_at ? `Last synced ${fmtDateTime(d.last_sync_at)}` : "Not synced yet"}. It also syncs every hour.</span>
            </div>
          ) : (
            <Callout tone="warn">Jubelio is not connected for this client yet.</Callout>
          )}
          {d.last_error && <Callout tone="crit" title="The last sync failed">{d.last_error}</Callout>}
          {d.months.length === 0 ? (
            <Empty icon="chart" title="No orders yet" hint="Orders appear here after the first sync." />
          ) : (
            <>
              <Panel className="p-2">
                <h2 className="px-3 pt-2 text-sm font-semibold text-ink">Sales per channel</h2>
                <Table head={["Month", "Orders", "Sales", ...d.channels.map((c) => CHANNEL[c] ?? c), "Cancelled"]}
                  rows={d.months.map((m) => [monthName(m.month), fmtNum(m.orders), fmtRp(m.value), ...d.channels.map((c) => (m.channels[c] ? `${fmtNum(m.channels[c].orders)} · ${fmtRp(m.channels[c].value)}` : "–")), fmtNum(m.canceled)])} />
              </Panel>
              <Panel className="p-2">
                <h2 className="px-3 pt-2 text-sm font-semibold text-ink">Ad spend per platform</h2>
                <Table head={["Month", ...d.sources.map((s) => SOURCE[s] ?? s), "Total spend", "Sales ÷ spend"]}
                  rows={d.months.map((m) => [monthName(m.month), ...d.sources.map((s) => (m.spend[s] ? fmtRp(m.spend[s]) : "–")), m.spend_total ? fmtRp(m.spend_total) : "–", m.spend_total ? `${(m.value / m.spend_total).toFixed(2)}×` : "–"])} />
                <p className="px-3 pb-2 pt-1 text-xs text-muted">
                  Sales ÷ spend compares all sales with all spend of the month; it does not say which ad caused which order. Meta spend syncs by itself.
                  Type Shopee, TikTok and Tokopedia spend on the <Link to="/spend" className="underline">Spend page</Link>.
                </p>
              </Panel>
            </>
          )}
        </>
      )}
    </div>
  );
}
