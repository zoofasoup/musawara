// Performance label for an organic post: compared with the median of the same
// account's recent posts of the same format, so small and large accounts and
// reels versus photos are never judged against each other.

export type LabelPost = {
  media_id: string;
  ig_user_id: string;
  format: string;
  posted_at: string;
  reach: number | null;
  shares: number | null;
  saves: number | null;
};
export type PostLabel = "top" | "good" | "average" | "weak" | "new";

const MATURE_MS = 48 * 3_600_000;
const BASELINE_SIZE = 10;
const MIN_BASELINE = 5;
const WEIGHTS = { reach: 0.5, shares: 0.25, saves: 0.25 } as const;
type Metric = keyof typeof WEIGHTS;

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function toLabel(score: number): PostLabel {
  return score >= 1.5 ? "top" : score >= 1.1 ? "good" : score >= 0.8 ? "average" : "weak";
}

export function labelPosts(posts: LabelPost[], now = Date.now()): Map<string, PostLabel | null> {
  const out = new Map<string, PostLabel | null>();
  const age = (p: LabelPost) => now - new Date(p.posted_at).getTime();
  const mature = posts
    .filter((p) => age(p) >= MATURE_MS && p.reach != null)
    .sort((a, b) => new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime());

  for (const p of posts) {
    if (age(p) < MATURE_MS) {
      out.set(p.media_id, "new");
      continue;
    }
    if (p.reach == null) {
      out.set(p.media_id, null);
      continue;
    }
    const base = mature
      .filter((b) => b.ig_user_id === p.ig_user_id && b.format === p.format && b.media_id !== p.media_id)
      .slice(0, BASELINE_SIZE);
    if (base.length < MIN_BASELINE) {
      out.set(p.media_id, null);
      continue;
    }
    let sum = 0;
    let weight = 0;
    for (const m of Object.keys(WEIGHTS) as Metric[]) {
      const med = median(base.map((b) => b[m] ?? 0));
      if (med > 0) {
        sum += WEIGHTS[m] * ((p[m] ?? 0) / med);
        weight += WEIGHTS[m];
      }
    }
    out.set(p.media_id, weight ? toLabel(sum / weight) : null);
  }
  return out;
}
