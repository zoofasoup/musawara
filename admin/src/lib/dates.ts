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

/** Meta keeps about 37 months of insights, so that is as far back as "Maximum" goes. */
export const MAX_HISTORY_DAYS = 1125;

export function presets(): DateRange[] {
  const today = todayJakarta();
  const yesterday = addDays(today, -1);
  const monthStart = today.slice(0, 8) + "01";
  const lastMonthEnd = addDays(monthStart, -1);
  const lastMonthStart = lastMonthEnd.slice(0, 8) + "01";
  // weeks start on Monday (Indonesia)
  const dow = new Date(today + "T00:00:00Z").getUTCDay();
  const weekStart = addDays(today, -((dow + 6) % 7));
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: yesterday, to: yesterday },
    { key: "today2", label: "Today and yesterday", from: yesterday, to: today },
    { key: "3d", label: "Last 3 days", from: addDays(yesterday, -2), to: yesterday },
    { key: "7d", label: "Last 7 days", from: addDays(yesterday, -6), to: yesterday },
    { key: "14d", label: "Last 14 days", from: addDays(yesterday, -13), to: yesterday },
    { key: "28d", label: "Last 28 days", from: addDays(yesterday, -27), to: yesterday },
    { key: "30d", label: "Last 30 days", from: addDays(yesterday, -29), to: yesterday },
    { key: "week", label: "This week", from: weekStart, to: today },
    { key: "lastweek", label: "Last week", from: addDays(weekStart, -7), to: addDays(weekStart, -1) },
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "lastmonth", label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { key: "max", label: "Maximum", from: addDays(today, -MAX_HISTORY_DAYS), to: today },
  ];
}

export function presetByKey(key: string): DateRange {
  return presets().find((p) => p.key === key) ?? presets()[1];
}

/** The same calendar days `months` months earlier (31 Mar - 1 month = 28/29 Feb). */
export function shiftMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

export type CompareMode = "prev" | "month" | "year" | "custom" | "off";

/** Explicit comparison range for the modes that are not the server's default (previous equal-length period). */
export function compareRange(range: { from: string; to: string }, mode: CompareMode, custom: { from: string; to: string } | null): { from: string; to: string } | null {
  if (mode === "month") return { from: shiftMonths(range.from, -1), to: shiftMonths(range.to, -1) };
  if (mode === "year") return { from: shiftMonths(range.from, -12), to: shiftMonths(range.to, -12) };
  if (mode === "custom") return custom;
  return null;
}
