// Which actions a post's status allows, and how a schedule time is accepted. Publishing
// transitions (publishing, published, failed, needs_check) arrive with the cron in stage 3.

export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "needs_check";
export type Action = "edit" | "delete";

const ALLOWED: Record<Action, readonly PostStatus[]> = {
  edit: ["draft", "scheduled", "failed"],
  delete: ["draft", "scheduled", "failed"],
};

export const can = (status: PostStatus, action: Action) => ALLOWED[action].includes(status);

const MIN_LEAD_MS = 60_000;
const MAX_AHEAD_MS = 75 * 86_400_000;
const WITH_ZONE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseScheduledAt(input: unknown, nowMs: number): { ok: true; sql: string } | { ok: false; error: string } {
  if (typeof input !== "string" || !WITH_ZONE.test(input)) return { ok: false, error: "Pick a date and time." };
  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return { ok: false, error: "Pick a date and time." };
  const ts = Math.floor(parsed / 60_000) * 60_000;
  if (ts < nowMs + MIN_LEAD_MS) return { ok: false, error: "Pick a time at least a minute from now." };
  if (ts > nowMs + MAX_AHEAD_MS) return { ok: false, error: "Posts can be scheduled up to 75 days ahead." };
  return { ok: true, sql: new Date(ts).toISOString().slice(0, 19).replace("T", " ") };
}
