// CRM calls go through the platform proxy: /api/crm/<path> -> gateway /api/<path>.
// Every call carries X-WA-Account with the number picked in the account switcher, so pages never pass it.
import { useEffect, useRef, useSyncExternalStore } from "react";
import { api, ApiError, useApi } from "../../lib/api";

/* ---------- selected WhatsApp account (module-level store, persisted) ---------- */

const KEY = "crm.account";
let accountId: number | null = null;
try {
  const v = Number(localStorage.getItem(KEY));
  if (Number.isInteger(v) && v > 0) accountId = v;
} catch {
  /* storage blocked: start on the gateway default */
}
const listeners = new Set<() => void>();

export const getAccountId = () => accountId;

export function setAccountId(id: number | null) {
  if (id === accountId) return;
  accountId = id;
  try {
    if (id === null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

/** Selected account id, or null when none was chosen yet (the gateway then uses its default). */
export function useAccountId() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    getAccountId,
    getAccountId
  );
}

/** `account=<id>` for URLs that cannot carry the X-WA-Account header (images, downloads); empty on the default number. */
export const accountParam = () => (accountId === null ? "" : `account=${accountId}`);

const accountHeaders = (): Record<string, string> => (accountId === null ? {} : { "X-WA-Account": String(accountId) });

/* ---------- calls ---------- */

export const crm = <T = any>(path: string, opts?: { method?: string; body?: unknown }) =>
  api<T>("/crm" + path, { ...opts, headers: accountHeaders() });

/** Declarative GET against the gateway — pass null to skip. Refetches when the account changes. */
export const useCrm = <T = any>(path: string | null) => {
  const id = useAccountId();
  return useApi<T>(path === null ? null : "/crm" + path, { headers: accountHeaders(), key: String(id) });
};

/** Multipart request (media uploads, CSV import). The browser sets the boundary header. */
export async function crmUpload<T = any>(path: string, form: FormData, method = "POST"): Promise<T> {
  const res = await fetch("/api/crm" + path, { method, credentials: "include", headers: accountHeaders(), body: form });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data?.code);
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
