// The pipeline board: one card per contact on the number picked in the switcher, columns are the stages. Drag a card to move it.
import { useMemo, useState } from "react";
import { Search, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Kanban } from "../../../components/Kanban";
import { Btn, Empty, Pill, useNotify } from "../../../components/kit";
import { fmtRp } from "../../../lib/format";
import { ErrorPanel, fmtPhone, ListSkeleton, PageHead, TagChip, useDebounced, useGateway } from "../data/shared";
import { AddContactsSheet, type ContactLite } from "./AddContactsSheet";
import { CustomizeSheet } from "./CustomizeSheet";
import { LeadSheet } from "./LeadSheet";
import { STAGE_BAR, useFieldValues, usePipeline, type Lead } from "./api";

const todayYmd = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const daysIn = (sql: string) => Math.max(0, Math.floor((Date.now() - Date.parse(sql.replace(" ", "T") + "Z")) / 86_400_000));
const compactRp = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(/\.0$/, "")} M` : n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")} jt` : fmtRp(n));

export function CrmPipeline() {
  const { notify, node } = useNotify();
  const board = usePipeline();
  const vals = useFieldValues(board.account);
  const gw = useGateway<Array<{ phone: string; name: string; tags: string[] }>>("/contacts");
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim().toLowerCase());
  const [openPhone, setOpenPhone] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [customizing, setCustomizing] = useState(false);

  const contacts: ContactLite[] = useMemo(() => (gw.data ?? []).map((c) => ({ phone: c.phone, name: c.name ?? "", tags: c.tags ?? [] })), [gw.data]);
  const byPhone = useMemo(() => new Map(contacts.map((c) => [c.phone, c])), [contacts]);
  const data = board.data;
  const reload = () => { board.reload(); vals.reload(); };

  const leads = useMemo(() => (data?.leads ?? []).filter((l) => {
    if (!dq) return true;
    const c = byPhone.get(l.phone);
    return l.phone.includes(dq) || (c?.name ?? "").toLowerCase().includes(dq) || (c?.tags ?? []).some((t) => t.includes(dq));
  }), [data, dq, byPhone]);

  const stageById = useMemo(() => new Map((data?.stages ?? []).map((s) => [s.id, s])), [data]);
  const openValue = (data?.leads ?? []).reduce((n, l) => n + (stageById.get(l.stage_id)?.kind === "open" ? l.value_idr ?? 0 : 0), 0);
  const wonValue = (data?.leads ?? []).reduce((n, l) => n + (stageById.get(l.stage_id)?.kind === "won" ? l.value_idr ?? 0 : 0), 0);

  if (!board.account) return <Empty icon="users" title="Pick a WhatsApp number" hint="The pipeline belongs to one number. Choose it in the switcher above." />;
  if (board.loading && !data) return <ListSkeleton rows={4} />;
  if (board.error || !data) return <ErrorPanel error={board.error} onRetry={board.reload} />;

  const picked = openPhone ? data.leads.find((l) => l.phone === openPhone) : null;
  const colSum = (id: number) => (data.leads.filter((l) => l.stage_id === id).reduce((n, l) => n + (l.value_idr ?? 0), 0));

  return (
    <div className="space-y-3">
      {node}
      <PageHead
        title="Pipeline"
        hint={`${data.leads.length} card(s) · open ${fmtRp(openValue)} · won ${fmtRp(wonValue)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input aria-label="Search the board" placeholder="Search" className="w-44 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <Btn tone="secondary" icon="plus" onClick={() => setAdding(true)}>Add contacts</Btn>
            <Btn tone="ghost" onClick={() => setCustomizing(true)}><Settings2 className="h-4 w-4" />Customize</Btn>
          </div>
        }
      />
      {data.leads.length === 0 && <Empty icon="users" title="No cards yet" hint="Add contacts to start tracking them from first message to deal." action={<Btn tone="primary" icon="plus" onClick={() => setAdding(true)}>Add contacts</Btn>} />}
      {data.leads.length > 0 && (
        <Kanban<Lead>
          columns={data.stages.map((s) => ({ id: String(s.id), label: colSum(s.id) ? `${s.name} · ${compactRp(colSum(s.id))}` : s.name, color: STAGE_BAR[s.color], empty: "Drop a card here" }))}
          items={leads}
          getId={(l) => l.phone}
          getColumn={(l) => String(l.stage_id)}
          onMove={async (l, to) => { await board.call("PUT", `/leads/${l.phone}`, { stage_id: Number(to) }); reload(); }}
          renderCard={(l) => {
            const c = byPhone.get(l.phone);
            const late = l.expected_close && l.expected_close < todayYmd() && stageById.get(l.stage_id)?.kind === "open";
            return (
              <button type="button" onClick={() => setOpenPhone(l.phone)} className="block w-full rounded-2xl bg-surface p-3 text-left shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-panel)]">
                <span className="block truncate text-sm font-medium text-ink">{c?.name || fmtPhone(l.phone)}</span>
                {c?.name && <span className="block truncate text-xs text-muted">{fmtPhone(l.phone)}</span>}
                {l.value_idr != null && <span className="mt-1.5 block text-sm font-semibold text-ink">{fmtRp(l.value_idr)}</span>}
                <span className="mt-1.5 flex flex-wrap items-center gap-1">
                  {(c?.tags ?? []).slice(0, 2).map((t) => <TagChip key={t}>{t}</TagChip>)}
                  <span className="text-[11px] text-muted">{daysIn(l.stage_changed_at)} d in stage</span>
                  {late && <Pill tone="crit" size="sm" dot={false}>Overdue</Pill>}
                </span>
              </button>
            );
          }}
        />
      )}
      {adding && <AddContactsSheet contacts={contacts} onBoard={new Set(data.leads.map((l) => l.phone))} stages={data.stages} call={board.call} notify={notify} onClose={() => setAdding(false)} onChanged={() => { setAdding(false); reload(); }} />}
      {customizing && <CustomizeSheet stages={data.stages} leads={data.leads} fields={data.fields} call={board.call} notify={notify} onClose={() => setCustomizing(false)} onChanged={reload} />}
      {picked && (
        <LeadSheet key={picked.phone} lead={picked} name={byPhone.get(picked.phone)?.name || fmtPhone(picked.phone)} tags={byPhone.get(picked.phone)?.tags ?? []}
          stages={data.stages} fields={data.fields} values={vals.data?.values[picked.phone] ?? {}} call={board.call} notify={notify}
          onClose={() => setOpenPhone(null)} onChanged={() => { setOpenPhone(null); reload(); }} />
      )}
    </div>
  );
}
