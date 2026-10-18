// All date bucketing uses YYYY-MM-DD strings in a target IANA timezone
// (the ad account's timezone for sync, Asia/Jakarta for display).

export function ymdInTz(tz: string, date: Date = new Date()): string {
  // en-CA locale formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function daysInMonth(ymd: string): number {
  const [y, m] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(ymd: string): string {
  return ymd.slice(0, 8) + "01";
}

export function dayOfMonth(ymd: string): number {
  return Number(ymd.slice(8, 10));
}
