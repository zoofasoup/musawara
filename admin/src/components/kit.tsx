// Shared building blocks (buttons, inputs, panels, pills, toasts): section shell, buttons, pills,
// confirm/copy helpers and a tiny toast host (replaces alert()/confirm()).

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "./icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet as UiSheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { glassThickCls } from "../lib/glass";

export type Notify = (text: string, kind?: "ok" | "err") => void;

export function useNotify() {
  const notify = useCallback<Notify>((text, kind = "ok") => {
    if (kind === "err") toast.error(text, { duration: 8000 });
    else toast.success(text, { duration: 3500 });
  }, []);
  // Phones: lift toasts above the bottom tab bar.
  const node = <Toaster position="bottom-right" offset={16} mobileOffset={{ bottom: 100, left: 16, right: 16 }} />;
  return { notify, node };
}

import { TONE, type Tone } from "../lib/tone";
export type { Tone };

export function Pill({
  tone = "neutral",
  icon,
  dot,
  busy,
  size = "default",
  children,
}: {
  tone?: Tone;
  icon?: IconName;
  dot?: boolean;
  /** Work in progress: a slowly turning dashed ring instead of the dot. */
  busy?: boolean;
  size?: "sm" | "default" | "lg";
  children: ReactNode;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1.5 border-0 font-semibold shadow-none transition-colors",
        size === "sm" ? "h-auto rounded-lg px-2.5 py-0.5 text-[11px]" : size === "lg" ? "h-auto min-h-9 rounded-2xl px-3.5 py-1 text-sm" : "h-auto min-h-7 rounded-xl px-3 py-1 text-xs",
        TONE[tone].soft
      )}
    >
      {icon ? (
        <Icon name={icon} className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      ) : busy ? (
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 animate-[spin_6s_linear_infinite]">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="3.6 3.1" strokeLinecap="round" />
        </svg>
      ) : (
        (dot ?? true) && <span className={cn("shrink-0 rounded-full", size === "sm" ? "h-1.5 w-1.5" : "h-2 w-2", TONE[tone].dot)} aria-hidden />
      )}
      {children}
    </Badge>
  );
}

const BTN_VARIANT = { primary: "default", secondary: "outline", ghost: "ghost", danger: "destructive" } as const;

export type BtnSize = "default" | "sm" | "lg";

const BTN_SIZE_CLASSES: Record<BtnSize, string> = {
  default: "h-auto min-h-11 md:min-h-10 px-4 text-sm rounded-2xl",
  sm: "h-auto min-h-8 px-3 py-1 text-xs rounded-xl",
  lg: "h-auto min-h-12 px-5 text-base rounded-2xl",
};

const glowStyle = {
  background:
    "radial-gradient(130% 100% at 0% 0%, oklch(0.87 0.14 62) 0%, oklch(0.78 0.17 20 / 0.55) 30%, transparent 64%), linear-gradient(165deg, color-mix(in oklch, var(--accent) 80%, oklch(0.72 0.2 335)) 0%, var(--accent) 100%)",
  // No ring-as-outline: use inset + drop to avoid the 1px gap the border creates
  boxShadow: "inset 0 1px 0 0 rgb(255 255 255 / 0.35), 0 8px 22px -6px color-mix(in srgb, var(--accent) 55%, transparent)",
} as const;

const flatPrimaryStyle = {
  boxShadow: "0 6px 16px -6px color-mix(in srgb, var(--accent) 60%, transparent)",
} as const;

const TONE_CLASSES = {
  // border-0 bg-clip-border to prevent the base <Button> from inserting a gap before boxShadow rings
  primary: "border-0 bg-clip-border font-semibold text-white",
  secondary: "border-0 bg-surface text-ink2 shadow-[var(--shadow-soft)] hover:text-ink hover:shadow-[var(--shadow-panel)]",
  ghost: "border-0 bg-transparent text-ink2 hover:bg-surface3 hover:text-ink shadow-none",
  danger: "border-0 bg-surface text-crit shadow-[var(--shadow-soft)] hover:bg-crit/10 hover:shadow-[var(--shadow-panel)]",
} as const;

