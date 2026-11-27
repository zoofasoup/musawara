// Results per platform on a client's overview: ad spend next to what was sold in the same period.
import { fmtDateTime, fmtNum, fmtRp } from "../lib/format";
import { Callout } from "./Callout";
import { CardSkeleton, ErrorState } from "./ui";
import { Empty } from "./kit";

export type Platforms = {
  rows: Array<{ platform: string; spend: number; orders: number; sales: number; ratio: number | null }>;
  jubelio: { last_sync_at: string | null; last_error: string | null } | null;
};

const money = (v: number) => (v ? fmtRp(v) : "–");

export function PlatformResults({ data, loading, error, onRetry }: { data?: Platforms; loading: boolean; error?: string; onRetry: () => void }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !data) return <CardSkeleton lines={4} />;
  const rows = data?.rows ?? [];
  if (!rows.length) return <Empty title="No spend or sales in this period" />;
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const sales = rows.reduce((s, r) => s + r.sales, 0);
  const all = [...rows, { platform: "Total", spend, orders: rows.reduce((s, r) => s + r.orders, 0), sales, ratio: spend && sales ? sales / spend : null }];
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>{["Platform", "Ad spend", "Orders", "Sales", "Share of sales", "Sales ÷ spend"].map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-muted ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {all.map((r) => (
              <tr key={r.platform} className={`border-t border-border ${r.platform === "Total" ? "font-semibold" : ""}`}>
                <td className="whitespace-nowrap px-3 py-2 font-medium text-ink">{r.platform}</td>
                {[money(r.spend), r.orders ? fmtNum(r.orders) : "–", money(r.sales), sales && r.sales ? `${Math.round((r.sales / sales) * 100)}%` : "–", r.ratio ? `${fmtNum(r.ratio, 2)}×` : "–"].map((c, i) => <td key={i} className="tnum whitespace-nowrap px-3 py-2 text-right text-ink">{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="px-3 text-xs text-muted">
        Sales are where the order was placed, not which ad caused it: Meta ads can end in a Shopee or WhatsApp order.
        {data?.jubelio?.last_sync_at ? ` Orders last synced ${fmtDateTime(data.jubelio.last_sync_at)}.` : ""}
      </p>
      {data?.jubelio?.last_error && <Callout tone="crit" compact>The last order sync failed: {data.jubelio.last_error}</Callout>}
    </div>
  );
}
