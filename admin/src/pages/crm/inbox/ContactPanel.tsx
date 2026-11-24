// Contact details beside the chat (like Kommo's side panel): stage, owner, deal, the number's custom fields, follow-ups and notes.
// Everything saves by itself: stage and owner at once, the rest a moment after typing stops, so there is no Save button to forget.
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "../../../components/ui";
import { useNotify, type Notify } from "../../../components/kit";
import { Field, fmtPhone, TagChip } from "../data/shared";
import { changedValues, FieldsForm } from "../pipeline/FieldsForm";
import { ContactTasks } from "../pipeline/ContactTasks";
import { Timeline } from "../pipeline/Timeline";
import { todayYmd, useFieldValues, usePipeline, type FieldDef, type Lead } from "../pipeline/api";

type Call = <T = any>(method: string, sub: string, body?: unknown) => Promise<T>;

function Body({ phone, lead, board, saved, notify, reload }: { phone: string; lead: Lead | undefined; board: NonNullable<ReturnType<typeof usePipeline>["data"]> & { call: Call }; saved: Record<string, string>; notify: Notify; reload: () => void }) {
  const { stages, owners, fields } = board;
  const [vals, setVals] = useState(saved);
  const persisted = useRef(saved);
  const latest = useRef({ vals, fields });
  latest.current = { vals, fields };
  const [value, setValue] = useState(lead?.value_idr == null ? "" : String(lead.value_idr));
  const [close, setClose] = useState(lead?.expected_close ?? "");

  async function flush() {
    const { vals: v, fields: f } = latest.current;
    const changed = changedValues(persisted.current, v, f as FieldDef[]);
    if (!Object.keys(changed).length) return;
    persisted.current = { ...v };
    try { await board.call("PUT", `/values/${phone}`, { values: changed }); reload(); } catch (e: any) { persisted.current = saved; notify(e.message, "err"); }
  }
  useEffect(() => {
    const t = setTimeout(() => void flush(), 700);
    return () => clearTimeout(t);
  }, [vals]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLead = async (patch: Record<string, unknown>) => {
    try { await board.call("PUT", `/leads/${phone}`, patch); reload(); } catch (e: any) { notify(e.message, "err"); reload(); }
  };

  return (
    <div className="space-y-4">
      <Field label="Stage">
        <NativeSelect className="w-full" value={lead ? String(lead.stage_id) : ""} onChange={(e) => e.target.value && void saveLead({ stage_id: Number(e.target.value) })}>
          {!lead && <option value="">Not on the board yet</option>}
          {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </NativeSelect>
      </Field>
      {lead && (
        <>
          <Field label="Owner">
            <NativeSelect className="w-full" value={lead.owner_user_id == null ? "" : String(lead.owner_user_id)} onChange={(e) => void saveLead({ owner_user_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Nobody yet</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Deal value (Rp)">
              <Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="28000000"
                onBlur={() => { const n = value.trim() === "" ? null : Number(value.replace(/[^\d]/g, "")); if (n === (lead.value_idr ?? null)) return; if (n !== null && !Number.isInteger(n)) return notify("The deal value must be a whole amount in Rp.", "err"); void saveLead({ value_idr: n }); }} />
            </Field>
            <Field label="Expected close">
              <Input type="date" value={close} onChange={(e) => setClose(e.target.value)} onBlur={() => { if ((close || null) !== (lead.expected_close ?? null)) void saveLead({ expected_close: close || null }); }} />
            </Field>
          </div>
        </>
      )}
      <FieldsForm fields={fields} values={vals} onChange={(id, v) => setVals((x) => ({ ...x, [id]: v }))} />
      <ContactTasks phone={phone} today={todayYmd()} notify={notify} />
      <Timeline phone={phone} notify={notify} />
    </div>
  );
}

export function ContactPanel({ phone, name, tags }: { phone: string; name: string; tags: string[] }) {
  const board = usePipeline();
  const vals = useFieldValues(board.account);
  const { notify, node } = useNotify();
  const reload = () => { board.reload(); vals.reload(); };
  const lead = board.data?.leads.find((l) => l.phone === phone);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pb-2 pt-3">
        <p className="truncate text-base font-semibold text-ink">{name}</p>
        <p className="text-sm text-ink2">{fmtPhone(phone)}</p>
        {tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{tags.map((t) => <TagChip key={t}>{t}</TagChip>)}</div>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {board.data && vals.data ? (
          <Body key={phone} phone={phone} lead={lead} board={{ ...board.data, call: board.call }} saved={vals.data.values[phone] ?? {}} notify={notify} reload={reload} />
        ) : board.error ? (
          <p className="text-sm text-muted">The pipeline could not be loaded.</p>
        ) : (
          <div className="space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /></div>
        )}
      </div>
      {node}
    </div>
  );
}
