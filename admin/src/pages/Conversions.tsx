// Sales: upload a CSV/XLSX of real closings (any number of sheets), save them to
// the dashboard, and optionally send them to Meta as offline conversions.
// Every sale is tracked as "dashboard only" or "sent to Meta"; re-uploading the
// same sales never duplicates anything (see worker/routes/conversions.ts).
// Identifiers are hashed in the browser; only hashes reach the server and Meta.

import { Checkbox } from "@/components/ui/checkbox";
import { TONE } from "../lib/tone";
import { Segmented } from "../components/Segmented";
import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { FormField } from "../components/FormField";
import { Callout } from "../components/Callout";
import { PageHeader } from "../components/PageHeader";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "../lib/api";
import { Icon } from "../components/icons";
import { fmtAgo, fmtDayFull, fmtDateTime, fmtNum, fmtRp } from "../lib/format";
import {
  buildSales, COLUMN_GUIDE, FIELD_HINT, FIELD_LABEL, guessMapping, parseWorkbook, planMeta, REQUIRED, templateCsv, unitEvent,
  type Field, type Mapping, type MetaUnit, type SaleRow, type Sheet,
} from "../lib/conversions";
import { Btn, Empty, Panel, Pill, useNotify, type Notify, type Tone } from "../components/kit";
import { SalesGrid, type SavedSale } from "./SalesGrid";

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

type Settings = { settings: any[]; tokenConfigured: boolean };
type Mode = "dashboard" | "meta";

const FIELD_ORDER: Field[] = ["time", "value", "discount", "name", "consultant", "departure", "package", "room", "dp", "status", "order_id", "group", "phone", "email", "source", "first_name", "last_name"];

