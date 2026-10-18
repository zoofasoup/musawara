import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";

export type User = { id: number; email: string; name: string; role: "admin" | "client"; client_id: number | null };
export type ClientInfo = { id: number; name: string; slug: string; logo_url: string | null; brand_color: string };

type AuthState = {
  user: User | null;
  client: ClientInfo | null; // set for client-role users
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    const d = await api<{ user: User }>("/auth/login", { body: { email, password } });
    setUser(d.user);
    if (d.user.client_id) {
      const me = await api<{ client: ClientInfo | null }>("/auth/me");
      setClient(me.client);
    }
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    setUser(null);
    setClient(null);
  }, []);

  const setSession = useCallback((u: User, c?: ClientInfo | null) => {
    setUser(u);
    setClient(c ?? null);
  }, []);

  return <AuthContext.Provider value={{ user, client, ready, login, logout, setSession }}>{children}</AuthContext.Provider>;
}
