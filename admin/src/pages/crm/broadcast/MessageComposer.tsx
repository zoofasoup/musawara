// The one message editor used for templates and broadcasts: a textarea that leads, one slim toolbar (Insert field picker + bold,
// italic, strike), and "{" autocomplete for placeholders right where you type. No wall of buttons.
import { useMemo, useRef, useState } from "react";
import { Bold, Braces, Italic, Strikethrough } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Picker, type PickItem } from "@/components/ui/picker";
import { fmtNum } from "../../../lib/format";
import { Btn } from "../../../components/kit";
import { suggestVars, tokenAtCaret, unknownTokens, varGroup, type Variable } from "./audience";

const SPIN = "__spin";

export function MessageComposer({ value, onChange, vars, maxLength = 4000, rows = 10, placeholder, label = "Message" }: {
  value: string; onChange: (v: string) => void; vars: Variable[]; maxLength?: number; rows?: number; placeholder?: string; label?: string;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [hi, setHi] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const items = useMemo<PickItem[]>(() => [
    ...vars.map((v) => ({ value: v.token, label: `{${v.token}}`, hint: v.label === v.token ? v.hint : `${v.label}. ${v.hint}`, group: varGroup(v) })),
    { value: SPIN, label: "{Halo|Hai}", hint: "Picks one option at random for each person", group: "Variation" },
  ], [vars]);

  const focusAt = (p: number) => requestAnimationFrame(() => { area.current?.focus(); area.current?.setSelectionRange(p, p); setCaret(p); });
  const insert = (before: string, after = "") => {
    const el = area.current;
    const a = el?.selectionStart ?? value.length, b = el?.selectionEnd ?? value.length;
    onChange(value.slice(0, a) + before + value.slice(a, b) + after + value.slice(b));
    focusAt(b > a ? b + before.length + after.length : a + before.length);
  };

  const at = !dismissed ? tokenAtCaret(value, caret) : null;
  const suggestions = at ? suggestVars(vars, at.query).slice(0, 6) : [];
  const accept = (v: Variable) => {
    if (!at) return;
    const text = `{${v.token}}`;
    onChange(value.slice(0, at.start) + text + value.slice(caret));
    focusAt(at.start + text.length);
    setHi(0);
  };
  const unknown = unknownTokens(value, vars);
  const sync = (el: HTMLTextAreaElement) => { setCaret(el.selectionStart); setDismissed(false); };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Message tools">
        <Picker label="Insert field" searchPlaceholder="Search fields…" multiple={false} items={items} value={[]} onChange={() => {}} align="start"
          onPicked={(i) => insert(i.value === SPIN ? "{Halo|Hai}" : `{${i.value}}`)}>
          <Braces className="h-4 w-4" aria-hidden />Insert field
        </Picker>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Btn tone="ghost" size="icon" aria-label="Bold" onClick={() => insert("*", "*")}><Bold className="h-4 w-4" /></Btn>
        <Btn tone="ghost" size="icon" aria-label="Italic" onClick={() => insert("_", "_")}><Italic className="h-4 w-4" /></Btn>
        <Btn tone="ghost" size="icon" aria-label="Strikethrough" onClick={() => insert("~", "~")}><Strikethrough className="h-4 w-4" /></Btn>
      </div>
      <div className="relative">
        <Textarea
          ref={area}
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder ?? "{Halo|Hai} Kak {nama}, … (type { to insert a field)"}
          className="min-h-[14rem] py-2.5 text-[15px] leading-relaxed"
          onChange={(e) => { onChange(e.target.value); sync(e.target); setHi(0); }}
          onSelect={(e) => sync(e.currentTarget)}
          onClick={(e) => sync(e.currentTarget)}
          onKeyDown={(e) => {
            if (suggestions.length === 0) return;
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => (h - 1 + suggestions.length) % suggestions.length); }
            else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); accept(suggestions[Math.min(hi, suggestions.length - 1)]); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setDismissed(true); }
          }}
        />
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label="Fields" className="absolute left-2 right-2 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-2xl bg-surface p-1 shadow-[var(--shadow-panel)]">
            {suggestions.map((v, i) => (
              <li key={v.token} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); accept(v); }} onMouseEnter={() => setHi(i)}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 py-1.5 text-sm md:min-h-9 ${i === hi ? "bg-surface2" : ""}`}>
                <span className="font-medium text-ink">{`{${v.token}}`}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{v.hint}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted">
        <span>{unknown.length > 0 ? <span className="text-warn">{unknown.map((t) => `{${t}}`).join(", ")} {unknown.length === 1 ? "is" : "are"} not a known field and would be sent as typed.</span> : "Fields are filled in for each person."}</span>
        <span className="tnum">{fmtNum(value.length)} / {fmtNum(maxLength)}</span>
      </p>
    </div>
  );
}
