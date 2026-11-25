// Above the chat box: answers found in the conversation that are not saved yet. One click stores them in the contact's fields,
// already formatted; the × hides one you do not want. Nothing is saved by itself.
import { useMemo, useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Btn } from "../../../components/kit";
import { detectAnswers, type DetectField, type DetectMsg, type Suggestion } from "./detect";

export const VALUES_SAVED = "crm:values"; // lets the details panel beside the chat show the new values at once

export function DetectedAnswers({ phone, messages, fields, values, save }: {
  phone: string; messages: DetectMsg[]; fields: DetectField[]; values: Record<string, string>; save: (values: Record<string, string>) => Promise<void>;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const found = useMemo(() => detectAnswers(messages, fields, values), [messages, fields, values]);
  const list = found.filter((s) => !hidden.has(`${s.fieldId}:${s.value}`));
  if (!list.length) return null;

  const run = async (items: Suggestion[]) => {
    setBusy(true);
    setErr(undefined);
    const out = Object.fromEntries(items.map((s) => [String(s.fieldId), s.value]));
    try {
      await save(out);
      window.dispatchEvent(new CustomEvent(VALUES_SAVED, { detail: { phone, values: out } }));
    } catch (e: any) {
      setErr(e.message);
    }
    setBusy(false);
  };

  return (
    <div className="bg-surface px-3 pt-2" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted"><Sparkles className="h-3.5 w-3.5" aria-hidden />From the chat</span>
        {list.map((s) => (
          <span key={s.fieldId} className="inline-flex items-center rounded-xl bg-surface2" title={`"${s.source}"`}>
            <Btn tone="ghost" size="sm" disabled={busy} aria-label={`Save ${s.label}: ${s.display}`} onClick={() => void run([s])}>
              <Check className="h-3.5 w-3.5" aria-hidden />{s.label}: <b>{s.display}</b>
            </Btn>
            <Btn tone="ghost" size="icon" aria-label={`Ignore ${s.label}: ${s.display}`} onClick={() => setHidden((h) => new Set(h).add(`${s.fieldId}:${s.value}`))}><X className="h-3.5 w-3.5" /></Btn>
          </span>
        ))}
        {list.length > 1 && <Btn tone="primary" size="sm" flat loading={busy} onClick={() => void run(list)}>Save all {list.length}</Btn>}
      </div>
      {err && <p role="alert" className="pt-1 text-xs text-crit">{err}</p>}
    </div>
  );
}
