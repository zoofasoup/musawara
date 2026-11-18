// Project board across all clients. Admin only. Four status panels; a task moves
// by changing its status select (no drag and drop).

import { NativeSelect } from "@/components/ui/native-select";
import { Input } from "@/components/ui/input";
import { ClientFilter } from "../components/ClientFilter";
import { PageHeader } from "../components/PageHeader";
import { useClientScope } from "../context/ClientScope";
import { useState } from "react";
import { api, useApi } from "../lib/api";
import { CardSkeleton, EmptyState, ErrorState, SectionTitle } from "../components/ui";
import { Btn, ConfirmBtn } from "../components/kit";

type Task = { id: number; client_id: number; client_name: string; title: string; status: string; assignee: string | null; due_date: string | null };

const COLUMNS = [
  { key: "todo", label: "To do" },
  { key: "doing", label: "In progress" },
  { key: "review", label: "In review" },
  { key: "done", label: "Done" },
];


function today() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export function Board() {
  const { clientId: scopeId, clients: scopeClients } = useClientScope();
  const clientFilter = scopeId ? String(scopeId) : "";
  const clients = { data: { clients: scopeClients } };
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
      <PageHeader title="Board" subtitle="Tasks across clients, in four columns." actions={<ClientFilter />} />

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <NativeSelect required value={form.client_id || clientFilter} onChange={(e) => setForm({ ...form, client_id: e.target.value })} aria-label="Client">
          <option value="">Client</option>
          {clients.data?.clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </NativeSelect>
        <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="New task" aria-label="Task title" className="w-full sm:w-auto sm:flex-[2]" />
        <Input value={form.assignee} onChange={(e) => setForm({ ...form, assignee: e.target.value })} placeholder="Assignee" aria-label="Assignee" className="w-full sm:w-auto sm:flex-1" />
        <Input className="w-auto" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} aria-label="Due date" />
        <Btn tone="secondary" type="submit">Add task</Btn>
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
                    <div key={t.id} className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)] p-3">
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
                        <NativeSelect
                          value={t.status}
                          onChange={(e) => act(() => api(`/admin/tasks/${t.id}`, { method: "PUT", body: { status: e.target.value } }))}
                          className="flex-1 text-xs"
                          aria-label={`Status of ${t.title}`}
                        >
                          {COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </NativeSelect>
                        <ConfirmBtn
                          label="Delete"
                          confirmLabel="Delete task"
                          icon="trash"
                          onConfirm={() => void act(() => api(`/admin/tasks/${t.id}`, { method: "DELETE" }))}
                        />
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
