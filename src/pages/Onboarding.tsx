// Onboarding checklist for one client. Admin only. The team ticks items off as
// they happen; the brand knowledge line links to where that item is done.

import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { CardSkeleton, ErrorState, SectionTitle } from "../components/ui";

type State = {
  items: { id: number; label: string; done: number; done_at: string | null }[];
  brand: { filled: number; total: number };
};

const btn = "inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink";

export function Onboarding({ clientId }: { clientId: number }) {
  const { data, error, reload } = useApi<State>(`/admin/clients/${clientId}/onboarding`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string>();

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setActionError(undefined);
    try {
      await fn();
      reload();
    } catch (e: any) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <CardSkeleton lines={6} />;

  const done = data.items.filter((i) => i.done).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Onboarding</h1>
        <Link to={`/c/${clientId}`} className={btn}>
          Back to dashboard
        </Link>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border2 bg-surface p-6 text-center">
          <p className="mb-3 text-sm text-ink2">No onboarding started for this client.</p>
          <button className={btn} disabled={busy} onClick={() => run(() => api(`/admin/clients/${clientId}/onboarding/start`, { method: "POST", body: {} }))}>
            Start onboarding
          </button>
        </div>
      ) : (
        <div>
          <SectionTitle right={<span className="tnum text-xs text-muted">{done} of {data.items.length} done</span>}>Checklist</SectionTitle>
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface">
            {data.items.map((i) => (
              <li key={i.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={!!i.done}
                    disabled={busy}
                    onChange={(e) => run(() => api(`/admin/onboarding/${i.id}`, { method: "PUT", body: { done: e.target.checked } }))}
                    className="h-4 w-4"
                  />
                  <span className={`text-sm ${i.done ? "text-muted line-through" : "text-ink"}`}>{i.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-ink2">
        Brand knowledge: <span className="tnum">{data.brand.filled} of {data.brand.total}</span> sections filled.{" "}
        <Link to={`/c/${clientId}/brand`} className="text-ink underline underline-offset-2">
          Open brand knowledge
        </Link>
      </p>
      {actionError && <p role="alert" className="text-xs text-crit">{actionError}</p>}
    </div>
  );
}
