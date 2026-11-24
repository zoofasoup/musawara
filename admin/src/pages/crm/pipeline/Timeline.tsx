// What happened to one contact (notes, stage moves, tasks) with a box to add a note.
import { useEffect, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Btn, ConfirmBtn, type Notify } from "../../../components/kit";
import { fmtDateTime } from "../../../lib/format";
import { useAuth } from "../../../context/AuthContext";
import { useTasksApi, type TimelineItem } from "./api";

export function Timeline({ phone, notify }: { phone: string; notify: Notify }) {
  const { call } = useTasksApi();
  const { user } = useAuth();
  const [items, setItems] = useState<TimelineItem[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => call<{ items: TimelineItem[] }>("GET", `/timeline/${phone}`).then((d) => setItems(d.items)).catch(() => setItems([]));
  useEffect(() => { void load(); }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    setBusy(true);
    try { await call("POST", "/notes", { phone, body: text }); setText(""); await load(); } catch (e: any) { notify(e.message, "err"); }
    setBusy(false);
  }

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Notes and activity</h3>
      <div className="space-y-2">
        <Textarea aria-label="New note" rows={2} maxLength={2000} placeholder="Write a note about this contact" value={text} onChange={(e) => setText(e.target.value)} className="py-2" />
        <Btn tone="secondary" size="sm" loading={busy} disabled={!text.trim()} onClick={add}>Add note</Btn>
      </div>
      {items === null ? <p className="mt-3 text-sm text-muted">Loading…</p> : items.length === 0 ? <p className="mt-3 text-sm text-muted">Nothing yet.</p> : (
        <ul className="mt-3 space-y-2.5">
          {items.map((i, n) => (
            <li key={`${i.kind}-${i.id ?? n}`} className={`text-sm ${i.kind === "note" ? "rounded-2xl bg-surface2 p-2.5 text-ink" : "text-ink2"}`}>
              <span className="whitespace-pre-wrap break-words">{i.text}</span>
              <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                {fmtDateTime(i.at)}{i.user_name ? ` · ${i.user_name}` : ""}
                {i.kind === "note" && (i.user_id === user?.id || user?.staff_role === "owner") && (
                  <ConfirmBtn label="Remove" confirmLabel="Remove note" onConfirm={async () => { try { await call("DELETE", `/notes/${i.id}`); await load(); } catch (e: any) { notify(e.message, "err"); } }} />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
