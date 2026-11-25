// Message templates (also called quick replies: type "/" in a chat to use one). Built to stay manageable with dozens of them:
// search across name, text and category, category chips with counts, sorting, a compact list, duplicate, and bulk move / delete.
// The editor inserts placeholders from the number's own custom fields and previews the message as it looks in WhatsApp.

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo, useState } from "react";
import { Copy, Pencil, Search } from "lucide-react";
import { crm } from "./crmApi";
import { fmtNum } from "../../lib/format";
import { Btn, ConfirmBtn, Empty, Panel, Pill, Sheet, useNotify, type Notify } from "../../components/kit";
import { Segmented } from "../../components/Segmented";
import { NativeSelect } from "@/components/ui/native-select";
import { ErrorPanel, Field, gatewayProblem, ListSkeleton, PageHead, useGateway } from "./data/shared";
import { usePipeline } from "./pipeline/api";
import { renderMessage, variablesFor } from "./broadcast/audience";
import { MessageComposer } from "./broadcast/MessageComposer";
import { WaPreview } from "./broadcast/WaPreview";

type Template = { id: number; name: string; body: string; category: string; use_count: number; updated_at?: number };
type Sort = "name" | "recent" | "used";
const NONE = "\u0000none";

const normalize = (raw: any): Template[] =>
  (Array.isArray(raw) ? raw : Array.isArray(raw?.templates) ? raw.templates : []).map((t: any) => ({
    id: t.id, name: String(t.name ?? ""), body: String(t.body ?? t.template ?? t.text ?? ""), category: String(t.category ?? ""), use_count: Number(t.use_count ?? 0), updated_at: t.updated_at,
  }));

function TemplateEditor({ template, categories, notify, onClose, onChanged }: { template: Template | null; categories: string[]; notify: Notify; onClose: () => void; onChanged: () => void }) {
  const board = usePipeline();
  const vars = useMemo(() => variablesFor(board.data?.fields ?? []), [board.data]);
  const [name, setName] = useState(template?.name ?? "");
  const [category, setCategory] = useState(template?.category ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [sampleName, setSampleName] = useState("Budi");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [view, setView] = useState<"write" | "preview">("write");

  const shown = renderMessage(body, { name: sampleName, phone: "6281234567890", vars: Object.fromEntries(vars.filter((v) => v.fieldId !== undefined).map((v) => [v.token, `[${v.label}]`])) }, () => 0);

  const save = async () => {
    if (!name.trim()) return setErr("Give the template a name.");
    if (!body.trim()) return setErr("Write the message text.");
    setBusy(true);
    setErr(undefined);
    try {
      const payload = { name: name.trim(), body, category: category.trim() };
      if (template) await crm(`/templates/${template.id}`, { method: "PUT", body: payload });
      else await crm("/templates", { method: "POST", body: payload });
      notify("Template saved.");
      onChanged();
      onClose();
    } catch (e: any) {
      setErr(gatewayProblem(e).kind === "missing" ? "This gateway cannot store templates yet." : e.message);
    }
    setBusy(false);
  };

  return (
    <Sheet title={template ? "Edit template" : "New template"} onClose={onClose}>
      <div className="space-y-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Info DP dan cicilan" autoComplete="off" maxLength={80} /></Field>
          <Field label="Category">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} list="template-categories" placeholder="Follow-up" autoComplete="off" maxLength={40} />
            <datalist id="template-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>
        <Segmented label="Editor view" value={view} onChange={setView} fill options={[{ value: "write", label: "Write" }, { value: "preview", label: "Preview" }]} />
        {view === "write" ? (
          <MessageComposer value={body} onChange={setBody} vars={vars} rows={12} placeholder="{Halo|Hai} Kak {nama}, …" />
        ) : (
          <div className="space-y-2 rounded-2xl bg-surface2/60 p-3">
            <div className="flex items-center gap-2">
              <p className="flex-1 text-xs font-medium text-ink2">Preview in WhatsApp</p>
              <Input aria-label="Sample name" className="w-32" value={sampleName} onChange={(e) => setSampleName(e.target.value)} placeholder="Sample name" />
            </div>
            <WaPreview text={shown} title={sampleName || "Kak"} subtitle="+62 812-3456-7890" />
            <p className="text-xs text-muted">Custom fields show as [Field name] here; real values fill in when sent.</p>
          </div>
        )}
        {err && <p role="alert" className="text-xs text-crit">{err}</p>}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 bg-background px-4 py-3 shadow-[0_-8px_24px_-16px_rgba(20,24,36,0.18)]">
        <Btn tone="primary" loading={busy} onClick={() => void save()}>Save template</Btn>
        {template && <ConfirmBtn label="Delete" confirmLabel="Delete template" onConfirm={async () => { try { await crm(`/templates/${template.id}`, { method: "DELETE" }); notify("Template deleted. Broadcasts already created are not affected."); onChanged(); onClose(); } catch (e: any) { setErr(e.message); } }} />}
      </div>
    </Sheet>
  );
}

