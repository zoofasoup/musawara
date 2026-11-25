// Filters as sentence rows that exist only when you add them ("Tag is any of iklan, leads +3"), not as a wall of toggles. Each row's
// values live in a searchable picker, so pages with dozens of tags stay compact. Rows are joined by "and".
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Picker, type PickItem } from "@/components/ui/picker";
import { Btn } from "../../../components/kit";
import { NONE, type FieldRule, type Rules } from "./audience";
import type { AudienceData } from "./useAudienceData";

type Kind = "tag" | "stage" | "owner" | "chat" | `field:${number}`;
const KIND_LABEL = { tag: "Tag", stage: "Pipeline stage", owner: "Owner", chat: "Last conversation" } as const;

const summary = (labels: string[]) => (labels.length === 0 ? "Select…" : labels.length <= 2 ? labels.join(", ") : `${labels.slice(0, 2).join(", ")} +${labels.length - 2}`);
const nameOf = (items: PickItem[], v: string) => items.find((i) => i.value === v)?.label ?? v;

function startingRows(r: Rules): Kind[] {
  const rows: Kind[] = [];
  if (r.tags.length) rows.push("tag");
  if (r.stages.length) rows.push("stage");
  if (r.owners.length) rows.push("owner");
  for (const f of r.fields) rows.push(`field:${f.fieldId}`);
  if (r.chat !== "any") rows.push("chat");
  return rows;
}

