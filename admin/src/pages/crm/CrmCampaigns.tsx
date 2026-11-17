// Broadcasts: list with live progress, a create flow that ends in a review step, and a detail view
// with per-recipient status and pause / resume / cancel / retry. Creating a broadcast sends real
// WhatsApp messages, so the final button states the recipient count and needs a connected WhatsApp.

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowLeft, Pause } from "lucide-react";
import { crm, crmUpload } from "./crmApi";
import { fmtNum } from "../../lib/format";
import { Btn, ConfirmBtn, Empty, Panel, Pill, useNotify, type Notify, type Tone } from "../../components/kit";
import { Bubble, ErrorPanel, Field, fmtDuration, fmtPhone, fmtWhen, ListSkeleton, PageHead, PLACEHOLDERS, TagChip, useDebounced, useGateway, useWaStatus, type WaState } from "./data/shared";

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
    <div role="status" className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-xs text-ink">
      <b className="text-warn">WhatsApp is not connected</b> (status: {wa.status}). Nothing can be sent until it reconnects; any running broadcast waits and resumes by itself. Connect it on the WhatsApp tab.
    </div>
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
                <button key={k} type="button" aria-pressed={filter === k} onClick={() => { setFilter(k); setShown(100); }} className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium ${filter === k ? "bg-surface3 text-ink" : "text-ink2 hover:text-ink"}`}>
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

/* ================= create ================= */

type Recipients = { count: number; invalid: string[]; sample: { phone: string; name: string } | null; key?: string };
const STEPS = ["Recipients", "Message", "Review"];

function NewBroadcast({ initialIds, ready, notify, onCancel, onCreated }: { initialIds: number[]; ready: boolean; notify: Notify; onCancel: () => void; onCreated: (id: number) => void }) {
  const tagsQ = useGateway<Array<{ tag: string; count: number }>>("/tags");
  const tplQ = useGateway<unknown>("/templates");
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [ids, setIds] = useState<number[]>(initialIds);
  const [numbers, setNumbers] = useState("");
  const [template, setTemplate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [delayMin, setDelayMin] = useState("10");
  const [delayMax, setDelayMax] = useState("25");
  const [rec, setRec] = useState<Recipients | null>(null);
  const [recErr, setRecErr] = useState<string>();
  const [sample, setSample] = useState<string>();
  const [problem, setProblem] = useState<string>();
  const [busy, setBusy] = useState(false);

  const dNumbers = useDebounced(numbers, 300);
  const key = JSON.stringify([tags, ids, dNumbers]);
  useEffect(() => {
    let alive = true;
    if (!tags.length && !ids.length && !dNumbers.trim()) {
      setRec({ count: 0, invalid: [], sample: null, key });
      return;
    }
    crm<Recipients>("/campaigns/recipients", { method: "POST", body: { tags, contactIds: ids, numbers: dNumbers } })
      .then((r) => alive && (setRec({ ...r, key }), setRecErr(undefined)))
      .catch((e) => alive && setRecErr(e.message));
    return () => { alive = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const templates = (() => {
    const raw: any = tplQ.data;
    const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.templates) ? raw.templates : [];
    return arr.map((t: any) => ({ id: t.id, name: String(t.name ?? ""), body: String(t.body ?? t.template ?? t.text ?? "") }));
  })();

  const min = Math.round(Number(delayMin) || 0);
  const max = Math.round(Number(delayMax) || 0);
  // The count is only trusted once it answers the current selection (it is recomputed after every change).
  const fresh = rec?.key === key && numbers === dNumbers && !recErr;
  const count = fresh ? rec!.count : 0;
  const paceOk = min >= 3 && max >= min;

  // Rendered sample for the review step, drawn by the gateway so it matches what it will send.
  const drawSample = () => {
    if (!template.trim()) return setSample("");
    crm<{ text: string }>("/preview", { method: "POST", body: { template, name: rec?.sample?.name, phone: rec?.sample?.phone } })
      .then((r) => setSample(r.text))
      .catch((e) => setProblem(e.message));
  };

  const next = () => {
    setProblem(undefined);
    if (step === 0) {
      if (!name.trim()) return setProblem("Give the broadcast a name so you can find it later.");
      if (!fresh) return setProblem(recErr ?? "Still counting recipients, try again in a moment.");
      if (!count) return setProblem("Choose at least one tag, or add numbers, so there is someone to send to.");
    }
    if (step === 1) {
      if (!template.trim() && !file) return setProblem("Write a message or attach a file.");
      if (!paceOk) return setProblem(min < 3 ? "The pause between messages must be at least 3 seconds." : "The longest pause must be at least the shortest.");
      if (file && file.size > MAX_FILE) return setProblem("That file is over 64 MB.");
      drawSample();
    }
    setStep(step + 1);
  };

  const create = async () => {
    setBusy(true);
    setProblem(undefined);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("template", template);
      fd.set("delayMin", String(min));
      fd.set("delayMax", String(max));
      fd.set("tags", JSON.stringify(tags));
      fd.set("contactIds", JSON.stringify(ids));
      fd.set("numbers", numbers);
      if (file) fd.set("media", file);
      const r = await crmUpload<{ id: number; count: number }>("/campaigns", fd);
      notify(`Broadcast started for ${fmtNum(r.count)} people.`);
      onCreated(r.id);
    } catch (e: any) {
      setProblem(e.message);
      setBusy(false);
    }
  };

  const eta = count ? fmtDuration((count * (min + max)) / 2) : "";

  return (
    <div className="space-y-4">
      <Btn tone="ghost" onClick={onCancel}>
        <ArrowLeft className="size-4" />
        All broadcasts
      </Btn>
      <PageHead title="New broadcast" />
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === step ? "step" : undefined} className={`inline-flex min-h-8 items-center rounded-full px-3 ${i === step ? "bg-[color-mix(in_srgb,var(--accent)_12%,white)] font-medium text-musawara-ink" : i < step ? "bg-good/12 text-good" : "bg-surface3 text-ink2"}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <Panel className="space-y-4 p-4">
        {step === 0 && (
          <>
            <Field label="Broadcast name" hint="Only for you, recipients never see it.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Promo 11.11" autoComplete="off" />
            </Field>
            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Send to everyone with a tag</p>
              {tagsQ.error && !tagsQ.data ? (
                <p className="text-xs text-crit">Could not load tags: {(tagsQ.error as Error).message}</p>
              ) : tagsQ.loading ? (
                <p className="text-xs text-muted">Loading tags...</p>
              ) : (tagsQ.data ?? []).length === 0 ? (
                <p className="text-xs text-muted">No tags yet. Tag contacts on the Contacts page to send by group, or add numbers below.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {tagsQ.data!.map((t) => {
                    const on = tags.includes(t.tag);
                    return (
                      <button key={t.tag} type="button" aria-pressed={on} onClick={() => setTags(on ? tags.filter((x) => x !== t.tag) : [...tags, t.tag])} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${on ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,white)] text-musawara-ink" : "border-border bg-surface text-ink2 hover:bg-surface2"}`}>
                        {t.tag} <span className="tnum text-muted">{fmtNum(t.count)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {ids.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
                {fmtNum(ids.length)} contacts chosen on the Contacts page
                <Btn tone="ghost" onClick={() => setIds([])}>Remove them</Btn>
              </div>
            )}
            <Field label="Extra numbers (optional)" hint='One per line, or "number, name". Numbers are cleaned the same way as contacts.'>
              <Textarea value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={4} className="py-2" placeholder={"081234567890, Budi\n6285711112222"} />
            </Field>
            <div aria-live="polite" className="text-sm text-ink">
              {recErr ? <span className="text-crit">{recErr}</span> : !fresh ? <span className="text-muted">Counting recipients...</span> : <><b className="tnum">{fmtNum(count)}</b> {count === 1 ? "person" : "people"} will receive this (duplicates removed).</>}
              {rec && rec.invalid.length > 0 && (
                <p className="mt-1 break-words text-xs text-crit">{fmtNum(rec.invalid.length)} lines are not valid numbers and will be skipped: {rec.invalid.slice(0, 4).join(", ")}{rec.invalid.length > 4 ? ", ..." : ""}</p>
              )}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {templates.length > 0 && (
              <Field label="Start from a template">
                <NativeSelect className="w-full" value="" onChange={(e) => { const t = templates.find((x: any) => String(x.id) === e.target.value); if (t) setTemplate(t.body); }}>
                  <option value="">Choose a template (replaces the text below)</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </NativeSelect>
              </Field>
            )}
            <Field label="Message">
              <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={8} className="py-2" placeholder="{Halo|Hai} {nama}, ada promo 11.11 diskon 50% hari ini saja." />
            </Field>
            <ul className="space-y-1 text-xs text-muted">
              {PLACEHOLDERS.map((p) => (
                <li key={p.token}><code className="text-ink2">{p.token}</code>{p.alt && <> or <code className="text-ink2">{p.alt}</code></>}: {p.desc}</li>
              ))}
            </ul>
            <Field label="Attachment (optional)" hint={file ? `${file.name}, ${(file.size / 1048576).toFixed(1)} MB. With an attachment, the message becomes its caption. Max 64 MB.` : "Image, video or document, up to 64 MB. The message becomes its caption."}>
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block min-h-11 w-full text-xs text-ink2 file:mr-3 file:min-h-11 file:rounded-lg file:border file:border-border file:bg-surface file:px-3 file:text-xs" />
            </Field>
            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Pause between messages (seconds)</p>
              <div className="grid max-w-xs grid-cols-2 gap-3">
                <Field label="Shortest"><Input type="number" min={3} value={delayMin} onChange={(e) => setDelayMin(e.target.value)} inputMode="numeric" /></Field>
                <Field label="Longest"><Input type="number" min={3} value={delayMax} onChange={(e) => setDelayMax(e.target.value)} inputMode="numeric" /></Field>
              </div>
              <p className="mt-2 text-xs text-muted">At least 3 seconds. A random pause in this range looks more natural and lowers the risk of the number being blocked.{eta && ` About ${fmtNum(count)} messages will take ${eta}.`}</p>
            </div>
          </>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-ink">Check before sending</h2>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-muted">Name</dt><dd className="break-words text-ink">{name}</dd>
              <dt className="text-muted">Recipients</dt>
              <dd className="text-ink"><b className="tnum">{fmtNum(count)}</b> {count === 1 ? "person" : "people"}{tags.length > 0 && <span className="ml-2 inline-flex flex-wrap gap-1">{tags.map((t) => <TagChip key={t}>{t}</TagChip>)}</span>}{ids.length > 0 && <span className="text-ink2"> + {fmtNum(ids.length)} chosen contacts</span>}{numbers.trim() && <span className="text-ink2"> + typed numbers</span>}</dd>
              <dt className="text-muted">Pacing</dt><dd className="text-ink">{min} to {max} s between messages{eta && `, ${eta} in total`}</dd>
              <dt className="text-muted">Attachment</dt><dd className="break-all text-ink">{file ? file.name : "None"}</dd>
            </dl>
            <div>
              <p className="mb-1 text-xs font-medium text-ink2">Sample for {rec?.sample ? `${rec.sample.name || "the first recipient"} (${fmtPhone(rec.sample.phone)})` : "the first recipient"}</p>
              <Bubble text={sample ?? ""} attachment={file?.name} />
              <p className="mt-1 text-xs text-muted">Spintax choices such as {"{Halo|Hai}"} differ per person.</p>
            </div>
            <p className="rounded-lg bg-surface2 px-3 py-2 text-xs text-ink2">
              This sends real WhatsApp messages as soon as you confirm. Only message people who know your business; reports as spam can get the number blocked. You can pause or cancel from the broadcast page, but messages already sent cannot be recalled.
            </p>
          </div>
        )}

        {problem && <p role="alert" className="text-xs text-crit">{problem}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {step > 0 && <Btn onClick={() => { setProblem(undefined); setStep(step - 1); }} disabled={busy}>Back</Btn>}
          {step < 2 ? (
            <Btn tone="primary" onClick={next}>Continue</Btn>
          ) : (
            <Btn tone="primary" loading={busy} disabled={!ready || !fresh || count === 0} onClick={() => void create()}>
              Send to {fmtNum(count)} {count === 1 ? "person" : "people"}
            </Btn>
          )}
          {step === 2 && !ready && <span className="text-xs text-warn">Connect WhatsApp first. Sending is disabled until it is connected.</span>}
        </div>
      </Panel>
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
                <button key={c.id} type="button" onClick={() => setView({ kind: "detail", id: c.id })} className="block w-full min-h-11 rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-4 text-left hover:bg-surface2">
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
