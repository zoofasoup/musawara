// Broadcasts: list with live progress, a create flow that ends in a review step, and a detail view
// with per-recipient status and pause / resume / cancel / retry. Creating a broadcast sends real
// WhatsApp messages, so the final button states the recipient count and needs a connected WhatsApp.

import { Callout } from "../../components/Callout";
import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Pause } from "lucide-react";
import { crm } from "./crmApi";
import { fmtNum } from "../../lib/format";
import { Btn, ConfirmBtn, Empty, Panel, Pill, useNotify, type Notify, type Tone } from "../../components/kit";
import { NewBroadcast } from "./broadcast/NewBroadcast";
import { Bubble, ErrorPanel, fmtPhone, fmtWhen, ListSkeleton, PageHead, useGateway, useWaStatus, type WaState } from "./data/shared";

type Campaign = {
  id: number; name: string; status: string; created_at: number; delay_min: number; delay_max: number;
  media_name: string | null; template: string; total: number | null; sent: number | null; failed: number | null; pending: number | null; cancelled: number | null;
};
type Item = { id: number; phone: string; name: string; status: string; error: string | null; text: string | null; sent_at: number | null };
type Detail = Campaign & { items: Item[] };

const STATUS: Record<string, { label: string; tone: Tone }> = {
  running: { label: "Sending", tone: "accent" },
  paused: { label: "Paused", tone: "warn" },
  done: { label: "Done", tone: "good" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  pending: { label: "Waiting", tone: "neutral" },
  sending: { label: "Sending", tone: "accent" },
  sent: { label: "Sent", tone: "good" },
  failed: { label: "Failed", tone: "crit" },
};
const num = (n: number | null | undefined) => n ?? 0;
const MAX_FILE = 64 * 1024 * 1024;

function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <Pill tone={s.tone}>{s.label}</Pill>;
}

function Progress({ c }: { c: Campaign }) {
  const total = num(c.total);
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  return (
    <div role="img" aria-label={`${num(c.sent)} sent, ${num(c.failed)} failed, ${num(c.pending)} waiting of ${total}`} className="flex h-2 overflow-hidden rounded-full bg-surface3">
      <span className="bg-good" style={{ width: `${pct(num(c.sent))}%` }} />
      <span className="bg-crit" style={{ width: `${pct(num(c.failed))}%` }} />
    </div>
  );
}

function Counts({ c }: { c: Campaign }) {
  return (
    <p className="text-xs text-ink2">
      <span className="tnum">{fmtNum(num(c.sent))}</span> sent · <span className="tnum">{fmtNum(num(c.failed))}</span> failed · <span className="tnum">{fmtNum(num(c.pending))}</span> waiting
      {num(c.cancelled) > 0 && <> · <span className="tnum">{fmtNum(num(c.cancelled))}</span> cancelled</>} of <span className="tnum">{fmtNum(num(c.total))}</span>
    </p>
  );
}

function WaBanner({ wa, ready }: { wa?: WaState; ready: boolean }) {
  if (!wa) return null;
  return ready ? (
    <p className="text-xs text-muted">WhatsApp connected{wa.me?.phone ? ` as ${fmtPhone(wa.me.phone)}` : ""}.</p>
  ) : (
    <Callout tone="warn" title="WhatsApp is not connected">
      Status: {wa.status}. Nothing can be sent until it reconnects; any running broadcast waits and resumes by itself. Connect it on the WhatsApp tab.
    </Callout>
  );
}

/* ================= detail ================= */

const FILTERS = [["", "All"], ["sent", "Sent"], ["failed", "Failed"], ["pending", "Waiting"], ["cancelled", "Cancelled"]] as const;

