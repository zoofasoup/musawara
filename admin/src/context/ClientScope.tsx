// The team's "which client am I looking at" choice, shared by every page and kept across visits.
// null means all clients. Pages that need exactly one client use `clientId ?? first client`.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "./AuthContext";

export type ScopeClient = { id: number; name: string };
type Scope = {
  clients: ScopeClient[];
  loading: boolean;
  /** The chosen client, or null for all clients. */
  clientId: number | null;
  setClientId: (id: number | null) => void;
  /** The chosen client, or the first one when "all" is chosen. For pages that work on a single client. */
  singleId: number | null;
};

const KEY = "ma_client_scope";
const Ctx = createContext<Scope>({ clients: [], loading: false, clientId: null, setClientId: () => {}, singleId: null });
export const useClientScope = () => useContext(Ctx);

function stored(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function ClientScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [clients, setClients] = useState<ScopeClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [clientId, setId] = useState<number | null>(stored);

  useEffect(() => {
    if (!isAdmin) {
      setClients([]);
      return;
    }
    let alive = true;
    setLoading(true);
    api<{ clients: ScopeClient[] }>("/admin/clients")
      .then((d) => alive && setClients(d.clients))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isAdmin]);

  // A saved choice for a client that no longer exists falls back to "all".
  const valid = clientId !== null && (loading || clients.length === 0 || clients.some((c) => c.id === clientId)) ? clientId : null;

  const setClientId = useCallback((id: number | null) => {
    setId(id);
    try {
      if (id === null) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, String(id));
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
  }, []);

  const value = useMemo<Scope>(
    () => ({ clients, loading, clientId: valid, setClientId, singleId: valid ?? clients[0]?.id ?? null }),
    [clients, loading, valid, setClientId]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
