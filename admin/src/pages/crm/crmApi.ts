// CRM calls go through the platform proxy: /api/crm/<path> -> gateway /api/<path>.
import { useEffect, useRef } from "react";
import { api, ApiError, useApi } from "../../lib/api";

export const crm = <T = any>(path: string, opts?: { method?: string; body?: unknown }) => api<T>("/crm" + path, opts);

/** Declarative GET against the gateway — pass null to skip. */
export const useCrm = <T = any>(path: string | null) => useApi<T>(path === null ? null : "/crm" + path);

/** Multipart request (media uploads, CSV import). The browser sets the boundary header. */
export async function crmUpload<T = any>(path: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch("/api/crm" + path, { method, credentials: "include", body: form });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status);
  return data as T;
}

/** Calls fn every `ms` while the tab is visible (the gateway has no push channel through the Worker). */
export function usePoll(fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
