// A form row: label above, the control, then a hint or an error. The label wraps the control, so tapping the label focuses it
// and screen readers read them together. Use for every labelled input, select, textarea in a form; do not hand-write label markup.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormField({ label, hint, error, optional, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; optional?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-ink2">
        {label}
        {optional && <span className="font-normal text-muted">optional</span>}
      </span>
      {children}
      {error ? (
        <span role="alert" className="mt-1 block text-xs text-crit">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-muted">{hint}</span>
      )}
    </label>
  );
}

/** Fields in a grid: one column on phones, two from tablet. */
export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
