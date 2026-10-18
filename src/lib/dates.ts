// Date-range presets computed in Asia/Jakarta.

export type DateRange = { key: string; label: string; from: string; to: string };

export function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function rangeLength(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000) + 1;
}

/** Previous equal-length period immediately before `from` (delta comparisons). */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const len = rangeLength(from, to);
  return { from: addDays(from, -len), to: addDays(from, -1) };
}

export function presets(): DateRange[] {
  const today = todayJakarta();
  const yesterday = addDays(today, -1);
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";
  return [
    { key: "7d", label: "Last 7 days", from: addDays(yesterday, -6), to: yesterday },
    { key: "14d", label: "Last 14 days", from: addDays(yesterday, -13), to: yesterday },
    { key: "30d", label: "Last 30 days", from: addDays(yesterday, -29), to: yesterday },
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "lastmonth", label: "Last month", from: lastMonthStart, to: lastMonthEnd },
  ];
}