function CampaignDetail({ id, ready, notify, onBack }: { id: number; ready: boolean; notify: Notify; onBack: () => void }) {
  const g = useGateway<Detail>(`/campaigns/${id}`, { pollMs: 3000 });
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(100);
  const [busy, setBusy] = useState(false);
  const c = g.data;

  const act = async (action: "pause" | "resume" | "cancel" | "retry", done: string) => {
    setBusy(true);
    try {
      await crm(`/campaigns/${id}/${action}`, { method: "POST" });
      notify(done);
      g.refresh();
    } catch (e: any) {
      notify(e.message, "err");
    }
    setBusy(false);
  };

  const items = c?.items ?? [];
  const match = (i: Item) => !filter || i.status === filter || (filter === "pending" && i.status === "sending");
  const rows = useMemo(() => items.filter(match), [items, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const count = (f: string) => (f ? items.filter((i) => i.status === f || (f === "pending" && i.status === "sending")).length : items.length);
  const uncertain = items.filter((i) => i.status === "failed" && /tidak pasti/i.test(i.error ?? "")).length;
  const retryable = num(c?.failed) + num(c?.cancelled);

  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onBack}>
        <ArrowLeft className="size-4" />
        All broadcasts
      </Btn>
      {g.error && !c ? (
        <ErrorPanel error={g.error} onRetry={g.reload} />
      ) : !c ? (
        <ListSkeleton />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h1 className="break-words text-lg font-semibold text-ink">{c.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <StatusPill status={c.status} />
                <span>Created {fmtWhen(c.created_at)}</span>
                <span>Pause {c.delay_min} to {c.delay_max} s between messages</span>
              </div>
            </div>
          </div>

          <Panel className="space-y-3 p-4">
            <Progress c={c} />
            <Counts c={c} />
            <div className="flex flex-wrap items-center gap-2">
              {c.status === "running" && (
                <Btn disabled={busy} onClick={() => void act("pause", "Paused. The message in flight still completes.")}>
                  <Pause className="size-4" />
                  Pause
                </Btn>
              )}
              {c.status === "paused" && (
                <ConfirmBtn icon="check" label="Resume" confirmLabel={`Resume sending to ${fmtNum(num(c.pending))} people`} onConfirm={() => void act("resume", "Resumed.")} />
              )}
              {(c.status === "running" || c.status === "paused") && (
                <ConfirmBtn label="Cancel the rest" confirmLabel={`Cancel ${fmtNum(num(c.pending))} unsent messages`} onConfirm={() => void act("cancel", "Cancelled. Messages already sent stay sent.")} />
              )}
              {retryable > 0 && (
                <ConfirmBtn icon="refresh" label={`Retry ${fmtNum(retryable)} failed or cancelled`} confirmLabel={`Send again to ${fmtNum(retryable)} people`} onConfirm={() => void act("retry", "Retrying. Sending has restarted.")} />
              )}
            </div>
            {retryable > 0 && uncertain > 0 && (
              <p className="text-xs text-warn">
                {fmtNum(uncertain)} failed with status uncertain (the app stopped while sending). They may already have received the message. Check the Inbox before retrying, because retry sends to every failed number.
              </p>
            )}
            {!ready && (c.status === "running" || retryable > 0) && <p className="text-xs text-muted">WhatsApp is not connected right now, so sending is on hold.</p>}
          </Panel>

          <div>
            <p className="mb-1 text-xs font-medium text-ink2">Message{c.media_name ? " (with attachment)" : ""}</p>
            <Bubble text={c.template} attachment={c.media_name} />
            <p className="mt-1 text-xs text-muted">Placeholders are filled per person when sent.</p>
          </div>

          <div className="space-y-2">
            <div role="group" aria-label="Filter recipients" className="flex flex-wrap gap-1">
              {FILTERS.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(100); }} className={`inline-flex min-h-11 items-center rounded-xl px-3 text-xs font-medium ${filter === k ? "bg-surface3 text-ink" : "text-ink2 hover:text-ink"}`}>
                  {l} <span className="tnum ml-1 text-muted">{fmtNum(count(k))}</span>
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <Empty icon="users" title="No recipients here" hint="Nothing matches this filter." />
            ) : (
              <Panel className="divide-y divide-border">
                {rows.slice(0, shown).map((i) => (
                  <div key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-xs">
                    <span className="min-w-0 flex-1 basis-40 break-words font-medium text-ink">{i.name || "No name"}</span>
                    <span className="tnum text-ink2">{fmtPhone(i.phone)}</span>
                    <StatusPill status={i.status} />
                    <span className="tnum text-muted">{fmtWhen(i.sent_at)}</span>
                    {i.error && <span className="basis-full break-words text-crit">{i.error}</span>}
                  </div>
                ))}
              </Panel>
            )}
            {rows.length > shown && (
              <Btn onClick={() => setShown((s) => s + 200)}>Show more ({fmtNum(rows.length - shown)} left)</Btn>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ================= page ================= */

type View = { kind: "list" } | { kind: "new"; ids: number[] } | { kind: "detail"; id: number };

export function CrmCampaigns() {
  const { notify, node } = useNotify();
  const location = useLocation();
  const { wa, ready } = useWaStatus();
  const preselected: number[] = (location.state as any)?.contactIds ?? [];
  const [view, setView] = useState<View>(preselected.length ? { kind: "new", ids: preselected } : { kind: "list" });
  const list = useGateway<Campaign[]>("/campaigns", { pollMs: 3000 });

  const toList = () => { setView({ kind: "list" }); list.reload(); };

  return (
    <div className="space-y-4">
      {node}
      {view.kind === "new" ? (
        <>
          <WaBanner wa={wa} ready={ready} />
          <NewBroadcast initialIds={view.ids} ready={ready} notify={notify} onCancel={toList} onCreated={(id) => { list.reload(); setView({ kind: "detail", id }); }} />
        </>
      ) : view.kind === "detail" ? (
        <>
          <WaBanner wa={wa} ready={ready} />
          <CampaignDetail id={view.id} ready={ready} notify={notify} onBack={toList} />
        </>
      ) : (
        <>
          <PageHead title="Broadcasts" hint="Send one message to many people, paced so the number stays safe." actions={!list.error && <Btn tone="primary" icon="plus" onClick={() => setView({ kind: "new", ids: [] })}>New broadcast</Btn>} />
          <WaBanner wa={wa} ready={ready} />
          {list.error && !list.data ? (
            <ErrorPanel error={list.error} onRetry={list.reload} />
          ) : list.loading && !list.data ? (
            <ListSkeleton />
          ) : (list.data ?? []).length === 0 ? (
            <Empty icon="mail" title="No broadcasts yet" hint="Create one to message a tag or a list of numbers. You review the recipients and a sample before anything is sent." action={<Btn tone="primary" icon="plus" onClick={() => setView({ kind: "new", ids: [] })}>New broadcast</Btn>} />
          ) : (
            <div className="space-y-3">
              {list.data!.map((c) => (
                <button key={c.id} type="button" onClick={() => setView({ kind: "detail", id: c.id })} className="block w-full min-h-11 rounded-2xl bg-surface shadow-[var(--shadow-soft)] p-4 text-left hover:bg-surface2">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 break-words text-sm font-semibold text-ink">{c.name}</span>
                    <StatusPill status={c.status} />
                  </span>
                  <span className="mt-2 block"><Progress c={c} /></span>
                  <span className="mt-2 block"><Counts c={c} /></span>
                  <span className="mt-1 block text-xs text-muted">{fmtWhen(c.created_at)} · pause {c.delay_min}-{c.delay_max} s{c.media_name ? ` · ${c.media_name}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
