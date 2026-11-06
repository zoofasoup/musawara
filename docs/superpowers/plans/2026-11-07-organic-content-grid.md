# Organic content grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Replace the text list on `/admin/organic` with a per-client thumbnail grid carrying a performance label.

**Architecture:** A pure label function (`admin/src/lib/organicLabel.ts`, tested with `node --test`) scores each post against the median of its account and format. Migration 0012 stores `thumbnail_url`; `pollPosts` fills it. `Organic.tsx` gets client tabs, a compact story row, and the grid with a detail sheet.

**Tech Stack:** React, Tailwind, Hono, D1, Node built-in test runner (Node 26 runs `.ts`).

## Global Constraints
- Spec: `docs/superpowers/specs/2026-11-07-organic-content-grid-design.md`.
- Labels: Top, Good, Average, Weak, New (under 48 h); no label with fewer than 5 same-format baseline posts.
- Baseline: last 10 mature posts (48 h or older, reach known) of the same account and format, excluding the post itself.
- Score = 0.5 * reach/median + 0.25 * shares/median + 0.25 * saves/median (components with median 0 are dropped, weights renormalised). Top >= 1.5, Good >= 1.1, Average >= 0.8, else Weak.
- Mobile first, 44px tap targets, no horizontal scroll at 375px.

### Task 1: Label function (tested)
**Files:** Create `admin/src/lib/organicLabel.ts`, `admin/src/lib/organicLabel.test.ts`
**Interfaces:** Produces `type LabelPost = {media_id; ig_user_id; format; posted_at; reach; shares; saves}`, `type PostLabel = "top"|"good"|"average"|"weak"|"new"`, `labelPosts(posts: LabelPost[], now?: number): Map<string, PostLabel | null>`.
- [ ] Write the failing tests (thresholds, New rule, sample-size rule, per-format baseline).
- [ ] Run `node --test admin/src/lib/organicLabel.test.ts`, expect FAIL.
- [ ] Implement `labelPosts`.
- [ ] Run again, expect PASS. Commit.

### Task 2: Thumbnail data
**Files:** Create `admin/migrations/0012_organic_thumbnail.sql`; modify `admin/worker/lib/organic.ts` (`pollPosts`).
- [ ] Migration: `ALTER TABLE organic_posts ADD COLUMN thumbnail_url TEXT;`
- [ ] Request `thumbnail_url,media_url` in the media fields; store `thumbnail_url` for reels/video, `media_url` otherwise; update on conflict.
- [ ] Apply locally, type check. Commit.

### Task 3: Grid UI
**Files:** Modify `admin/src/pages/Organic.tsx`.
- [ ] Client tabs; compact story row (count / target + thin 14-day strip) for the selected client.
- [ ] Posts grid (2 cols phone, 4 to 5 desktop): thumbnail with grey fallback tile on error, format badge, label chip, date and reach line.
- [ ] Detail sheet on tap: all metrics, full caption, Instagram link.
- [ ] Type check, build, check at 375px in the browser. Commit.

### Task 4: Release
- [ ] Migrate remote, copy `admin/dist` to `out/admin`, `npx wrangler deploy` (production config), verify the bundle, run Check now.
