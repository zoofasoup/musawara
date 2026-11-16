// Message templates: saved texts with {nama} / {nomor} / {Halo|Hai} placeholders and a live preview.
// The gateway server at the time of writing has no template endpoints, so this page talks to
// GET/POST /templates and PUT/DELETE /templates/:id and explains plainly when they are missing.

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { crm } from "./crmApi";
import { fmtNum } from "../../lib/format";
import { Btn, ConfirmBtn, Empty, inputCls, Panel, Sheet, useNotify, type Notify } from "../../components/kit";
import { Bubble, ErrorPanel, Field, gatewayProblem, ListSkeleton, PageHead, PLACEHOLDERS, renderTemplate, useGateway } from "./data/shared";

type Template = { id: number; name: string; body: string; updated_at?: number };

const bodyOf = (t: any): string => String(t?.body ?? t?.template ?? t?.text ?? "");
const normalize = (raw: any): Template[] =>
  (Array.isArray(raw) ? raw : Array.isArray(raw?.templates) ? raw.templates : []).map((t: any) => ({ id: t.id, name: String(t.name ?? ""), body: bodyOf(t), updated_at: t.updated_at }));

function TemplateEditor({ template, notify, onClose, onChanged }: { template: Template | null; notify: Notify; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState(template?.name ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [sampleName, setSampleName] = useState("");
  const [sampleNo, setSampleNo] = useState("");
  const [seed, setSeed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const area = useRef<HTMLTextAreaElement>(null);

  const insert = (token: string) => {
    const el = area.current;
    const at = el ? [el.selectionStart, el.selectionEnd] : [body.length, body.length];
    setBody(body.slice(0, at[0]) + token + body.slice(at[1]));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at[0] + token.length, at[0] + token.length);
    });
  };

  // seed only forces a re-render so the random spintax choices are drawn again
  const preview = (void seed, renderTemplate(body, { name: sampleName, phone: sampleNo }));

  const save = async () => {
    if (!name.trim()) return setErr("Give the template a name.");
    if (!body.trim()) return setErr("Write the message text.");
    setBusy(true);
    setErr(undefined);
    try {
      if (template) await crm(`/templates/${template.id}`, { method: "PUT", body: { name: name.trim(), body } });
      else await crm("/templates", { method: "POST", body: { name: name.trim(), body } });
      notify("Template saved.");
      onChanged();
      onClose();
    } catch (e: any) {
      setErr(gatewayProblem(e).kind === "missing" ? "This gateway cannot store templates yet." : e.message);
    }
    setBusy(false);
  };

  const remove = async () => {
    if (!template) return;
    try {
      await crm(`/templates/${template.id}`, { method: "DELETE" });
      notify("Template deleted. Broadcasts already created are not affected.");
      onChanged();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <Sheet title={template ? "Edit template" : "New template"} onClose={onClose}>
      <h3 className="text-base font-semibold text-ink">{template ? "Edit template" : "New template"}</h3>
      <div className="mt-3 space-y-3">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Promo 11.11" autoComplete="off" />
        </Field>
        <Field label="Message">
          <textarea ref={area} value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={`${inputCls} py-2`} placeholder="{Halo|Hai} {nama}, ..." />
        </Field>
        <div>
          <p className="mb-1 text-xs font-medium text-ink2">Insert placeholder</p>
          <div className="flex flex-wrap gap-2">
            {PLACEHOLDERS.map((p) => (
              <Btn key={p.token} onClick={() => insert(p.token)} className="font-mono">
                {p.token}
              </Btn>
            ))}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {PLACEHOLDERS.map((p) => (
              <li key={p.token}>
                <code className="text-ink2">{p.token}</code>
                {p.alt && <> or <code className="text-ink2">{p.alt}</code></>}: {p.desc}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-border bg-surface2 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-ink2">Preview with a sample contact</p>
            <Btn tone="ghost" icon="refresh" onClick={() => setSeed((s) => s + 1)}>
              Reshuffle
            </Btn>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input value={sampleName} onChange={(e) => setSampleName(e.target.value)} placeholder="Sample name" aria-label="Sample name" className={inputCls} />
            <input value={sampleNo} onChange={(e) => setSampleNo(e.target.value)} placeholder="Sample number" aria-label="Sample number" inputMode="tel" className={inputCls} />
          </div>
          <div className="mt-3">
            <Bubble text={preview} />
          </div>
          <p className="mt-2 text-xs text-muted">{fmtNum(body.length)} characters. An empty name shows as "Kak", as it does when sent.</p>
        </div>

        {err && (
          <p role="alert" className="text-xs text-crit">
            {err}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Btn tone="primary" loading={busy} onClick={() => void save()}>
            Save template
          </Btn>
          {template && <ConfirmBtn label="Delete" confirmLabel="Delete template" onConfirm={() => void remove()} />}
        </div>
      </div>
    </Sheet>
  );
}

export function CrmTemplates() {
  const { notify, node } = useNotify();
  const list = useGateway<unknown>("/templates");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  const items = normalize(list.data);
  const missing = list.error && gatewayProblem(list.error).kind === "missing";

  return (
    <div className="space-y-4">
      {node}
      <PageHead
        title="Templates"
        hint="Reusable message texts for broadcasts. Use placeholders to personalise each message."
        actions={
          !list.error && (
            <Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>
              New template
            </Btn>
          )
        }
      />

      {missing ? (
        <Empty icon="mail" title="Templates are not available on this gateway yet" hint="The WhatsApp gateway has no template storage. You can still write the message directly when you create a broadcast." />
      ) : list.error && !list.data ? (
        <ErrorPanel error={list.error} onRetry={list.reload} />
      ) : list.loading && !list.data ? (
        <ListSkeleton />
      ) : items.length === 0 ? (
        <Empty icon="mail" title="No templates yet" hint="Save the messages you send often, then pick one when you create a broadcast." action={<Btn tone="primary" icon="plus" onClick={() => setEditing("new")}>New template</Btn>} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((t) => (
            <Panel key={t.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="min-w-0 break-words text-sm font-semibold text-ink">{t.name}</h2>
                <button type="button" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)} className="-m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-ink2 hover:bg-secondary hover:text-ink">
                  <Pencil className="size-4" />
                </button>
              </div>
              <p className="line-clamp-5 whitespace-pre-wrap break-words text-xs text-ink2">{t.body}</p>
            </Panel>
          ))}
        </div>
      )}

      {editing && <TemplateEditor key={editing === "new" ? "new" : editing.id} template={editing === "new" ? null : editing} notify={notify} onClose={() => setEditing(null)} onChanged={list.reload} />}
    </div>
  );
}
