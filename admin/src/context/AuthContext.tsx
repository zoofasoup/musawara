import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearApiCache } from "../lib/api";

import type { ClientRole, StaffRole } from "../../shared/permissions";

export type User = {
  id: number;
  email: string;
  name: string;
  role: "admin" | "client";
  client_id: number | null;
  /** Team members only: Owner, Ads, Content or CRM. null = no role yet, so no access. */
  staff_role: StaffRole | null;
  /** Client logins only: viewer (reads) or approver (decides on approvals). */
  client_role: ClientRole | null;
  /** Has a second factor set up. */
  two_factor?: boolean;
  /** Two-factor is required for the team and this account has none yet: only the set-up screen opens. */
  mfa_required?: boolean;
};
export type ClientInfo = { id: number; name: string; slug: string; logo_url: string | null; brand_color: string };

type AuthState = {
  user: User | null;
  client: ClientInfo | null; // set for client-role users
  ready: boolean;
  /** Resolves with `{ twoFactor: true }` when a code is still needed (finish with verifyTwoFactor). */
  login: (email: string, password: string) => Promise<{ twoFactor: true } | void>;
  verifyTwoFactor: (code: string, backup?: boolean) => Promise<void>;
  /** Re-read who is signed in (after setting up or turning off two-factor). */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setSession: (user: User, client?: ClientInfo | null) => void;
};

const AuthContext = createContext<AuthState>(null as any);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<{ user: User; client: ClientInfo | null }>("/auth/me")
      .then((d) => {
        setUser(d.user);
        setClient(d.client);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const refresh = useCallback(async () => {
    clearApiCache();
    const me = await api<{ user: User; client: ClientInfo | null }>("/auth/me");
    setUser(me.user);
    setClient(me.client);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const d = await api<{ user?: User; twoFactor?: boolean }>("/auth/login", { body: { email, password } });
    if (d.twoFactor) return { twoFactor: true as const };
    if (!d.user) throw new Error("Invalid sign-in response");
    await refresh();
  }, [refresh]);

  const verifyTwoFactor = useCallback(async (code: string, backup = false) => {
    await api(`/auth/two-factor/${backup ? "verify-backup-code" : "verify-totp"}`, { body: { code: code.replace(/\s/g, "") } });
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    clearApiCache();
    setUser(null);
    setClient(null);
  }, []);

  const setSession = useCallback((u: User, c?: ClientInfo | null) => {
    clearApiCache();
    setUser(u);
    setClient(c ?? null);
  }, []);

  return <AuthContext.Provider value={{ user, client, ready, login, verifyTwoFactor, refresh, logout, setSession }}>{children}</AuthContext.Provider>;
}