export function CrmTemplates() {
  const { notify, node } = useNotify();
  const list = useGateway<unknown>("/templates");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");               // "" = all, NONE = no category
  const [sort, setSort] = useState<Sort>("name");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [moveTo, setMoveTo] = useState("");
  const items = useMemo(() => normalize(list.data), [list.data]);
  const missing = list.error && gatewayProblem(list.error).kind === "missing";

  const categories = useMemo(() => [...new Set(items.map((t) => t.category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [items]);
  const uncategorized = items.filter((t) => !t.category).length;
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const rows = items.filter((t) => (cat === "" || (cat === NONE ? !t.category : t.category === cat)) && (!n || `${t.name} ${t.body} ${t.category}`.toLowerCase().includes(n)));
    return rows.sort((a, b) => sort === "name" && cat === "" && categories.length > 0 ? (a.category ? 0 : 1) - (b.category ? 0 : 1) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name) : sort === "used" ? b.use_count - a.use_count || a.name.localeCompare(b.name) : sort === "recent" ? (b.updated_at ?? 0) - (a.updated_at ?? 0) : a.name.localeCompare(b.name));
  }, [items, q, cat, sort, categories.length]);

  // With A–Z and no category picked, rows sit under their category heading; any other sort or filter shows a flat list with the category as a pill.
  const grouped = sort === "name" && cat === "" && categories.length > 0;
  const allShown = shown.length > 0 && shown.every((t) => picked.has(t.id));
  const toggle = (id: number) => setPicked((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; });
  const bulk = async (body: Record<string, unknown>, done: string) => {
    try { await crm("/templates/bulk", { method: "POST", body: { ids: [...picked], ...body } }); notify(done); setPicked(new Set()); setMoveTo(""); list.reload(); } catch (e: any) { notify(e.message, "err"); }
  };
  const duplicate = async (t: Template) => {
    const taken = new Set(items.map((x) => x.name.toLowerCase()));
    let name = `${t.name} (copy)`;
    for (let i = 2; taken.has(name.toLowerCase()); i++) name = `${t.name} (copy ${i})`;
    try { await crm("/templates", { method: "POST", body: { name: name.slice(0, 80), body: t.body, category: t.category } }); notify("Duplicated."); list.reload(); } catch (e: any) { notify(e.message, "err"); }
  };

  return (
    <div className="space-y-4">
      {node}
      <PageHead title="Templates" hint="Saved messages for broadcasts and quick replies. Type / in a chat to use one." actions={!list.error && <Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>New template</Btn>} />

      {missing ? (
        <Empty icon="mail" title="Templates are not available on this gateway yet" hint="The WhatsApp gateway has no template storage. You can still write the message directly when you create a broadcast." />
      ) : list.error && !list.data ? (
        <ErrorPanel error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <Empty icon="mail" title="No templates yet" hint="Save the messages you send often, then pick one with / in a chat or when you create a broadcast." action={<Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>New template</Btn>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input aria-label="Search templates" className="pl-9" placeholder={`Search ${fmtNum(items.length)} templates by name, text or category`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {categories.length > 0 && (
              <NativeSelect aria-label="Category" value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">All categories ({fmtNum(items.length)})</option>
                {categories.map((c) => <option key={c} value={c}>{c} ({fmtNum(items.filter((t) => t.category === c).length)})</option>)}
                {uncategorized > 0 && <option value={NONE}>No category ({fmtNum(uncategorized)})</option>}
              </NativeSelect>
            )}
            <NativeSelect aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="name">Sort: A–Z</option>
              <option value="recent">Sort: Recently edited</option>
              <option value="used">Sort: Most used</option>
            </NativeSelect>
          </div>

          {picked.size > 0 && (
            <Panel className="sticky top-0 z-10 flex flex-wrap items-center gap-2 p-3">
              <span className="text-sm font-medium text-ink">{fmtNum(picked.size)} selected</span>
              <Input aria-label="Move to category" list="template-categories-bulk" className="w-44" placeholder="Move to category…" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} maxLength={40} />
              <datalist id="template-categories-bulk">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              <Btn tone="secondary" size="sm" onClick={() => void bulk({ action: "category", category: moveTo.trim() }, moveTo.trim() ? `Moved to ${moveTo.trim()}.` : "Category removed.")}>{moveTo.trim() ? "Move" : "Remove category"}</Btn>
              <ConfirmBtn label="Delete" confirmLabel={`Delete ${fmtNum(picked.size)} templates`} onConfirm={() => void bulk({ action: "delete" }, "Deleted. Broadcasts already created are not affected.")} />
              <Btn tone="ghost" size="sm" onClick={() => setPicked(new Set())}>Clear</Btn>
            </Panel>
          )}

          {shown.length === 0 ? (
            <Empty icon="mail" title="No template matches" hint={q ? `Nothing for "${q}" in this category.` : "This category is empty."} action={<Btn onClick={() => { setQ(""); setCat(""); }}>Clear search and filter</Btn>} />
          ) : (
            <Panel className="divide-y divide-border overflow-hidden">
              <div className="flex items-center gap-3 px-3 py-2 text-xs text-muted">
                <Checkbox checked={allShown} onCheckedChange={(on) => setPicked(on ? new Set(shown.map((t) => t.id)) : new Set())} aria-label="Select all shown" />
                <span>{fmtNum(shown.length)} {shown.length === 1 ? "template" : "templates"}</span>
              </div>
              {shown.map((t, i) => (
                <div key={t.id}>
                  {grouped && (i === 0 || shown[i - 1].category !== t.category) && (
                    <p className="bg-surface2/60 px-3 py-1.5 text-xs font-medium text-ink2">{t.category || "No category"}</p>
                  )}
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Checkbox checked={picked.has(t.id)} onCheckedChange={() => toggle(t.id)} aria-label={`Select ${t.name}`} />
                    <button type="button" onClick={() => setEditing(t)} className="min-h-11 min-w-0 flex-1 text-left" aria-label={`Edit ${t.name}`}>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{t.name}</span>
                        {!grouped && t.category && <Pill tone="neutral">{t.category}</Pill>}
                        {t.use_count > 0 && <span className="text-xs text-muted">used {fmtNum(t.use_count)}×</span>}
                      </span>
                      <span className="block truncate text-xs text-ink2">{t.body.replace(/\s+/g, " ")}</span>
                    </button>
                    <Btn tone="ghost" size="icon" aria-label={`Duplicate ${t.name}`} onClick={() => void duplicate(t)}><Copy className="h-4 w-4" /></Btn>
                    <Btn tone="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></Btn>
                  </div>
                </div>
              ))}
            </Panel>
          )}
        </>
      )}

      {editing && <TemplateEditor key={editing === "new" ? "new" : editing.id} template={editing === "new" ? null : editing} categories={categories} notify={notify} onClose={() => setEditing(null)} onChanged={list.reload} />}
    </div>
  );
}
