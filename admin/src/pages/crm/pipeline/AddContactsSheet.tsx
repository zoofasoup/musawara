// Pick contacts of this number and put them on the board in one go.
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Btn, Sheet, type Notify } from "../../../components/kit";
import { fmtPhone } from "../data/shared";
import type { Stage } from "./api";

export type ContactLite = { phone: string; name: string; tags: string[] };

export function AddContactsSheet({ contacts, onBoard, stages, call, onChanged, onClose, notify }: {
  contacts: ContactLite[]; onBoard: Set<string>; stages: Stage[]; call: <T = any>(m: string, s: string, b?: unknown) => Promise<T>;
  onChanged: () => void; onClose: () => void; notify: Notify;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [stage, setStage] = useState(String(stages[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return contacts.filter((c) => !onBoard.has(c.phone) && (!n || c.name.toLowerCase().includes(n) || c.phone.includes(n) || c.tags.some((t) => t.includes(n)))).slice(0, 300);
  }, [contacts, onBoard, q]);
  const toggle = (p: string) => setPicked((s) => { const x = new Set(s); x.has(p) ? x.delete(p) : x.add(p); return x; });

  async function add() {
    setBusy(true);
    try {
      await call("POST", "/leads/bulk", { phones: [...picked], stage_id: Number(stage) });
      notify(`${picked.size} contact(s) added.`);
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet title="Add contacts to the pipeline" onClose={onClose}>
      <div className="space-y-3">
        <Input aria-label="Search contacts" placeholder="Search name, number or tag" value={q} onChange={(e) => setQ(e.target.value)} />
        <NativeSelect aria-label="Start in stage" className="w-full" value={stage} onChange={(e) => setStage(e.target.value)}>
          {stages.map((s) => <option key={s.id} value={s.id}>Start in: {s.name}</option>)}
        </NativeSelect>
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border">
          {list.map((c) => (
            <li key={c.phone}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 hover:bg-surface2">
                <Checkbox checked={picked.has(c.phone)} onCheckedChange={() => toggle(c.phone)} />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm text-ink">{c.name || fmtPhone(c.phone)}</span><span className="block truncate text-xs text-muted">{fmtPhone(c.phone)}{c.tags.length ? ` · ${c.tags.join(", ")}` : ""}</span></span>
              </label>
            </li>
          ))}
          {list.length === 0 && <li className="p-4 text-center text-sm text-muted">No contacts to add.</li>}
        </ul>
        <Btn tone="primary" loading={busy} disabled={picked.size === 0} onClick={add}>Add {picked.size || ""} to pipeline</Btn>
      </div>
    </Sheet>
  );
}
