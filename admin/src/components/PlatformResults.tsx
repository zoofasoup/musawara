// A client's overview: three totals, then ad spend per ad platform next to (not mixed with) where the orders were placed.
import { Link } from "react-router-dom";
import { fmtDateTime, fmtNum, fmtRp } from "../lib/format";
import { Callout } from "./Callout";
import { CardSkeleton, ErrorState } from "./ui";
import { Empty } from "./kit";

export type Platforms = {
  ads: Array<{ key: string; name: string; spend: number; leads: number | null }>;
  channels: Array<{ name: string; orders: number; sales: number }>;
  jubelio: { last_sync_at: string | null; last_error: string | null } | null;
};

const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Total({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface2 px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tnum mt-0.5 break-words text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Row({ name, value, percent, detail }: { name: string; value: string; percent: number; detail: React.ReactNode }) {
  return (
    <li>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="min-w-0 font-medium text-ink">{name}</span>
        <span className="tnum shrink-0 font-semibold text-ink">{value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface3" aria-hidden>
        <div className="h-full rounded-full bg-chart-4" style={{ width: `${percent}%` }} />
      </div>
      <p className="tnum mt-1 text-xs text-muted">{detail}</p>
    </li>
  );
}

export function PlatformResults({ data, loading, error, onRetry }: { data?: Platforms; loading: boolean; error?: string; onRetry: () => void }) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (loading && !data) return <CardSkeleton lines={4} />;
  const ads = data?.ads ?? [];
  const channels = data?.channels ?? [];
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const sales = channels.reduce((s, c) => s + c.sales, 0);
  const orders = channels.reduce((s, c) => s + c.orders, 0);
  if (!spend && !sales) return <Empty title="No spend or sales in this period" />;
  const empty = ads.filter((a) => !a.spend && a.key !== "meta").map((a) => a.name);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Total label="Ad spend" value={fmtRp(spend)} hint={empty.length ? `Without ${empty.join(" and ")}` : undefined} />
        <Total label="Sales" value={fmtRp(sales)} hint={`${fmtNum(orders)} paid ${orders === 1 ? "order" : "orders"}`} />
        <Total label="Sales for every Rp 1 of ads" value={spend && sales ? `Rp ${fmtNum(sales / spend, 2)}` : "–"} hint={spend && sales ? (sales < spend ? "Recorded sales are below ad spend" : "Recorded sales are above ad spend") : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Where the ad money went</h3>
          <ul className="mt-3 space-y-4">
            {ads.map((a) => (
              <Row
                key={a.key}
                name={a.name}
                value={a.spend ? fmtRp(a.spend) : "No data yet"}
                percent={share(a.spend, spend)}
                detail={
                  !a.spend
                    ? a.key === "meta" ? "No Meta spend synced for this period." : <>Nothing recorded. <Link to="/spend" className="font-medium text-musawara-ink underline">Add it on the Spend page</Link></>
                    : a.leads
                      ? `${share(a.spend, spend)}% of ad spend · ${fmtNum(a.leads)} chat leads · ${fmtRp(a.spend / a.leads)} per lead`
                      : `${share(a.spend, spend)}% of ad spend`
                }
              />
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">Where the orders were placed</h3>
          {channels.length ? (
            <ul className="mt-3 space-y-4">
              {channels.map((c) => (
                <Row key={c.name} name={c.name === "Manual (internal)" ? "Typed into Jubelio (manual)" : c.name} value={fmtRp(c.sales)} percent={share(c.sales, sales)} detail={`${share(c.sales, sales)}% of sales · ${fmtNum(c.orders)} ${c.orders === 1 ? "order" : "orders"}`} />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">No paid orders in this period.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        An order does not say which ad caused it: someone who saw a Meta ad can buy on Shopee or over WhatsApp.
        {data?.jubelio?.last_sync_at ? ` Orders last synced ${fmtDateTime(data.jubelio.last_sync_at)}.` : ""}
      </p>
      {data?.jubelio?.last_error && <Callout tone="crit" compact>The last order sync failed: {data.jubelio.last_error}</Callout>}
    </div>
  );
}
