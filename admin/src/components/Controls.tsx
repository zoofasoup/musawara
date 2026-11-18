// "Buttons v2": the raised / recessed visual language. Everything clickable is a white raised tile with a soft shadow and no
// border; containers (segmented tracks, search) are recessed grey; the main action of a view can carry the glow gradient.
// Corner radius follows nesting: outer rounded-2xl, inner rounded-xl. Floating tab bars on phones stay capsules.
// Preview in /styleguide; the old Btn and Pill still do the real work until this is rolled out.

import type { ComponentProps, ReactNode } from "react";
import { ChevronsUpDown, CloudUpload, Filter, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "./Avatar";

const base = "press inline-flex min-h-11 select-none items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium outline-none transition-[box-shadow,background-color,color] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:pointer-events-none disabled:opacity-50 md:min-h-10";
export const raisedCls = "bg-surface text-ink2 shadow-[var(--shadow-soft)] hover:text-ink hover:shadow-[var(--shadow-panel)]";
const recessedCls = "bg-surface3";

/** The glow gradient: a warm corner fading into the client's accent, with a white rim and a coloured halo. One per view. */
const glowStyle = {
  background:
    "radial-gradient(130% 100% at 0% 0%, oklch(0.87 0.14 62) 0%, oklch(0.78 0.17 20 / 0.55) 30%, transparent 64%), linear-gradient(165deg, color-mix(in oklch, var(--accent) 80%, oklch(0.72 0.2 335)) 0%, var(--accent) 100%)",
  boxShadow: "0 0 0 2px rgb(255 255 255 / 0.85), 0 8px 22px -6px color-mix(in srgb, var(--accent) 55%, transparent)",
} as const;

type Btn = Omit<ComponentProps<"button">, "children"> & { children?: ReactNode };

/** Main action. Flat accent in the same shape if you pass `flat` (for places that show several actions). */
export function GlowBtn({ className, children, flat, style, ...p }: Btn & { flat?: boolean }) {
  return (
    <button type="button" {...p} style={flat ? { boxShadow: "0 6px 16px -6px color-mix(in srgb, var(--accent) 60%, transparent)", ...style } : { ...glowStyle, ...style }} className={cn(base, "font-semibold text-white", flat && "bg-[var(--accent)]", className)}>
      {children}
    </button>
  );
}
export const AskBtn = (p: Btn) => <GlowBtn {...p}><Sparkles className="h-4 w-4" aria-hidden />{p.children ?? "Ask AI"}</GlowBtn>;

export function RaisedBtn({ className, ...p }: Btn) {
  return <button type="button" {...p} className={cn(base, raisedCls, className)} />;
}

/** "Put something here": dashed outline, no fill. */
export function DashedBtn({ className, children, ...p }: Btn) {
  return (
    <button type="button" {...p} className={cn(base, "border border-dashed border-border2 bg-transparent text-ink2 hover:border-[var(--accent)] hover:bg-surface/60 hover:text-ink", className)}>
      <CloudUpload className="h-4 w-4" aria-hidden />
      {children}
    </button>
  );
}

/** Square icon-only button. */
export function IconTile({ label, className, children, ...p }: Btn & { label: string }) {
  return <button type="button" aria-label={label} title={label} {...p} className={cn(base, raisedCls, "w-11 px-0 md:w-10", className)}>{children}</button>;
}

/** A filter that shows how many are on and clears them all. */
export function FilterBtn({ count, onClick, onClear, children = "Filter" }: { count: number; onClick?: () => void; onClear?: () => void; children?: ReactNode }) {
  return (
    <span className={cn("inline-flex min-h-11 items-center rounded-2xl pl-1 pr-1 md:min-h-10", raisedCls)}>
      <button type="button" onClick={onClick} className="press inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium md:min-h-10">
        <Filter className="h-4 w-4" aria-hidden />
        {children}
        {count > 0 && <span className="tnum font-semibold text-[var(--accent)]">{count}</span>}
      </button>
      {count > 0 && (
        <>
          <span aria-hidden className="h-5 w-px bg-border" />
          <button type="button" onClick={onClear} aria-label="Clear filters" className="press inline-flex h-9 w-9 items-center justify-center rounded-xl text-muted hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </>
      )}
    </span>
  );
}

/** A chosen person, tag or filter value, with a way to take it off. */
export function Chip({ label, avatar, onRemove, className }: { label: string; avatar?: string; onRemove?: () => void; className?: string }) {
  return (
    <span className={cn("inline-flex min-h-11 items-center gap-2 rounded-2xl py-1 pl-2 pr-1 text-sm font-semibold text-ink md:min-h-10", raisedCls, "hover:text-ink", className)}>
      {avatar !== undefined && <Avatar name={avatar || label} size={28} />}
      <span className="px-0.5">{label}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${label}`} className="press inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:text-ink">
          <X className="h-4 w-4" />
        </button>
      )}
    </span>
  );
}

/** Recessed track; the chosen option is a raised white tile. Options can be icons (give each an aria-label) or text. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; icon?: ReactNode }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex gap-1 rounded-2xl p-1", recessedCls)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.icon ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn("press inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm font-medium transition-[box-shadow,background-color,color]", o.icon && !o.label.length ? "" : "", on ? "bg-surface text-ink shadow-[var(--shadow-soft)]" : "text-ink2 hover:text-ink")}
          >
            {o.icon}
            {!o.icon && o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A value you step through, with the action it feeds attached on the right (inner radius = outer minus padding). */
export function StepperAction({ value, onStep, action }: { value: ReactNode; onStep: (dir: 1 | -1) => void; action: ReactNode }) {
  return (
    <div className={cn("inline-flex items-center gap-2 rounded-2xl p-1.5 pl-4", raisedCls, "hover:shadow-[var(--shadow-soft)]")}>
      <span className="tnum text-sm font-semibold text-ink">{value}</span>
      <button type="button" aria-label="Change value" onClick={() => onStep(1)} onContextMenu={(e) => { e.preventDefault(); onStep(-1); }} className="press inline-flex h-9 w-7 items-center justify-center rounded-lg text-muted hover:text-ink">
        <ChevronsUpDown className="h-4 w-4" />
      </button>
      {action}
    </div>
  );
}

/** Status, not an action: tinted fill, no shadow. `dot` for a live state, `dashed` for work in progress. */
export function StatusPill({ tone = "good", mark = "dot", children }: { tone?: "good" | "info" | "warn" | "crit" | "neutral"; mark?: "dot" | "dashed" | "none"; children: ReactNode }) {
  const t = {
    good: "bg-good/15 text-good",
    info: "bg-chart-4/10 text-chart-4",
    warn: "bg-warn/15 text-warn",
    crit: "bg-crit/12 text-crit",
    neutral: "bg-surface3 text-ink2",
  }[tone];
  return (
    <span className={cn("inline-flex min-h-9 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold", t)}>
      {mark === "dot" && <span aria-hidden className="h-2 w-2 rounded-full bg-current" />}
      {mark === "dashed" && (
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 animate-[spin_6s_linear_infinite]">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3.6 3.1" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </span>
  );
}

/** Recessed field with its submit as a round raised button inside. Pass the text input as `children` (an <Input> with no border). */
export function SearchField({ children, onSubmit, label = "Search" }: { children: ReactNode; onSubmit?: () => void; label?: string }) {
  return (
    <div className={cn("flex min-h-11 items-center gap-2 rounded-2xl py-1 pl-4 pr-1 focus-within:ring-2 focus-within:ring-[var(--accent)]/30 md:min-h-10", recessedCls)}>
      <div className="min-w-0 flex-1 [&_input]:min-h-0 [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:shadow-none [&_input]:ring-0 [&_input]:focus:ring-0">{children}</div>
      <button type="button" onClick={onSubmit} aria-label={label} className="press inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-ink2 shadow-[var(--shadow-soft)] hover:text-ink">
        <Search className="h-4 w-4" />
      </button>
    </div>
  );
}
