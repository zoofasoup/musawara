// Agency operations: onboarding template and task input validation.

export const ONBOARDING_TEMPLATE = [
  "Signed brief received",
  "Brand knowledge filled in",
  "Logo and brand assets collected",
  "Meta ad account access granted",
  "Instagram and Facebook page access granted",
  "WhatsApp number confirmed",
  "Kickoff call scheduled",
  "First project tasks created",
];

export const TASK_STATUSES = ["todo", "doing", "review", "done"] as const;

export type TaskInput = { client_id: number; title: string; status: string; assignee: string | null; due_date: string | null };

/** Validates a task body. `partial` allows omitted fields (PUT); POST requires client_id and title. */
export function parseTaskInput(body: any, partial: boolean): { error: string } | { value: Partial<TaskInput> } {
  const b = body ?? {};
  const out: Partial<TaskInput> = {};
  if (!partial || b.client_id !== undefined) {
    if (!Number.isInteger(b.client_id)) return { error: "client_id is required" };
    out.client_id = b.client_id;
  }
  if (!partial || b.title !== undefined) {
    if (typeof b.title !== "string" || !b.title.trim() || b.title.length > 200) return { error: "Title is required (max 200 characters)" };
    out.title = b.title.trim();
  }
  if (b.status !== undefined) {
    if (!(TASK_STATUSES as readonly string[]).includes(b.status)) return { error: "Unknown status" };
    out.status = b.status;
  }
  if (b.assignee !== undefined) {
    if (b.assignee !== null && (typeof b.assignee !== "string" || b.assignee.length > 60)) return { error: "Assignee must be under 60 characters" };
    out.assignee = b.assignee ? b.assignee.trim() : null;
  }
  if (b.due_date !== undefined) {
    if (b.due_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(b.due_date)) return { error: "Due date must be YYYY-MM-DD" };
    out.due_date = b.due_date;
  }
  return { value: out };
}
