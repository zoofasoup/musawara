// Follow-ups of the picked number: overdue, today, upcoming, and what is done. Check one off, or add one for any contact.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Btn, Empty, Panel, useNotify } from "../../components/kit";
import { fmtDay } from "../../lib/format";
import { ErrorPanel, fmtPhone, ListSkeleton, PageHead, useGateway } from "./data/shared";
import { useTasks, useTasksApi, type Task } from "./pipeline/api";

export function CrmTasks() {
  const { notify, node } = useNotify();
  const { call, account } = useTasksApi();
  const [mine, setMine] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const open = useTasks("open", mine);
  const done = useTasks("done", mine);
  const gw = useGateway<Array<{ phone: string; name: string }>>("/contacts");
  const names = useMemo(() => new Map((gw.data ?? []).map((c) => [c.phone, c.name])), [gw.data]);
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [assignee, setAssignee] = useState("");
  const reload = () => { open.reload(); done.reload(); };
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); reload(); } catch (e: any) { notify(e.message, "err"); } };

  if (!account) return <Empty icon="users" title="Pick a WhatsApp number" hint="Follow-ups belong to one number. Choose it in the switcher above." />;
  if (open.loading && !open.data) return <ListSkeleton rows={4} />;
  if (open.error || !open.data) return <ErrorPanel error={open.error} onRetry={open.reload} />;
  const { today, owners, tasks } = open.data;
  const groups: Array<[string, Task[]]> = [
    ["Overdue", tasks.filter((t) => t.due_date && t.due_date < today)],
    ["Today", tasks.filter((t) => t.due_date === today)],
    ["Upcoming", tasks.filter((t) => t.due_date && t.due_date > today)],
    ["No date", tasks.filter((t) => !t.due_date)],
  ];
  const row = (t: Task, finished = false) => (
    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
      <Checkbox aria-label={finished ? `Reopen: ${t.title}` : `Done: ${t.title}`} checked={finished} onCheckedChange={() => act(() => call("PATCH", `/${t.id}`, { done: !finished }))} />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${finished ? "text-muted line-through" : "text-ink"}`}>{t.title}</p>
        <Link to={`/crm/inbox?c=${t.phone}`} className="block truncate text-xs text-muted hover:text-ink hover:underline">{names.get(t.phone) || fmtPhone(t.phone)}{t.assignee_name ? ` · ${t.assignee_name}` : ""}</Link>
      </div>
      {t.due_date && <span className={`shrink-0 text-xs ${!finished && t.due_date < today ? "font-semibold text-crit" : "text-muted"}`}>{t.due_date === today ? "Today" : fmtDay(t.due_date)}</span>}
    </li>
  );

  return (
    <div className="space-y-3">
      {node}
      <PageHead title="Follow-ups" hint="What to do next, and for whom." actions={<Btn tone={mine ? "primary" : "secondary"} aria-pressed={mine} onClick={() => setMine(!mine)}>{mine ? "Mine" : "Everyone"}</Btn>} />
      <Panel className="p-3">
        <form className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); if (phone && title.trim()) void act(async () => { await call("POST", "", { phone, title, due_date: due || null, ...(assignee ? { assignee_user_id: Number(assignee) } : {}) }); setTitle(""); setDue(""); }); }}>
          <NativeSelect aria-label="Contact" value={phone} onChange={(e) => setPhone(e.target.value)}>
            <option value="">Contact…</option>
            {(gw.data ?? []).slice(0, 2000).map((c) => <option key={c.phone} value={c.phone}>{c.name || fmtPhone(c.phone)}</option>)}
          </NativeSelect>
          <Input aria-label="What to do" placeholder="e.g. Send the quote" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <NativeSelect aria-label="Assign to" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Me</option>
            {owners.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </NativeSelect>
          <Btn type="submit" tone="primary" icon="plus" disabled={!phone || !title.trim()}>Add</Btn>
        </form>
      </Panel>
      {tasks.length === 0 && <Empty icon="checkCircle" title="Nothing to follow up" hint="Add a follow-up above, or from a contact's card on the pipeline." />}
      {groups.filter(([, list]) => list.length).map(([label, list]) => (
        <section key={label}>
          <h2 className={`mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide ${label === "Overdue" ? "text-crit" : "text-muted"}`}>{label} · {list.length}</h2>
          <Panel className="divide-y divide-border">{list.map((t) => row(t))}</Panel>
        </section>
      ))}
      <Btn tone="ghost" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide done" : "Show done"}</Btn>
      {showDone && done.data && <Panel className="divide-y divide-border">{done.data.tasks.length ? done.data.tasks.map((t) => row(t, true)) : <p className="p-4 text-sm text-muted">Nothing done yet.</p>}</Panel>}
    </div>
  );
}
