// Share-link surface: same ClientDashboard, read-only, no nav,
// "Powered by Musawara Creative" footer.

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, setShareToken } from "../lib/api";
import { ClientDashboard } from "./ClientDashboard";
import { Wordmark } from "../components/Layout";
import { CardSkeleton, ErrorState } from "../components/ui";

export function ShareView() {
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
          <div className="mx-auto max-w-md pt-20">
            <ErrorState message={error} />
          </div>
        ) : !client ? (
          <CardSkeleton lines={6} />
        ) : (
          <ClientDashboard clientId={client.id} share />
        )}
      </main>
      <footer className="border-t border-border py-5 text-center">
        <span className="text-[11px] text-muted">Powered by </span>
        <Wordmark compact />
      </footer>
    </div>
  );
}
