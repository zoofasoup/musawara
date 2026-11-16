// Pure rules for the asset library and the approval flow: Drive link validation, input
// checks and the status machine. No I/O here so they are unit-tested directly.

export const ASSET_KINDS = ["image", "video", "doc", "other"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type ApprovalStatus = "pending" | "approved" | "changes_requested";
export const APPROVAL_STATUSES: readonly ApprovalStatus[] = ["pending", "approved", "changes_requested"];
export type Decision = "approved" | "changes_requested";

const DRIVE_HOSTS = new Set(["drive.google.com", "docs.google.com"]);
const MAX_URL = 2000;

/** Only an https link on drive.google.com or docs.google.com is accepted. Returns the normalised URL. */
export function validateDriveUrl(input: unknown): { ok: true; url: string } | { ok: false; error: string } {
  if (typeof input !== "string" || !input.trim()) return { ok: false, error: "Paste a Google Drive link." };
  const raw = input.trim();
  if (raw.length > MAX_URL) return { ok: false, error: "That link is too long." };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "That is not a valid link." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "The link must start with https://." };
  if (u.username || u.password || u.port) return { ok: false, error: "That link is not allowed." };
  if (!DRIVE_HOSTS.has(u.hostname.toLowerCase())) return { ok: false, error: "Only drive.google.com and docs.google.com links are allowed." };
  return { ok: true, url: u.href };
}

/** "Reel, Padel ,reel" -> ["reel","padel"]: lower case, trimmed, de-duplicated, no commas inside a tag. */
export function parseTags(input: unknown): string[] {
  const parts = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const out: string[] = [];
  for (const p of parts) {
    if (typeof p !== "string") continue;
    const t = p.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40);
    if (t && !t.includes(",") && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 20);
}

export type AssetInput = { title: string; kind: AssetKind; drive_url: string; tags: string; notes: string };

export function validateAsset(body: any): { ok: true; asset: AssetInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be JSON." };
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { ok: false, error: "Give the asset a title." };
  if (title.length > 200) return { ok: false, error: "The title is too long." };
  const kind = body.kind ?? "other";
  if (!ASSET_KINDS.includes(kind)) return { ok: false, error: "Unknown asset type." };
  const url = validateDriveUrl(body.drive_url);
  if (!url.ok) return url;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (notes.length > 2000) return { ok: false, error: "The notes are too long." };
  return { ok: true, asset: { title, kind, drive_url: url.url, tags: parseTags(body.tags).join(","), notes } };
}

export type Transition = { ok: true; to: ApprovalStatus } | { ok: false; error: string };

/** A client decides a pending request. Approved is final; changes_requested waits for a resubmit. */
export function decide(status: ApprovalStatus, decision: unknown, comment: unknown): Transition {
  if (decision !== "approved" && decision !== "changes_requested") return { ok: false, error: "Unknown decision." };
  if (status === "approved") return { ok: false, error: "This request is already approved." };
  if (status === "changes_requested") return { ok: false, error: "Changes were already requested. Wait for the team to resubmit." };
  if (typeof comment === "string" && comment.length > 2000) return { ok: false, error: "The comment is too long." };
  if (decision === "changes_requested" && !(typeof comment === "string" && comment.trim()))
    return { ok: false, error: "Say what needs to change." };
  return { ok: true, to: decision };
}

/** The team sends a request back for review. Only a request with changes requested can be resubmitted. */
export function resubmit(status: ApprovalStatus): Transition {
  if (status === "changes_requested") return { ok: true, to: "pending" };
  if (status === "pending") return { ok: false, error: "This request is already waiting for the client." };
  return { ok: false, error: "An approved request cannot be resubmitted. Create a new request." };
}

/** Distinct positive integer ids, at most `max`. */
export function parseIds(input: unknown, max = 20): number[] | null {
  if (!Array.isArray(input)) return null;
  const ids = [...new Set(input)];
  if (ids.length > max || !ids.every((n) => Number.isInteger(n) && n > 0)) return null;
  return ids as number[];
}
