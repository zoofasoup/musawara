// One ad platform month by month: what it cost, what the platform says it brought, and the orders in that platform's shop.
import { fmtNum, fmtRp } from "../lib/format";
import { Empty } from "./kit";

export type MonthRow = { month: string; spend: number; result: number; adOrders: number; shopOrders: number; shopSales: number };
export type PlatformKey = "meta" | "shopee" | "tiktok";

const NAME: Record<PlatformKey, string> = { meta: "Meta", shopee: "Shopee", tiktok: "TikTok" };
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const money = (v: number) => (v ? fmtRp(v) : "–");

function Total({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-2xl bg-surface2 px-4 py-3">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="tnum mt-0.5 break-words text-xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function PlatformDetail({ platform, rows }: { platform: PlatformKey; rows: MonthRow[] }) {
  const meta = platform === "meta";
  const name = NAME[platform];
  if (!rows.length) return <Empty title={`Nothing recorded for ${name} in this period`} />;
  const sum = (key: keyof Omit<MonthRow, "month">) => rows.reduce((n, r) => n + r[key], 0);
  const spend = sum("spend"), result = sum("result");
  const per = (s: number, r: number) => (s && r ? (meta ? fmtRp(s / r) : `Rp ${fmtNum(r / s, 2)}`) : "–");
  const noResults = !meta && !result;
  const head = meta
    ? ["Month", "Ad spend", "Chat leads", "Cost per lead"]
    : ["Month", "Ad spend", `Revenue by ${name}`, "Ad orders", "Per Rp 1 of ads", "Shop orders", "Shop sales"];
  const line = (label: string, r: Omit<MonthRow, "month">) =>
    meta
      ? [label, money(r.spend), r.result ? fmtNum(r.result) : "–", per(r.spend, r.result)]
      : [label, money(r.spend), money(r.result), r.adOrders ? fmtNum(r.adOrders) : "–", per(r.spend, r.result), r.shopOrders ? fmtNum(r.shopOrders) : "–", money(r.shopSales)];
  const total = { spend, result, adOrders: sum("adOrders"), shopOrders: sum("shopOrders"), shopSales: sum("shopSales") };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Total label={`${name} ad spend`} value={money(spend)} />
        <Total label={meta ? "Chat leads" : `Revenue ${name} credits to its ads`} value={meta ? fmtNum(result) : money(result)} hint={noResults ? "Not imported yet" : meta ? undefined : `${fmtNum(total.adOrders)} orders`} />
        <Total label={meta ? "Cost per lead" : "Back for every Rp 1 of ads"} value={per(spend, result)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{head.map((h, i) => <th key={h} className={`whitespace-nowrap px-3 py-2 text-xs font-medium text-muted ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody>
            {[...rows.map((r) => line(monthName(r.month), r)), line("Total", total)].map((cells) => (
              <tr key={cells[0]} className={`border-t border-border ${cells[0] === "Total" ? "font-semibold" : ""}`}>
                {cells.map((c, i) => <td key={i} className={`whitespace-nowrap px-3 py-2 ${i ? "tnum text-right text-ink" : "font-medium text-ink"}`}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        {meta
          ? "Meta does not know which orders came from its ads, so it is judged on chat leads here."
          : `Revenue and ad orders are what ${name} itself credits to its ads; platforms can claim the same sale, so do not add them together. Shop sales are all orders placed there, from any source.`}
      </p>
    </div>
  );
}
