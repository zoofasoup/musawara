// Shared building blocks (buttons, inputs, panels, pills, toasts): section shell, buttons, pills,
// confirm/copy helpers and a tiny toast host (replaces alert()/confirm()).

import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export type Notify = (text: string, kind?: "ok" | "err") => void;

export function useNotify() {
  const [items, setItems] = useState<Array<{ id: number; text: string; kind: "ok" | "err" }>>([]);
  const notify = useCallback<Notify>((text, kind = "ok") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s, { id, text, kind }]);
    setTimeout(() => setItems((s) => s.filter((i) => i.id !== id)), kind === "err" ? 8000 : 3500);
  }, []);
  const node = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end">
      {items.map((i) => (
        <div
          key={i.id}
          role={i.kind === "err" ? "alert" : "status"}
          className={`pointer-events-auto flex max-w-md items-start gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] shadow-[var(--shadow-panel)] ${
            i.kind === "err" ? "border-crit/30 bg-surface text-crit" : "border-good/30 bg-surface text-ink"
          }`}
        >
          <Icon name={i.kind === "err" ? "alert" : "checkCircle"} className={`mt-0.5 h-4 w-4 ${i.kind === "err" ? "text-crit" : "text-good"}`} />
          <span className="break-words">{i.text}</span>
        </div>
      ))}
    </div>
  );
  return { notify, node };
}

const TONES = {
  neutral: "bg-surface3 text-ink2",
  good: "bg-good/12 text-good",
  warn: "bg-warn/12 text-warn",
  crit: "bg-crit/10 text-crit",
  accent: "bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-musawara-ink",
} as const;
export type Tone = keyof typeof TONES;

export function Pill({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  );
}

const BTN = {
  primary: "bg-[var(--accent)] text-[var(--on-accent)] hover:opacity-90",
  secondary: "border border-border2 bg-surface text-ink hover:bg-surface2",
  ghost: "text-ink2 hover:bg-surface2 hover:text-ink",
  danger: "text-crit hover:bg-crit/10",
} as const;

export function Btn({
  tone = "secondary",
  icon,
  loading,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof BTN; icon?: IconName; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BTN[tone]} ${className}`}
    >
      {icon && <Icon name={icon} className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
      {children}
    </button>
  );
}

export const inputCls =
  "min-h-11 w-full rounded-lg border border-border2 bg-surface px-3 text-sm text-ink placeholder:text-muted outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";

export const selectCls = inputCls.replace("w-full", "w-full sm:w-auto");

/** Inline field and small neutral button for toolbars and rows (not full width). */
export const fieldCls =
  "min-h-11 min-w-0 rounded-lg border border-border2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20";
export const selectSmCls = "min-h-11 rounded-lg border border-border2 bg-bg px-2 text-xs text-ink outline-none focus:border-[var(--accent)]";
export const btnCls =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal sheet: bottom sheet on phones, centred card on larger screens.
 * Escape and the scrim close it, focus moves in and returns on close, Tab stays inside.
 */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const lock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !box.current) return;
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = lock;
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="sheet-scrim fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="sheet-body max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-bg p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl"
      >
        {children}
      </div>
    </div>
  );
}

/** Destructive action that needs a second tap, so no browser confirm() popup. */
export function ConfirmBtn({ label, confirmLabel = "Tap again to confirm", icon = "trash", onConfirm }: { label: string; confirmLabel?: string; icon?: IconName; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number>();
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
    <span className="inline-flex items-center gap-1">
      <Btn tone="danger" className="bg-crit/10" onClick={onConfirm}>
        {confirmLabel}
      </Btn>
      <Btn tone="ghost" onClick={() => setArmed(false)}>
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
      className="inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-lg px-2 text-xs text-ink2 hover:bg-surface2 hover:text-ink lg:h-7 lg:min-h-0 lg:min-w-0"
    >
      <Icon name={done ? "check" : "copy"} className={`h-3.5 w-3.5 ${done ? "text-good" : ""}`} />
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
  return <div className={`rounded-xl border border-border bg-surface ${className}`}>{children}</div>;
}

export function Empty({ icon, title, hint, action }: { icon: IconName; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border2 bg-surface px-6 py-10 text-center">
      <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface3 text-ink2">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted">{hint}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
