import { useCallback, useEffect, useRef, useState } from "react";
import { CRM_ONLY } from "./product";

let shareToken: string | null = null;
/** Share-link views authenticate every data request with this header token. */
export function setShareToken(token: string | null) {
  shareToken = token;
}

export class ApiError extends Error {
  status: number;
  /** Machine-readable reason when the API sends one (the CRM proxy: gateway_unconfigured, gateway_down). */
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (shareToken) headers["X-Share-Token"] = shareToken;
  const res = await fetch("/api" + path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    credentials: "include",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
  return data as T;
}

/** Declarative GET with loading/error/reload — pass null to skip. */
// Where the built files live, without trailing slash ("/admin" in production). Logos and other static files load from here on every host.
export const ASSET_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
// Mount point of the routes. On app.* and portal.* the SPA sits at the root of the host (see portal/worker.ts).
export const BASE = /^(app|portal)\./.test(window.location.hostname) ? "" : ASSET_BASE;

/** The host an account with this role signs in at: team on app.*, clients on portal.*. Anywhere else (local dev) the current origin. */
export function homeOrigin(role: "admin" | "client"): string {
  if (CRM_ONLY) return window.location.origin + ASSET_BASE;
  const host = window.location.hostname;
  if (host === "musawara.id" || host.endsWith(".musawara.id")) return `https://${role === "admin" ? "app" : "portal"}.musawara.id`;
  return window.location.origin + ASSET_BASE;
}

// Last answer per request, so going back to a page shows what it had at once and refreshes underneath
// instead of blanking to a skeleton. Cleared on sign-out so one user's data never reaches the next.
const answers = new Map<string, unknown>();
const cacheClearers = new Set<() => void>();
/** Other caches (the WhatsApp gateway answers) register here so sign-out empties them too. */
export const onClearCache = (fn: () => void) => void cacheClearers.add(fn);
export const clearApiCache = () => { answers.clear(); cacheClearers.forEach((fn) => fn()); };

export function useApi<T = any>(path: string | null, extra?: { headers?: Record<string, string>; key?: string }) {
  const headersRef = useRef(extra?.headers);
  headersRef.current = extra?.headers;
  const cacheKey = path ? path + "|" + (extra?.key ?? "") : null;
  const keyRef = useRef(cacheKey);
  const [data, setData] = useState<T | undefined>(() => (cacheKey ? (answers.get(cacheKey) as T | undefined) : undefined));
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(path) && data === undefined);
  const [tick, setTick] = useState(0);
  const pathRef = useRef(path);
  pathRef.current = path;

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    if (keyRef.current !== cacheKey) {
      keyRef.current = cacheKey; // a different key (for example another account) must not show the previous answer
      setData(cacheKey ? (answers.get(cacheKey) as T | undefined) : undefined);
    }
    let alive = true;
    if (!(cacheKey && answers.has(cacheKey))) setLoading(true);
    setError(undefined);
    api<T>(path, { headers: headersRef.current })
      .then((d) => {
        if (cacheKey) answers.set(cacheKey, d);
        if (alive && pathRef.current === path) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((e: any) => {
        if (alive && pathRef.current === path) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [path, cacheKey, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
