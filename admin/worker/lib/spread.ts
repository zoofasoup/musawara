// A report that only has a total for a period (Shopee's ad report) is stored as an even share per day, so that any date range
// shows a part of it. The shares are estimates; their sum is exactly the report's total.

export const SPREAD_NOTE = "Imported from ad report (monthly total, spread per day)";

export type DayShare = { date: string; amount: number; revenue?: number; orders?: number };

const DAY = 86_400_000;

export function spreadOverDays(total: Omit<DayShare, "date">, from: string, to: string): DayShare[] {
  const start = Date.parse(from);
  const n = Math.round((Date.parse(to) - start) / DAY) + 1;
  // rounding the running total (not each share) keeps the sum exact and whole numbers whole
  const part = (value: number, i: number) => {
    const upTo = (k: number) => (k === n ? value : Math.round((value * k) / n));
    return upTo(i + 1) - upTo(i);
  };
  return Array.from({ length: n }, (_, i) => ({
    date: new Date(start + i * DAY).toISOString().slice(0, 10),
    amount: part(total.amount, i),
    ...(total.revenue === undefined ? {} : { revenue: part(total.revenue, i) }),
    ...(total.orders === undefined ? {} : { orders: part(total.orders, i) }),
  }));
}
