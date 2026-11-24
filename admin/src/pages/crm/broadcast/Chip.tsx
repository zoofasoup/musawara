// A pressable choice chip (a tag, a stage, an owner…). Pressed = part of the filter.
import type { ReactNode } from "react";

export function Chip({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`press inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-musawara-ink" : "border-border bg-surface text-ink2 hover:bg-surface2"}`}>
      {children}
      {count !== undefined && <span className="tnum text-muted">{count.toLocaleString("en-US")}</span>}
    </button>
  );
}
