// /assets: the asset library is per client, so this sends the team to the chosen client's library,
// or asks which client when "All clients" is selected.
import { Link, Navigate } from "react-router-dom";
import { useClientScope } from "../context/ClientScope";
import { CardSkeleton } from "../components/ui";
import { Empty, Panel } from "../components/kit";

export function AssetsEntry() {
  const { clients, clientId, loading } = useClientScope();
  if (clientId !== null) return <Navigate to={`/c/${clientId}/assets`} replace />;
  if (loading) return <CardSkeleton lines={3} />;
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-ink">Asset library</h1>
      <p className="mt-1 text-sm text-ink2">Pick a client to open their library of Google Drive links.</p>
      <div className="mt-5">
        {clients.length === 0 ? (
          <Empty icon="building" title="No clients yet" hint="Add a client in Settings first." />
        ) : (
          <Panel className="divide-y divide-border">
            {clients.map((c) => (
              <Link key={c.id} to={`/c/${c.id}/assets`} className="flex min-h-12 items-center justify-between px-3.5 text-sm font-medium text-ink hover:bg-surface2/60">
                {c.name}
                <span aria-hidden className="text-muted">›</span>
              </Link>
            ))}
          </Panel>
        )}
      </div>
    </div>
  );
}