export function Btn({
  tone = "secondary",
  size = "default",
  icon,
  loading,
  children,
  className = "",
  style,
  flat,
  ...rest
}: Omit<React.ComponentProps<typeof Button>, "variant" | "size"> & {
  tone?: keyof typeof BTN_VARIANT;
  size?: BtnSize;
  icon?: IconName;
  loading?: boolean;
  flat?: boolean;
}) {
  const isGlow = tone === "primary" && !flat;
  const computedStyle = isGlow
    ? { ...glowStyle, ...style }
    : tone === "primary"
      ? { ...flatPrimaryStyle, ...style }
      : style;

  // primary tone needs border:none in inline style because the base <Button> variant
  // adds `border border-transparent bg-clip-padding` which creates a 1-px transparent gap
  // before any box-shadow ring. bg-clip-border + border:none closes that gap.
  const inlineStyle =
    tone === "primary"
      ? { border: "none", backgroundClip: "border-box", ...computedStyle }
      : computedStyle;

  return (
    <Button
      {...rest}
      variant={tone === "secondary" ? "outline" : tone === "danger" ? "destructive" : tone === "ghost" ? "ghost" : "default"}
      disabled={rest.disabled || loading}
      style={inlineStyle}
      className={cn(
        "press inline-flex select-none items-center justify-center gap-2 font-medium outline-none transition-[box-shadow,background-color,color] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:pointer-events-none disabled:opacity-50",
        BTN_SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        tone === "primary" && flat && "bg-[var(--accent)]",
        className
      )}
    >
      {icon && <Icon name={icon} className={cn(size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4", loading ? "animate-spin" : "")} />}
      {children}
    </Button>
  );
}

function useIsPhone() {
  const q = "(max-width: 639px)";
  const [phone, setPhone] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

/** Where a flick would come to rest, using Apple's scroll-deceleration form (velocity in px/s, result in px). */
const project = (v: number, rate = 0.998) => ((v / 1000) * rate) / (1 - rate);
/** Past a boundary the thing follows less and less, so the edge feels soft instead of hard. */
const rubberband = (overshoot: number, dimension: number, c = 0.55) => (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));

/**
 * Drag-to-dismiss for a bottom sheet. It tracks the finger 1:1 from wherever the sheet is on screen (so it can be grabbed
 * mid-animation), resists upward pulls, and on release uses the flick's velocity to decide: dismiss or settle back.
 */
function useSheetDrag(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; pos: number; hist: Array<[number, number]> } | null>(null);
  const live = (el: HTMLElement) => {
    const t = getComputedStyle(el).transform;
    return t === "none" ? 0 : new DOMMatrixReadOnly(t).m42;
  };
  const ease = "cubic-bezier(0.32, 0.72, 0, 1)";
  const end = () => {
    const el = ref.current;
    const d = drag.current;
    drag.current = null;
    if (!el || !d) return;
    const recent = d.hist.filter(([t]) => performance.now() - t < 100);
    const first = recent[0], last = recent[recent.length - 1];
    const v = first && last && last[0] > first[0] ? ((last[1] - first[1]) / (last[0] - first[0])) * 1000 : 0;
    const h = el.offsetHeight;
    if (d.pos + project(v) > h * 0.5 || v > 900) {
      el.style.transition = `transform 280ms ${ease}`;
      el.style.transform = `translateY(${h + 48}px)`;
      window.setTimeout(onDismiss, 220);
    } else {
      el.style.transition = `transform 420ms ${ease}`;
      el.style.transform = "translateY(0)";
      window.setTimeout(() => { el.style.transition = ""; el.style.transform = ""; }, 440);
    }
  };
  const handlers = {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      const el = ref.current;
      if (!el) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const base = live(el);
      el.style.transition = "none";
      el.style.transform = `translateY(${base}px)`;
      drag.current = { y0: e.clientY - base, pos: base, hist: [[performance.now(), e.clientY]] };
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const el = ref.current;
      const d = drag.current;
      if (!el || !d) return;
      d.pos = e.clientY - d.y0;
      d.hist.push([performance.now(), e.clientY]);
      if (d.hist.length > 6) d.hist.shift();
      el.style.transform = `translateY(${d.pos >= 0 ? d.pos : -rubberband(-d.pos, el.offsetHeight)}px)`;
    },
    onPointerUp: end,
    onPointerCancel: end,
  };
  return { ref, handlers };
}

/**
 * Modal sheet: rises from the bottom on phones, slides in from the right on larger screens.
 * Escape, the scrim and the close button dismiss it; focus is trapped and restored (Base UI).
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const phone = useIsPhone();
  const { ref, handlers } = useSheetDrag(onClose);
  return (
    <UiSheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        ref={ref}
        side={phone ? "bottom" : "right"}
        data-glass={phone ? "" : undefined}
        className={cn("overflow-y-auto bg-background p-4", phone ? `max-h-[90dvh] rounded-t-[28px] pb-[max(1rem,env(safe-area-inset-bottom))] pt-6 ${glassThickCls}` : "sm:max-w-md")}
      >
        {phone && (
          <div {...handlers} aria-hidden className="absolute inset-x-0 top-0 z-10 flex h-8 cursor-grab touch-none items-start justify-center pt-2 active:cursor-grabbing">
            <span className="h-1 w-9 rounded-full bg-ink/20" />
          </div>
        )}
        <SheetTitle className="sr-only">{title}</SheetTitle>
        <SheetDescription className="sr-only">{title}</SheetDescription>
        {children}
      </SheetContent>
    </UiSheet>
  );
}

/** Destructive action that needs a second tap, so no browser confirm() popup. */
export function ConfirmBtn({ label, confirmLabel = "Tap again to confirm", icon = "trash", onConfirm }: { label: string; confirmLabel?: string; icon?: IconName; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!armed) {
    return (
      <Btn
        tone="danger"
        icon={icon}
        onClick={() => {
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), 4000);
        }}
      >
        {label}
      </Btn>
    );
  }
  return (
    <span className="inline-flex min-h-11 md:min-h-10 items-center gap-1.5 rounded-2xl bg-surface p-1 shadow-[var(--shadow-soft)]">
      <Btn tone="danger" size="sm" className="rounded-xl" onClick={onConfirm}>
        {confirmLabel}
      </Btn>
      <Btn tone="ghost" size="sm" className="rounded-xl" onClick={() => setArmed(false)}>
        Cancel
      </Btn>
    </span>
  );
}

