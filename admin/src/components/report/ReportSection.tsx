// Building blocks of the client report: a section with its plain-language summary, a metrics
// strip, and a simple bar list. Cards avoid page breaks inside them when printed.

import type { ReactNode } from "react";

export function ReportSection({ title, summary, note, children }: { title: string; summary: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="report-section mb-8">
      <h2 className="text-base font-bold leading-tight text-ink">{title}</h2>
      <p className="mb-3 mt-1 max-w-3xl text-sm leading-relaxed text-ink2">{summary}</p>
      {children}
      {note && <p className="mt-2 text-xs text-muted">{note}</p>}
    </section>
  );
}

export function SubTitle({ children }: { children: ReactNode }) {
  return <h3 className="report-keep mb-2 mt-5 text-xs font-medium uppercase tracking-wider text-ink2">{children}</h3>;
}

/** Cells that KpiCard draws with `flat`: the strip supplies the outer border and radius. */
export function MetricStrip({ children, cols = "grid-cols-2 sm:grid-cols-4" }: { children: ReactNode; cols?: string }) {
  return (
    <div className="report-card overflow-hidden rounded-xl border border-border bg-surface">
      <div className={`-mb-px -mr-px grid ${cols}`}>{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`report-card rounded-xl border border-border bg-surface ${className}`}>{children}</div>;
}

/** Horizontal bars sized by count, with the count and the revenue written out (no colour-only meaning). */
export function BarList({ rows, money }: { rows: Array<{ label: string; count: number; revenue?: number }>; money: (v: number) => string }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.label} className="px-3.5 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="min-w-0 text-sm text-ink">{r.label}</span>
            <span className="tnum text-xs text-ink2">
              {r.count} {r.count === 1 ? "sale" : "sales"}
              {r.revenue != null && <> · {money(r.revenue)}</>}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-surface3" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${(r.count / max) * 100}%`, background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

export function Thumb({ src, alt = "", fallback }: { src: string | null; alt?: string; fallback: string }) {
  return src ? (
    <img src={src} alt={alt} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => ((e.currentTarget.style.display = "none"))} />
  ) : (
    <div className="flex h-full w-full items-center justify-center text-xs text-muted">{fallback}</div>
  );
}
