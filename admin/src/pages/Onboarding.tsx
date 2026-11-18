// Onboarding checklist for one client. Admin only. The team ticks items off as
// they happen; the brand knowledge line links to where that item is done.

import { buttonVariants } from "@/components/ui/button";
import { Callout } from "../components/Callout";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { CardSkeleton, ErrorState, SectionTitle } from "../components/ui";
import { Btn } from "../components/kit";

type State = {
  items: { id: number; label: string; done: number; done_at: string | null }[];
  brand: { filled: number; total: number };
};


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
        <Link to={`/c/${clientId}`} className={buttonVariants({ variant: "outline", className: "min-h-11 text-xs" })}>
          Back to dashboard
        </Link>
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border2 bg-surface p-6 text-center">
          <p className="mb-3 text-sm text-ink2">No onboarding started for this client.</p>
          <Btn tone="secondary" disabled={busy} onClick={() => run(() => api(`/admin/clients/${clientId}/onboarding/start`, { method: "POST", body: {} }))}>
            Start onboarding
          </Btn>
        </div>
      ) : (
        <div>
          <SectionTitle right={<span className="tnum text-xs text-muted">{done} of {data.items.length} done</span>}>Checklist</SectionTitle>
          <ul className="divide-y divide-border rounded-2xl bg-surface shadow-[var(--shadow-soft)]">
            {data.items.map((i) => (
              <li key={i.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5">
                  <Checkbox
                    checked={!!i.done}
                    disabled={busy}
                    onCheckedChange={(on) => run(() => api(`/admin/onboarding/${i.id}`, { method: "PUT", body: { done: on } }))}
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
        <Link to={`/c/${clientId}/brand`} className="inline-flex min-h-11 items-center text-ink underline underline-offset-2">
          Open brand knowledge
        </Link>
      </p>
      {actionError && <Callout tone="crit" compact>{actionError}</Callout>}
    </div>
  );
}
