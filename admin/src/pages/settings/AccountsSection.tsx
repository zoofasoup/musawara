import { useState } from "react";
import { api, useApi } from "../../lib/api";
import { ClientAvatar } from "../../components/Layout";
import { Icon } from "../../components/icons";
import { fmtAgo, fmtDateTime, fmtDayFull, fmtNum, hoursSince } from "../../lib/format";
import { Btn, ConfirmBtn, CopyBtn, Empty, inputCls, Panel, Pill, Section, selectCls, type Notify, type Tone } from "./kit";

const ymdAdd = (ymd: string, days: number) => new Date(Date.parse(ymd + "T00:00:00Z") + days * 86_400_000).toISOString().slice(0, 10);

type Health = { key: "ok" | "stale" | "failed" | "never" | "running"; label: string; tone: Tone; dot: string };
export function accountHealth(a: any): Health {
  if (a.last_status === "failed") return { key: "failed", label: "Last sync failed", tone: "crit", dot: "bg-crit" };
  if (a.last_status === "running") return { key: "running", label: "Syncing", tone: "warn", dot: "bg-warn" };
  if (!a.last_success) return { key: "never", label: "Never synced", tone: "neutral", dot: "bg-border2" };
  const h = hoursSince(a.last_success);
  if (h == null || h > 26) return { key: "stale", label: "Out of date", tone: "warn", dot: "bg-warn" };
  return { key: "ok", label: "Up to date", tone: "good", dot: "bg-good" };
}

type PlanChunk = { since: string; until: string; covered: boolean };
type Plan = { from: string; to: string; chunks: PlanChunk[]; covered: number; reach_limited_before: string; capped_by_meta: boolean };

