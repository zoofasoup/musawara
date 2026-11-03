import { fmtDateTime } from "../lib/format";
import { EmptyState, SeverityDot } from "./ui";

export type Alert = {
  id: number;
  type: string;
  severity: string;
  message: string;
  date: string | null;
  acknowledged: number;
  created_at: string;
  entity_name?: string | null;
  account_name?: string | null;
  client_name?: string | null;
  client_id?: number;
};

const TYPE_LABELS: Record<string, string> = {
  cpr_spike: "CPR spike",
  creative_fatigue: "Creative fatigue",
  zero_results: "Zero results",
  budget_pacing: "Budget pacing",
  sync_failure: "Sync failure",
};

export function AlertFeed({
  alerts,
  onAck,
  showClient = false,
}: {
  alerts: Alert[];
  onAck?: (id: number) => void;
  showClient?: boolean;
}) {
  if (alerts.length === 0) {
    return <EmptyState title="No alerts" hint="Anomaly detection runs after every sync." />;
  }
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {alerts.map((a) => (
        <li key={a.id} className={`flex items-start gap-2.5 px-3.5 py-3 ${a.acknowledged ? "opacity-45" : ""}`}>
          <SeverityDot severity={a.severity} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-snug text-ink">{a.message}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {showClient && a.client_name ? `${a.client_name} · ` : ""}
              {TYPE_LABELS[a.type] ?? a.type} · {fmtDateTime(a.created_at)}
              {a.acknowledged ? " · acknowledged" : ""}
            </p>
          </div>
          {onAck && !a.acknowledged && (
            <button
              onClick={() => onAck(a.id)}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-border2 bg-surface px-3 text-[11px] font-medium text-ink2 hover:bg-surface3 hover:text-ink"
            >
              Ack
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
