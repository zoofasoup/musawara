// Shared types, formatting and polling for the CRM inbox and connection pages.

import { useCallback, useEffect, useRef, useState } from "react";
import { crm, usePoll } from "../crmApi";

/** One row of GET /conversations (last message per phone). SQLite booleans arrive as 0/1. */
export type Conv = {
  phone: string;
  body: string;
  media_type: string | null;
  from_me: number;
  ts: number;
  name: string;
  is_contact: number;
  tags: string; // comma separated
  unread: number;
};

export type Msg = {
  id?: number;
  wa_id: string;
  phone: string;
  from_me: number;
  body: string;
  media_type: string | null;
  ack: number; // -1 failed, 0 pending, 1 sent, 2 delivered, 3 read, 4 played
  is_read: number;
  ts: number;
};

export type Thread = { phone: string; name: string; messages: Msg[] };

export type WaState = {
  status: "starting" | "qr" | "loading" | "ready" | "disconnected" | "error";
  qr: string | null;
  me: { phone?: string; name?: string } | null;
  error: string | null;
  since: number; // ms epoch when the state last changed
};

export type SyncState = { running: boolean; chats: number; done: number; added: number; startedAt: number | null; finishedAt: number | null };

export const tagList = (c: Conv) => (c.tags ? c.tags.split(",").filter(Boolean) : []);
export const fmtPhone = (p: string) => (p ? "+" + p : "");
export const convTitle = (c: { name?: string; phone: string }) => c.name || fmtPhone(c.phone);

export const MEDIA_LABEL: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Audio",
  ptt: "Voice message",
  document: "Document",
  sticker: "Sticker",
};
export const mediaLabel = (t: string | null) => (t ? MEDIA_LABEL[t] ?? "Media" : "");

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY = 86_400_000;

export const fmtClock = (ts: number) => new Date(ts * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Time in the conversation list: clock today, "Yesterday", weekday this week, otherwise the date. */
export function fmtListTime(ts: number): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff <= 0) return fmtClock(ts);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-GB", { weekday: "short" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export const dayKey = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function fmtDayLabel(ts: number): string {
  const d = new Date(ts * 1000);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/** "3 min", "2 h 5 min", "just now". */
export function fmtSince(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** ApiError carries status and message only, so the proxy's failure codes are told apart by both. */
export type GatewayProblem = { kind: "unconfigured" | "down" | "notConnected" | "other"; message: string };
export function classify(e: unknown): GatewayProblem {
  const status = (e as any)?.status as number | undefined;
  const message = (e as any)?.message || "Something went wrong";
  if (status === 502) return { kind: "down", message };
  if (status === 503) return { kind: /not configured/i.test(message) ? "unconfigured" : "notConnected", message };
  return { kind: "other", message };
}

/**
 * GET a gateway path now and then every `ms`. Keeps the last good data when a poll fails
 * (error is set until the next success). Changing `path` resets everything.
 */
export function useLive<T>(path: string | null, ms: number) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [loaded, setLoaded] = useState(false);
  const pathRef = useRef(path);
  pathRef.current = path;
  const issued = useRef(0);
  const applied = useRef(0);

  const load = useCallback(async () => {
    const p = pathRef.current;
    if (!p) return;
    const n = ++issued.current;
    try {
      const d = await crm<T>(p);
      if (pathRef.current === p && n > applied.current) {
        applied.current = n;
        setData(d);
        setError(undefined);
        setLoaded(true);
      }
    } catch (e) {
      if (pathRef.current === p && n > applied.current) {
        applied.current = n;
        setError(e);
        setLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    setData(undefined);
    setError(undefined);
    setLoaded(false);
    applied.current = issued.current; // drop answers still in flight for the old path
    void load();
  }, [path, load]);

  usePoll(load, ms);
  return { data, error, loaded, reload: load };
}

/** WhatsApp connection state: every 3 s until connected, then every 15 s. */
export function useWaStatus() {
  const [fast, setFast] = useState(true);
  const r = useLive<WaState>("/wa/status", fast ? 3000 : 15000);
  const ready = r.data?.status === "ready";
  useEffect(() => setFast(!ready), [ready]);
  return { ...r, ready };
}
