// Organic content: Instagram stories per day against the daily target.

import { useState } from "react";
import { api, useApi } from "../lib/api";
import { fmtDay } from "../lib/format";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";

type Day = { day: string; count: number };
type Account = {
  id: number;
  client_name: string;
  ig_username: string | null;
  ig_user_id: string;
  story_target: number;
  last_poll_at: string | null;
  last_error: string | null;
  days: Day[];
};
type Candidate = { ig_user_id: string; ig_username: string | null; page_id: string; page_name: string };

const btn = "inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink disabled:opacity-50";

export function Organic() {
  const list = useApi<{ today: string; accounts: Account[] }>("/admin/organic");
  const clients = useApi<{ clients: { id: number; name: string }[] }>("/admin/clients");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setMsg("");
    try {
      await fn();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy("");
  };

  const discover = () =>
    run("discover", async () => {
      const r = await api<{ candidates: Candidate[] }>("/admin/organic/discover");
      setFound(r.candidates);
      if (!r.candidates.length) setMsg("No Instagram account found. Check the token permissions and that the Page is shared with your system user.");
    });
  const add = (c: Candidate) =>
    run("add" + c.ig_user_id, async () => {
      await api("/admin/organic/accounts", { method: "POST", body: { client_id: Number(pick[c.ig_user_id]), ig_user_id: c.ig_user_id, ig_username: c.ig_username, page_id: c.page_id } });
      await api("/admin/organic/poll", { method: "POST", body: {} });
      list.reload();
    });
  const poll = () =>
    run("poll", async () => {
      const r = await api<{ added: number; errors: string[] }>("/admin/organic/poll", { method: "POST", body: {} });
      setMsg(r.errors.length ? r.errors[0] : `${r.added} new stories recorded`);
      list.reload();
    });
  const remove = (a: Account) =>
    run("rm" + a.id, async () => {
      if (!confirm(`Stop tracking @${a.ig_username ?? a.ig_user_id}? Recorded stories stay.`)) return;
      await api(`/admin/organic/accounts/${a.id}`, { method: "DELETE" });
      list.reload();
    });

  const tracked = new Set((list.data?.accounts ?? []).map((a) => a.ig_user_id));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold text-ink">Organic</h1>
      <p className="mt-1 text-sm text-ink2">Instagram stories per day against target. Checked every hour, since stories disappear after 24 hours.</p>

      <div className="mt-5">
        <SectionTitle
          right={
            <span className="flex gap-2">
              <button className={btn} disabled={!!busy} onClick={discover}>{busy === "discover" ? "Looking…" : "Find accounts"}</button>
              <button className={btn} disabled={!!busy} onClick={poll}>{busy === "poll" ? "Checking…" : "Check now"}</button>
            </span>
          }
        >
          Stories
        </SectionTitle>
        {msg && <p className="mb-3 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-ink2">{msg}</p>}

        {list.loading ? (
          <CardSkeleton lines={4} />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : !list.data?.accounts.length ? (
          <EmptyState title="No account tracked yet" hint="Press Find accounts, then add the Instagram accounts to watch." />
        ) : (
          <div className="grid gap-3">
            {list.data.accounts.map((a) => {
              const today = a.days[a.days.length - 1]?.count ?? 0;
              const met = today >= a.story_target;
              return (
                <div key={a.id} className="rounded-xl border border-border bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-ink">@{a.ig_username ?? a.ig_user_id}</p>
                      <p className="text-xs text-muted">{a.client_name}</p>
                    </div>
                    <div className="text-right">
                      <p className={`tnum text-2xl font-semibold ${met ? "text-good" : "text-ink"}`}>
                        {today}<span className="text-sm font-normal text-muted"> / {a.story_target} today</span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-end gap-1" role="img" aria-label="Stories per day, last 14 days">
                    {a.days.map((d) => (
                      <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${fmtDay(d.day)}: ${d.count}`}>
                        <div className="flex h-16 w-full items-end">
                          <div
                            className={`w-full rounded-sm ${d.count >= a.story_target ? "bg-good" : "bg-warn"}`}
                            style={{ height: `${Math.max(4, Math.min(100, (d.count / Math.max(a.story_target, 1)) * 100))}%`, opacity: d.count ? 1 : 0.25 }}
                          />
                        </div>
                        <span className="tnum text-[10px] text-muted">{d.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                    <span>{a.last_error ? <span className="text-crit">{a.last_error}</span> : a.last_poll_at ? `Last check ${a.last_poll_at} UTC` : "Not checked yet"}</span>
                    <button className={btn} disabled={!!busy} onClick={() => remove(a)}>Stop tracking</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {found && found.length > 0 && (
        <div className="mt-6">
          <SectionTitle>Accounts the token can see</SectionTitle>
          <div className="grid gap-2">
            {found.map((c) => (
              <div key={c.ig_user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface p-3">
                <div>
                  <p className="text-sm font-medium text-ink">@{c.ig_username ?? c.ig_user_id}</p>
                  <p className="text-xs text-muted">Page: {c.page_name}</p>
                </div>
                {tracked.has(c.ig_user_id) ? (
                  <span className="text-xs text-muted">Tracked</span>
                ) : (
                  <span className="flex gap-2">
                    <select className="min-h-11 rounded-lg border border-border2 bg-bg px-2 text-sm text-ink" value={pick[c.ig_user_id] ?? ""} onChange={(e) => setPick({ ...pick, [c.ig_user_id]: e.target.value })} aria-label="Client">
                      <option value="">Client…</option>
                      {clients.data?.clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                    </select>
                    <button className={btn} disabled={!pick[c.ig_user_id] || !!busy} onClick={() => add(c)}>Track</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
