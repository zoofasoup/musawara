// Bring daily ad cost in from a marketplace report: pick the file, check what was read, then save. The file stays in the browser.
import { useRef, useState } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { api } from "../lib/api";
import { parseAdReport, type AdDay } from "../lib/adReport";
import { fmtDayFull, fmtRp } from "../lib/format";
import { Callout } from "./Callout";
import { Btn, Nested } from "./kit";

const SOURCES = [["tiktok", "TikTok"], ["shopee", "Shopee"], ["tokopedia", "Tokopedia"], ["other", "Other"]] as const;

export function AdReportImport({ clients, onSaved }: { clients: Array<{ id: number; name: string }>; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState("tiktok");
  const [client, setClient] = useState("");
  const [read, setRead] = useState<{ name: string; days: AdDay[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "warn" | "crit"; text: string } | null>(null);

  async function pick(file: File) {
    setMessage(null);
    setRead(null);
    try {
      const { default: readXlsxFile } = await import("read-excel-file/universal");
      const sheets = await readXlsxFile(file);
      const days = parseAdReport((sheets[0]?.data ?? []) as unknown[][]);
      if (!days.length) throw new Error("No dated rows in this file.");
      setRead({ name: file.name, days });
    } catch (e: any) {
      setMessage({ tone: "crit", text: e?.message ?? "This file cannot be read." });
    }
  }

  async function save() {
    if (!read) return;
    setBusy(true);
    try {
      const r = await api<{ days: number; total: number; manual_days: number }>("/admin/spend/import", { body: { source, client_id: client, rows: read.days } });
      setMessage(r.manual_days
        ? { tone: "warn", text: `Saved ${fmtRp(r.total)}. ${r.manual_days} of these days also have an entry typed by hand: delete it below if it is the same cost.` }
        : { tone: "good", text: `Saved ${fmtRp(r.total)} over ${r.days} days.` });
      setRead(null);
      onSaved();
    } catch (e: any) {
      setMessage({ tone: "crit", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const total = read?.days.reduce((s, d) => s + d.amount, 0) ?? 0;
  return (
    <Nested title="Import an ad report">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <NativeSelect value={source} onChange={(e) => setSource(e.target.value)} aria-label="Report source">
            {SOURCES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </NativeSelect>
          <NativeSelect value={client} onChange={(e) => setClient(e.target.value)} aria-label="Report client">
            <option value="">Company-wide</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
          <input ref={input} type="file" accept=".xlsx" className="hidden" aria-label="Ad report file" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = ""; }} />
          <Btn tone="secondary" onClick={() => input.current?.click()}>Choose .xlsx file</Btn>
        </div>
        {read && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-ink2">
            <span className="min-w-0 break-words">
              For <b className="text-ink">{clients.find((c) => String(c.id) === client)?.name ?? "Company-wide"}</b>, {read.name}: <b className="tnum text-ink">{fmtRp(total)}</b>, {read.days.length} days, {fmtDayFull(read.days[0].date)} to {fmtDayFull(read.days[read.days.length - 1].date)}
            </span>
            <Btn tone="primary" loading={busy} onClick={() => void save()}>Save</Btn>
          </div>
        )}
        {message && <Callout tone={message.tone} compact>{message.text}</Callout>}
        <p className="text-xs text-muted">Importing the same dates again replaces the earlier import. Pick the client the report belongs to.</p>
      </div>
    </Nested>
  );
}
