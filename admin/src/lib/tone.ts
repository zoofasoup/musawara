// The one set of status colours. Pill, Callout, StatusBadge and the CPA chip all read from here, so "good" is the same green everywhere.
export const TONE = {
  neutral: { soft: "bg-surface3 text-ink2", dot: "bg-muted" },
  good: { soft: "bg-good/12 text-good", dot: "bg-good" },
  warn: { soft: "bg-warn/12 text-warn", dot: "bg-warn" },
  crit: { soft: "bg-crit/10 text-crit", dot: "bg-crit" },
  info: { soft: "bg-chart-4/10 text-chart-4", dot: "bg-chart-4" },
  accent: { soft: "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-musawara-ink", dot: "bg-[var(--accent)]" },
} as const;
export type Tone = keyof typeof TONE;

/** Meta delivery status to a tone (ACTIVE green, any paused amber, deleted red, the rest quiet). */
export const statusTone = (status: string): Tone =>
  status === "ACTIVE" ? "good" : /PAUSED/.test(status) ? "warn" : status === "DELETED" ? "crit" : "neutral";
