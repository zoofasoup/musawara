// Project board across all clients. Admin only. Four status panels; a task moves
// by changing its status select (no drag and drop).

import { useState } from "react";
import { api, useApi } from "../lib/api";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";

type Task = { id: number; client_id: number; client_name: string; title: string; status: string; assignee: string | null; due_date: string | null };

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
];

const field = "min-h-11 min-w-0 rounded-lg border border-border2 bg-bg px-3 py-2 text-sm text-ink";
const btn = "inline-flex min-h-11 items-center rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink";

function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export function Board() {
  const [clientFilter, setClientFilter] = useState("");
  const clients = useApi<{ clients: { id: number; name: string }[] }>("/admin/clients");
  const tasks = useApi<{ tasks: Task[] }>(`/admin/tasks${clientFilter ? `?client_id=${clientFilter}` : ""}`);
  const [form, setForm] = useState({ client_id: "", title: "", assignee: "", due_date: "" });
  const [error, setError] = useState<string>();

  async function act(fn: () => Promise<unknown>) {
    setError(undefined);
    try {
      await fn();
      tasks.reload();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await act(async () => {
      await api("/admin/tasks", {
        body: {
          client_id: Number(form.client_id),
          title: form.title,
          assignee: form.assignee || null,
          due_date: form.due_date || null,
        },
      });
      setForm({ ...form, title: "", assignee: "", due_date: "" });
    });
  }

  if (tasks.error) return <ErrorState message={tasks.error} onRetry={tasks.reload} />;

  const list = tasks.data?.tasks ?? [];
  const now = today();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Board</h1>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className={field} aria-label="Filter by client">
          <option value="">All clients</option>
          {clients.data?.clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <select required value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={field} aria-label="Client">
          <option value="">Client</option>
          {clients.data?.clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="New task" aria-label="Task title" className={`${field} w-full sm:w-auto sm:flex-[2]`} />
        <input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder="Assignee" aria-label="Assignee" className={`${field} w-full sm:w-auto sm:flex-1`} />
        <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={field} aria-label="Due date" />
        <button className={btn}>Add task</button>
      </form>
      {error && <p role="alert" className="text-xs text-crit">{error}</p>}

      {tasks.loading && !tasks.data ? (
        <CardSkeleton lines={5} />
      ) : list.length === 0 ? (
        <EmptyState title={clientFilter ? "No tasks for this client" : "No tasks yet"} hint={clientFilter ? "Add one above." : "Add the first one above."} />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = list.filter((t) => t.status === col.key);
            return (
              <div key={col.key}>
                <SectionTitle right={<span className="tnum text-xs text-muted">{items.length}</span>}>{col.label}</SectionTitle>
                <div className="space-y-2">
                  {items.map((t) => (
                    <div key={t.id} className="rounded-xl border border-border bg-surface p-3">
                      <p className="text-sm font-medium text-ink">{t.title}</p>
                      <p className="mt-0.5 text-xs text-ink2">
                        {t.client_name}
                        {t.assignee ? ` · ${t.assignee}` : ""}
                      </p>
                      {t.due_date && (
                        <p className={`tnum mt-0.5 text-xs ${t.status !== "done" && t.due_date < now ? "text-crit" : "text-ink2"}`}>
                          Due {t.due_date}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          value={t.status}
                          onChange={(e) => act(() => api(`/admin/tasks/${t.id}`, { method: "PUT", body: { status: e.target.value } }))}
                          className={`${field} flex-1 text-xs`}
                          aria-label={`Status of ${t.title}`}
                        >
                          {COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                        <button
                          className="inline-flex min-h-11 items-center px-3 text-xs text-muted hover:text-crit"
                          onClick={() => {
                            if (!window.confirm(`Delete "${t.title}"?`)) return;
                            void act(() => api(`/admin/tasks/${t.id}`, { method: "DELETE" }));
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
