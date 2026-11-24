// Step 2: the message. Search a saved template, insert placeholders ({nama}, {nomor}, the number's custom fields…) with one click,
// format with WhatsApp's own marks, attach a file, set the pace. The preview on the right is the real thing as it will look.
import { useMemo, useRef, useState } from "react";
import { Bold, Italic, Search, Strikethrough } from "lucide-react";
import { Callout } from "../../../components/Callout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Btn, Panel } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";
import { crm } from "../crmApi";
import { Field, fmtDuration, fmtPhone } from "../data/shared";
import { renderMessage, unknownTokens, type Contact } from "./audience";
import type { AudienceData } from "./useAudienceData";
import { WaPreview } from "./WaPreview";
import { Chip } from "./Chip";

export type Template = { id: number; name: string; body: string; category: string; use_count: number };

export function MessageStep({ data, templates, template, setTemplate, file, setFile, delayMin, delayMax, setDelayMin, setDelayMax, sample, count }: {
  data: AudienceData; templates: Template[]; template: string; setTemplate: (v: string) => void; file: File | null; setFile: (f: File | null) => void;
  delayMin: string; delayMax: string; setDelayMin: (v: string) => void; setDelayMax: (v: string) => void; sample: Contact | undefined; count: number;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState("");
  const [undo, setUndo] = useState<string | null>(null);
  const shown = useMemo(() => { const n = q.trim().toLowerCase(); return templates.filter((t) => !n || `${t.name} ${t.category} ${t.body}`.toLowerCase().includes(n)); }, [templates, q]);

  /** Put text at the cursor (or around the selection) and keep the cursor after it. */
  const insert = (before: string, after = "") => {
    const el = area.current;
    const a = el?.selectionStart ?? template.length, b = el?.selectionEnd ?? template.length;
    const next = template.slice(0, a) + before + template.slice(a, b) + after + template.slice(b);
    setTemplate(next);
    requestAnimationFrame(() => { el?.focus(); const p = a + before.length + (b - a) + (b > a ? after.length : 0); el?.setSelectionRange(b > a ? p : a + before.length, b > a ? p : a + before.length); });
  };

  const unknown = unknownTokens(template, data.vars);
  const min = Math.round(Number(delayMin) || 0), max = Math.round(Number(delayMax) || 0);
  const eta = count ? fmtDuration((count * (min + max)) / 2) : "";
  const shownText = renderMessage(template, { name: sample?.name, phone: sample?.phone, vars: sample ? data.valuesOfPerson(sample.phone) : {} });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {templates.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-ink2">Start from a saved template</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search templates" className="pl-9" placeholder={`Search ${templates.length} templates`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <ul className="max-h-48 space-y-1.5 overflow-y-auto">
              {shown.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => { if (template.trim() && template !== t.body) setUndo(template); setTemplate(t.body); void crm(`/templates/${t.id}/used`, { method: "POST" }).catch(() => {}); }} className="press block w-full min-h-11 rounded-xl bg-surface px-3 py-2 text-left shadow-[var(--shadow-soft)] hover:bg-surface2">
                    <span className="flex items-center gap-2"><span className="truncate text-sm font-medium text-ink">{t.name}</span>{t.category && <span className="shrink-0 rounded-lg bg-surface3 px-1.5 py-0.5 text-[11px] text-ink2">{t.category}</span>}</span>
                    <span className="block truncate text-xs text-muted">{t.body.replace(/\s+/g, " ")}</span>
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="px-1 py-2 text-xs text-muted">No template matches "{q}".</li>}
            </ul>
            {undo !== null && <p className="text-xs text-ink2">Template applied. <Btn tone="ghost" size="sm" onClick={() => { setTemplate(undo); setUndo(null); }}>Undo, bring back my text</Btn></p>}
          </div>
        )}

        <Field label="Message">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Insert into the message">
              {data.vars.map((v) => <Chip key={v.token} on={false} onClick={() => insert(`{${v.token}}`)}>{`{${v.token}}`}</Chip>)}
              <Chip on={false} onClick={() => insert("{Halo|Hai}")}>{"{Halo|Hai}"}</Chip>
              <span className="mx-1 h-6 w-px bg-border" aria-hidden />
              <Btn tone="secondary" size="sm" aria-label="Bold" onClick={() => insert("*", "*")}><Bold className="h-4 w-4" /></Btn>
              <Btn tone="secondary" size="sm" aria-label="Italic" onClick={() => insert("_", "_")}><Italic className="h-4 w-4" /></Btn>
              <Btn tone="secondary" size="sm" aria-label="Strikethrough" onClick={() => insert("~", "~")}><Strikethrough className="h-4 w-4" /></Btn>
            </div>
            <Textarea ref={area} value={template} onChange={(e) => setTemplate(e.target.value)} rows={9} className="py-2" placeholder="{Halo|Hai} {nama}, ada promo 11.11 diskon 50% hari ini saja." />
            <p className="text-xs text-muted">Click a placeholder to put it where the cursor is. It is replaced per person when sent: {data.vars.slice(0, 4).map((v) => `{${v.token}} = ${v.hint.toLowerCase()}`).join("; ")}. {"{Halo|Hai}"} picks one option at random for each person.</p>
          </div>
        </Field>
        {unknown.length > 0 && (
          <Callout tone="warn" compact>{unknown.map((t) => `{${t}}`).join(", ")} {unknown.length === 1 ? "is" : "are"} not a known placeholder and would be sent exactly as typed. Check the spelling, or pick one from the buttons above.</Callout>
        )}

        <Field label="Attachment (optional)" hint={file ? `${file.name}, ${(file.size / 1048576).toFixed(1)} MB. With an attachment, the message becomes its caption. Max 64 MB.` : "Image, video or document, up to 64 MB. The message becomes its caption."}>
          <div className="flex flex-wrap items-center gap-2">
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block min-h-11 min-w-0 flex-1 text-xs text-ink2 file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-border file:bg-surface file:px-3 file:text-xs" />
            {file && <Btn tone="ghost" onClick={() => setFile(null)}>Remove</Btn>}
          </div>
        </Field>

        <div>
          <p className="mb-1 text-xs font-medium text-ink2">Pause between messages (seconds)</p>
          <div className="grid max-w-xs grid-cols-2 gap-3">
            <Field label="Shortest"><Input type="number" min={3} value={delayMin} onChange={(e) => setDelayMin(e.target.value)} inputMode="numeric" /></Field>
            <Field label="Longest"><Input type="number" min={3} value={delayMax} onChange={(e) => setDelayMax(e.target.value)} inputMode="numeric" /></Field>
          </div>
          <p className="mt-2 text-xs text-muted">At least 3 seconds. A random pause in this range looks more natural and lowers the risk of the number being blocked.{eta && ` About ${fmtNum(count)} messages will take ${eta}.`}</p>
        </div>
      </div>

      <aside className="lg:sticky lg:top-2 lg:self-start">
        <Panel className="space-y-2 p-3">
          <p className="text-xs font-medium text-muted">Preview</p>
          <WaPreview text={shownText} file={file} title={sample?.name || "Kak"} subtitle={sample ? fmtPhone(sample.phone) : "The first recipient"} />
          <p className="text-xs text-muted">Shown with {sample ? `${sample.name || "the first recipient"}'s` : "sample"} details.</p>
        </Panel>
      </aside>
    </div>
  );
}
