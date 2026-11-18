// All alerts of one client: open ones first, team members can acknowledge them.

import { api, useApi } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { AlertFeed, type Alert } from "../components/AlertFeed";
import { Bento } from "../components/kit";
import { CardSkeleton, ErrorState } from "../components/ui";

export function ClientAlerts({ clientId }: { clientId: number }) {
  const { user } = useAuth();
  const alerts = useApi<{ alerts: Alert[] }>(`/clients/${clientId}/alerts`);
  if (alerts.error) return <ErrorState message={alerts.error} onRetry={alerts.reload} />;
  if (alerts.loading && !alerts.data) return <CardSkeleton lines={4} />;
  const list = alerts.data?.alerts ?? [];
  const open = list.filter((a) => !a.acknowledged).length;
  return (
    <Bento title="Alerts" subtitle={open ? `${open} open` : "Nothing open"} className="max-w-3xl">
      <AlertFeed
        inCard
        alerts={list}
        onAck={
          user?.role === "admin"
            ? async (id) => {
                await api(`/admin/alerts/${id}/ack`, { method: "POST", body: {} });
                alerts.reload();
              }
            : undefined
        }
      />
    </Bento>
  );
}
