import { useCallback, useEffect, useRef, useState } from "react";

let shareToken: string | null = null;
/** Share-link views authenticate every data request with this header token. */
export function setShareToken(token: string | null) {
  shareToken = token;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (shareToken) headers["X-Share-Token"] = shareToken;
  const res = await fetch("/api" + path, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    credentials: "include",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Declarative GET with loading/error/reload — pass null to skip. */
// Mount point of the SPA, without trailing slash ("/admin" in production).
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useApi<T = any>(path: string | null) {
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
    let alive = true;
    setLoading(true);
    setError(undefined);
    api<T>(path)
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
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload };
}