export function FilterBuilder({ data, rules, setRules }: { data: AudienceData; rules: Rules; setRules: (r: Rules) => void }) {
  const [rows, setRows] = useState<Kind[]>(() => startingRows(rules));
  const set = (patch: Partial<Rules>) => setRules({ ...rules, ...patch });

  const tagItems: PickItem[] = data.tags.map((t) => ({ value: t.tag, label: t.tag, count: t.count }));
  const stageItems: PickItem[] = [...data.stages.map((s) => ({ value: String(s.id), label: s.name })), { value: NONE, label: "Not on the board" }];
  const ownerItems: PickItem[] = [...data.owners.map((o) => ({ value: String(o.id), label: o.name })), { value: NONE, label: "Nobody" }];
  const toId = (v: string) => (v === NONE ? NONE : Number(v));

  type Option = { kind: Kind; label: string; group?: string; disabled?: boolean };
  const available: Option[] = ([
    { kind: "tag", label: KIND_LABEL.tag, disabled: tagItems.length === 0 },
    { kind: "stage", label: KIND_LABEL.stage, disabled: !data.pipelineReady },
    { kind: "owner", label: KIND_LABEL.owner, disabled: !data.pipelineReady },
    { kind: "chat", label: KIND_LABEL.chat },
    ...data.fields.map((f): Option => ({ kind: `field:${f.id}`, label: f.label, group: "Custom fields" })),
  ] as Option[]).filter((o) => !rows.includes(o.kind));

  const remove = (kind: Kind) => {
    setRows(rows.filter((k) => k !== kind));
    if (kind === "tag") set({ tags: [] });
    else if (kind === "stage") set({ stages: [] });
    else if (kind === "owner") set({ owners: [] });
    else if (kind === "chat") set({ chat: "any" });
    else set({ fields: rules.fields.filter((f) => f.fieldId !== Number(kind.slice(6))) });
  };
  const setField = (fieldId: number, mode: FieldRule["mode"], values: string[]) => {
    const rest = rules.fields.filter((f) => f.fieldId !== fieldId);
    // An "is any of" row with nothing picked yet stays out of the rules, so it does not turn the count to zero while you choose.
    set({ fields: mode === "in" && values.length === 0 ? rest : [...rest, { fieldId, mode, values }] });
  };

  return (
    <div className="space-y-2">
      {rows.map((kind, i) => {
        const wrap = "flex flex-wrap items-center gap-2 rounded-2xl bg-surface2/60 p-2.5";
        const head = (label: string, joiner = "is any of") => (
          <>
            {i > 0 && <span className="w-full text-xs font-medium uppercase tracking-wide text-muted sm:w-auto">and</span>}
            <span className="min-w-16 text-sm font-medium text-ink">{label}</span>
            {joiner && <span className="text-sm text-muted">{joiner}</span>}
          </>
        );
        const x = <Btn tone="ghost" size="icon" aria-label={`Remove the ${kind.startsWith("field") ? "field" : KIND_LABEL[kind as keyof typeof KIND_LABEL]} filter`} className="ml-auto" onClick={() => remove(kind)}><X className="h-4 w-4" /></Btn>;

        if (kind === "tag") return (
          <div key={kind} className={wrap}>{head("Tag")}
            <Picker label="Tags" items={tagItems} value={rules.tags} onChange={(v) => set({ tags: v })} searchPlaceholder="Search tags…">{summary(rules.tags)}</Picker>{x}</div>
        );
        if (kind === "stage") return (
          <div key={kind} className={wrap}>{head("Pipeline stage", "is")}
            <Picker label="Stages" items={stageItems} value={rules.stages.map(String)} onChange={(v) => set({ stages: v.map(toId) })} searchPlaceholder="Search stages…">{summary(rules.stages.map((s) => nameOf(stageItems, String(s))))}</Picker>{x}</div>
        );
        if (kind === "owner") return (
          <div key={kind} className={wrap}>{head("Owner", "is")}
            <Picker label="Owners" items={ownerItems} value={rules.owners.map(String)} onChange={(v) => set({ owners: v.map(toId) })} searchPlaceholder="Search people…">{summary(rules.owners.map((o) => nameOf(ownerItems, String(o))))}</Picker>{x}</div>
        );
        if (kind === "chat") return (
          <div key={kind} className={wrap}>{head("Last conversation", "")}
            <NativeSelect aria-label="Last conversation" value={rules.chat === "within" ? String(rules.chatDays) : "never"} onChange={(e) => set(e.target.value === "never" ? { chat: "never" } : { chat: "within", chatDays: Number(e.target.value) })}>
              <option value="never">Never chatted</option>
              {[7, 14, 30, 90, 180].map((d) => <option key={d} value={d}>Chatted in the last {d} days</option>)}
            </NativeSelect>{x}</div>
        );
        const id = Number(kind.slice(6));
        const f = data.fields.find((d) => d.id === id);
        if (!f) return null;
        const rule = rules.fields.find((r) => r.fieldId === id);
        const mode = rule?.mode ?? (f.type === "select" ? "in" : "filled");
        const optItems: PickItem[] = f.options.map((o) => ({ value: o, label: o }));
        return (
          <div key={kind} className={wrap}>{head(f.label, "")}
            <NativeSelect aria-label={`${f.label} condition`} value={mode} onChange={(e) => setField(id, e.target.value as FieldRule["mode"], [])}>
              {f.type === "select" && <option value="in">is any of</option>}
              <option value="filled">has a value</option>
              <option value="empty">is empty</option>
            </NativeSelect>
            {mode === "in" && <Picker label={f.label} items={optItems} value={rule?.values ?? []} onChange={(v) => setField(id, "in", v)} searchPlaceholder="Search…">{summary(rule?.values ?? [])}</Picker>}
            {x}</div>
        );
      })}
      <DropdownMenu>
        <DropdownMenuTrigger className="press inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 text-sm text-ink2 hover:bg-surface2 hover:text-ink md:min-h-9" disabled={available.length === 0}>
          <Plus className="h-4 w-4" aria-hidden />Add filter
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-56 overflow-y-auto">
          {available.map((o, i) => (
            <div key={o.kind}>
              {o.group && available[i - 1]?.group !== o.group && <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted">{o.group}</p>}
              <DropdownMenuItem disabled={o.disabled} onClick={() => setRows([...rows, o.kind])}>{o.label}</DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
