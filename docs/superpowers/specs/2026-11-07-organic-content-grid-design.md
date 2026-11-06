# Organic: content grid with performance labels

Date: 2026-11-07. Page: `/admin/organic`.

## Goal
The team sees which content performs well at a glance, per client, without reading a wall of text.

## Page structure
1. **Client tabs** at the top (Musafar, NurAlive). One client at a time; everything below is that client's.
2. **Story summary**, compact: one row `N / target today` plus a thin 14-day strip. Replaces the large per-account cards.
3. **Posts grid**: 2 columns on phones, 4 to 5 on desktop. Each card: thumbnail, format badge (Reel / Carousel / Photo / Video), performance label in a corner, and one line below with date and reach.
4. Filters: format and sort only. Default sort newest.
5. Tap a card: detail panel with reach, views, saves, shares, likes, comments, average watch time, full caption, and an "Open on Instagram" link.

## Performance label
- Score = the post compared with the **median of the last 10 posts of the same format on the same account**.
- Basis: reach / followers, weighted with share rate and save rate.
- Labels: **Top** (well above median), **Good**, **Average**, **Weak**.
- Posts younger than 48 hours get **New**, never Weak (numbers not mature).
- Fewer than 5 posts of that format on the account: no label (sample too small).
- Computed when the page loads; not stored.

## Thumbnails
- Reels and videos use `thumbnail_url`; photos and carousels use `media_url`.
- Instagram CDN URLs expire after a few days. The hourly poll already reads each post, so the URL is updated in the database every run and stays fresh.
- If an image fails to load, show a grey tile with a format icon.
- Images are not copied to storage (no extra cost).

## Data change
- Migration `0012`: add `thumbnail_url TEXT` to `organic_posts`.
- `pollPosts` requests `thumbnail_url,media_url` and writes the right one per format.
- `GET /admin/organic/posts` returns posts plus each account's followers (already joined); label computation lives in the frontend helper, next to the grid.

## Out of scope
A/B tags, story insights, linking organic content to sales, changing poll frequency.

## Testing
- Unit test for the label function: thresholds, the 48-hour New rule, the sample-size rule, per-format baseline.
- Manual: both clients' tabs, a failed image, empty state, 375px width.