function Step({ n, title, hint, children, done }: { n: number; title: string; hint?: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${done ? TONE.good.soft : TONE.neutral.soft}`}>
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

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-penjualan.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function FileGuide() {
  return (
    <details className="group mb-3 rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-ink">
        <Icon name="info" className="h-4 w-4 text-ink2" />
        Isi file yang dibutuhkan
        <Icon name="chevronDown" className="ml-auto h-4 w-4 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <ul className="divide-y divide-border text-xs">
          {COLUMN_GUIDE.map((c) => (
            <li key={c.title} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
              <span className="w-36 shrink-0 font-medium text-ink">{c.title}</span>
              <Pill tone={c.need === "required" ? "crit" : c.need === "recommended" ? "warn" : "neutral"}>
                {c.need === "required" ? "Wajib" : c.need === "recommended" ? "Disarankan" : "Opsional"}
              </Pill>
              <span className="min-w-0 flex-1 text-ink2">{c.note}</span>
              <span className="font-mono text-xs text-muted">{c.example}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">Satu baris = satu orang = satu penjualan. File Excel boleh berisi banyak sheet (satu per bulan). Judul kolom lain tetap bisa dipakai, dicocokkan di langkah 3.</p>
        <Btn icon="database" onClick={downloadTemplate}>Unduh template (CSV)</Btn>
      </div>
    </details>
  );
}

function SavedSales({ clientId, refreshKey, notify, onChanged }: { clientId: string; refreshKey: number; notify: Notify; onChanged: () => void }) {
  const { data, loading } = useApi<{ months: any[]; rows: SavedSale[]; sheetSync: { at: string; inserted: number; updated: number; error?: string } | null }>(
    clientId ? `/admin/conversions/sales?client_id=${clientId}&k=${refreshKey}` : null
  );
  if (!clientId) return <p className="text-xs text-muted">Choose a client above to see its saved sales.</p>;
  if (loading && !data) return <div className="h-24 skeleton rounded-xl" />;
  if (!data || data.months.length === 0) return <Empty icon="database" title="No sales saved yet" hint="Upload a file above. Every sale you save here feeds Purchases, CPA and ROAS on the dashboard." />;
  const total = data.months.reduce((s, m) => s + m.n, 0);
  const sent = data.months.reduce((s, m) => s + (m.sent ?? 0), 0);
  const value = data.months.reduce((s, m) => s + (m.value ?? 0), 0);
  const cancelled = data.months.reduce((s, m) => s + (m.cancelled ?? 0), 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Pill tone="neutral">{fmtNum(total)} sales · {fmtRp(value)}</Pill>
        <Pill tone="good" icon="check">{fmtNum(sent)} sent to Meta</Pill>
        <Pill tone="neutral" icon="database">{fmtNum(total - sent)} dashboard only</Pill>
        {cancelled > 0 && <Pill tone="crit">{fmtNum(cancelled)} cancelled (not counted)</Pill>}
      </div>
      {data.sheetSync && (
        <p className={`text-xs ${data.sheetSync.error ? "text-crit" : "text-muted"}`}>
          {data.sheetSync.error
            ? `Google Sheet sync failed ${fmtAgo(data.sheetSync.at)}: ${data.sheetSync.error}`
            : `Google Sheet synced ${fmtAgo(data.sheetSync.at)} · ${fmtNum(data.sheetSync.inserted)} new, ${fmtNum(data.sheetSync.updated)} checked`}
        </p>
      )}
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
            <tr><th className="px-3 py-2">Month</th><th className="px-3 py-2 text-right">Sales</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2 text-right">Sent to Meta</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.months.map((m) => (
              <tr key={m.month}>
                <td className="tnum px-3 py-2 text-ink">{m.month}</td>
                <td className="tnum px-3 py-2 text-right text-ink2">{fmtNum(m.n)}</td>
                <td className="tnum px-3 py-2 text-right text-ink2">{fmtRp(m.value)}</td>
                <td className="tnum px-3 py-2 text-right text-ink2">{fmtNum(m.sent ?? 0)} / {fmtNum(m.n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <SalesGrid rows={data.rows} months={data.months} notify={notify} onChanged={onChanged} />
    </div>
  );
}

function History({ refreshKey }: { refreshKey: number }) {
  const { data, loading } = useApi<{ batches: any[] }>(`/admin/conversions/batches?k=${refreshKey}`);
  if (loading && !data) return <div className="h-20 skeleton rounded-xl" />;
  if (!data?.batches.length) return <Empty icon="database" title="Nothing sent to Meta yet" hint="Every send appears here with what was sent, skipped and failed." />;
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

const DASH: Record<SaleRow["status"], { label: string; tone: Tone }> = {
  new: { label: "New", tone: "good" },
  saved: { label: "Already saved", tone: "neutral" },
  dup_in_file: { label: "Duplicate in file", tone: "neutral" },
  invalid: { label: "Invalid", tone: "crit" },
};
type Filter = "all" | "new" | "saved" | "dup_in_file" | "invalid" | "meta_send" | "meta_none";

export function Conversions({ clientId: fixedId }: { clientId?: number } = {}) {
  const { notify, node } = useNotify();
  const clients = useApi<{ clients: any[] }>("/admin/clients");
  const conf = useApi<Settings>("/admin/conversions/settings");
  const [clientId, setClientId] = useState(fixedId ? String(fixedId) : "");
  const [mode, setMode] = useState<Mode>("dashboard");
  const [datasetId, setDatasetId] = useState("");
  const [eventName, setEventName] = useState("Purchase");
  const [actionSource, setActionSource] = useState("physical_store");
  const [currency, setCurrency] = useState("IDR");
  const [test, setTest] = useState(true);
  const [testCode, setTestCode] = useState("");

  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [map, setMap] = useState<Mapping | null>(null);
  const [rows, setRows] = useState<SaleRow[] | null>(null);
  const [units, setUnits] = useState<MetaUnit[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null);
  const [lastRun, setLastRun] = useState<string[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  const datasets = useApi<{ datasets: Array<{ id: string; name: string }> }>(clientId && mode === "meta" ? `/admin/conversions/datasets?client_id=${clientId}` : null);
  const clientList = clients.data?.clients ?? [];
  const tokenOk = Boolean(conf.data?.tokenConfigured);
  const metaDestOk = /^\d{5,20}$/.test(datasetId) && (!test || testCode.trim().length > 0);
  const ready = Boolean(clientId) && (mode === "dashboard" || metaDestOk);

  const pickClient = (id: string) => {
    setClientId(id);
    const s = conf.data?.settings.find((x) => String(x.client_id) === id);
    setDatasetId(s?.dataset_id ?? "");
    setEventName(s?.event_name ?? "Purchase");
    setActionSource(s?.action_source ?? "physical_store");
    setCurrency(s?.currency ?? "IDR");
    reset();
  };
  // Inside a client's own Sales tab the client is fixed; load its saved destination once the settings arrive.
  const settingsLoaded = useRef(false);
  useEffect(() => {
    if (fixedId && conf.data && !settingsLoaded.current) {
      settingsLoaded.current = true;
      pickClient(String(fixedId));
    }
  }, [fixedId, conf.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const reset = () => { setSheets([]); setSelected(new Set()); setMap(null); setRows(null); setUnits([]); setFileName(""); setConfirming(false); setLastRun(null); setFilter("all"); };

  const saveDestination = async () => {
    try {
      await api(`/admin/conversions/settings/${clientId}`, { method: "PUT", body: { dataset_id: datasetId, action_source: actionSource, event_name: eventName, currency } });
      conf.reload();
      notify("Saved as this client's default.");
    } catch (e: any) { notify(e.message, "err"); }
  };
  const unionHeaders = (list: Sheet[]) => [...new Set(list.flatMap((s) => s.headers).filter(Boolean))];

  /** Build the rows, ask the server what it already has, and plan what can go to Meta. */
  const evaluate = useCallback(
    async (chosen: Sheet[], m: Mapping) => {
      setBusy("Checking rows…");
      try {
        const built = await buildSales(chosen, m, { clientId: Number(clientId) });
        const keys = built.filter((r) => r.sale_key).map((r) => r.sale_key!);
        const { existing } = keys.length
          ? await api<{ existing: Record<string, string> }>("/admin/conversions/sales/check", { method: "POST", body: { client_id: Number(clientId), keys } })
          : { existing: {} as Record<string, string> };
        for (const r of built) if (r.status === "new" && existing[r.sale_key!] === "deleted") { r.status = "dup_in_file"; r.reason = "Deleted by you earlier, not added again"; }
        for (const r of built) if (r.status === "new" && existing[r.sale_key!]) { r.status = "saved"; r.reason = existing[r.sale_key!] === "sent" ? "Already saved, sent to Meta" : "Already saved"; }

        let planned = mode === "meta" ? planMeta(built, existing) : [];
        if (mode === "meta" && planned.length) {
          // the Meta ledger may know a booking even if the sales table does not (e.g. an earlier test of the same file)
          const evs = await Promise.all(planned.map((u) => unitEvent(u, { datasetId, eventName, actionSource, currency })));
          const { existing: led } = await api<{ existing: Record<string, string> }>("/admin/conversions/check", { method: "POST", body: { dataset_id: datasetId, is_test: test, keys: evs.map((e) => e.row_key) } });
          planned = planned.filter((u, i) => {
            const st = led[evs[i].row_key];
            if (!st || st === "failed") return true;
            for (const r of u.rows) { r.meta = st === "sent" ? "sent" : "already_event"; r.metaReason = st === "sent" ? "Already sent to Meta" : "A send is unconfirmed, check history"; }
            return false;
          });
        }
        setRows(built);
        setUnits(planned);
      } catch (e: any) {
        notify(e.message, "err");
      } finally { setBusy(null); }
    },
    [clientId, mode, datasetId, eventName, actionSource, currency, test, notify]
  );

  const chosenSheets = (sel: Set<string>) => sheets.filter((s) => sel.has(s.name));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    reset();
    setBusy("Reading file…");
    try {
      const all = await parseWorkbook(file);
      const usable = all.filter((s) => s.recognised >= 2 && s.body.length > 0);
      if (usable.length === 0) throw new Error("No sheet with recognisable columns (needs at least a date and a price).");
      // a sheet whose name is the start of another's ("Juni" vs "Juni_MSWR") is probably an older copy: leave it unticked
      const names = usable.map((s) => s.name);
      const sel = new Set(names.filter((n) => !names.some((o) => o !== n && o.toLowerCase().startsWith(n.toLowerCase()))));
      const chosen = usable.filter((s) => sel.has(s.name));
      const m = guessMapping(unionHeaders(chosen));
      setFileName(file.name); setSheets(usable); setSelected(sel); setMap(m);
      if (REQUIRED.every((f) => m[f])) await evaluate(chosen, m);
    } catch (e: any) { notify(e.message, "err"); }
    finally { setBusy(null); }
  };

  const toggleSheet = (name: string) => {
    const next = new Set(selected);
    next.has(name) ? next.delete(name) : next.add(name);
    setSelected(next);
    const chosen = sheets.filter((s) => next.has(s.name));
    const m = guessMapping(unionHeaders(chosen));
    setMap(m);
    setRows(null);
    if (chosen.length && REQUIRED.every((f) => m[f])) void evaluate(chosen, m);
  };

  const counts = useMemo(() => {
    const c = { new: 0, saved: 0, dup_in_file: 0, invalid: 0, newValue: 0, meta_send: units.reduce((s, u) => s + u.count, 0), meta_none: 0, noContact: 0, tooOld: 0, sentRows: 0 };
    for (const r of rows ?? []) {
      c[r.status]++;
      if (r.status === "new") c.newValue += r.value ?? 0;
      if (r.status === "new" || r.status === "saved") {
        if (r.meta === "no_contact") { c.noContact++; c.meta_none++; }
        else if (r.meta === "too_old") { c.tooOld++; c.meta_none++; }
        else if (r.meta === "sent") c.sentRows++;
      }
    }
    return c;
  }, [rows, units]);
  const sendValue = units.reduce((s, u) => s + u.value, 0);
  const toSave = (rows ?? []).filter((r) => r.status === "new" || (r.status === "saved" && (r.group_key || r.has_contact)));

  const mapOk = map && REQUIRED.every((f) => map[f]);
  const selectedList = chosenSheets(selected);
  const headersAll = unionHeaders(selectedList);

  const run = async () => {
    setConfirming(false);
    setLastRun(null);
    const log: string[] = [];
    try {
      // 1. dashboard
      let inserted = 0, updated = 0;
      const payload = toSave.map((r) => ({ sale_key: r.sale_key, sale_date: r.date, value: r.value, label: r.label, source: r.source, consultant: r.consultant, group_key: r.group_key, has_contact: r.has_contact, departure_date: r.departure, package_name: r.package, room_type: r.room, down_payment: r.dp, pay_status: r.pay_status }));
      for (let i = 0; i < payload.length; i += 300) {
        setProgress({ done: i, total: payload.length, label: "Saving to dashboard" });
        const res = await api<{ inserted: number; updated: number }>("/admin/conversions/sales/import", { method: "POST", body: { client_id: Number(clientId), rows: payload.slice(i, i + 300) } });
        inserted += res.inserted; updated += res.updated;
      }
      log.push(`Dashboard: ${fmtNum(inserted)} new sales saved${updated ? `, ${fmtNum(updated)} updated` : ""}.`);

      // 2. Meta
      if (mode === "meta" && units.length) {
        const b = await api<{ id: number }>("/admin/conversions/batches", {
          method: "POST",
          body: { client_id: Number(clientId), dataset_id: datasetId, filename: fileName, is_test: test, test_event_code: test ? testCode.trim() : null },
        });
        const evs = await Promise.all(units.map((u) => unitEvent(u, { datasetId, eventName, actionSource, currency })));
        let sent = 0, failed = 0, uncertain = 0, skipped = 0, err = "";
        for (let i = 0; i < evs.length; i += 200) {
          setProgress({ done: i, total: evs.length, label: test ? "Sending test events to Meta" : "Sending to Meta" });
          const r = await api<{ sent: number; failed: number; uncertain: number; skipped: number; error?: string }>(`/admin/conversions/batches/${b.id}/send`, { method: "POST", body: { rows: evs.slice(i, i + 200) } });
          sent += r.sent; failed += r.failed; uncertain += r.uncertain; skipped += r.skipped;
          if (r.error) err = r.error;
        }
        log.push(`Meta${test ? " (test)" : ""}: ${sent} booking${sent === 1 ? "" : "s"} sent${skipped ? `, ${skipped} skipped (already known)` : ""}${failed ? `, ${failed} failed` : ""}${uncertain ? `, ${uncertain} unconfirmed` : ""}.${err ? " " + err : ""}`);
      }
    } catch (e: any) {
      log.push(`Stopped: ${e.message}`);
      notify(e.message, "err");
    } finally {
      setProgress(null);
      setLastRun(log);
      setRefreshKey((k) => k + 1);
      if (mapOk) await evaluate(selectedList, map!); // refresh: what was just saved/sent now shows as such
    }
  };

  const shown = (rows ?? []).filter((r) => {
    if (filter === "all") return true;
    if (filter === "meta_send") return r.meta === "send" && units.some((u) => u.rows.includes(r));
    if (filter === "meta_none") return r.meta === "no_contact" || r.meta === "too_old";
    return r.status === filter;
  });

  const chip = (k: Filter, label: string, n: number) =>
    n > 0 || k === "all" ? (
      <button key={k} onClick={() => setFilter(k)} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs lg:min-h-8 ${filter === k ? "border-ink bg-ink text-bg" : "border-border2 bg-surface text-ink2"}`}>
        {label} <b className="font-medium">{n}</b>
      </button>
    ) : null;

  return (
    <div className="max-w-4xl space-y-9 pb-24">
      <PageHeader title="Sales" subtitle="Upload real closings from a CSV or Excel file. They feed Purchases, CPA and ROAS on the dashboard, and can also be sent to Meta as offline conversions. Re-uploading never duplicates anything." />

      <Step n={1} title={fixedId ? "What to do" : "Client and what to do"} hint="Dashboard only is the default. Sending to Meta is optional." done={ready}>
        <Panel className="space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {!fixedId && (
              <FormField label="Client">
                <NativeSelect value={clientId} onChange={(e) => pickClient(e.target.value)} className="w-full">
                  <option value="">Choose…</option>
                  {clientList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </NativeSelect>
              </FormField>
            )}
            <div className="text-xs text-muted">
              <p>What should happen</p>
              <Segmented label="Destination" value={mode} onChange={(k) => { setMode(k); setRows(null); setUnits([]); }} options={[{ value: "dashboard", label: "Dashboard only" }, { value: "meta", label: "Dashboard + Meta" }]} />
            </div>
          </div>

          {mode === "meta" && (
            <div className="space-y-3 border-t border-border pt-3">
              {!tokenOk && !conf.loading ? (
                <Callout tone="warn" compact>No Meta token yet. Add it once in Settings, Meta connection. The same token is used here (it needs the ads_management permission).</Callout>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted"><Icon name="key" className="h-3.5 w-3.5" /> Sends with the token from Settings, Meta connection (needs ads_management).</p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Dataset">
                  {datasets.data?.datasets.length ? (
                    <NativeSelect value={datasets.data.datasets.some((d) => d.id === datasetId) ? datasetId : ""} onChange={(e) => setDatasetId(e.target.value)} className="mb-2 w-full">
                      <option value="">Choose from this ad account…</option>
                      {datasets.data.datasets.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.id}</option>)}
                    </NativeSelect>
                  ) : null}
                  <Input value={datasetId} onChange={(e) => setDatasetId(e.target.value.replace(/\D/g, ""))} placeholder="Dataset ID (Events Manager)" inputMode="numeric" className="font-mono" />
                </FormField>
                <FormField label="Event">
                  <NativeSelect value={eventName} onChange={(e) => setEventName(e.target.value)} className="w-full">{EVENTS.map((e) => <option key={e.v} value={e.v}>{e.l}</option>)}</NativeSelect>
                </FormField>
                <FormField label="Where did the sale happen">
                  <NativeSelect value={actionSource} onChange={(e) => setActionSource(e.target.value)} className="w-full">{SOURCES.map((e) => <option key={e.v} value={e.v}>{e.l}</option>)}</NativeSelect>
                </FormField>
                <div className="text-xs text-muted">
                  <p>Mode</p>
                  <Segmented label="Test or live" value={test ? "test" : "live"} onChange={(k) => { setTest(k === "test"); setRows(null); setUnits([]); }} options={[{ value: "test", label: "Test" }, { value: "live", label: "Live" }]} />
                </div>
              </div>
              {test ? (
                <Input value={testCode} onChange={(e) => setTestCode(e.target.value.trim())} placeholder="Test event code, e.g. TEST12345" aria-label="Test event code" className="sm:max-w-xs font-mono" />
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-warn"><Icon name="alert" className="h-4 w-4" /> Live: events count for ads reporting and optimisation.</p>
              )}
              <div className="flex justify-end"><Btn disabled={!/^\d{5,20}$/.test(datasetId) || !clientId} onClick={saveDestination}>Save as default</Btn></div>
            </div>
          )}
        </Panel>
      </Step>

      <Step n={2} title="Upload your sales file" hint="CSV or Excel (.xlsx). Excel files can have one sheet per month." done={sheets.length > 0}>
        <FileGuide />
        <div className={`flex flex-col items-center rounded-xl border border-dashed px-6 py-8 text-center ${ready ? "border-border2 bg-surface" : "border-border bg-surface2/50 opacity-70"}`}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (ready) void onFile(e.dataTransfer.files?.[0]); }}>
          <span className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-surface3 text-ink2"><Icon name="database" className="h-5 w-5" /></span>
          <p className="text-sm font-medium text-ink">{fileName || "Drop the file here"}</p>
          <p className="mt-1 max-w-md text-xs text-muted"><Icon name="shield" className="mr-1 inline h-3.5 w-3.5" />Phone numbers and emails are hashed in your browser. Only the hashes are sent. Only a short label (Budi S.) is stored, never full names.</p>
          <div className="mt-3 flex gap-2">
            <Btn tone="primary" disabled={!ready || busy !== null} loading={busy !== null} onClick={() => fileInput.current?.click()}>{busy ?? (sheets.length ? "Choose another file" : "Choose file")}</Btn>
            {sheets.length > 0 && <Btn tone="ghost" onClick={reset}>Clear</Btn>}
          </div>
          {!ready && <p className="mt-2 text-xs text-warn">{clientId ? "Fill in the Meta destination in step 1 (or switch to Dashboard only)." : "Choose a client in step 1 first."}</p>}
          <input ref={fileInput} type="file" accept=".csv,.txt,.tsv,.xlsx" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        {sheets.length > 1 && (
          <Panel className="mt-3 divide-y divide-border">
            <p className="px-4 py-2.5 text-xs font-medium text-ink">Sheets to include</p>
            {sheets.map((s) => (
              <label key={s.name} className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2 text-xs">
                <Checkbox checked={selected.has(s.name)} onCheckedChange={() => toggleSheet(s.name)} />
                <span className="font-medium text-ink">{s.name}</span>
                <span className="tnum text-muted">{s.body.length} rows</span>
                {!selected.has(s.name) && sheets.some((o) => o.name !== s.name && o.name.toLowerCase().startsWith(s.name.toLowerCase())) && (
                  <span className="text-xs text-warn">looks like an older copy of another sheet, left unticked</span>
                )}
              </label>
            ))}
          </Panel>
        )}
      </Step>

      {map && (
        <Step n={3} title="Match the columns" hint="Guessed from the column titles. Fix anything that is wrong." done={Boolean(mapOk)}>
          <Panel className="p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELD_ORDER.map((f) => (
                <label key={f} className="block text-xs text-muted">
                  {FIELD_LABEL[f]}{REQUIRED.includes(f) ? " *" : ""}
                  <NativeSelect
                    value={map[f] ?? ""}
                    onChange={(e) => { setMap({ ...map, [f]: e.target.value || null }); setRows(null); setUnits([]); }}
                    className="mt-1 w-full"
                  >
                    <option value="">Not in my file</option>
                    {headersAll.map((h) => <option key={h} value={h}>{h}</option>)}
                  </NativeSelect>
                  {FIELD_HINT[f] && <span className="mt-0.5 block text-xs text-muted">{FIELD_HINT[f]}</span>}
                </label>
              ))}
            </div>
            {mode === "meta" && !map.group && <Callout tone="warn" compact className="mt-3">No booking column: each person is sent to Meta as a separate purchase, and only people with a phone or email can be sent.</Callout>}
            <div className="mt-3 flex justify-end"><Btn tone="primary" disabled={!mapOk || busy !== null} loading={busy !== null} onClick={() => evaluate(selectedList, map)}>Check rows</Btn></div>
          </Panel>
        </Step>
      )}

      {rows && (
        <Step n={4} title="Review before saving" hint={`${fmtNum(rows.length)} rows read from ${selectedList.length} sheet${selectedList.length === 1 ? "" : "s"}. Nothing is saved until you confirm.`} done={counts.new === 0 && counts.saved > 0}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {chip("all", "All", rows.length)}
              {chip("new", "New", counts.new)}
              {chip("saved", "Already saved", counts.saved)}
              {chip("dup_in_file", "Duplicate in file", counts.dup_in_file)}
              {chip("invalid", "Invalid", counts.invalid)}
              {mode === "meta" && chip("meta_send", "To send to Meta", counts.meta_send)}
              {mode === "meta" && chip("meta_none", "Dashboard only", counts.meta_none)}
            </div>

            <Panel className="space-y-1.5 p-3.5 text-xs text-ink2">
              <p><b className="text-ink">Dashboard:</b> {fmtNum(counts.new)} new sales worth {fmtRp(counts.newValue)} will be saved. {counts.saved > 0 && `${fmtNum(counts.saved)} are already there and are not counted twice.`}</p>
              {mode === "meta" ? (
                <p><b className="text-ink">Meta:</b> {units.length} booking{units.length === 1 ? "" : "s"} ({fmtNum(counts.meta_send)} people, {fmtRp(sendValue)}) can be sent.
                  {counts.noContact > 0 && ` ${fmtNum(counts.noContact)} ${counts.noContact === 1 ? "person has" : "people have"} no phone or email in their booking, so ${counts.noContact === 1 ? "stays" : "stay"} dashboard-only.`}
                  {counts.tooOld > 0 && ` ${fmtNum(counts.tooOld)} ${counts.tooOld === 1 ? "is" : "are"} older than 62 days, which Meta does not accept.`}
                  {counts.sentRows > 0 && ` ${fmtNum(counts.sentRows)} were already sent.`}</p>
              ) : (
                <p><b className="text-ink">Meta:</b> nothing will be sent (Dashboard only). Switch in step 1 to send sales that have a phone or email.</p>
              )}
            </Panel>

            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="border-b border-border text-xs uppercase tracking-wider text-muted">
                  <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2">Closer</th><th className="px-3 py-2">Departure</th><th className="px-3 py-2">Source</th><th className="px-3 py-2">Dashboard</th>{mode === "meta" && <th className="px-3 py-2">Meta</th>}</tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {shown.slice(0, 200).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-muted"><span className="tnum">{r.sheet !== "CSV" ? `${r.sheet} · ` : ""}{r.line}</span></td>
                      <td className="px-3 py-2 text-ink">{r.label || "–"}</td>
                      <td className="tnum px-3 py-2 text-ink2">{r.date ? fmtDayFull(r.date) : "–"}</td>
                      <td className="tnum px-3 py-2 text-right text-ink2">{r.value != null ? fmtRp(r.value) : "–"}</td>
                      <td className="px-3 py-2 text-ink">{r.consultant || "–"}</td>
                      <td className="tnum px-3 py-2 text-ink2">{r.departure ? fmtDayFull(r.departure) : "–"}</td>
                      <td className="max-w-[10rem] truncate px-3 py-2 text-ink2" title={r.source}>{r.source || "–"}</td>
                      <td className="px-3 py-2"><Pill tone={DASH[r.status].tone}>{DASH[r.status].label}</Pill>{r.reason && r.status !== "saved" && <span className="ml-2 text-muted">{r.reason}</span>}</td>
                      {mode === "meta" && (
                        <td className="px-3 py-2">
                          {r.status === "invalid" || r.status === "dup_in_file" ? <span className="text-muted">–</span>
                            : r.meta === "send" ? <Pill tone="good" icon="check">To send</Pill>
                            : r.meta === "sent" ? <Pill tone="neutral">Sent</Pill>
                            : <span className="text-muted">{r.metaReason || "Dashboard only"}</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown.length > 200 && <p className="border-t border-border px-3 py-2 text-xs text-muted">Showing the first 200 rows of this view.</p>}
            </Panel>
          </div>
        </Step>
      )}

      {rows && (
        <Step n={5} title={mode === "meta" ? (test ? "Save, then send test events" : "Save, then send to Meta") : "Save to dashboard"} hint={toSave.length ? `${fmtNum(counts.new)} new sale${counts.new === 1 ? "" : "s"} to save${mode === "meta" ? `, ${units.length} booking${units.length === 1 ? "" : "s"} to send` : ""}.` : "Nothing new to save."}>
          {progress ? (
            <Panel className="p-4">
              <div className="h-2 overflow-hidden rounded-full bg-surface3"><div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${Math.max(4, Math.round((progress.done / Math.max(1, progress.total)) * 100))}%` }} /></div>
              <p className="tnum mt-1.5 text-xs text-muted">{progress.label}: {progress.done} of {progress.total}. Keep this tab open.</p>
            </Panel>
          ) : confirming ? (
            <Panel className="space-y-3 border-[var(--accent)]/40 p-4">
              <p className="text-sm font-medium text-ink">Save {fmtNum(counts.new)} sale{counts.new === 1 ? "" : "s"} ({fmtRp(counts.newValue)}) to the dashboard{mode === "meta" && units.length ? `, then send ${units.length} ${eventName} event${units.length === 1 ? "" : "s"} worth ${fmtRp(sendValue)} to dataset ${datasetId}` : ""}?</p>
              {mode === "meta" && <p className="text-xs text-muted">{test ? "Test mode: events appear only in Events Manager, Test events." : "Live: Meta will use them for reporting and optimisation. This cannot be undone from here."} Bookings already sent are skipped.</p>}
              <div className="flex gap-2"><Btn tone="primary" icon="check" onClick={run}>Confirm</Btn><Btn tone="ghost" onClick={() => setConfirming(false)}>Cancel</Btn></div>
            </Panel>
          ) : (
            <Btn tone="primary" disabled={toSave.length === 0 && units.length === 0 || (mode === "meta" && units.length > 0 && !tokenOk)} onClick={() => setConfirming(true)}>
              {mode === "meta" && units.length ? `Save ${counts.new} and send ${units.length} to Meta` : `Save ${counts.new} to dashboard`}
            </Btn>
          )}
          {mode === "meta" && units.length > 0 && !tokenOk && <p className="mt-2 text-xs text-warn">Add the Meta token in Settings to send.</p>}
          {lastRun && (
            <Panel className="mt-3 space-y-1 p-3.5 text-xs">
              {lastRun.map((l, i) => <p key={i} className={l.startsWith("Stopped") ? "text-crit" : "text-ink"}>{l}</p>)}
            </Panel>
          )}
        </Step>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">Saved sales</h2>
        <SavedSales clientId={clientId} refreshKey={refreshKey} notify={notify} onChanged={() => setRefreshKey((k) => k + 1)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-ink">Meta send history</h2>
        <History refreshKey={refreshKey} />
      </section>
      {node}
    </div>
  );
}
