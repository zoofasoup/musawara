// Offline conversions: upload a CSV/XLSX of real sales, see which rows were
// already sent (skipped) and which are new, then send only the new ones to Meta.
// Identifiers are hashed in the browser; the server keeps a ledger so a sale can
// never be sent twice (see worker/routes/conversions.ts).

import { useCallback, useMemo, useRef, useState } from "react";
import { api, useApi } from "../lib/api";
import { Icon } from "../components/icons";
import { fmtDateTime, fmtNum, fmtRp } from "../lib/format";
import {
  buildRows, FIELD_LABEL, guessMapping, parseFile, type Field, type Mapping, type PreparedRow, type RowStatus,
} from "../lib/conversions";
import { Btn, Empty, inputCls, Panel, Pill, selectCls, useNotify, type Notify, type Tone } from "./settings/kit";

const EVENTS = [
  { v: "Purchase", l: "Purchase (a paid sale)" },
  { v: "Lead", l: "Lead" },
  { v: "Contact", l: "Contact" },
  { v: "Schedule", l: "Schedule (booking)" },
];
const SOURCES = [
  { v: "physical_store", l: "Physical store / offline (recommended)" },
  { v: "other", l: "Other" },
  { v: "chat", l: "Chat" },
  { v: "phone_call", l: "Phone call" },
  { v: "email", l: "Email" },
  { v: "system_generated", l: "System generated" },
];

const STATUS: Record<RowStatus, { label: string; tone: Tone; hint: string }> = {
  new: { label: "New", tone: "good", hint: "Will be sent" },
  retry: { label: "Retry", tone: "warn", hint: "Failed before, will be sent again" },
  sent: { label: "Already sent", tone: "neutral", hint: "Skipped, Meta already has it" },
  uncertain: { label: "Uncertain", tone: "warn", hint: "May have been sent, not resent automatically" },
  dup_in_file: { label: "Duplicate in file", tone: "neutral", hint: "Skipped" },
  invalid: { label: "Invalid", tone: "crit", hint: "Fix it in the file" },
  too_old: { label: "Too old", tone: "crit", hint: "Meta only accepts the last 62 days" },
};
const ORDER: RowStatus[] = ["new", "retry", "sent", "uncertain", "dup_in_file", "invalid", "too_old"];

type Settings = { settings: any[]; tokenConfigured: boolean };

function Step({ n, title, hint, children, done }: { n: number; title: string; hint?: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${done ? "bg-good/12 text-good" : "bg-surface3 text-ink2"}`}>
          {done ? <Icon name="check" className="h-4 w-4" /> : n}
        </span>
        <div>
          <h2 className="text-base font-bold leading-tight text-ink">{title}</h2>
          {hint && <p className="text-xs text-muted">{hint}</p>}
        </div>
      </div>
      <div className="sm:pl-10">{children}</div>
    </section>
  );
}

function History() {
  const { data, loading, reload } = useApi<{ batches: any[] }>("/admin/conversions/batches");
  void reload;
  if (loading) return <div className="h-20 skeleton rounded-xl" />;
  if (!data?.batches.length) return <Empty icon="database" title="Nothing sent yet" hint="Every upload appears here with what was sent, skipped and failed." />;
  return (
    <Panel className="divide-y divide-border">
      {data.batches.map((b) => (
        <div key={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3.5 text-xs">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
              <span className="truncate">{b.filename || `Batch #${b.id}`}</span>
              {b.is_test ? <Pill tone="warn">Test</Pill> : null}
            </p>
            <p className="text-muted">{b.client_name} · {fmtDateTime(b.created_at)}</p>
          </div>
          <Pill tone="good" icon="check">{fmtNum(b.sent ?? 0)} sent</Pill>
          {b.failed > 0 && <Pill tone="crit">{b.failed} failed</Pill>}
          {b.uncertain > 0 && <Pill tone="warn">{b.uncertain} uncertain</Pill>}
          {!b.is_test && b.value_sent > 0 && <span className="tnum text-ink2">{fmtRp(b.value_sent)}</span>}
        </div>
      ))}
    </Panel>
  );
}

