// SMM planning rules: kanban stages, which moves are allowed, how a Publish post moves a card,
// and Asia/Jakarta day bucketing for the calendar. Pure functions, no I/O.

export const STAGES = ["idea", "drafting", "in_review", "scheduled", "published"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  idea: "Idea",
  drafting: "Drafting",
  in_review: "In review",
  scheduled: "Scheduled",
  published: "Published",
};

/** Stages a person may drag/click a card into. Scheduled and Published belong to Publish posts. */
export const MANUAL_STAGES: readonly Stage[] = ["idea", "drafting", "in_review"];
const POST_DRIVEN_STATUSES = ["scheduled", "publishing", "published"];

export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);
const rank = (s: Stage) => STAGES.indexOf(s);

/**
 * Manual move. Never reaches Scheduled/Published (a person moving a card must not look like
 * scheduling or publishing). A card whose linked post is scheduled/publishing/published is locked
 * to what Publish says.
 */
export function checkMove(from: Stage, to: Stage, linkedPostStatus: string | null): { ok: true } | { ok: false; error: string } {
  if (from === to) return { ok: false, error: "The card is already in this column." };
  if (!MANUAL_STAGES.includes(to))
    return { ok: false, error: "Cards move to Scheduled and Published by themselves when the linked Publish post is scheduled or published." };
  if (linkedPostStatus && POST_DRIVEN_STATUSES.includes(linkedPostStatus))
    return { ok: false, error: "This card follows its Publish post. Change the post in Publish instead." };
  return { ok: true };
}

/** The stage a Publish post status implies, or null when the post says nothing about the card. */
export function stageFromPost(status: string | null): Stage | null {
  if (status === "scheduled" || status === "publishing") return "scheduled";
  if (status === "published") return "published";
  return null; // draft, failed, needs_check: never pull a card backwards or forwards
}

/** Next stage after a post update. Forward only: the card never moves back because of a post. */
export function syncStage(current: Stage, postStatus: string | null): Stage {
  const implied = stageFromPost(postStatus);
  return implied && rank(implied) > rank(current) ? implied : current;
}

/** The same rule as syncStage, as SQL (run before reads and after linking). Only ever raises a stage. */
export const SYNC_SQL = [
  `UPDATE content_plans SET stage='published', updated_at=datetime('now')
    WHERE stage != 'published' AND post_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM posts p WHERE p.id=content_plans.post_id AND p.status='published')`,
  `UPDATE content_plans SET stage='scheduled', updated_at=datetime('now')
    WHERE stage IN ('idea','drafting','in_review') AND post_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM posts p WHERE p.id=content_plans.post_id AND p.status IN ('scheduled','publishing'))`,
];

// ------------------------------------------------------------------ Asia/Jakarta days
const JAKARTA_OFFSET_MS = 7 * 3_600_000; // no DST in Indonesia

/** UTC SQL text ("2026-11-12 17:30:00") to its Asia/Jakarta calendar day ("2026-11-13"). */
export function jakartaDay(utcSql: string): string {
  const ms = Date.parse(utcSql.replace(" ", "T") + "Z");
  return new Date(ms + JAKARTA_OFFSET_MS).toISOString().slice(0, 10);
}

/** UTC SQL text of the instant a Jakarta day starts. */
export function jakartaDayStartUtc(ymd: string): string {
  return new Date(Date.parse(ymd + "T00:00:00Z") - JAKARTA_OFFSET_MS).toISOString().slice(0, 19).replace("T", " ");
}

export const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + "T00:00:00Z"));

/** Groups items by Jakarta day, ordered by time within each day. */
export function bucketByDay<T extends { scheduled_at: string }>(items: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const it of [...items].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))) {
    const d = jakartaDay(it.scheduled_at);
    out.set(d, [...(out.get(d) ?? []), it]);
  }
  return out;
}

export const addDaysYmd = (ymd: string, n: number) => new Date(Date.parse(ymd + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
/** Monday of the week containing ymd (weeks start Monday in Indonesia). */
export function weekStart(ymd: string): string {
  const dow = (new Date(ymd + "T00:00:00Z").getUTCDay() + 6) % 7;
  return addDaysYmd(ymd, -dow);
}
/** Month grid: whole Monday-first weeks covering the month of ymd. */
export function monthGrid(ymd: string): string[][] {
  const first = ymd.slice(0, 8) + "01";
  const next = new Date(Date.UTC(+first.slice(0, 4), +first.slice(5, 7), 1)).toISOString().slice(0, 10);
  const last = addDaysYmd(next, -1);
  const weeks: string[][] = [];
  for (let d = weekStart(first); d <= last; d = addDaysYmd(d, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysYmd(d, i)));
  return weeks;
}

/** Colour/label for a post status, shared by calendar and cards. */
export const POST_STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" | "crit" | "accent" }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "accent" },
  publishing: { label: "Publishing", tone: "warn" },
  published: { label: "Published", tone: "good" },
  failed: { label: "Failed", tone: "crit" },
  needs_check: { label: "Needs check", tone: "crit" },
};
