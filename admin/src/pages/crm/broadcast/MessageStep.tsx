// Step 2: the message. The editor leads; a template picker and the attachment sit above it; the pace is one line you can change.
// The WhatsApp preview stays beside the editor on wide screens and opens on demand on a phone.
import { useMemo, useRef, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Picker, type PickItem } from "@/components/ui/picker";
import { Btn, Panel } from "../../../components/kit";
import { fmtNum } from "../../../lib/format";
import { crm } from "../crmApi";
import { Field, fmtDuration, fmtPhone } from "../data/shared";
import { renderMessage, type Contact } from "./audience";
import type { AudienceData } from "./useAudienceData";
import { MessageComposer } from "./MessageComposer";
import { WaPreview } from "./WaPreview";
import { templateFile } from "./templateFile";

export type Template = { id: number; name: string; body: string; category: string; use_count: number; media_name: string | null; media_mime: string | null };

export function MessageStep({ data, templates, template, setTemplate, file, setFile, delayMin, delayMax, setDelayMin, setDelayMax, sample, count }: {
  data: AudienceData; templates: Template[]; template: string; setTemplate: (v: string) => void; file: File | null; setFile: (f: File | null) => void;
  delayMin: string; delayMax: string; setDelayMin: (v: string) => void; setDelayMax: (v: string) => void; sample: Contact | undefined; count: number;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string>();
  const [editPace, setEditPace] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const items = useMemo<PickItem[]>(() => templates.map((t) => ({ value: String(t.id), label: t.name, hint: t.body.replace(/\s+/g, " "), group: t.category || "No category" })).sort((a, b) => (a.group === "No category" ? 1 : 0) - (b.group === "No category" ? 1 : 0) || a.group!.localeCompare(b.group!)), [templates]);
  const min = Math.round(Number(delayMin) || 0), max = Math.round(Number(delayMax) || 0);
  const eta = count && min >= 3 && max >= min ? fmtDuration((count * (min + max)) / 2) : "";
  const shownText = renderMessage(template, { name: sample?.name, phone: sample?.phone, vars: sample ? data.valuesOfPerson(sample.phone) : {} });
  const preview = (
    <Panel className="space-y-2 p-3">
      <p className="text-xs font-medium text-muted">Preview{sample ? ` with ${sample.name || "the first recipient"}` : ""}</p>
      <WaPreview text={shownText} file={file} title={sample?.name || "Kak"} subtitle={sample ? fmtPhone(sample.phone) : "The first recipient"} />
    </Panel>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {templates.length > 0 && (
            <Picker label="Use a template" items={items} value={[]} multiple={false} onChange={() => {}} searchPlaceholder={`Search ${templates.length} templates…`} emptyText="No template matches"
              onPicked={(i) => { const t = templates.find((x) => String(x.id) === i.value); if (!t) return; if (template.trim() && template !== t.body) setUndo(template); setTemplate(t.body); setFileError(undefined); if (t.media_name) templateFile(t).then(setFile).catch((e) => setFileError(e.message)); void crm(`/templates/${t.id}/used`, { method: "POST" }).catch(() => {}); }}>
              <FileText className="h-4 w-4" aria-hidden />Use a template
            </Picker>
          )}
          <Btn tone="secondary" size="sm" onClick={() => picker.current?.click()}><Paperclip className="h-4 w-4" aria-hidden />{file ? "Change file" : "Attach file"}</Btn>
          <input ref={picker} type="file" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          {file && <span className="flex min-w-0 items-center gap-2 text-xs text-ink2"><span className="truncate">{file.name}</span><span className="shrink-0 text-muted">{(file.size / 1048576).toFixed(1)} MB</span><Btn tone="ghost" size="sm" onClick={() => setFile(null)}>Remove</Btn></span>}
          <Btn tone="ghost" size="sm" className="ml-auto lg:hidden" onClick={() => setShowPreview(!showPreview)}>{showPreview ? "Hide preview" : "Preview"}</Btn>
        </div>
        {undo !== null && <p className="text-xs text-ink2">Template applied. <Btn tone="ghost" size="sm" onClick={() => { setTemplate(undo); setUndo(null); }}>Undo, bring back my text</Btn></p>}
        {fileError && <p role="alert" className="text-xs text-crit">{fileError}</p>}
        {file && <p className="text-xs text-muted">With an attachment, the message becomes its caption (max 64 MB).</p>}

        <MessageComposer value={template} onChange={setTemplate} vars={data.vars} rows={11} />
        {showPreview && <div className="lg:hidden">{preview}</div>}

        <div className="text-sm text-ink2">
          {editPace ? (
            <div className="space-y-2">
              <div className="grid max-w-xs grid-cols-2 gap-3">
                <Field label="Shortest (s)"><Input type="number" min={3} value={delayMin} onChange={(e) => setDelayMin(e.target.value)} inputMode="numeric" /></Field>
                <Field label="Longest (s)"><Input type="number" min={3} value={delayMax} onChange={(e) => setDelayMax(e.target.value)} inputMode="numeric" /></Field>
              </div>
              <p className="text-xs text-muted">At least 3 seconds. A random pause in this range looks more natural and lowers the risk of the number being blocked.</p>
              <Btn tone="ghost" size="sm" onClick={() => setEditPace(false)}>Done</Btn>
            </div>
          ) : (
            <p>Sent with a pause of <b className="tnum text-ink">{min}–{max} s</b> between messages{eta ? <>, about <b className="text-ink">{eta}</b> for {fmtNum(count)} people</> : ""}. <Btn tone="ghost" size="sm" onClick={() => setEditPace(true)}>Change</Btn></p>
          )}
        </div>
      </div>
      <aside className="hidden lg:sticky lg:top-2 lg:block lg:self-start">{preview}</aside>
    </div>
  );
}
