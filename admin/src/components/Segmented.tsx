// The one choice control: pick one value you hold in state (a range, a filter, a role). Route tabs use PillNav; panels use Tabs.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SlidingTrack } from "./SlidingTrack";

const recessedCls = "bg-surface3";

/**
 * The one choice control: a recessed track, the chosen option a raised white tile. For picking among a few values you hold in state
 * (range, role, filter). Options can be text, an icon (give it a label for screen readers), and carry a count. `fill` stretches it
 * to the full width with equal columns. Route tabs use PillNav instead; in-page panels use Tabs.
 */
export function Segmented<T extends string>({ value, onChange, options, label, fill }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode; iconOnly?: boolean; badge?: ReactNode }>; label: string; fill?: boolean }) {
  return (
    <SlidingTrack role="radiogroup" aria-label={label} className={cn("gap-1 rounded-2xl p-1", recessedCls, fill ? "grid w-full" : "inline-flex")} style={fill ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` } : undefined}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.iconOnly ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn("press relative z-10 inline-flex min-h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-xs font-medium md:min-h-9", on ? "text-ink" : "text-ink2 hover:text-ink")}
          >
            {o.icon}
            {!o.iconOnly && o.label}
            {o.badge !== undefined && <span key={String(o.badge)} className="tnum swap-in text-muted">{o.badge}</span>}
          </button>
        );
      })}
    </SlidingTrack>
  );
}
