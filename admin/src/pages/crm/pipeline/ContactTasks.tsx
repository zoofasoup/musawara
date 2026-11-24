// The follow-ups of one contact, with a quick "add" row. Shown inside the card sheet.
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Btn, type Notify } from "../../../components/kit";
import { fmtDay } from "../../../lib/format";
import { useTasksApi, type Task } from "./api";

export function ContactTasks({ phone, today, notify }: { phone: string; today: string; notify: Notify }) {
  const { call } = useTasksApi();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const load = () => call<{ tasks: Task[] }>("GET", `?scope=open&phone=${phone}`).then((d) => setTasks(d.tasks)).catch(() => setTasks([]));
  useEffect(() => { void load(); }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e: any) { notify(e.message, "err"); } };

  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Follow-ups</h3>
      {tasks && tasks.length > 0 && (
        <ul className="mb-2 space-y-1">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2">
              <Checkbox aria-label={`Done: ${t.title}`} checked={false} onCheckedChange={() => act(() => call("PATCH", `/${t.id}`, { done: true }))} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{t.title}</span>
              {t.due_date && <span className={`shrink-0 text-xs ${t.due_date < today ? "font-semibold text-crit" : "text-muted"}`}>{t.due_date === today ? "Today" : fmtDay(t.due_date)}</span>}
            </li>
          ))}
        </ul>
      )}
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) void act(async () => { await call("POST", "", { phone, title, due_date: due || null }); setTitle(""); setDue(""); }); }}>
        <Input aria-label="Follow-up" className="min-w-0 flex-1" placeholder="e.g. Call about the visa" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        <Input aria-label="Due date" type="date" className="w-40" value={due} onChange={(e) => setDue(e.target.value)} />
        <Btn type="submit" tone="secondary" icon="plus" disabled={!title.trim()}>Add</Btn>
      </form>
    </section>
  );
}