export function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title="Copy"
      aria-label={label ?? "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: nothing to do */
        }
      }}
      className={cn(
        "press inline-flex min-h-11 md:min-h-10 select-none items-center justify-center gap-2 rounded-2xl px-4 text-sm font-medium transition-[box-shadow,background-color,color] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40",
        done
          ? `${TONE.good.soft} shadow-[var(--shadow-soft)]`
          : "bg-surface text-ink2 shadow-[var(--shadow-soft)] hover:text-ink hover:shadow-[var(--shadow-panel)]"
      )}
    >
      <Icon name={done ? "check" : "copy"} className={cn("h-4 w-4", done && "text-good")} />
      {label && <span>{done ? "Copied" : label}</span>}
    </button>
  );
}

export function Section({
  id,
  step,
  done,
  icon,
  title,
  hint,
  action,
  children,
}: {
  id: string;
  step: number;
  done?: boolean;
  icon: IconName;
  title: string;
  hint: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              done ? "bg-good/12 text-good" : "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-musawara-ink"
            }`}
          >
            <Icon name={done ? "check" : icon} className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight text-ink">
              <span className="mr-1.5 text-muted">{step}.</span>
              {title}
            </h2>
            <p className="text-xs text-muted">{hint}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  // A raised card. No default padding: lists, tables and the inbox fill it edge to edge, and forms add their own (p-4, p-5).
  return <div className={cn("rounded-2xl bg-surface shadow-[var(--shadow-soft)]", className)}>{children}</div>;
}

/** A small raised card: a quiet title row on top, the number or summary below. */
export function Nested({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-surface p-3 shadow-[var(--shadow-soft)] ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-2 px-1 pb-2 pt-0.5 text-xs font-semibold text-ink2">
          <span className="min-w-0 truncate">{title}</span>
          {right}
        </div>
      )}
      <div className="px-1">{children}</div>
    </div>
  );
}

/**
 * Bento tile: a free-standing white card with a large radius, used for dashboards where each tile
 * is one widget (a number, a chart, a table). Title and right slot sit in the top row.
 */
export function Bento({ title, subtitle, right, children, className = "" }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-3xl bg-surface p-5 shadow-[var(--shadow-soft)]", className)}>
      {(title || right) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-base font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

/** One surface holding rows separated by hairlines: the way to show a list, instead of a box per item. */
export function RowList({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`divide-y divide-border/50 overflow-hidden rounded-2xl bg-surface shadow-[var(--shadow-soft)] ${className}`}>{children}</ul>;
}

/** The one empty state: an icon tile, what is missing, what to do about it. `compact` for inside a card or a list. */
export function Empty({ icon = "info", title, hint, action, compact }: { icon?: IconName; title: string; hint?: string; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl bg-surface text-center shadow-[var(--shadow-soft)] ${compact ? "px-4 py-6" : "px-6 py-10"}`}>
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface3 text-ink2">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
