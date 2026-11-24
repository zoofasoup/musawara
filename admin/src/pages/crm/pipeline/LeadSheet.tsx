// One card on the board: stage, deal value, expected close date, the contact's custom fields, and the history of moves.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Btn, ConfirmBtn, Sheet, type Notify } from "../../../components/kit";
import { Field, fmtPhone, TagChip } from "../data/shared";
import { fmtDateTime } from "../../../lib/format";
import { changedValues, FieldsForm } from "./FieldsForm";
import { ContactTasks } from "./ContactTasks";
import { Timeline } from "./Timeline";
import { todayYmd, type FieldDef, type Lead, type Owner, type Stage } from "./api";

type Call = <T = any>(method: string, sub: string, body?: unknown) => Promise<T>;

export function LeadSheet({ lead, name, tags, stages, owners, fields, values, call, onChanged, onClose, notify }: {
  lead: Lead; name: string; tags: string[]; stages: Stage[]; owners: Owner[]; fields: FieldDef[]; values: Record<string, string>;
  call: Call; onChanged: () => void; onClose: () => void; notify: Notify;
}) {
  const navigate = useNavigate();
  const [stageId, setStageId] = useState(String(lead.stage_id));
  const [value, setValue] = useState(lead.value_idr == null ? "" : String(lead.value_idr));
  const [close, setClose] = useState(lead.expected_close ?? "");
  const [vals, setVals] = useState(values);
  const [ownerId, setOwnerId] = useState(lead.owner_user_id == null ? "" : String(lead.owner_user_id));
  const [busy, setBusy] = useState(false);

  async function save() {
    const amount = value.trim() === "" ? null : Number(value.replace(/[^\d]/g, ""));
    if (amount !== null && !Number.isInteger(amount)) return notify("The deal value must be a whole amount in Rp.", "err");
    setBusy(true);
    try {
      await call("PUT", `/leads/${lead.phone}`, { stage_id: Number(stageId), value_idr: amount, expected_close: close || null, owner_user_id: ownerId ? Number(ownerId) : null });
      const changed = changedValues(values, vals, fields);
      if (Object.keys(changed).length) await call("PUT", `/values/${lead.phone}`, { values: changed });
      notify("Saved.");
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <p className="text-sm text-ink2">{fmtPhone(lead.phone)}</p>
          {tags.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{tags.map((t) => <TagChip key={t}>{t}</TagChip>)}</div>}
        </div>
        <Field label="Stage">
          <NativeSelect className="w-full" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Owner">
          <NativeSelect className="w-full" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Nobody yet</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Deal value (Rp)"><Input inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 28000000" /></Field>
          <Field label="Expected close"><Input type="date" value={close} onChange={(e) => setClose(e.target.value)} /></Field>
        </div>
        <FieldsForm fields={fields} values={vals} onChange={(id, v) => setVals((x) => ({ ...x, [id]: v }))} />
        <div className="flex flex-wrap gap-2">
          <Btn tone="primary" loading={busy} onClick={save}>Save</Btn>
          <Btn tone="secondary" onClick={() => navigate(`/crm/inbox?c=${lead.phone}`)}>Open chat</Btn>
          <ConfirmBtn label="Remove from pipeline" confirmLabel="Remove" onConfirm={async () => {
            try { await call("DELETE", `/leads/${lead.phone}`); notify("Removed from the pipeline."); onChanged(); } catch (e: any) { notify(e.message, "err"); }
          }} />
        </div>
        <ContactTasks phone={lead.phone} today={todayYmd()} notify={notify} />
        <Timeline phone={lead.phone} notify={notify} />
      </div>
    </Sheet>
  );
}
