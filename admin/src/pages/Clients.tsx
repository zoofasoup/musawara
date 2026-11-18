// All clients: pick one to open its dashboard. This is where you go to work on a single client.
import { Link } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { useApi } from "../lib/api";
import { fmtNum, fmtRp } from "../lib/format";
import { ClientAvatar } from "../components/Layout";
import { Bento, Empty } from "../components/kit";
import { CardSkeleton, ErrorState } from "../components/ui";

type Row = { id: number; name: string; logo_url: string | null; brand_color: string; totals: { spend: number; leads: number; purchases: number }; unacknowledged_alerts: number };

export function Clients() {
  const { data, error, loading, reload } = useApi<{ clients: Row[] }>("/admin/overview");
  if (loading && !data) return <CardSkeleton lines={4} />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="Clients" subtitle="Open a client to see its ads, sales, content and files in one place." actions={<Link to="/settings" className="inline-flex min-h-11 items-center text-xs font-medium text-musawara-ink hover:underline">Add a client in Settings</Link>} />
      {data.clients.length === 0 ? (
        <Empty title="No clients yet" hint="Add your first client in Settings." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.clients.map((c) => (
            <Link key={c.id} to={`/c/${c.id}`} className="press block" style={{ ["--accent" as any]: c.brand_color }}>
              <Bento className="h-full transition-colors hover:bg-surface2/60">
                <div className="flex items-center gap-3">
                  <ClientAvatar name={c.name} logoUrl={c.logo_url} color={c.brand_color} size={10} />
                  <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{c.name}</p>
                  {c.unacknowledged_alerts > 0 && <span className="tnum rounded-full bg-crit/10 px-2 py-0.5 text-xs font-semibold text-crit" title="Open alerts">{c.unacknowledged_alerts}</span>}
                </div>
                <dl className="tnum mt-4 grid grid-cols-3 gap-2 text-sm">
                  <div className="min-w-0"><dt className="text-xs text-muted">Spend</dt><dd className="truncate font-semibold text-ink">{c.totals.spend ? fmtRp(c.totals.spend) : "–"}</dd></div>
                  <div><dt className="text-xs text-muted">Leads</dt><dd className="font-semibold text-ink">{c.totals.leads ? fmtNum(c.totals.leads) : "–"}</dd></div>
                  <div><dt className="text-xs text-muted">Purchases</dt><dd className="font-semibold text-ink">{c.totals.purchases ? fmtNum(c.totals.purchases) : "–"}</dd></div>
                </dl>
                <p className="mt-3 text-xs text-muted">This month</p>
              </Bento>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