export function Conversions() {
  const { notify, node } = useNotify();
  const clients = useApi<{ clients: any[] }>("/admin/clients");
  const conf = useApi<Settings>("/admin/conversions/settings");
  const [clientId, setClientId] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [eventName, setEventName] = useState("Purchase");
  const [actionSource, setActionSource] = useState("physical_store");
  const [currency, setCurrency] = useState("IDR");
  const [test, setTest] = useState(true);
  const [testCode, setTestCode] = useState("");
  const [capiToken, setCapiToken] = useState("");

  const [fileName, setFileName] = useState("");
  const [raw, setRaw] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<PreparedRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<RowStatus | "all">("all");
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [lastRun, setLastRun] = useState<{ sent: number; failed: number; uncertain: number; error?: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [histKey, setHistKey] = useState(0);

  const datasets = useApi<{ datasets: Array<{ id: string; name: string }>; error?: string }>(clientId ? `/admin/conversions/datasets?client_id=${clientId}` : null);

  const pickClient = (id: string) => {
    setClientId(id);
    const s = conf.data?.settings.find((x) => String(x.client_id) === id);
    setDatasetId(s?.dataset_id ?? "");
    setEventName(s?.event_name ?? "Purchase");
    setActionSource(s?.action_source ?? "physical_store");
    setCurrency(s?.currency ?? "IDR");
    resetFile();
  };

  const resetFile = () => { setRaw(null); setMap(null); setRows(null); setFileName(""); setConfirming(false); setLastRun(null); setFilter("all"); };

  const destinationOk = Boolean(clientId && /^\d{5,20}$/.test(datasetId));
  const ready = destinationOk && (!test || testCode.trim().length > 0);

  const saveDestination = async () => {
    try {
      await api(`/admin/conversions/settings/${clientId}`, { method: "PUT", body: { dataset_id: datasetId, action_source: actionSource, event_name: eventName, currency } });
      conf.reload();
      notify("Saved as this client's default.");
    } catch (e: any) { notify(e.message, "err"); }
  };

  const saveToken = async () => {
    try {
      await api("/admin/conversions/token", { method: "POST", body: { token: capiToken } });
      setCapiToken("");
      conf.reload();
      notify("Conversions token saved.");
    } catch (e: any) { notify(e.message, "err"); }
  };

  // Hash, then ask the server which rows it already knows.
  const evaluate = useCallback(async (data: string[][], m: Mapping) => {
    setBusy("Checking rows…");
    try {
      const built = await buildRows(data.slice(1), m, { datasetId, eventName, actionSource, currency });
      const keys = built.filter((r) => r.payload).map((r) => r.payload!.row_key);
      const { existing } = keys.length
        ? await api<{ existing: Record<string, string> }>("/admin/conversions/check", { method: "POST", body: { dataset_id: datasetId, is_test: test, keys } })
        : { existing: {} };
      setRows(
        built.map((r) => {
          const s = r.payload ? existing[r.payload.row_key] : undefined;
          if (!s) return r;
          if (s === "sent") return { ...r, status: "sent" as const, reason: "Already sent earlier" };
          if (s === "failed") return { ...r, status: "retry" as const, reason: "Failed earlier, will retry" };
          return { ...r, status: "uncertain" as const, reason: s === "pending" ? "A send is in progress" : "A previous send never confirmed" };
        })
      );
    } catch (e: any) {
      notify(e.message, "err");
    } finally { setBusy(null); }
  }, [datasetId, eventName, actionSource, currency, test, notify]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    resetFile();
    setBusy("Reading file…");
    try {
      const data = await parseFile(file);
      if (data.length < 2) throw new Error("The file has no data rows.");
      if (data.length > 20001) throw new Error("Max 20,000 rows per file. Split it and upload in parts.");
      const m = guessMapping(data[0]);
      setFileName(file.name); setRaw(data); setMap(m);
      if ((m.phone >= 0 || m.email >= 0) && m.time >= 0) await evaluate(data, m);
    } catch (e: any) { notify(e.message, "err"); }
    finally { setBusy(null); }
  };

  const counts = useMemo(() => {
    const c = Object.fromEntries(ORDER.map((s) => [s, 0])) as Record<RowStatus, number>;
    rows?.forEach((r) => c[r.status]++);
    return c;
  }, [rows]);
  const toSend = useMemo(() => (rows ?? []).filter((r) => r.status === "new" || r.status === "retry"), [rows]);
  const sendValue = toSend.reduce((s, r) => s + (r.payload?.value ?? 0), 0);

  const send = async () => {
    setConfirming(false);
    setLastRun(null);
    const chunk = 200;
    let sent = 0, failed = 0, uncertain = 0, lastError: string | undefined;
    try {
      const b = await api<{ id: number }>("/admin/conversions/batches", {
        method: "POST",
        body: { client_id: Number(clientId), dataset_id: datasetId, filename: fileName, is_test: test, test_event_code: test ? testCode.trim() : null },
      });
      setProgress({ done: 0, total: toSend.length });
      for (let i = 0; i < toSend.length; i += chunk) {
        const part = toSend.slice(i, i + chunk);
        const r = await api<{ sent: number; failed: number; uncertain: number; error?: string }>(`/admin/conversions/batches/${b.id}/send`, {
          method: "POST",
          body: { rows: part.map((p) => p.payload) },
        });
        sent += r.sent; failed += r.failed; uncertain += r.uncertain;
        if (r.error) lastError = r.error;
        setProgress({ done: Math.min(i + chunk, toSend.length), total: toSend.length });
      }
    } catch (e: any) {
      lastError = e.message;
      notify(e.message, "err");
    } finally {
      setProgress(null);
      setLastRun({ sent, failed, uncertain, error: lastError });
      setHistKey((k) => k + 1);
      if (raw && map) await evaluate(raw, map); // refresh: what was just sent now shows as "Already sent"
    }
  };

  const resolveUncertain = async (action: "mark_sent" | "retry") => {
    const keys = (rows ?? []).filter((r) => r.status === "uncertain" && r.payload).map((r) => r.payload!.row_key);
    try {
      await api("/admin/conversions/uncertain/resolve", { method: "POST", body: { dataset_id: datasetId, is_test: test, keys, action } });
      if (raw && map) await evaluate(raw, map);
      notify(action === "mark_sent" ? "Marked as sent." : "Released for retry.");
    } catch (e: any) { notify(e.message, "err"); }
  };

  const mapOk = map && (map.phone >= 0 || map.email >= 0) && map.time >= 0 && (eventName !== "Purchase" || map.value >= 0);
  const shown = (rows ?? []).filter((r) => filter === "all" || r.status === filter).slice(0, 200);
  const tokenOk = Boolean(conf.data?.tokenConfigured);
  const clientList = clients.data?.clients ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-9 pb-24">
      <div>
        <h1 className="text-2xl font-bold text-ink">Offline conversions</h1>
        <p className="text-sm text-muted">Upload real sales from a CSV or Excel file and send them to Meta, so ads can be optimised for purchases. Rows already sent are detected and skipped.</p>
      </div>

      {!tokenOk && !conf.loading && (
        <Panel className="border-warn/40 bg-warn/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-warn"><Icon name="key" className="h-4 w-4" /> Add a Conversions API token first</p>
          <p className="mt-1 text-xs text-ink2">It must be a system-user token with the <b>ads_management</b> permission and access to the dataset. It is separate from the read-only token and stored encrypted.</p>
          <div className="mt-3 flex gap-2">
            <input type="password" value={capiToken} onChange={(e) => setCapiToken(e.target.value)} placeholder="Paste token (starts with EAA…)" aria-label="Conversions API token" autoComplete="off" className={`${inputCls} font-mono`} />
            <Btn tone="primary" disabled={!capiToken.trim()} onClick={saveToken}>Save</Btn>
          </div>
        </Panel>
      )}

      <Step n={1} title="Where to send" hint="Pick the client and the Meta dataset that its ads optimise on." done={destinationOk}>
        <Panel className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs text-muted">Client
              <select value={clientId} onChange={(e) => pickClient(e.target.value)} className={`${inputCls} mt-1`}>
                <option value="">Choose…</option>
                {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-xs text-muted">Dataset
              {datasets.data?.datasets.length ? (
                <select value={datasets.data.datasets.some((d) => d.id === datasetId) ? datasetId : ""} onChange={(e) => setDatasetId(e.target.value)} className={`${inputCls} mt-1`}>
                  <option value="">Choose from this ad account…</option>
                  {datasets.data.datasets.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.id}</option>)}
                </select>
              ) : null}
              <input value={datasetId} onChange={(e) => setDatasetId(e.target.value.replace(/\D/g, ""))} placeholder="Dataset ID (Events Manager)" inputMode="numeric" className={`${inputCls} mt-1 font-mono`} />
            </label>
            <label className="block text-xs text-muted">Event
              <select value={eventName} onChange={(e) => setEventName(e.target.value)} className={`${inputCls} mt-1`}>{EVENTS.map((e) => <option key={e.v} value={e.v}>{e.l}</option>)}</select>
            </label>
            <label className="block text-xs text-muted">Where did the sale happen
              <select value={actionSource} onChange={(e) => setActionSource(e.target.value)} className={`${inputCls} mt-1`}>{SOURCES.map((e) => <option key={e.v} value={e.v}>{e.l}</option>)}</select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
            <div role="radiogroup" aria-label="Mode" className="inline-flex rounded-lg bg-surface3 p-0.5">
              {[{ v: true, l: "Test mode" }, { v: false, l: "Live" }].map((o) => (
                <button key={String(o.v)} type="button" role="radio" aria-checked={test === o.v} onClick={() => { setTest(o.v); setRows(null); if (raw && map) void evaluate(raw, map); }}
                  className={`inline-flex min-h-11 items-center rounded-md px-3.5 text-xs font-medium lg:min-h-9 ${test === o.v ? "bg-surface text-ink shadow-sm" : "text-ink2 hover:text-ink"}`}>{o.l}</button>
              ))}
            </div>
            {test ? (
              <input value={testCode} onChange={(e) => setTestCode(e.target.value.trim())} placeholder="Test event code, e.g. TEST12345" aria-label="Test event code" className={`${inputCls} sm:max-w-xs font-mono`} />
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-warn"><Icon name="alert" className="h-4 w-4" /> Live: events count for ads reporting and optimisation.</p>
            )}
            <Btn disabled={!destinationOk} onClick={saveDestination}>Save as default</Btn>
          </div>
          {test && <p className="text-[11px] text-muted">Get the code in Events Manager, Test events. Test sends appear only there and are tracked separately, so they never block a live send.</p>}
        </Panel>
      </Step>

      <Step n={2} title="Upload your sales file" hint="CSV or Excel (.xlsx). The first row must be the column titles." done={Boolean(raw)}>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (ready) void onFile(e.dataTransfer.files?.[0]); }}
          className={`flex flex-col items-center rounded-xl border border-dashed px-6 py-8 text-center ${ready ? "border-border2 bg-surface" : "border-border bg-surface2/50 opacity-70"}`}
        >
          <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface3 text-ink2"><Icon name="database" className="h-5 w-5" /></span>
          <p className="text-sm font-medium text-ink">{fileName || "Drop the file here"}</p>
          <p className="mt-1 max-w-md text-xs text-muted">
            <Icon name="shield" className="mr-1 inline h-3.5 w-3.5" />Phone numbers and emails are hashed in your browser. Only the hashes are sent to the server and Meta.
          </p>
          <div className="mt-3 flex gap-2">
            <Btn tone="primary" disabled={!ready || busy !== null} loading={busy !== null} onClick={() => fileInput.current?.click()}>{busy ?? (raw ? "Choose another file" : "Choose file")}</Btn>
            {raw && <Btn tone="ghost" onClick={resetFile}>Clear</Btn>}
          </div>
          {!ready && <p className="mt-2 text-xs text-warn">{destinationOk ? "Enter the test event code above (or switch to Live)." : "Choose a client and dataset in step 1 first."}</p>}
          <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,.xlsx" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
      </Step>

      {raw && map && (
        <Step n={3} title="Match the columns" hint="We guessed from your column titles. Fix anything that is wrong." done={Boolean(mapOk)}>
          <Panel className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(FIELD_LABEL) as Field[]).map((f) => (
                <label key={f} className="block text-xs text-muted">
                  {FIELD_LABEL[f]}{f === "order_id" ? " (best duplicate protection)" : ""}
                  <select value={map[f]} onChange={(e) => { const m = { ...map, [f]: Number(e.target.value) }; setMap(m); setRows(null); }} className={`${selectCls} mt-1`}>
                    <option value={-1}>Not in my file</option>
                    {raw[0].map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}{raw[1]?.[i] ? `  ·  e.g. ${f === "phone" || f === "email" ? "•••" : raw[1][i].slice(0, 18)}` : ""}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {map.order_id < 0 && <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn"><Icon name="info" className="mt-0.5 h-3.5 w-3.5" />No order/invoice ID: repeats are detected by person + date + amount. Two real purchases with the same three would count as one. Adding an ID column avoids that.</p>}
            <div className="mt-3 flex justify-end"><Btn tone="primary" disabled={!mapOk || busy !== null} loading={busy !== null} onClick={() => evaluate(raw, map)}>Check rows</Btn></div>
          </Panel>
        </Step>
      )}

      {rows && (
        <Step n={4} title="Review before sending" hint="Only the green rows go out. Everything else is skipped or needs a fix." done={toSend.length === 0 && counts.sent > 0}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setFilter("all")} className={`inline-flex min-h-11 items-center rounded-full border px-3 text-xs ${filter === "all" ? "border-ink bg-ink text-bg" : "border-border2 bg-surface text-ink2"} lg:min-h-8`}>All {rows.length}</button>
              {ORDER.filter((s) => counts[s] > 0).map((s) => (
                <button key={s} onClick={() => setFilter(s)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs ${filter === s ? "border-ink bg-ink text-bg" : "border-border2 bg-surface text-ink2"} lg:min-h-8`}>
                  {STATUS[s].label} <b className="font-medium">{counts[s]}</b>
                </button>
              ))}
            </div>

            {counts.sent + counts.dup_in_file > 0 && (
              <p className="flex items-start gap-2 rounded-xl bg-good/8 px-3.5 py-2.5 text-xs text-ink2">
                <Icon name="shield" className="mt-0.5 h-4 w-4 text-good" />
                {counts.sent} row{counts.sent === 1 ? "" : "s"} already sent earlier and {counts.dup_in_file} repeated inside the file will be skipped. No duplicates will go out.
              </p>
            )}
            {counts.uncertain > 0 && (
              <Panel className="border-warn/40 bg-warn/5 p-3.5 text-xs">
                <p className="font-medium text-warn">{counts.uncertain} row{counts.uncertain === 1 ? "" : "s"} with an unknown outcome</p>
                <p className="mt-1 text-ink2">A send was interrupted before Meta confirmed. They are never resent automatically. Check Events Manager, then choose:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn onClick={() => resolveUncertain("mark_sent")}>They arrived, mark as sent</Btn>
                  <Btn onClick={() => resolveUncertain("retry")}>They did not arrive, allow retry</Btn>
                </div>
              </Panel>
            )}

            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-border text-[11px] uppercase tracking-wider text-muted">
                  <tr><th className="px-3 py-2">Line</th><th className="px-3 py-2">Person</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2">Order</th><th className="px-3 py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.map((r) => (
                    <tr key={r.rowNo}>
                      <td className="tnum px-3 py-2 text-muted">{r.rowNo + 1}</td>
                      <td className="px-3 py-2 font-mono text-ink2">{r.preview.who}</td>
                      <td className="tnum px-3 py-2 text-ink2">{r.preview.time}</td>
                      <td className="tnum px-3 py-2 text-right text-ink2">{r.preview.value}</td>
                      <td className="px-3 py-2 text-ink2">{r.preview.order}</td>
                      <td className="px-3 py-2"><Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>{r.reason && <span className="ml-2 text-muted">{r.reason}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(rows.filter((r) => filter === "all" || r.status === filter).length > 200) && <p className="border-t border-border px-3 py-2 text-[11px] text-muted">Showing the first 200 rows of this view.</p>}
            </Panel>
          </div>
        </Step>
      )}

      {rows && (
        <Step n={5} title={test ? "Send test events" : "Send to Meta"} hint={toSend.length ? `${fmtNum(toSend.length)} new row${toSend.length === 1 ? "" : "s"} ready.` : "Nothing new to send."}>
          {progress ? (
            <Panel className="p-4" >
              <div className="h-2 overflow-hidden rounded-full bg-surface3"><div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.max(4, Math.round((progress.done / progress.total) * 100))}%` }} /></div>
              <p className="tnum mt-1.5 text-xs text-muted">{progress.done} of {progress.total} rows. Keep this tab open.</p>
            </Panel>
          ) : confirming ? (
            <Panel className="space-y-3 border-[var(--accent)]/40 p-4">
              <p className="text-sm font-medium text-ink">Send {fmtNum(toSend.length)} {eventName} event{toSend.length === 1 ? "" : "s"}{eventName === "Purchase" ? ` worth ${fmtRp(sendValue)}` : ""} to dataset {datasetId}?</p>
              <p className="text-xs text-muted">{test ? "Test mode: they show up in Events Manager, Test events only." : "Live: Meta will use them for reporting and optimisation. This cannot be undone from here."} Rows already sent are not included.</p>
              <div className="flex gap-2"><Btn tone="primary" icon="check" onClick={send}>{test ? "Confirm test send" : "Confirm and send"}</Btn><Btn tone="ghost" onClick={() => setConfirming(false)}>Cancel</Btn></div>
            </Panel>
          ) : (
            <Btn tone="primary" disabled={toSend.length === 0 || !tokenOk} onClick={() => setConfirming(true)}>{test ? `Send ${toSend.length} as test` : `Send ${toSend.length} new events`}</Btn>
          )}
          {!tokenOk && <p className="mt-2 text-xs text-warn">Add the Conversions API token at the top first.</p>}
          {lastRun && (
            <Panel className="mt-3 p-3.5 text-xs">
              <div className="flex flex-wrap gap-2">
                <Pill tone="good" icon="check">{lastRun.sent} sent</Pill>
                {lastRun.failed > 0 && <Pill tone="crit">{lastRun.failed} failed</Pill>}
                {lastRun.uncertain > 0 && <Pill tone="warn">{lastRun.uncertain} uncertain</Pill>}
              </div>
              {lastRun.error && <p className="mt-2 break-words text-crit">{lastRun.error}</p>}
              {lastRun.failed > 0 && <p className="mt-2 text-muted">Failed rows stay in the list as "Retry". Fix the cause, then send again: only they go out.</p>}
            </Panel>
          )}
        </Step>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">History</h2>
        <History key={histKey} />
      </section>
      {node}
    </div>
  );
}
