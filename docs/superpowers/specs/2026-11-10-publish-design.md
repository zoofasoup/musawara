# Publish: social scheduler for the Musawara admin (Buffer-style)

Date: 2026-11-10. Status: draft for review.

## Goal

Add a "Publish" area to the admin, per client, to compose, schedule and auto-publish posts to
Instagram and Facebook, with a queue, a calendar and post analytics. Modelled on Buffer's core:
composer, queue, calendar, analytics.

## Decisions (from brainstorming)

- First version covers: composer + queue + calendar + analytics.
- Channels: Instagram + Facebook only. Channel code sits behind an adapter so LinkedIn, TikTok etc. can be added later; none are built now.
- Multi-client: one workspace per client, same scoping as the existing ad data.
- Post types: single image, carousel (up to 10), reel/video, story.
- Architecture: cron every minute + a status machine in D1 (not Workflows).

Out of scope for now: inbox/comments/DMs, team approval flow, AI caption assistant, bio page, any channel besides IG and FB.

## 1. Data and publish flow

New D1 tables (migration `0014_publish.sql`), all keyed by `client_id`:

- `channels`: `client_id`, `platform` (instagram|facebook), `external_id`, `name`, `status`. No tokens stored; the existing Meta system-user token is used and Page tokens are fetched at use time.
- `posts`: `client_id`, `status` (draft|scheduled|publishing|published|failed|needs_check), `kind` (feed|carousel|reel|story), `caption`, `scheduled_at` (UTC), `created_by`, `attempts`, `last_error`.
- `post_targets`: one row per post x channel with its own `status`, `external_post_id`, `container_id`, `last_error`. One target failing never fails the others.
- `post_media`: `post_id`, `position`, R2 key, type, width, height, duration.
- `publish_slots`: recurring weekday + time per client, used for "next slot". Added later with the calendar (migration 0015), not in 0014.

Status machine: `draft -> scheduled -> publishing -> published | failed | needs_check`.

- The cron (`* * * * *`, added to the existing `0 * * * *`) claims one due target with `UPDATE ... SET status='publishing' WHERE status='scheduled' AND scheduled_at <= now`, so two runs never publish the same target.
- Video/reel/story: the target stays `publishing`; each tick checks the container `status_code` until `FINISHED`, then publishes.
- Transient errors (rate limit, timeout) retry up to 3 times. Permanent errors (token, permission, format) go straight to `failed` with a readable reason.
- If the outcome is unknown (request sent, no response), the target becomes `needs_check` and is never retried automatically, to avoid duplicate posts. A person confirms.

Channel adapter interface: `publish(target)` and `checkStatus(target)`, with Instagram and Facebook implementations. Per-platform rules (aspect ratio, caption length, 10-item carousel limit, video length) are validated before scheduling, not at publish time.

## 2. Pages and UI

Menu "Publish" inside each client, three tabs. Style follows the existing admin: mobile-first, stacked panels without boxes, light Onest, functional red, 44px tap targets, empty data hidden.

1. Queue: posts grouped by day, ordered by time. Row = thumbnail, caption excerpt, channel icons, time, status. Failed rows show the reason and a Retry button. Tap opens the composer.
2. Calendar: week and month. On phone a swipeable day list; on desktop a grid with drag to reschedule (phone uses "Change schedule"). Empty days have a "+" to create a post for that date.
3. Analytics: per post and per channel (reach, likes, comments, saves, profile clicks), 7/30/90 day comparison, best posts, best posting hours. Reuses the existing organic tables, plus insight pulls for posts published through this feature.

Composer (a full screen, not a modal): channel checkboxes and type; media upload (up to 10 images or one video, reorderable); caption with per-channel counters and IG/FB-style previews; timing = publish now, schedule (date + time in WIB), save draft, or "next slot". Validation is inline, and the schedule button stays disabled until the post is valid.

## 3. Media, Meta permissions, errors, tests

Media: uploaded through the Worker into a new R2 bucket `musawara-media`. Images up to 8 MB, video up to 100 MB (Worker body limit); larger video is rejected with a clear message. Instagram fetches media by URL, so files are served through a Worker route with short-lived signed URLs; the bucket is not public. Orphaned files are removed by the existing daily cron.

Meta permissions (a precondition, verified first, not assumed): the system-user token needs `instagram_basic`, `instagram_content_publish`, `pages_manage_posts`, `pages_read_engagement`, `instagram_manage_insights`, and each client's Page and IG account must be assigned to the system user. Settings checks the token via `debug_token` and lists missing permissions; scheduling stays disabled until they are present. Client accounts owned by other businesses may need Advanced Access (Meta App Review), which is outside the code and cannot be guaranteed.

Security: all routes use the existing admin session and check `client_id`. Admins can do everything; client share links (ShareView) are read-only.

Tests: `node --test` unit tests for per-platform validation, the status machine, claiming, and adapters against a faked Meta. Real Instagram/Facebook publishing cannot be tested without a permitted token and a test account, so there is a dry-run mode (all steps run, the publish call is not sent) and a "send one post to a chosen test account" button.

## Build stages (each testable and deployable alone)

1. Token permission check, migration, R2 bucket and binding.
2. Composer + queue (draft and schedule, no publishing yet).
3. Publish cron for feed and carousel.
4. Reel and story.
5. Calendar.
6. Analytics.

## Risks and open items

- The stored token was created for ad reading; it likely must be regenerated with the permissions above.
- Creating the R2 bucket and adding the every-minute cron are infrastructure changes and are done only with explicit approval at stage 1.
- Publish time can drift up to about one minute (cron granularity).
- Instagram Story and reel behaviour through the API (formats, durations) will be confirmed against Meta's current docs at stage 4.
