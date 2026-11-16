import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, setShareToken } from "../lib/api";
import { ReportView } from "../components/report/ReportView";
import { Wordmark } from "../components/Layout";
import { CardSkeleton, ErrorState } from "../components/ui";

/** Combined report (ads, organic, sales) for one client and period. */
export function ClientReport({ clientId }: { clientId: number }) {
  return <ReportView clientId={clientId} />;
}

/** The same report opened from a share link (/share/:token/report), no login. */
export function ShareReport() {
  const { token } = useParams();
  const [client, setClient] = useState<{ id: number; name: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setShareToken(token ?? null);
    api<{ client: any }>(`/share/${token}`)
      .then((d) => setClient(d.client))
      .catch((e: any) => setError(e.message));
    return () => setShareToken(null);
  }, [token]);

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-7xl px-4 py-6">
        {error ? (
          <div className="mx-auto max-w-md pt-20"><ErrorState message={error} /></div>
        ) : !client ? (
          <CardSkeleton lines={6} />
        ) : (
          <ReportView clientId={client.id} share />
        )}
      </main>
      <footer className="border-t border-border py-5 text-center print:hidden">
        <span className="text-xs text-muted">Powered by </span>
        <Wordmark compact />
      </footer>
    </div>
  );
}
