// Shared pieces for the CRM data pages: gateway fetch hook with proper error classes,
// the failure panel, WhatsApp status polling, and ports of the gateway's phone/tag/template rules.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError } from "../../../lib/api";
import { crm, usePoll } from "../crmApi";
import { Btn, Panel } from "../../../components/kit";
import { Skeleton } from "@/components/ui/skeleton";

/* ---------- gateway rules (ported from wa-crm db.js / campaigns.js) ---------- */

/** Same rule as the gateway: Indonesian defaults (08xx and 8xx become 628xx), 10 to 15 digits. */
export function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return /^[1-9]\d{9,14}$/.test(d) ? d : null;
}

export function parseTags(input: unknown): string[] {
  const list = Array.isArray(input) ? input : String(input ?? "").split(/[,;]/);
  return [...new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
}

export const fmtPhone = (p: string | null | undefined) => (p ? "+" + p : "");

export const PLACEHOLDERS = [
  { token: "{nama}", alt: "{name}", desc: "Contact name. Falls back to \"Kak\" when the name is empty." },
  { token: "{nomor}", alt: "{phone}", desc: "Phone number, digits with country code." },
  { token: "{Halo|Hai|Hi}", alt: "", desc: "One option picked at random per recipient, so each message differs slightly. Can be nested." },
] as const;

/** Same as the gateway renderTemplate; spintax is random, so the sample can be reshuffled. */
export function renderTemplate(template: string, c: { name?: string; phone?: string }): string {
  let out = String(template ?? "").replace(/\{\s*(nama|name|nomor|phone)\s*\}/gi, (_, key: string) => {
    const k = key.toLowerCase();
    if (k === "nama" || k === "name") return (c.name || "").trim() || "Kak";
    return c.phone || "";
  });
  const spin = /\{([^{}]*\|[^{}]*)\}/;
  let guard = 0;
  while (spin.test(out) && guard++ < 500) {
    out = out.replace(spin, (_, body: string) => {
      const opts = body.split("|");
      return opts[Math.floor(Math.random() * opts.length)];
    });
  }
  return out;
}

export function fmtDuration(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return "under 1 minute";
  if (m < 60) return `about ${m} min`;
  return `about ${Math.floor(m / 60)} h ${m % 60} min`;
}

export function fmtWhen(ts: number | null | undefined): string {
  if (!ts) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(ts * 1000));
}

/* ---------- gateway data hook ---------- */

export function useGateway<T = any>(path: string | null, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const cur = useRef(path);
  cur.current = path;

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    crm<T>(path)
      .then((d) => {
        if (alive && cur.current === path) {
          setData(d);
          setError(undefined);
        }
      })
      .catch((e) => alive && cur.current === path && setError(e))
      .finally(() => alive && cur.current === path && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick]);

  // Quiet refresh: keeps old data on screen and ignores transient failures.
  const refresh = useCallback(() => {
    const p = cur.current;
    if (!p) return;
    crm<T>(p)
      .then((d) => {
        if (cur.current === p) {
          setData(d);
          setError(undefined);
        }
      })
      .catch(() => {});
  }, []);
  usePoll(refresh, opts.pollMs ?? 3_600_000);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, refresh, setData };
}

export type WaState = { status: string; qr: string | null; me: { name?: string; phone?: string } | null; error: string | null };

/** WhatsApp connection state, refreshed every 5 s. `ready` means messages can go out. */
export function useWaStatus() {
  const g = useGateway<WaState>("/wa/status", { pollMs: 5000 });
  return { wa: g.data, ready: g.data?.status === "ready", error: g.error, loading: g.loading };
}

/* ---------- error presentation ---------- */

export function gatewayProblem(e: unknown): { title: string; text: string; kind: "unconfigured" | "down" | "missing" | "other" } {
  const status = e instanceof ApiError ? e.status : 0;
  const msg = e instanceof Error ? e.message : String(e);
  if (status === 503 && /not configured/i.test(msg)) {
    return { kind: "unconfigured", title: "WhatsApp gateway is not set up", text: "This platform has no gateway address or token yet, so contacts and broadcasts cannot load. Ask whoever deploys the platform to set WA_GATEWAY_URL and WA_GATEWAY_TOKEN." };
  }
  if (status === 502) {
    return { kind: "down", title: "WhatsApp gateway is not reachable", text: "The gateway server did not answer. It may be restarting or offline. Nothing was lost; try again in a minute." };
  }
  if (status === 404) return { kind: "missing", title: "Not found", text: msg };
  return { kind: "other", title: "Something went wrong", text: msg };
}

export function ErrorPanel({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const p = gatewayProblem(error);
  return (
    <div role="alert" className="rounded-xl border border-crit/30 bg-crit/5 px-5 py-6 text-center">
      <p className="text-sm font-medium text-crit">{p.title}</p>
      <p className="mx-auto mt-1 max-w-md text-xs text-ink2">{p.text}</p>
      {onRetry && p.kind !== "unconfigured" && (
        <Btn className="mt-3" icon="refresh" onClick={onRetry}>
          Try again
        </Btn>
      )}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Panel className="space-y-3 p-4" >
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-5 ${i % 3 === 0 ? "w-2/3" : "w-full"}`} />
      ))}
    </Panel>
  );
}

/* ---------- small UI helpers ---------- */

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block text-xs text-muted">
      <span className="font-medium text-ink2">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function TagChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-md bg-surface3 px-1.5 py-0.5 text-xs text-ink2">{children}</span>;
}

export function PageHead({ title, hint, actions }: { title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
        {hint && <p className="mt-0.5 max-w-xl text-xs text-muted">{hint}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Phone-safe message bubble used for template and broadcast previews. */
export function Bubble({ text, attachment }: { text: string; attachment?: string | null }) {
  return (
    <div className="max-w-full rounded-xl rounded-tl-sm border border-border bg-out p-3 text-sm text-ink">
      {attachment && <p className="mb-1 break-all text-xs text-muted">Attachment: {attachment}</p>}
      <p className="whitespace-pre-wrap break-words">{text || <span className="text-muted">The message appears here</span>}</p>
    </div>
  );
}
