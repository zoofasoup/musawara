// One banner for "you should know this": data is stale, alerts are open, something is waiting, a gateway is down.
// Tinted fill, no border. Give it `to` to make the whole banner a link, or `action` for a button. Use `compact` inside cards.

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TONE = {
  info: { box: "bg-chart-4/10 text-chart-4", icon: Info },
  warn: { box: "bg-warn/12 text-warn", icon: AlertTriangle },
  crit: { box: "bg-crit/10 text-crit", icon: AlertCircle },
  good: { box: "bg-good/12 text-good", icon: CheckCircle2 },
  accent: { box: "bg-[color-mix(in_srgb,var(--accent)_10%,white)] text-musawara-ink", icon: Info },
} as const;
export type CalloutTone = keyof typeof TONE;

export function Callout({ tone = "info", title, children, to, action, compact, className }: { tone?: CalloutTone; title?: ReactNode; children?: ReactNode; to?: string; action?: ReactNode; compact?: boolean; className?: string }) {
  const { box, icon: Icon } = TONE[tone];
  const body = (
    <>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold leading-snug">{title}</p>}
        {children && <div className={cn("text-xs leading-relaxed", title ? "mt-0.5 text-ink2" : "text-[13px] text-inherit")}>{children}</div>}
      </div>
      {to && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 opacity-70" aria-hidden />}
      {action && <div className="shrink-0 self-center">{action}</div>}
    </>
  );
  const cls = cn("flex items-start gap-3 rounded-2xl", compact ? "px-3 py-2.5" : "px-4 py-3", box, to && "press min-h-11 hover:brightness-[0.98]", className);
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  return <div role={tone === "crit" || tone === "warn" ? "alert" : "status"} className={cls}>{body}</div>;
}
