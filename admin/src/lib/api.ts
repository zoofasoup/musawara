import { useCallback, useEffect, useRef, useState } from "react";

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

export function useApi<T = any>(path: string | null, extra?: { headers?: Record<string, string>; key?: string }) {
  const headersRef = useRef(extra?.headers);
  headersRef.current = extra?.headers;
  const cacheKey = path ? path + "|" + (extra?.key ?? "") : null;
  const keyRef = useRef(cacheKey);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(Boolean(path));
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
      setData(undefined);
    }
    let alive = true;
    setLoading(true);
    setError(undefined);
    api<T>(path, { headers: headersRef.current })
      .then((d) => {
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
