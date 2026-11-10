# Publish, stages 1 and 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per client, an admin can connect Instagram and Facebook channels, upload media, and compose, save and schedule posts that appear in a queue. Nothing is sent to Meta yet.

**Architecture:** New D1 tables plus a private R2 bucket. Pure rule and state modules (`publishRules.ts`, `postState.ts`) are the single source of truth, used by the Worker routes and imported by the React composer for live validation. Routes live in `worker/routes/publish.ts` (per client, behind the existing `clientAccess` middleware) and `worker/routes/publishSetup.ts` (admin only: token permissions and channel connection).

**Tech Stack:** Cloudflare Worker + Hono, D1, R2, React 19 + react-router, Tailwind tokens from `src/components/kit.tsx`, `node --test` for unit tests.

Spec: `docs/superpowers/specs/2026-11-10-publish-design.md`. This plan covers spec stages 1 and 2. Stages 3 to 6 (publish cron, reel/story publishing, calendar, analytics) get their own plans once stage 1 has proven the Meta permissions.

Deferred from the spec's section 2, on purpose: IG/FB-style previews, "next slot" (needs the `publish_slots` table, which moves to the calendar plan as migration 0015), and client-user (non-admin) access. In this plan every Publish page and write route is admin only.

## Global Constraints

- All paths are relative to the repo root `musawara-ui/`. Admin code lives under `admin/`. Run `npm` commands from `admin/`, `wrangler` commands from the repo root.
- Admin UI strings are English. Time zone for people is Asia/Jakarta (WIB, UTC+7). Dates in D1 are UTC text `YYYY-MM-DD HH:MM:SS` (same as `datetime('now')`), displayed with `fmtDateTime` from `src/lib/format.ts`.
- UI rules (from the project's design language): mobile-first, stacked sections without boxes, tap targets at least 44px (`min-h-11`), use only existing tokens (`text-ink`, `text-muted`, `text-crit`, `bg-surface`, etc.), hide empty data, no placeholder content.
- Every write route requires an admin session. Tenant isolation comes from the existing `clientAccess` middleware: always use `c.get("access").clientId`, never an id from the body.
- Never commit `wrangler.local.jsonc` or `.dev.vars`. Never deploy or push from this plan; that is a separate step the user approves.
- Commit message trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

---

## File Structure

Create:
- `admin/migrations/0014_publish.sql` — tables `channels`, `posts`, `post_targets`, `post_media`.
- `admin/worker/lib/publishRules.ts` (+ `.test.ts`) — what IG/FB accept; upload checks.
- `admin/worker/lib/postState.ts` (+ `.test.ts`) — allowed actions per status, schedule time parsing.
- `admin/worker/lib/metaPermissions.ts` (+ `.test.ts`) — required publish permissions and the check.
- `admin/worker/routes/publishSetup.ts` — admin: permissions, channel discovery and connect.
- `admin/worker/routes/publish.ts` — per client: channels, posts, media.
- `admin/src/lib/publishApi.ts` — shared client types, status tones, media URL helper, upload.
- `admin/src/components/PublishChannels.tsx` — permissions strip and channel connect sheet.
- `admin/src/pages/Publish.tsx` — queue.
- `admin/src/pages/PublishComposer.tsx` — composer.

Modify:
- `wrangler.jsonc`, `wrangler.local.jsonc` (local only) — R2 binding `MEDIA`.
- `admin/worker/types.ts` — `MEDIA: R2Bucket`.
- `admin/worker/routes/admin.ts` — mount `publishSetup` at `/publish`.
- `admin/worker/routes/clients.ts` — mount `publish` at `/:clientId/publish`.
- `admin/src/App.tsx` — three routes.
- `admin/src/pages/ClientDashboard.tsx` — "Publish" link next to Brand knowledge / Onboarding.

---

### Task 1: Schema and R2 binding

**Files:**
- Create: `admin/migrations/0014_publish.sql`
- Modify: `wrangler.jsonc`, `wrangler.local.jsonc`, `admin/worker/types.ts`

**Interfaces:**
- Produces: D1 tables `channels(id, client_id, platform, external_id, page_id, name, status, created_at)`, `posts(id, client_id, status, kind, caption, scheduled_at, created_by, created_at, updated_at, attempts, last_error)`, `post_targets(id, post_id, channel_id, status, external_post_id, container_id, last_error, published_at)`, `post_media(id, post_id, position, r2_key, type, bytes, width, height, duration_sec)`; `Env.MEDIA: R2Bucket`.

- [ ] **Step 1: Write the migration**

`admin/migrations/0014_publish.sql`:

```sql
-- Publish: connected channels, posts, per-channel targets and media. Dates are UTC text.
CREATE TABLE IF NOT EXISTS channels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('instagram','facebook')),
  external_id TEXT NOT NULL,            -- IG user id, or Facebook Page id
  page_id     TEXT,                     -- the Page that owns the IG account (token lookup)
  name        TEXT,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (client_id, platform, external_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','scheduled','publishing','published','failed','needs_check')),
  kind         TEXT NOT NULL CHECK (kind IN ('feed','carousel','reel','story')),
  caption      TEXT NOT NULL DEFAULT '',
  scheduled_at TEXT,                    -- UTC; NULL for drafts
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_client ON posts (client_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_posts_due ON posts (status, scheduled_at);

CREATE TABLE IF NOT EXISTS post_targets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id          INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  channel_id       INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','scheduled','publishing','published','failed','needs_check')),
  external_post_id TEXT,
  container_id     TEXT,
  last_error       TEXT,
  published_at     TEXT,
  UNIQUE (post_id, channel_id)
);

CREATE TABLE IF NOT EXISTS post_media (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id      INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  r2_key       TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('image','video')),
  bytes        INTEGER NOT NULL DEFAULT 0,
  width        INTEGER,
  height       INTEGER,
  duration_sec REAL,
  UNIQUE (post_id, position)
);
```

- [ ] **Step 2: Add the R2 binding**

In `wrangler.jsonc`, after the `d1_databases` block add:

```jsonc
  // Publish: uploaded post media. Private; served only through /api/clients/:id/publish/media.
  // The bucket must exist before `wrangler deploy`: npx wrangler r2 bucket create musawara-media
  "r2_buckets": [{ "binding": "MEDIA", "bucket_name": "musawara-media" }],
```

Make the same addition in `wrangler.local.jsonc` (untracked, local dev only; Miniflare creates the bucket locally).

In `admin/worker/types.ts`, inside `Env` after `ASSETS: Fetcher;` add:

```ts
  /** Post media for Publish (private R2 bucket). */
  MEDIA: R2Bucket;
```

Also check `admin/wrangler.jsonc` for a `d1_databases` block: `grep -n d1_databases admin/wrangler.jsonc`. If it has one, add the same `r2_buckets` entry there; if the grep prints nothing, leave the file alone.

- [ ] **Step 3: Apply the migration to the local database and check it**

Run (repo root):

```bash
npx wrangler d1 migrations apply musawara-ads --local -c wrangler.local.jsonc --persist-to .wrangler/state-real
npx wrangler d1 execute musawara-ads --local -c wrangler.local.jsonc --persist-to .wrangler/state-real --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('channels','posts','post_targets','post_media') ORDER BY name"
```

Expected: the second command lists exactly `channels`, `post_media`, `post_targets`, `posts`.

- [ ] **Step 4: Type check and commit**

```bash
cd admin && npm run check
```

Expected: no errors.

```bash
git add admin/migrations/0014_publish.sql wrangler.jsonc admin/worker/types.ts
git commit -m "feat(publish): schema and R2 binding" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

(Add `admin/wrangler.jsonc` to `git add` only if Step 2 changed it. `wrangler.local.jsonc` is never added.)

---

### Task 2: Platform rules

**Files:**
- Create: `admin/worker/lib/publishRules.ts`
- Test: `admin/worker/lib/publishRules.test.ts`

**Interfaces:**
- Produces:
  - `type Platform = "instagram" | "facebook"`, `type Kind = "feed" | "carousel" | "reel" | "story"`
  - `type MediaIn = { type: "image" | "video"; bytes?: number; width?: number | null; height?: number | null; durationSec?: number | null }`
  - `type PostIn = { kind: Kind; caption: string; media: MediaIn[]; platforms: Platform[] }`
  - `const KINDS: readonly Kind[]`, `const PLATFORMS: readonly Platform[]`
  - `const MAX_CAROUSEL = 10`, `const IG_CAPTION_MAX = 2200`
  - `checkUpload(contentType: string, bytes: number): { ok: true; type: "image" | "video"; ext: string } | { ok: false; error: string }`
  - `validatePost(p: PostIn): string[]` (empty array = valid)

- [ ] **Step 1: Write the failing tests**

`admin/worker/lib/publishRules.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { checkUpload, validatePost, type PostIn } from "./publishRules.ts";

const img = (over = {}) => ({ type: "image" as const, bytes: 1_000_000, width: 1080, height: 1350, ...over });
const vid = (over = {}) => ({ type: "video" as const, bytes: 10_000_000, width: 1080, height: 1920, durationSec: 20, ...over });
const post = (over: Partial<PostIn> = {}): PostIn => ({ kind: "feed", caption: "Halo", media: [img()], platforms: ["instagram"], ...over });

test("upload: only JPEG images and MP4/MOV videos, with size limits", () => {
  assert.deepEqual(checkUpload("image/jpeg", 1000), { ok: true, type: "image", ext: "jpg" });
  assert.deepEqual(checkUpload("video/mp4", 1000), { ok: true, type: "video", ext: "mp4" });
  assert.deepEqual(checkUpload("video/quicktime", 1000), { ok: true, type: "video", ext: "mov" });
  assert.equal(checkUpload("image/png", 1000).ok, false);
  assert.equal(checkUpload("image/jpeg", 9 * 1024 * 1024).ok, false);
  assert.equal(checkUpload("video/mp4", 101 * 1024 * 1024).ok, false);
  assert.equal(checkUpload("video/mp4", 0).ok, false);
  assert.equal(checkUpload("video/mp4", NaN).ok, false);
});

test("a valid photo post has no errors", () => {
  assert.deepEqual(validatePost(post()), []);
});

test("needs a channel and a known type", () => {
  assert.match(validatePost(post({ platforms: [] })).join(" "), /channel/i);
  assert.match(validatePost(post({ kind: "podcast" as any })).join(" "), /type/i);
});

test("instagram caption: 2200 characters and 30 hashtags", () => {
  assert.equal(validatePost(post({ caption: "a".repeat(2200) })).length, 0);
  assert.match(validatePost(post({ caption: "a".repeat(2201) })).join(" "), /2200/);
  const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
  assert.match(validatePost(post({ caption: tags })).join(" "), /30 hashtags/);
  // Facebook alone has no such limit
  assert.equal(validatePost(post({ caption: tags, platforms: ["facebook"] })).length, 0);
});

test("feed takes exactly one photo, not a video", () => {
  assert.match(validatePost(post({ media: [] })).join(" "), /one photo/i);
  assert.match(validatePost(post({ media: [img(), img()] })).join(" "), /one photo/i);
  assert.match(validatePost(post({ media: [vid()] })).join(" "), /one photo/i);
});

test("instagram feed photos must fit 4:5 to 1.91:1", () => {
  assert.match(validatePost(post({ media: [img({ width: 1000, height: 1500 })] })).join(" "), /4:5/);
  assert.match(validatePost(post({ media: [img({ width: 2000, height: 1000 })] })).join(" "), /1.91/);
  assert.equal(validatePost(post({ media: [img({ width: 1080, height: 1080 })] })).length, 0);
  // unknown size is not an error (Meta checks it)
  assert.equal(validatePost(post({ media: [img({ width: null, height: null })] })).length, 0);
});

test("carousel: 2 to 10 items, Facebook cannot mix in video", () => {
  assert.match(validatePost(post({ kind: "carousel", media: [img()] })).join(" "), /2 to 10/);
  assert.match(validatePost(post({ kind: "carousel", media: Array.from({ length: 11 }, () => img()) })).join(" "), /2 to 10/);
  assert.equal(validatePost(post({ kind: "carousel", media: [img(), vid()] })).length, 0);
  assert.match(validatePost(post({ kind: "carousel", media: [img(), vid()], platforms: ["instagram", "facebook"] })).join(" "), /Facebook/);
});

test("reel: one video of 3 to 90 seconds", () => {
  const reel = (media: any[]) => post({ kind: "reel", media });
  assert.equal(validatePost(reel([vid()])).length, 0);
  assert.match(validatePost(reel([img()])).join(" "), /one video/i);
  assert.match(validatePost(reel([vid({ durationSec: 2 })])).join(" "), /3 and 90/);
  assert.match(validatePost(reel([vid({ durationSec: 91 })])).join(" "), /3 and 90/);
});

test("story: one photo or video, no caption, video up to 60 seconds", () => {
  const story = (media: any[], caption = "") => post({ kind: "story", caption, media });
  assert.equal(validatePost(story([img()])).length, 0);
  assert.equal(validatePost(story([vid({ durationSec: 60 })])).length, 0);
  assert.match(validatePost(story([vid({ durationSec: 61 })])).join(" "), /60/);
  assert.match(validatePost(story([img()], "teks")).join(" "), /caption/i);
  assert.match(validatePost(story([img(), img()])).join(" "), /one/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd admin && node --test worker/lib/publishRules.test.ts`
Expected: FAIL (cannot find `./publishRules.ts`).

- [ ] **Step 3: Write the implementation**

`admin/worker/lib/publishRules.ts`:

```ts
// What Instagram and Facebook accept, checked before a post can be scheduled. Pure, no
// Worker APIs, so the React composer imports it too and shows the same errors live.
// Limits are Meta's documented ones; reel and story numbers are re-verified in stage 4.

export type Platform = "instagram" | "facebook";
export type Kind = "feed" | "carousel" | "reel" | "story";
export type MediaIn = {
  type: "image" | "video";
  bytes?: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
};
export type PostIn = { kind: Kind; caption: string; media: MediaIn[]; platforms: Platform[] };

export const KINDS: readonly Kind[] = ["feed", "carousel", "reel", "story"];
export const PLATFORMS: readonly Platform[] = ["instagram", "facebook"];

export const MAX_CAROUSEL = 10;
export const IG_CAPTION_MAX = 2200;
export const IG_HASHTAGS_MAX = 30;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // the Worker request body limit
const FEED_RATIO_MIN = 0.8; // 4:5
const FEED_RATIO_MAX = 1.91;

const UPLOAD_TYPES: Record<string, { type: "image" | "video"; ext: string }> = {
  "image/jpeg": { type: "image", ext: "jpg" },
  "video/mp4": { type: "video", ext: "mp4" },
  "video/quicktime": { type: "video", ext: "mov" },
};

export function checkUpload(
  contentType: string,
  bytes: number
): { ok: true; type: "image" | "video"; ext: string } | { ok: false; error: string } {
  const t = UPLOAD_TYPES[contentType];
  if (!t) return { ok: false, error: "Use a JPEG photo or an MP4 / MOV video." };
  if (!Number.isFinite(bytes) || bytes <= 0) return { ok: false, error: "The file is empty." };
  const max = t.type === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (bytes > max) return { ok: false, error: `${t.type === "image" ? "Photos" : "Videos"} can be at most ${max / 1024 / 1024} MB.` };
  return { ok: true, type: t.type, ext: t.ext };
}

const hashtags = (s: string) => (s.match(/#[\p{L}\p{N}_]+/gu) ?? []).length;

export function validatePost(p: PostIn): string[] {
  const errors: string[] = [];
  if (!KINDS.includes(p.kind)) return ["Unknown post type."];
  if (p.platforms.length === 0) errors.push("Pick at least one channel.");
  const ig = p.platforms.includes("instagram");
  const fb = p.platforms.includes("facebook");

  if (p.kind === "story") {
    if (p.caption.trim()) errors.push("Stories do not have a caption.");
  } else if (ig) {
    if (p.caption.length > IG_CAPTION_MAX) errors.push(`Instagram captions can be at most ${IG_CAPTION_MAX} characters.`);
    if (hashtags(p.caption) > IG_HASHTAGS_MAX) errors.push(`Instagram allows at most ${IG_HASHTAGS_MAX} hashtags.`);
  }

  const m = p.media;
  const photoRatio = (x: MediaIn) => {
    if (!ig || x.type !== "image" || !x.width || !x.height) return;
    const r = x.width / x.height;
    if (r < FEED_RATIO_MIN) errors.push("Instagram photos must not be taller than 4:5.");
    else if (r > FEED_RATIO_MAX) errors.push("Instagram photos must not be wider than 1.91:1.");
  };

  if (p.kind === "feed") {
    if (m.length !== 1 || m[0].type !== "image") errors.push("A photo post needs exactly one photo.");
    else photoRatio(m[0]);
  } else if (p.kind === "carousel") {
    if (m.length < 2 || m.length > MAX_CAROUSEL) errors.push(`A carousel needs 2 to ${MAX_CAROUSEL} items.`);
    if (fb && m.some((x) => x.type === "video")) errors.push("Facebook carousels can only hold photos.");
    m.forEach(photoRatio);
  } else if (p.kind === "reel") {
    if (m.length !== 1 || m[0].type !== "video") errors.push("A reel needs exactly one video.");
    else if (m[0].durationSec != null && (m[0].durationSec < 3 || m[0].durationSec > 90)) errors.push("A reel must last between 3 and 90 seconds.");
  } else {
    if (m.length !== 1) errors.push("A story needs exactly one photo or video.");
    else if (m[0].type === "video" && m[0].durationSec != null && m[0].durationSec > 60) errors.push("A story video can last at most 60 seconds.");
  }
  return errors;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd admin && node --test worker/lib/publishRules.test.ts`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add admin/worker/lib/publishRules.ts admin/worker/lib/publishRules.test.ts
git commit -m "feat(publish): platform rules and upload checks" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Post state and schedule time

**Files:**
- Create: `admin/worker/lib/postState.ts`
- Test: `admin/worker/lib/postState.test.ts`

**Interfaces:**
- Produces:
  - `type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "needs_check"`
  - `type Action = "edit" | "delete"`
  - `can(status: PostStatus, action: Action): boolean`
  - `parseScheduledAt(input: unknown, nowMs: number): { ok: true; sql: string } | { ok: false; error: string }` — `sql` is UTC `YYYY-MM-DD HH:MM:SS`, seconds always `00`.

- [ ] **Step 1: Write the failing tests**

`admin/worker/lib/postState.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { can, parseScheduledAt } from "./postState.ts";

const NOW = Date.parse("2026-11-11T03:00:00Z");

test("only draft, scheduled and failed posts can be edited or deleted", () => {
  for (const s of ["draft", "scheduled", "failed"] as const) {
    assert.equal(can(s, "edit"), true);
    assert.equal(can(s, "delete"), true);
  }
  for (const s of ["publishing", "published", "needs_check"] as const) {
    assert.equal(can(s, "edit"), false);
    assert.equal(can(s, "delete"), false);
  }
});

test("a valid future time becomes UTC SQL text with seconds zeroed", () => {
  assert.deepEqual(parseScheduledAt("2026-11-12T05:30:45.123Z", NOW), { ok: true, sql: "2026-11-12 05:30:00" });
  assert.deepEqual(parseScheduledAt("2026-11-12T12:30:00+07:00", NOW), { ok: true, sql: "2026-11-12 05:30:00" });
});

test("rejects missing, malformed, past and too-soon times", () => {
  assert.equal(parseScheduledAt(undefined, NOW).ok, false);
  assert.equal(parseScheduledAt("besok", NOW).ok, false);
  assert.equal(parseScheduledAt("2026-11-12 05:30", NOW).ok, false); // no zone
  assert.equal(parseScheduledAt("2026-11-10T05:30:00Z", NOW).ok, false);
  assert.equal(parseScheduledAt("2026-11-11T03:00:30Z", NOW).ok, false); // under 1 minute ahead
  assert.equal(parseScheduledAt("2026-11-11T03:02:00Z", NOW).ok, true);
});

test("rejects times more than 75 days ahead", () => {
  assert.equal(parseScheduledAt("2027-01-24T03:00:00Z", NOW).ok, true); // 74 days
  assert.equal(parseScheduledAt("2027-02-01T03:00:00Z", NOW).ok, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd admin && node --test worker/lib/postState.test.ts`
Expected: FAIL (cannot find `./postState.ts`).

- [ ] **Step 3: Write the implementation**

`admin/worker/lib/postState.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd admin && node --test worker/lib/postState.test.ts`
Expected: all pass. (The "74 days" case: `2027-01-24T03:00:00Z` is 74 days after `NOW`.)

- [ ] **Step 5: Commit**

```bash
git add admin/worker/lib/postState.ts admin/worker/lib/postState.test.ts
git commit -m "feat(publish): post state rules and schedule time parsing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Token permissions and channel setup (admin)

**Files:**
- Create: `admin/worker/lib/metaPermissions.ts`, `admin/worker/lib/metaPermissions.test.ts`, `admin/worker/routes/publishSetup.ts`
- Modify: `admin/worker/routes/admin.ts` (import near line 20, mount near line 25)

**Interfaces:**
- Consumes: `metaGet(env, path, params, maxRetries)` and `discoverInstagram(env)` (existing).
- Produces:
  - `REQUIRED_PUBLISH_PERMISSIONS: readonly string[]`
  - `missingPermissions(rows: { permission: string; status: string }[]): string[]`
  - HTTP (all under `/api/admin/publish`, admin only): `GET /permissions` → `{ ok: boolean; missing: string[]; error?: string }`, `GET /candidates`, `POST /channels` body `{ client_id, ig_user_id, ig_username?, page_id, page_name? }`, `DELETE /channels/:id`.

- [ ] **Step 1: Write the failing test**

`admin/worker/lib/metaPermissions.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { missingPermissions, REQUIRED_PUBLISH_PERMISSIONS } from "./metaPermissions.ts";

test("lists every required permission that is not granted", () => {
  const all = REQUIRED_PUBLISH_PERMISSIONS.map((permission) => ({ permission, status: "granted" }));
  assert.deepEqual(missingPermissions(all), []);
  assert.deepEqual(missingPermissions([]), [...REQUIRED_PUBLISH_PERMISSIONS]);
  const declined = all.map((r) => (r.permission === "instagram_content_publish" ? { ...r, status: "declined" } : r));
  assert.deepEqual(missingPermissions(declined), ["instagram_content_publish"]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd admin && node --test worker/lib/metaPermissions.test.ts`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Write `metaPermissions.ts`**

```ts
// The Meta token was created for reading ads. Publishing needs more permissions; this
// lists what is missing so the admin can regenerate the token before anything is scheduled.
// Pure on purpose (no Worker imports) so node can test it; the Graph call lives in publishSetup.ts.

export const REQUIRED_PUBLISH_PERMISSIONS = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
] as const;

export function missingPermissions(rows: { permission: string; status: string }[]): string[] {
  const granted = new Set(rows.filter((r) => r.status === "granted").map((r) => r.permission));
  return REQUIRED_PUBLISH_PERMISSIONS.filter((p) => !granted.has(p));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd admin && node --test worker/lib/metaPermissions.test.ts`
Expected: pass.

- [ ] **Step 5: Write the setup routes**

`admin/worker/routes/publishSetup.ts`:

```ts
// Admin-only Publish setup: is the Meta token allowed to publish, and which Instagram and
// Facebook accounts belong to which client. Mounted under /api/admin (requireAdmin applies).

import { Hono } from "hono";
import { metaGet } from "../lib/meta";
import { missingPermissions } from "../lib/metaPermissions";
import { discoverInstagram } from "../lib/organic";
import type { Env, Vars } from "../types";

const setup = new Hono<{ Bindings: Env; Variables: Vars }>();

setup.get("/permissions", async (c) => {
  try {
    const res = await metaGet(c.env, "me/permissions", {}, 1);
    const missing = missingPermissions(res?.data ?? []);
    return c.json({ ok: missing.length === 0, missing });
  } catch (e: any) {
    // e.g. no token configured, or Meta does not expose /me/permissions for this token type
    return c.json({ ok: false, missing: [], error: e.message });
  }
});

setup.get("/candidates", async (c) => {
  try {
    return c.json({ candidates: await discoverInstagram(c.env) });
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }
});

// Connecting an Instagram account also connects the Facebook Page it hangs off.
setup.post("/channels", async (c) => {
  const b = await c.req.json().catch(() => ({}));
  if (!Number.isInteger(b.client_id) || !b.ig_user_id || !b.page_id) return c.json({ error: "client_id, ig_user_id and page_id are required" }, 400);
  const client = await c.env.DB.prepare("SELECT id FROM clients WHERE id=?").bind(b.client_id).first();
  if (!client) return c.json({ error: "Client not found" }, 404);
  const upsert = `INSERT INTO channels (client_id, platform, external_id, page_id, name) VALUES (?,?,?,?,?)
    ON CONFLICT(client_id, platform, external_id) DO UPDATE SET name=excluded.name, page_id=excluded.page_id, status='active'`;
  await c.env.DB.batch([
    c.env.DB.prepare(upsert).bind(b.client_id, "instagram", String(b.ig_user_id), String(b.page_id), b.ig_username ? `@${b.ig_username}` : String(b.ig_user_id)),
    c.env.DB.prepare(upsert).bind(b.client_id, "facebook", String(b.page_id), String(b.page_id), String(b.page_name ?? b.page_id)),
  ]);
  return c.json({ ok: true });
});

// Disabling keeps history: posts that targeted the channel still show it.
setup.delete("/channels/:id", async (c) => {
  await c.env.DB.prepare("UPDATE channels SET status='disabled' WHERE id=?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

export default setup;
```

In `admin/worker/routes/admin.ts` add next to the other route imports `import publishSetup from "./publishSetup";` and next to `admin.route("/organic", organic);` add `admin.route("/publish", publishSetup);`.

- [ ] **Step 6: Type check, run all tests, commit**

```bash
cd admin && npm run check && npm test
```

Expected: no type errors; all tests pass.

```bash
git add admin/worker/lib/metaPermissions.ts admin/worker/lib/metaPermissions.test.ts admin/worker/routes/publishSetup.ts admin/worker/routes/admin.ts
git commit -m "feat(publish): token permission check and channel setup routes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Posts, channels and media routes (per client)

**Files:**
- Create: `admin/worker/routes/publish.ts`
- Modify: `admin/worker/routes/clients.ts` (import, and mount directly after line 11 `clients.use("/:clientId/*", clientAccess);`)

**Interfaces:**
- Consumes: `validatePost`, `checkUpload`, `KINDS`, `MAX_CAROUSEL`, `Kind`, `Platform` (Task 2); `can`, `parseScheduledAt` (Task 3).
- Produces HTTP under `/api/clients/:clientId/publish` (non-GET requires an admin user; share links are read-only):
  - `GET /channels` → `{ channels: { id, platform, external_id, name }[] }`
  - `GET /posts` → `{ posts: { id, status, kind, caption, scheduled_at, last_error, media_count, cover_key, cover_type, platforms: Platform[] }[] }`
  - `GET /posts/:id` → `{ id, status, kind, caption, scheduled_at, last_error, channel_ids: number[], media: { r2_key, type, bytes, width, height, duration_sec }[] }`
  - `POST /posts` and `PUT /posts/:id`, body `{ kind, caption, channel_ids: number[], media: { r2_key, type, bytes, width?, height?, duration_sec? }[], schedule: boolean, scheduled_at?: string }` → `{ id, status }`; 400 `{ error, errors? }`
  - `DELETE /posts/:id` → `{ ok: true }`
  - `POST /media` (raw body, `Content-Type` = file type) → `{ key, file, type, bytes }`
  - `GET /media/:file` → the file (supports `Range`)

- [ ] **Step 1: Write the routes**

`admin/worker/routes/publish.ts`:

```ts
// Publish per client: channels, posts, media. clientAccess has already resolved the tenant
// (c.get("access").clientId); writes are admin-only, share links are read-only.

import { Hono, type Context } from "hono";
import type { Env, Vars } from "../types";
import { can, parseScheduledAt, type PostStatus } from "../lib/postState";
import { checkUpload, KINDS, MAX_CAROUSEL, validatePost, type Kind, type Platform } from "../lib/publishRules";

const publish = new Hono<{ Bindings: Env; Variables: Vars }>();
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

publish.use("*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const a = c.get("access");
  if (a.type !== "user" || a.user.role !== "admin") return c.json({ error: "Read-only access" }, 403);
  await next();
});

const clientOf = (c: Ctx) => c.get("access").clientId;
const FILE_RE = /^[0-9a-f-]{36}\.(jpg|mp4|mov)$/;

// ------------------------------------------------------------------ channels
publish.get("/channels", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, platform, external_id, name FROM channels WHERE client_id=? AND status='active' ORDER BY platform, name"
  )
    .bind(clientOf(c))
    .all();
  return c.json({ channels: results });
});

// --------------------------------------------------------------------- posts
type MediaBody = { r2_key: string; type: "image" | "video"; bytes: number; width: number | null; height: number | null; duration_sec: number | null };
type Parsed = { kind: Kind; caption: string; channelIds: number[]; media: MediaBody[]; schedule: boolean; scheduledAt: string | null };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/** Reads and checks a post body. Drafts only need to be well-formed; scheduling must pass every rule. */
async function parsePost(c: Ctx, clientId: number): Promise<{ ok: true; post: Parsed } | { ok: false; error: string; errors?: string[] }> {
  const b: any = await c.req.json().catch(() => null);
  if (!b || typeof b !== "object") return { ok: false, error: "Body must be JSON." };
  if (!KINDS.includes(b.kind)) return { ok: false, error: "Unknown post type." };
  const caption = typeof b.caption === "string" ? b.caption : "";
  if (caption.length > 63_206) return { ok: false, error: "Caption is too long." };

  const channelIds: number[] = Array.isArray(b.channel_ids) ? [...new Set<number>(b.channel_ids)] : [];
  if (channelIds.length > 10 || !channelIds.every(Number.isInteger)) return { ok: false, error: "Invalid channels." };
  const channels = channelIds.length
    ? (
        await c.env.DB.prepare(
          `SELECT id, platform FROM channels WHERE client_id=? AND status='active' AND id IN (${channelIds.map(() => "?").join(",")})`
        )
          .bind(clientId, ...channelIds)
          .all<{ id: number; platform: Platform }>()
      ).results
    : [];
  if (channels.length !== channelIds.length) return { ok: false, error: "A selected channel does not belong to this client." };

  const rawMedia: any[] = Array.isArray(b.media) ? b.media : [];
  if (rawMedia.length > MAX_CAROUSEL) return { ok: false, error: `At most ${MAX_CAROUSEL} media items.` };
  const media: MediaBody[] = [];
  for (const m of rawMedia) {
    if (typeof m?.r2_key !== "string" || !m.r2_key.startsWith(`c${clientId}/`) || !FILE_RE.test(m.r2_key.slice(`c${clientId}/`.length)))
      return { ok: false, error: "Invalid media." };
    if (m.type !== "image" && m.type !== "video") return { ok: false, error: "Invalid media." };
    media.push({ r2_key: m.r2_key, type: m.type, bytes: num(m.bytes) ?? 0, width: num(m.width), height: num(m.height), duration_sec: num(m.duration_sec) });
  }

  const schedule = b.schedule === true;
  let scheduledAt: string | null = null;
  if (schedule) {
    const errors = validatePost({
      kind: b.kind,
      caption,
      media: media.map((m) => ({ type: m.type, bytes: m.bytes, width: m.width, height: m.height, durationSec: m.duration_sec })),
      platforms: [...new Set(channels.map((ch) => ch.platform))],
    });
    const when = parseScheduledAt(b.scheduled_at, Date.now());
    if (!when.ok) errors.push(when.error);
    else scheduledAt = when.sql;
    if (errors.length) return { ok: false, error: errors[0], errors };
  }
  return { ok: true, post: { kind: b.kind, caption, channelIds, media, schedule, scheduledAt } };
}

/** Targets and media rows for a post, in the status the post ends up in. */
function children(c: Ctx, postId: number, p: Parsed) {
  const status = p.schedule ? "scheduled" : "draft";
  return [
    ...p.channelIds.map((id) => c.env.DB.prepare("INSERT INTO post_targets (post_id, channel_id, status) VALUES (?,?,?)").bind(postId, id, status)),
    ...p.media.map((m, i) =>
      c.env.DB.prepare("INSERT INTO post_media (post_id, position, r2_key, type, bytes, width, height, duration_sec) VALUES (?,?,?,?,?,?,?,?)").bind(
        postId, i, m.r2_key, m.type, m.bytes, m.width, m.height, m.duration_sec
      )
    ),
  ];
}

publish.get("/posts", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.status, p.kind, p.caption, p.scheduled_at, p.last_error,
            (SELECT COUNT(*) FROM post_media m WHERE m.post_id=p.id) AS media_count,
            (SELECT r2_key FROM post_media m WHERE m.post_id=p.id ORDER BY position LIMIT 1) AS cover_key,
            (SELECT type FROM post_media m WHERE m.post_id=p.id ORDER BY position LIMIT 1) AS cover_type,
            (SELECT group_concat(DISTINCT ch.platform) FROM post_targets t JOIN channels ch ON ch.id=t.channel_id WHERE t.post_id=p.id) AS platforms
       FROM posts p WHERE p.client_id=? ORDER BY p.scheduled_at, p.id DESC LIMIT 200`
  )
    .bind(clientOf(c))
    .all<any>();
  return c.json({ posts: results.map((r) => ({ ...r, platforms: r.platforms ? String(r.platforms).split(",") : [] })) });
});

publish.get("/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const post = await c.env.DB.prepare("SELECT id, status, kind, caption, scheduled_at, last_error FROM posts WHERE id=? AND client_id=?").bind(id, clientOf(c)).first<any>();
  if (!post) return c.json({ error: "Post not found" }, 404);
  const [targets, media] = await Promise.all([
    c.env.DB.prepare("SELECT channel_id FROM post_targets WHERE post_id=?").bind(id).all<{ channel_id: number }>(),
    c.env.DB.prepare("SELECT r2_key, type, bytes, width, height, duration_sec FROM post_media WHERE post_id=? ORDER BY position").bind(id).all(),
  ]);
  return c.json({ ...post, channel_ids: targets.results.map((t) => t.channel_id), media: media.results });
});

publish.post("/posts", async (c) => {
  const clientId = clientOf(c);
  const parsed = await parsePost(c, clientId);
  if (!parsed.ok) return c.json({ error: parsed.error, errors: parsed.errors }, 400);
  const p = parsed.post;
  const status = p.schedule ? "scheduled" : "draft";
  const a = c.get("access");
  const r = await c.env.DB.prepare("INSERT INTO posts (client_id, status, kind, caption, scheduled_at, created_by) VALUES (?,?,?,?,?,?)")
    .bind(clientId, status, p.kind, p.caption, p.scheduledAt, a.type === "user" ? a.user.id : null)
    .run();
  const id = r.meta.last_row_id as number;
  const rows = children(c, id, p);
  try {
    if (rows.length) await c.env.DB.batch(rows);
  } catch (e) {
    await c.env.DB.prepare("DELETE FROM posts WHERE id=?").bind(id).run();
    throw e;
  }
  return c.json({ id, status }, 201);
});

publish.put("/posts/:id", async (c) => {
  const clientId = clientOf(c);
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT status FROM posts WHERE id=? AND client_id=?").bind(id, clientId).first<{ status: PostStatus }>();
  if (!existing) return c.json({ error: "Post not found" }, 404);
  if (!can(existing.status, "edit")) return c.json({ error: "This post can no longer be edited." }, 409);
  const parsed = await parsePost(c, clientId);
  if (!parsed.ok) return c.json({ error: parsed.error, errors: parsed.errors }, 400);
  const p = parsed.post;
  const status = p.schedule ? "scheduled" : "draft";

  const before = await c.env.DB.prepare("SELECT r2_key FROM post_media WHERE post_id=?").bind(id).all<{ r2_key: string }>();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE posts SET status=?, kind=?, caption=?, scheduled_at=?, attempts=0, last_error=NULL, updated_at=datetime('now') WHERE id=?").bind(
      status, p.kind, p.caption, p.scheduledAt, id
    ),
    c.env.DB.prepare("DELETE FROM post_targets WHERE post_id=?").bind(id),
    c.env.DB.prepare("DELETE FROM post_media WHERE post_id=?").bind(id),
    ...children(c, id, p),
  ]);
  const kept = new Set(p.media.map((m) => m.r2_key));
  const dropped = before.results.map((r) => r.r2_key).filter((k) => !kept.has(k));
  if (dropped.length) await c.env.MEDIA.delete(dropped);
  return c.json({ id, status });
});

publish.delete("/posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const existing = await c.env.DB.prepare("SELECT status FROM posts WHERE id=? AND client_id=?").bind(id, clientOf(c)).first<{ status: PostStatus }>();
  if (!existing) return c.json({ error: "Post not found" }, 404);
  if (!can(existing.status, "delete")) return c.json({ error: "This post can no longer be deleted." }, 409);
  const keys = (await c.env.DB.prepare("SELECT r2_key FROM post_media WHERE post_id=?").bind(id).all<{ r2_key: string }>()).results.map((r) => r.r2_key);
  await c.env.DB.prepare("DELETE FROM posts WHERE id=?").bind(id).run(); // targets and media rows cascade
  if (keys.length) await c.env.MEDIA.delete(keys);
  return c.json({ ok: true });
});

// -------------------------------------------------------------------- media
// The body is streamed straight into R2 (never buffered), so a 100 MB video fits the Worker's memory.
publish.post("/media", async (c) => {
  const clientId = clientOf(c);
  const contentType = (c.req.header("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const length = Number(c.req.header("content-length"));
  const check = checkUpload(contentType, length);
  if (!check.ok) return c.json({ error: check.error }, 400);
  if (!c.req.raw.body) return c.json({ error: "The file is empty." }, 400);
  const file = `${crypto.randomUUID()}.${check.ext}`;
  const key = `c${clientId}/${file}`;
  const obj = await c.env.MEDIA.put(key, c.req.raw.body, { httpMetadata: { contentType } });
  return c.json({ key, file, type: check.type, bytes: obj.size }, 201);
});

publish.get("/media/:file", async (c) => {
  const file = c.req.param("file");
  if (!FILE_RE.test(file)) return c.json({ error: "Not found" }, 404);
  const obj = await c.env.MEDIA.get(`c${clientOf(c)}/${file}`, { range: c.req.raw.headers });
  if (!obj) return c.json({ error: "Not found" }, 404);
  const headers = new Headers({
    "content-type": obj.httpMetadata?.contentType ?? "application/octet-stream",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
    etag: obj.httpEtag,
  });
  let status = 200;
  const r = obj.range as { offset?: number; length?: number; suffix?: number } | undefined;
  if (r) {
    const start = r.suffix != null ? obj.size - r.suffix : r.offset ?? 0;
    const len = r.suffix != null ? r.suffix : r.length ?? obj.size - start;
    headers.set("content-range", `bytes ${start}-${start + len - 1}/${obj.size}`);
    headers.set("content-length", String(len));
    status = 206;
  } else {
    headers.set("content-length", String(obj.size));
  }
  return new Response(obj.body, { status, headers });
});

export default publish;
```

- [ ] **Step 2: Mount it**

In `admin/worker/routes/clients.ts` add `import publish from "./publish";` with the other imports and, directly after `clients.use("/:clientId/*", clientAccess);`, add:

```ts
clients.route("/:clientId/publish", publish);
```

- [ ] **Step 3: Type check and run all tests**

```bash
cd admin && npm run check && npm test
```

Expected: no type errors; all tests pass.

- [ ] **Step 4: Smoke test the API in the local worker**

Rebuild and start the local worker (config `musawara-admin` via `preview_start`; the admin must be copied into `out/admin` as done for earlier previews: `cd admin && npm run build && cd .. && rm -rf out/admin && cp -R admin/dist out/admin`). In the Browser pane, signed in as admin, run with `javascript_tool` (client 1 is "Musafar Tour & Travel"):

```js
const B = "/api/clients/1/publish";
const j = (r) => r.json();
// 1. a channel row for the test (admin setup route, no Meta call)
await fetch("/api/admin/publish/channels", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: 1, ig_user_id: "ig-test", ig_username: "testakun", page_id: "page-test", page_name: "Test Page" }) }).then(j);
const { channels } = await fetch(B + "/channels", { credentials: "include" }).then(j);
// 2. a tiny JPEG upload
const jpeg = Uint8Array.from(atob("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="), (c) => c.charCodeAt(0));
const up = await fetch(B + "/media", { method: "POST", credentials: "include", headers: { "Content-Type": "image/jpeg" }, body: new Blob([jpeg], { type: "image/jpeg" }) }).then(j);
// 3. draft, then schedule, then bad schedule, then delete
const body = (over) => JSON.stringify({ kind: "feed", caption: "Tes", channel_ids: [channels[0].id], media: [{ r2_key: up.key, type: "image", bytes: up.bytes, width: 1080, height: 1080 }], schedule: false, ...over });
const post = (b, m = "POST", p = "/posts") => fetch(B + p, { method: m, credentials: "include", headers: { "Content-Type": "application/json" }, body: b }).then(async (r) => [r.status, await r.json()]);
const draft = await post(body({}));
const when = new Date(Date.now() + 3600_000).toISOString();
const sched = await post(body({ schedule: true, scheduled_at: when }), "PUT", "/posts/" + draft[1].id);
const bad = await post(body({ schedule: true, scheduled_at: "2020-01-01T00:00:00Z" }), "PUT", "/posts/" + draft[1].id);
const media = await fetch(B + "/media/" + up.file, { credentials: "include" }).then((r) => [r.status, r.headers.get("content-type")]);
const list = await fetch(B + "/posts", { credentials: "include" }).then(j);
const del = await fetch(B + "/posts/" + draft[1].id, { method: "DELETE", credentials: "include" }).then(j);
JSON.stringify({ up, draft, sched, bad, media, listCount: list.posts.length, del })
```

Expected: `up` has `key` starting `c1/` and `type: "image"`; `draft[0]` is 201 with status `draft`; `sched` is `[200, {status:"scheduled"}]`; `bad[0]` is 400 with an error about time; `media` is `[200, "image/jpeg"]`; `del` is `{ok:true}`. (A one-pixel JPEG has width/height claimed by the body, so the ratio rule passes.)

Then clean up the local test rows:

```bash
npx wrangler d1 execute musawara-ads --local -c wrangler.local.jsonc --persist-to .wrangler/state-real --command "DELETE FROM channels WHERE external_id IN ('ig-test','page-test')"
```

- [ ] **Step 5: Commit**

```bash
git add admin/worker/routes/publish.ts admin/worker/routes/clients.ts
git commit -m "feat(publish): channels, posts and media routes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Queue page, channel setup UI and routing

**Files:**
- Create: `admin/src/lib/publishApi.ts`, `admin/src/components/PublishChannels.tsx`, `admin/src/pages/Publish.tsx`
- Modify: `admin/src/App.tsx`, `admin/src/pages/ClientDashboard.tsx`

**Interfaces:**
- Consumes: HTTP from Tasks 4 and 5; `Btn`, `Pill`, `Empty`, `Sheet`, `useNotify`, `btnCls`, `Tone` from `src/components/kit.tsx`; `api`, `useApi` from `src/lib/api.ts`.
- Produces (`publishApi.ts`): `type QueuePost`, `type Channel`, `STATUS: Record<PostStatus, { label: string; tone: Tone }>`, `mediaUrl(clientId: number, r2Key: string): string`, `uploadMedia(clientId: number, file: File): Promise<{ key: string; file: string; type: "image" | "video"; bytes: number }>`, and re-exports `Kind`, `Platform`, `PostStatus`.

- [ ] **Step 1: Write the shared client module**

`admin/src/lib/publishApi.ts`:

```ts
import type { Tone } from "../components/kit";
import type { PostStatus } from "../../worker/lib/postState.ts";
import type { Kind, Platform } from "../../worker/lib/publishRules.ts";

export type { Kind, Platform, PostStatus };

export type Channel = { id: number; platform: Platform; external_id: string; name: string | null };

export type QueuePost = {
  id: number;
  status: PostStatus;
  kind: Kind;
  caption: string;
  scheduled_at: string | null;
  last_error: string | null;
  media_count: number;
  cover_key: string | null;
  cover_type: "image" | "video" | null;
  platforms: Platform[];
};

export const STATUS: Record<PostStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "accent" },
  publishing: { label: "Publishing", tone: "warn" },
  published: { label: "Published", tone: "good" },
  failed: { label: "Failed", tone: "crit" },
  needs_check: { label: "Needs check", tone: "warn" },
};

export const KIND_LABEL: Record<Kind, string> = { feed: "Photo", carousel: "Carousel", reel: "Reel", story: "Story" };
export const PLATFORM_LABEL: Record<Platform, string> = { instagram: "Instagram", facebook: "Facebook" };

/** The R2 key is `c<clientId>/<file>`; the media route takes the file part. */
export const mediaUrl = (clientId: number, r2Key: string) => `/api/clients/${clientId}/publish/media/${r2Key.split("/").pop()}`;

export async function uploadMedia(clientId: number, file: File) {
  const res = await fetch(`/api/clients/${clientId}/publish/media`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": file.type },
    body: file,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`);
  return data as { key: string; file: string; type: "image" | "video"; bytes: number };
}
```

- [ ] **Step 2: Write the channels component**

`admin/src/components/PublishChannels.tsx`:

```tsx
// Admin-only strip on the Publish page: can the token publish, which accounts are
// connected to this client, and a sheet to connect more.

import { useState } from "react";
import { api, useApi } from "../lib/api";
import { Btn, Pill, Sheet, useNotify } from "./kit";
import { PLATFORM_LABEL, type Channel } from "../lib/publishApi";

type Candidate = { ig_user_id: string; ig_username: string | null; page_id: string; page_name: string };

export function PublishChannels({ clientId, channels, onChanged }: { clientId: number; channels: Channel[]; onChanged: () => void }) {
  const perms = useApi<{ ok: boolean; missing: string[]; error?: string }>("/admin/publish/permissions");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const { notify, node } = useNotify();
  const found = useApi<{ candidates: Candidate[] }>(open ? "/admin/publish/candidates" : null);

  const connect = async (c: Candidate) => {
    setBusy(c.ig_user_id);
    try {
      await api("/admin/publish/channels", { method: "POST", body: { client_id: clientId, ig_user_id: c.ig_user_id, ig_username: c.ig_username, page_id: c.page_id, page_name: c.page_name } });
      notify("Connected.");
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
    }
    setBusy("");
  };
  const disconnect = async (id: number) => {
    try {
      await api(`/admin/publish/channels/${id}`, { method: "DELETE" });
      onChanged();
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  return (
    <div className="space-y-3">
      {perms.data && !perms.data.ok && (
        <p className="text-xs text-crit">
          {perms.data.error
            ? `Could not read the token permissions: ${perms.data.error}`
            : `The Meta token cannot publish yet. Missing: ${perms.data.missing.join(", ")}.`}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {channels.map((ch) => (
          <span key={ch.id} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-surface3 pl-3 pr-1 text-xs text-ink2">
            {PLATFORM_LABEL[ch.platform]} · {ch.name ?? ch.external_id}
            <button className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:text-crit" aria-label={`Disconnect ${ch.name ?? ch.external_id}`} onClick={() => disconnect(ch.id)}>
              ×
            </button>
          </span>
        ))}
        <Btn icon="plus" onClick={() => setOpen(true)}>Connect account</Btn>
      </div>
      {open && (
        <Sheet title="Connect an account" onClose={() => setOpen(false)}>
          <div className="space-y-2">
            {found.loading && <p className="text-xs text-muted">Looking for accounts…</p>}
            {found.error && <p className="text-xs text-crit">{found.error}</p>}
            {found.data?.candidates.length === 0 && (
              <p className="text-xs text-muted">No Instagram account found. Check the token permissions and that the Page is shared with the system user.</p>
            )}
            {found.data?.candidates.map((c) => {
              const done = channels.some((ch) => ch.platform === "instagram" && ch.external_id === c.ig_user_id);
              return (
                <div key={c.ig_user_id} className="flex min-h-11 items-center justify-between gap-3">
                  <span className="min-w-0 text-sm text-ink">
                    {c.ig_username ? `@${c.ig_username}` : c.ig_user_id}
                    <span className="block truncate text-xs text-muted">{c.page_name}</span>
                  </span>
                  {done ? <Pill tone="good">Connected</Pill> : <Btn loading={busy === c.ig_user_id} onClick={() => connect(c)}>Connect</Btn>}
                </div>
              );
            })}
          </div>
        </Sheet>
      )}
      {node}
    </div>
  );
}
```

- [ ] **Step 3: Write the queue page**

`admin/src/pages/Publish.tsx`:

```tsx
// Publish queue for one client: what is coming up, what needs attention, drafts, recent posts.

import { Link } from "react-router-dom";
import { useApi } from "../lib/api";
import { fmtDateTime } from "../lib/format";
import { btnCls, Empty, Pill } from "../components/kit";
import { CardSkeleton, ErrorState } from "../components/ui";
import { PublishChannels } from "../components/PublishChannels";
import { KIND_LABEL, mediaUrl, PLATFORM_LABEL, STATUS, type Channel, type QueuePost } from "../lib/publishApi";

function Thumb({ clientId, post }: { clientId: number; post: QueuePost }) {
  const cls = "h-14 w-14 shrink-0 rounded-lg bg-surface3 object-cover";
  if (!post.cover_key) return <div className={cls} />;
  const src = mediaUrl(clientId, post.cover_key);
  return post.cover_type === "video" ? <video className={cls} src={`${src}#t=0.1`} preload="metadata" muted /> : <img className={cls} src={src} alt="" loading="lazy" />;
}

function Row({ clientId, post }: { clientId: number; post: QueuePost }) {
  const st = STATUS[post.status];
  const editable = post.status === "draft" || post.status === "scheduled" || post.status === "failed";
  const body = (
    <>
      <Thumb clientId={clientId} post={post} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Pill tone={st.tone}>{st.label}</Pill>
          <span className="text-xs text-muted">
            {KIND_LABEL[post.kind]}
            {post.media_count > 1 ? ` · ${post.media_count} items` : ""}
            {post.platforms.length ? ` · ${post.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}` : ""}
          </span>
        </span>
        <span className="mt-1 block truncate text-sm text-ink">{post.caption.trim() || "No caption"}</span>
        <span className="block text-xs text-muted">{post.scheduled_at ? fmtDateTime(post.scheduled_at) : "No time set"}</span>
        {post.last_error && <span className="block text-xs text-crit">{post.last_error}</span>}
      </span>
    </>
  );
  const cls = "flex min-h-11 items-center gap-3 py-2";
  return editable ? (
    <Link to={`/c/${clientId}/publish/${post.id}`} className={`${cls} hover:bg-surface`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Group({ title, clientId, posts }: { title: string; clientId: number; posts: QueuePost[] }) {
  if (!posts.length) return null;
  return (
    <section>
      <h2 className="mb-1 text-xs font-medium text-muted">{title}</h2>
      <div className="divide-y divide-border">
        {posts.map((p) => (
          <Row key={p.id} clientId={clientId} post={p} />
        ))}
      </div>
    </section>
  );
}

export function Publish({ clientId }: { clientId: number }) {
  const channels = useApi<{ channels: Channel[] }>(`/clients/${clientId}/publish/channels`);
  const posts = useApi<{ posts: QueuePost[] }>(`/clients/${clientId}/publish/posts`);

  if (posts.error) return <ErrorState message={posts.error} onRetry={posts.reload} />;
  if (posts.loading || !posts.data || !channels.data) return <CardSkeleton lines={6} />;

  const all = posts.data.posts;
  const at = (p: QueuePost) => p.scheduled_at ?? "";
  const upcoming = all.filter((p) => p.status === "scheduled" || p.status === "publishing").sort((a, b) => at(a).localeCompare(at(b)));
  const attention = all.filter((p) => p.status === "failed" || p.status === "needs_check");
  const drafts = all.filter((p) => p.status === "draft");
  const published = all.filter((p) => p.status === "published").sort((a, b) => at(b).localeCompare(at(a))).slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">Publish</h1>
        {channels.data.channels.length > 0 && (
          <Link to={`/c/${clientId}/publish/new`} className={btnCls}>
            New post
          </Link>
        )}
      </div>

      <PublishChannels clientId={clientId} channels={channels.data.channels} onChanged={channels.reload} />

      {channels.data.channels.length === 0 ? (
        <Empty icon="link" title="No account connected" hint="Connect this client's Instagram account above to start scheduling posts." />
      ) : all.length === 0 ? (
        <Empty icon="image" title="No posts yet" hint="Write the first post and schedule it." action={<Link to={`/c/${clientId}/publish/new`} className={btnCls}>New post</Link>} />
      ) : (
        <>
          <Group title="Needs attention" clientId={clientId} posts={attention} />
          <Group title="Coming up" clientId={clientId} posts={upcoming} />
          <Group title="Drafts" clientId={clientId} posts={drafts} />
          <Group title="Published" clientId={clientId} posts={published} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire the routes and the entry link**

In `admin/src/App.tsx` add with the other lazy imports:

```tsx
const Publish = lazy(() => import("./pages/Publish").then((m) => ({ default: m.Publish })));
const PublishComposer = lazy(() => import("./pages/PublishComposer").then((m) => ({ default: m.PublishComposer })));
```

and inside `<Routes>`, after the `/c/:id/onboarding` route:

```tsx
        <Route path="/c/:id/publish" element={<ProtectedRoute requireAdmin><ClientRoute page={Publish} /></ProtectedRoute>} />
        <Route path="/c/:id/publish/new" element={<ProtectedRoute requireAdmin><ClientRoute page={PublishComposer} /></ProtectedRoute>} />
        <Route path="/c/:id/publish/:postId" element={<ProtectedRoute requireAdmin><ClientRoute page={PublishComposer} /></ProtectedRoute>} />
```

In `admin/src/pages/ClientDashboard.tsx`, inside the admin-only fragment that holds the Brand knowledge and Onboarding links (around line 178), add as the first link:

```tsx
              <Link to={`/c/${clientId}/publish`} className="inline-flex min-h-11 items-center rounded-lg px-2.5 text-xs font-medium text-ink2 hover:bg-surface hover:text-ink">
                Publish
              </Link>
```

- [ ] **Step 5: Type check**

`PublishComposer` does not exist until Task 7, so create a temporary stub first so the check can run:

```bash
printf 'export function PublishComposer({ clientId }: { clientId: number }) { return <p>{clientId}</p>; }\n' > admin/src/pages/PublishComposer.tsx
cd admin && npm run check
```

Expected: no type errors. (Task 7 overwrites the stub.)

- [ ] **Step 6: Commit**

```bash
git add admin/src/lib/publishApi.ts admin/src/components/PublishChannels.tsx admin/src/pages/Publish.tsx admin/src/pages/PublishComposer.tsx admin/src/App.tsx admin/src/pages/ClientDashboard.tsx
git commit -m "feat(publish): queue page, channel setup and routing" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Composer

**Files:**
- Modify (overwrite the stub): `admin/src/pages/PublishComposer.tsx`

**Interfaces:**
- Consumes: `validatePost`, `MAX_CAROUSEL`, `IG_CAPTION_MAX`, `Kind`, `Platform` (`worker/lib/publishRules.ts`); `parseScheduledAt` (`worker/lib/postState.ts`); `uploadMedia`, `mediaUrl`, `KIND_LABEL`, `PLATFORM_LABEL`, `Channel`, `STATUS` (`publishApi.ts`); HTTP from Task 5.
- Produces: the page component `PublishComposer({ clientId })`; the post id comes from the `:postId` route param (absent on `/publish/new`).

- [ ] **Step 1: Write the composer**

`admin/src/pages/PublishComposer.tsx`:

```tsx
// One screen to write a post: channels, type, media, caption, time. Errors come from the same
// rules the Worker enforces, so the Schedule button only lights up for a post Meta will accept.

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, useApi } from "../lib/api";
import { Btn, ConfirmBtn, inputCls, Pill, useNotify } from "../components/kit";
import { CardSkeleton, ErrorState } from "../components/ui";
import { parseScheduledAt } from "../../worker/lib/postState.ts";
import { IG_CAPTION_MAX, MAX_CAROUSEL, validatePost, type Kind, type Platform } from "../../worker/lib/publishRules.ts";
import { KIND_LABEL, mediaUrl, PLATFORM_LABEL, STATUS, uploadMedia, type Channel, type PostStatus } from "../lib/publishApi";

type MediaItem = { key: string; type: "image" | "video"; bytes: number; width: number | null; height: number | null; durationSec: number | null };
type Detail = {
  id: number;
  status: PostStatus;
  kind: Kind;
  caption: string;
  scheduled_at: string | null;
  last_error: string | null;
  channel_ids: number[];
  media: { r2_key: string; type: "image" | "video"; bytes: number; width: number | null; height: number | null; duration_sec: number | null }[];
};

const KIND_INFO: Record<Kind, { accept: string; max: number; hint: string }> = {
  feed: { accept: "image/jpeg", max: 1, hint: "One JPEG photo." },
  carousel: { accept: "image/jpeg,video/mp4,video/quicktime", max: MAX_CAROUSEL, hint: `2 to ${MAX_CAROUSEL} photos or videos.` },
  reel: { accept: "video/mp4,video/quicktime", max: 1, hint: "One video, 3 to 90 seconds." },
  story: { accept: "image/jpeg,video/mp4,video/quicktime", max: 1, hint: "One photo or video. Stories have no caption." },
};
const KINDS = Object.keys(KIND_INFO) as Kind[];

type Size = { width: number | null; height: number | null; durationSec: number | null };
const UNKNOWN: Size = { width: null, height: null, durationSec: null };

/** Reads pixel size (and video length) in the browser so the rules can check them before upload. */
function measure(file: File): Promise<Size> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve) => {
    const done = (v: Size) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    if (file.type.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, durationSec: v.duration });
      v.onerror = () => done(UNKNOWN);
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight, durationSec: null });
      img.onerror = () => done(UNKNOWN);
      img.src = url;
    }
  });
}

/** D1 stores UTC text; the date-time input works in WIB (UTC+7). */
const toWibInput = (sql: string | null) => (sql ? new Date(new Date(sql.replace(" ", "T") + "Z").getTime() + 7 * 3_600_000).toISOString().slice(0, 16) : "");
const fromWibInput = (v: string) => (v ? new Date(`${v}:00+07:00`).toISOString() : "");

export function PublishComposer({ clientId }: { clientId: number }) {
  const postId = useParams().postId;
  const navigate = useNavigate();
  const { notify, node } = useNotify();
  const channels = useApi<{ channels: Channel[] }>(`/clients/${clientId}/publish/channels`);
  const detail = useApi<Detail>(postId ? `/clients/${clientId}/publish/posts/${postId}` : null);

  const [kind, setKind] = useState<Kind>("feed");
  const [caption, setCaption] = useState("");
  const [channelIds, setChannelIds] = useState<number[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [when, setWhen] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState<"" | "draft" | "schedule">("");

  // Load an existing post into the form once.
  useEffect(() => {
    const d = detail.data;
    if (!d) return;
    setKind(d.kind);
    setCaption(d.caption);
    setChannelIds(d.channel_ids);
    setWhen(toWibInput(d.scheduled_at));
    setMedia(d.media.map((m) => ({ key: m.r2_key, type: m.type, bytes: m.bytes, width: m.width, height: m.height, durationSec: m.duration_sec })));
  }, [detail.data]);

  const info = KIND_INFO[kind];
  const all = channels.data?.channels ?? [];
  const platforms = useMemo(() => [...new Set(all.filter((c) => channelIds.includes(c.id)).map((c) => c.platform))] as Platform[], [all, channelIds]);

  const errors = useMemo(() => {
    const e = validatePost({
      kind,
      caption,
      media: media.map((m) => ({ type: m.type, bytes: m.bytes, width: m.width, height: m.height, durationSec: m.durationSec })),
      platforms,
    });
    const t = parseScheduledAt(fromWibInput(when), Date.now());
    if (!t.ok) e.push(t.error);
    return e;
  }, [kind, caption, media, platforms, when]);

  const locked = detail.data ? !["draft", "scheduled", "failed"].includes(detail.data.status) : false;

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      const added: MediaItem[] = [];
      for (const file of Array.from(files)) {
        if (media.length + added.length >= info.max) {
          notify(`This post type holds at most ${info.max}.`, "err");
          break;
        }
        const [size, up] = await Promise.all([measure(file), uploadMedia(clientId, file)]);
        added.push({ key: up.key, type: up.type, bytes: up.bytes, ...size });
      }
      setMedia((m) => [...m, ...added]);
    } catch (e: any) {
      notify(e.message, "err");
    }
    setUploading(false);
  };

  const move = (i: number, d: -1 | 1) =>
    setMedia((m) => {
      const next = [...m];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });

  const save = async (schedule: boolean) => {
    setSaving(schedule ? "schedule" : "draft");
    try {
      const body = {
        kind,
        caption: kind === "story" ? "" : caption,
        channel_ids: channelIds,
        media: media.map((m) => ({ r2_key: m.key, type: m.type, bytes: m.bytes, width: m.width, height: m.height, duration_sec: m.durationSec })),
        schedule,
        ...(schedule ? { scheduled_at: fromWibInput(when) } : {}),
      };
      if (postId) await api(`/clients/${clientId}/publish/posts/${postId}`, { method: "PUT", body });
      else await api(`/clients/${clientId}/publish/posts`, { method: "POST", body });
      navigate(`/c/${clientId}/publish`);
    } catch (e: any) {
      notify(e.message, "err");
      setSaving("");
    }
  };

  const remove = async () => {
    try {
      await api(`/clients/${clientId}/publish/posts/${postId}`, { method: "DELETE" });
      navigate(`/c/${clientId}/publish`);
    } catch (e: any) {
      notify(e.message, "err");
    }
  };

  if (channels.error || detail.error) return <ErrorState message={(channels.error || detail.error)!} onRetry={() => { channels.reload(); detail.reload(); }} />;
  if (channels.loading || !channels.data || (postId && (detail.loading || !detail.data))) return <CardSkeleton lines={6} />;

  const label = "mb-2 block text-xs font-medium text-muted";
  const canSchedule = errors.length === 0 && !locked && !uploading;
  // Do not shout at an empty form: list problems only once the person has started.
  const started = channelIds.length > 0 || media.length > 0 || caption.trim() !== "" || when !== "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">{postId ? "Edit post" : "New post"}</h1>
        <div className="flex items-center gap-2">
          {detail.data && <Pill tone={STATUS[detail.data.status].tone}>{STATUS[detail.data.status].label}</Pill>}
          <Link to={`/c/${clientId}/publish`} className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-ink2 hover:text-ink">
            Back
          </Link>
        </div>
      </div>
      {detail.data?.last_error && <p className="text-xs text-crit">{detail.data.last_error}</p>}

      <fieldset disabled={locked} className="space-y-6">
        <div>
          <span className={label}>Channels</span>
          <div className="flex flex-wrap gap-2">
            {all.map((ch) => (
              <label key={ch.id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-surface3 px-3 text-xs text-ink2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={channelIds.includes(ch.id)}
                  onChange={(e) => setChannelIds((ids) => (e.target.checked ? [...ids, ch.id] : ids.filter((i) => i !== ch.id)))}
                />
                {PLATFORM_LABEL[ch.platform]} · {ch.name ?? ch.external_id}
              </label>
            ))}
          </div>
        </div>

        <div>
          <span className={label}>Type</span>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium ${kind === k ? "bg-ink text-bg" : "bg-surface3 text-ink2 hover:text-ink"}`}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{info.hint}</p>
        </div>

        <div>
          <span className={label}>Media</span>
          <div className="space-y-2">
            {media.map((m, i) => (
              <div key={m.key} className="flex min-h-11 items-center gap-3">
                {m.type === "video" ? (
                  <video className="h-14 w-14 shrink-0 rounded-lg bg-surface3 object-cover" src={`${mediaUrl(clientId, m.key)}#t=0.1`} preload="metadata" muted />
                ) : (
                  <img className="h-14 w-14 shrink-0 rounded-lg bg-surface3 object-cover" src={mediaUrl(clientId, m.key)} alt="" />
                )}
                <span className="min-w-0 flex-1 text-xs text-muted">
                  {m.type === "video" ? "Video" : "Photo"}
                  {m.width && m.height ? ` · ${m.width}×${m.height}` : ""}
                  {m.durationSec ? ` · ${Math.round(m.durationSec)} s` : ""}
                </span>
                {kind === "carousel" && (
                  <>
                    <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink2 hover:bg-surface disabled:opacity-40">↑</button>
                    <button type="button" aria-label="Move later" disabled={i === media.length - 1} onClick={() => move(i, 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-ink2 hover:bg-surface disabled:opacity-40">↓</button>
                  </>
                )}
                <button type="button" aria-label="Remove" onClick={() => setMedia((x) => x.filter((_, j) => j !== i))} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:text-crit">×</button>
              </div>
            ))}
            {media.length < info.max && (
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border bg-surface px-3 text-xs font-medium text-ink2 hover:bg-surface2 hover:text-ink">
                {uploading ? "Uploading…" : "Add media"}
                <input type="file" className="sr-only" accept={info.accept} multiple={info.max > 1} disabled={uploading} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              </label>
            )}
          </div>
        </div>

        {kind !== "story" && (
          <div>
            <label className={label} htmlFor="caption">Caption</label>
            <textarea id="caption" className={`${inputCls} min-h-32 py-2`} value={caption} onChange={(e) => setCaption(e.target.value)} />
            {platforms.includes("instagram") && (
              <p className={`mt-1 text-right text-xs ${caption.length > IG_CAPTION_MAX ? "text-crit" : "text-muted"}`}>
                {caption.length}/{IG_CAPTION_MAX}
              </p>
            )}
          </div>
        )}

        <div>
          <label className={label} htmlFor="when">When (WIB)</label>
          <input id="when" type="datetime-local" className={inputCls} value={when} onChange={(e) => setWhen(e.target.value)} />
        </div>
      </fieldset>

      {errors.length > 0 && !locked && started && (
        <ul className="space-y-1 text-xs text-crit">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          <Btn tone="primary" loading={saving === "schedule"} disabled={!canSchedule || saving !== ""} onClick={() => save(true)}>
            Schedule
          </Btn>
          <Btn loading={saving === "draft"} disabled={saving !== "" || uploading} onClick={() => save(false)}>
            Save draft
          </Btn>
          {postId && <ConfirmBtn label="Delete" onConfirm={remove} />}
        </div>
      )}
      {node}
    </div>
  );
}
```

- [ ] **Step 2: Type check, tests, build**

```bash
cd admin && npm run check && npm test && npm run build
```

Expected: no type errors, all tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/PublishComposer.tsx
git commit -m "feat(publish): composer with live validation" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: End-to-end check, phone audit, hand-off

**Files:** none changed unless the audit finds problems (fix them in the file concerned and re-run Task 7 Step 2).

- [ ] **Step 1: Run the full flow in the local app**

Rebuild into the preview (`cd admin && npm run build && cd .. && rm -rf out/admin && cp -R admin/dist out/admin`), start `musawara-admin` with `preview_start`, open `/admin/c/1/publish` in the Browser pane. Walk through, reading the page with `get_page_text` / `read_page` (screenshots may time out if the pane is hidden):

1. Empty state "No account connected" shows. "Connect account" opens the sheet; with no Meta token locally it shows the error text, not a blank sheet. Insert a channel for the test with the same `fetch` as in Task 5 Step 4 (reload to see the chips).
2. "New post": the form starts with no red text and Schedule is disabled. Tick a channel: the error list appears and names what is missing. Pick a channel, add a JPEG, type a caption, pick a time tomorrow: Schedule enables; click it; the queue shows the post under "Coming up" with its thumbnail and a WIB time.
3. Open it, change the caption, "Save draft": it moves to "Drafts" with "No time set". Delete it (second tap confirms): the queue returns to "No posts yet".
4. Switch type to Story: caption field disappears. Switch to Reel with a photo attached: error "A reel needs exactly one video."

Expected: every step behaves as described; no console errors (`read_console_messages` with `onlyErrors`).

- [ ] **Step 2: Phone width and quality audit**

`resize_window` to `mobile` (375x812), reload `/admin/c/1/publish` and `/admin/c/1/publish/new`, then verify with JS in the page:

```js
[...document.querySelectorAll("a,button,label,input,select,textarea")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 44 || r.width < 44) && !e.classList.contains("sr-only") && e.type !== "checkbox" && e.type !== "file"; }).map((e) => e.outerHTML.slice(0, 90))
```

Expected: an empty list (inline text links that sit inside a 44px row are acceptable only if their row is 44px). Also confirm: no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), no hardcoded colors in the new files (`grep -nE "#[0-9a-fA-F]{3,6}|rgb\(" admin/src/pages/Publish*.tsx admin/src/components/PublishChannels.tsx admin/src/lib/publishApi.ts` prints nothing), and that `kit.tsx` and other shared components are untouched (`git diff --stat 6620308..HEAD -- admin/src/components/kit.tsx` prints nothing). Reset the viewport with `resize_window` preset `desktop` afterwards.

- [ ] **Step 3: Remove local test data**

```bash
npx wrangler d1 execute musawara-ads --local -c wrangler.local.jsonc --persist-to .wrangler/state-real --command "DELETE FROM posts; DELETE FROM channels"
```

(Local only: this database is an export of production used for development. Never run this without `--local`.)

- [ ] **Step 4: Stop and hand off**

Do not push or deploy. Report to the user: what was built and verified, and that production needs, in this order: (1) the R2 bucket `npx wrangler r2 bucket create musawara-media`, (2) `npx wrangler d1 migrations apply musawara-ads --remote`, (3) a Meta token with the publish permissions (the Publish page lists what is missing), (4) deploy as before. Each of those is the user's call.

---

## Self-review

**Spec coverage (stages 1 and 2 only).** Token permission check: Task 4. Migration and R2: Task 1. Composer: Task 7. Queue: Task 6. Per-platform validation before scheduling: Tasks 2, 5, 7. Media upload, private, streamed, size limits: Tasks 2, 5. Admin-only writes, share read-only, tenant from `clientAccess`: Task 5. Channel connect per client: Tasks 4, 6. Tests and dry-run: unit tests in Tasks 2 to 4; dry-run belongs to stage 3 with the publish cron. Gaps by design (stated in the header): previews, next slot, calendar, analytics, publishing, client-user access.

**Placeholders.** None: every code step has complete code. The one conditional (Task 4 Step 4, if `meta.ts` cannot load under plain node) gives the exact fallback.

**Type consistency.** `Platform`, `Kind`, `PostStatus`, `MediaIn`, `PostIn` are defined once (Tasks 2 and 3) and re-exported by `publishApi.ts`. The `Detail` shape in the composer matches `GET /posts/:id` (`channel_ids`, `media` with `r2_key`, `duration_sec`). The POST/PUT body in the composer matches `parsePost` (`channel_ids`, `media[].r2_key/type/bytes/width/height/duration_sec`, `schedule`, `scheduled_at`). `mediaUrl` takes the file part of `c<clientId>/<file>` which is what `GET /media/:file` expects.

**Known risks to watch when executing.** `me/permissions` may not be exposed for system-user tokens (handled: the Publish page then shows the error text instead of a verdict). `fmtDateTime` shows WIB, so queue times and the `datetime-local` input agree. A scheduled post can be edited back to a draft by saving without "Schedule" (that is how "unschedule" works in this version).
