// Indonesian formatting: Rp with dot thousands separators, dates in Asia/Jakarta.

const idNum = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export function fmtRp(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "–";
  return "Rp " + idNum.format(Math.round(v));
}

export function fmtNum(v: number | null | undefined, decimals = 0): string {
  if (v == null || !isFinite(v)) return "–";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(v);
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "–";
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return "–";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: decimals }).format(v) + "%";
}

/** "12 Jul" from a YYYY-MM-DD string (date-only, no timezone math needed). */
export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}

export function fmtDayFull(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** SQLite datetime('now') strings are UTC — display in Asia/Jakarta. */
export function fmtDateTime(sqlUtc: string | null | undefined): string {
  if (!sqlUtc) return "–";
  const date = new Date(sqlUtc.replace(" ", "T") + "Z");
  if (isNaN(date.getTime())) return "–";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function hoursSince(sqlUtc: string | null | undefined): number | null {
  if (!sqlUtc) return null;
  const date = new Date(sqlUtc.replace(" ", "T") + "Z");
  if (isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / 3_600_000;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago" from a SQLite UTC datetime. */
export function fmtAgo(sqlUtc: string | null | undefined): string {
  const h = hoursSince(sqlUtc);
  if (h == null) return "never";
  const min = Math.round(h * 60);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  if (h < 48) return `${Math.round(h)} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Digits-only string shown with thousand separators ("1000000" -> "1.000.000") for money inputs. */
export function fmtDigits(raw: string): string {
  return raw ? new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(raw)) : "";
}