function Stat({ icon, label, value, sub }: { icon: Parameters<typeof Icon>[0]["name"]; label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface2 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted">
        <Icon name={icon} className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="tnum mt-1 truncate text-[13px] font-medium text-ink" title={value}>{value}</p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

function SyncHistory({ id }: { id: number }) {
  const jobs = useApi<{ jobs: any[] }>(`/admin/accounts/${id}/sync-jobs`);
  if (jobs.loading) return <div className="h-12 skeleton rounded-lg" />;
  if (jobs.error) return <p className="text-xs text-crit">{jobs.error}</p>;
  if (!jobs.data?.jobs.length) return <p className="text-xs text-muted">No runs yet.</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {jobs.data.jobs.map((j) => (
        <li key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2 text-xs">
          <Icon name={j.status === "success" ? "checkCircle" : j.status === "failed" ? "xCircle" : "clock"} className={`h-3.5 w-3.5 ${j.status === "success" ? "text-good" : j.status === "failed" ? "text-crit" : "text-warn"}`} />
          <span className="tnum text-ink">{fmtDateTime(j.started_at)}</span>
          {j.status === "success" && <span className="text-muted">{fmtNum(j.rows_upserted)} rows</span>}
          {j.error && <span className="w-full break-words pl-6 text-crit">{j.error}</span>}
        </li>
      ))}
    </ul>
  );
}

function AccountCard({ a, notify, reload }: { a: any; notify: Notify; reload: () => void }) {
  const health = accountHealth(a);
  const [open, setOpen] = useState(health.key === "failed");
  const [syncing, setSyncing] = useState(false);
  const [range, setRange] = useState<"3m" | "13m" | "all">("all");
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);

  const sync = async () => {
    setSyncing(true);
    const t0 = Date.now();
    try {
      const r = await api<{ rows: number }>(`/admin/accounts/${a.id}/sync`, { method: "POST" });
      notify(`${a.account_name || "Account"} synced: ${fmtNum(r.rows)} rows in ${Math.round((Date.now() - t0) / 1000)}s.`);
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSyncing(false);
      reload();
    }
  };

  // Meta sometimes rejects a big window ("temporarily unavailable"): retry once,
  // then split the range in half; only ranges that still fail at <= 3 days are
  // reported and skipped, so one bad stretch never blocks the rest.
  const pull = async (since: string, until: string, failed: string[]): Promise<void> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await api(`/admin/accounts/${a.id}/backfill`, { method: "POST", body: { since, until } });
        return;
      } catch (err: any) {
        if (/token|permission|not found/i.test(err.message)) throw err;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    const span = (Date.parse(until) - Date.parse(since)) / 86_400_000;
    if (span > 3) {
      const mid = ymdAdd(since, Math.floor(span / 2));
      await pull(since, mid, failed);
      await pull(ymdAdd(mid, 1), until, failed);
    } else {
      failed.push(since === until ? fmtDayFull(since) : `${fmtDayFull(since)} – ${fmtDayFull(until)}`);
    }
  };

  const backfill = async () => {
    try {
      setProgress({ done: 0, total: 0, label: "Planning…" });
      const plan = await api<Plan>(`/admin/accounts/${a.id}/history-plan?range=${range}`);
      const todo = plan.chunks.filter((c) => !c.covered);
      if (todo.length === 0) {
        notify(`Everything since ${fmtDayFull(plan.from)} is already pulled.`);
        return;
      }
      const failed: string[] = [];
      for (let i = 0; i < todo.length; i++) {
        setProgress({ done: i, total: todo.length, label: `${fmtDayFull(todo[i].since)}` });
        await pull(todo[i].since, todo[i].until, failed);
      }
      notify(
        failed.length ? `History pulled, but Meta refused: ${failed.join("; ")}. Run it again later.` : `History pulled: ${todo.length} ranges.`,
        failed.length ? "err" : "ok"
      );
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setProgress(null);
      reload();
    }
  };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Panel className="overflow-hidden">
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${health.dot}`} aria-hidden />
              <p className="truncate text-sm font-medium text-ink">{a.account_name || a.meta_account_id}</p>
              <Pill tone={health.tone}>{health.label}</Pill>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-muted">
              <span className="font-mono">{a.meta_account_id}</span>
              <CopyBtn text={a.meta_account_id} label="" />
              <span>· {a.currency} · {a.timezone}</span>
            </p>
          </div>
          <div className="flex gap-2">
            <Btn icon="refresh" loading={syncing} onClick={sync}>
              {syncing ? "Syncing…" : "Sync now"}
            </Btn>
            <Btn tone="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>
              More
              <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </Btn>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Stat icon="clock" label="Last sync" value={a.last_success ? fmtAgo(a.last_success) : "Never"} sub={a.last_status === "success" ? `${fmtNum(a.last_rows)} rows` : a.last_attempt ? fmtDateTime(a.last_attempt) : undefined} />
          <Stat icon="database" label="Data" value={a.data_from ? `${fmtDayFull(a.data_from)} – ${fmtDayFull(a.data_to)}` : "None yet"} sub={a.data_from ? `${fmtNum(a.data_days)} days with data` : "Run Sync now"} />
          <Stat icon="chart" label="Campaigns" value={fmtNum(a.campaigns ?? 0)} sub={a.primary_result_label ? `Result: ${a.primary_result_label}` : "Result type not set"} />
        </div>

        {health.key === "failed" && a.last_error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-crit/5 px-3 py-2 text-xs text-crit">
            <Icon name="alert" className="mt-0.5 h-3.5 w-3.5" />
            <span className="break-words">{a.last_error}</span>
          </p>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-border bg-surface2/50 p-4">
          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">Pull history</p>
            <p className="mb-2 text-xs text-muted">
              The daily sync only refreshes the last 28 days. Use this once to bring in older months. Ranges already pulled are skipped.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select value={range} disabled={progress !== null} onChange={(e) => setRange(e.target.value as typeof range)} aria-label="History range" className={selectCls}>
                <option value="all">All available (up to 37 months)</option>
                <option value="13m">Last 13 months</option>
                <option value="3m">Last 3 months</option>
              </select>
              <Btn tone="primary" icon="database" loading={progress !== null} onClick={backfill}>
                {progress ? "Pulling…" : "Pull history"}
              </Btn>
            </div>
            {progress && (
              <div className="mt-3" role="status" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full bg-surface3">
                  <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.max(pct, 4)}%` }} />
                </div>
                <p className="tnum mt-1 text-[11px] text-muted">
                  {progress.total ? `${progress.done} of ${progress.total} ranges · ` : ""}
                  {progress.label}
                </p>
              </div>
            )}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-ink">Sync history</p>
            <SyncHistory id={a.id} />
          </div>

          <div className="flex justify-end border-t border-border pt-3">
            <ConfirmBtn
              label="Disconnect account"
              icon="link"
              confirmLabel="Disconnect and delete its data"
              onConfirm={async () => {
                try {
                  await api(`/admin/accounts/${a.id}`, { method: "DELETE" });
                  notify("Account disconnected.");
                  reload();
                } catch (err: any) {
                  notify(err.message, "err");
                }
              }}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}

export function AccountsSection({
  accounts,
  clients,
  tokenOk,
  reloadClients,
  notify,
}: {
  accounts: ReturnType<typeof useApi<{ accounts: any[] }>>;
  clients: any[];
  tokenOk: boolean;
  reloadClients: () => void;
  notify: Notify;
}) {
  const { data, loading, error, reload } = accounts;
  const [adding, setAdding] = useState(false);
  const [clientId, setClientId] = useState("");
  const [metaId, setMetaId] = useState("");
  const [saving, setSaving] = useState(false);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId || !metaId.trim()) return;
    setSaving(true);
    try {
      await api("/admin/accounts", { method: "POST", body: { client_id: Number(clientId), meta_account_id: metaId.trim() } });
      notify("Account connected. Run Sync now to pull its data.");
      setClientId("");
      setMetaId("");
      setAdding(false);
      reload();
      reloadClients();
    } catch (err: any) {
      notify(err.message, "err");
    } finally {
      setSaving(false);
    }
  };

  const list = data?.accounts ?? [];
  const groups = clients
    .map((c) => ({ client: c, items: list.filter((a) => a.client_id === c.id) }))
    .filter((g) => g.items.length > 0);
  const allHealthy = list.length > 0 && list.every((a) => accountHealth(a).key === "ok");

  return (
    <Section
      id="accounts"
      step={3}
      done={allHealthy}
      icon="chart"
      title="Ad accounts"
      hint="Connect each Meta ad account to the client it belongs to."
      action={
        <Btn tone={adding ? "ghost" : "secondary"} icon={adding ? undefined : "plus"} onClick={() => setAdding(!adding)} disabled={clients.length === 0}>
          {adding ? "Cancel" : "Connect account"}
        </Btn>
      }
    >
      {!tokenOk && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-warn/10 px-3.5 py-2.5 text-xs text-warn">
          <Icon name="alert" className="mt-0.5 h-4 w-4" />
          Connect Meta in step 1 first, otherwise accounts cannot be checked or synced.
        </p>
      )}
      {adding && (
        <form onSubmit={connect} className="mb-3 space-y-2 rounded-xl border border-[var(--accent)]/30 bg-surface p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client" className={inputCls}>
              <option value="">Which client?</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input value={metaId} onChange={(e) => setMetaId(e.target.value)} placeholder="act_1234567890" aria-label="Meta ad account ID" spellCheck={false} className={`${inputCls} font-mono`} />
            <Btn type="submit" tone="primary" loading={saving} disabled={!clientId || !metaId.trim()}>
              Connect
            </Btn>
          </div>
          <p className="flex items-center gap-1.5 text-[11px] text-muted">
            <Icon name="info" className="h-3.5 w-3.5" /> Find the ID in Ads Manager, in the account dropdown at the top left. The system user must be assigned to that account.
          </p>
        </form>
      )}

      {loading ? (
        <div className="h-32 skeleton rounded-xl" />
      ) : error ? (
        <p className="text-sm text-crit">{error}</p>
      ) : list.length === 0 ? (
        <Empty icon="chart" title="No ad accounts connected" hint={clients.length ? "Connect a Meta ad account to a client to start pulling spend and results." : "Add a client first, then connect its ad accounts."} />
      ) : (
        <div className="space-y-5">
          {groups.map(({ client, items }) => (
            <div key={client.id}>
              <div className="mb-2 flex items-center gap-2">
                <ClientAvatar name={client.name} logoUrl={client.logo_url} color={client.brand_color} size={6} />
                <p className="text-[13px] font-medium text-ink">{client.name}</p>
                <span className="text-xs text-muted">{items.length} account{items.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-2.5">
                {items.map((a) => (
                  <AccountCard key={a.id} a={a} notify={notify} reload={() => { reload(); reloadClients(); }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
