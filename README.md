# Musawara

Public website for Musawara Creative (PT Musacreativa Digital Nusantara), the
in-house creative team of MUSA Group.

This is **Phase 1** of the build spec: the public site only. The internal
brand-knowledge admin dashboard (Phases 2–4) is not built yet, but the database
schema here is shaped so those tables hang off `clients` without a rewrite.

---

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · Supabase (Postgres)
· **static export deployed to Cloudflare Pages**.

> Next 16 has breaking changes against older App Router habits: `params` and
> `searchParams` are Promises, Turbopack is the default bundler, and `middleware`
> is now `proxy`. The bundled docs in `node_modules/next/dist/docs/` are the
> source of truth — read them rather than relying on memory.

## Running locally

```bash
npm install && npm run dev
```

Without Supabase credentials `npm run dev` serves a **development fixture**
(`src/lib/fixtures.ts`) so the site runs out of the box. The fixture contains
unverified figures and invented salary ranges, and is only ever served in
development: `src/lib/content.ts` keys on `NODE_ENV`, so any production build
serves empty content instead. Pages fall back to their empty states rather than
failing the build, which keeps genuinely static routes — notably the price
calculator — deployable with no database at all.

To run against a real database, copy `.env.example` to `.env.local` and fill it
in.

## Deploying (Cloudflare Pages)

The site builds to a static export in `out/`. Connect the GitHub repo in
Cloudflare Pages with:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `out` |
| Node version | 20 or newer |

Environment variables (Settings → Environment variables). All are optional —
without them the site still deploys, pages render their empty states, and the
careers form reports honestly that it is not connected:

```
NEXT_PUBLIC_SUPABASE_URL       # read at build time to prerender content,
NEXT_PUBLIC_SUPABASE_ANON_KEY  # and at runtime by the careers endpoint
NEXT_PUBLIC_SITE_URL           # https://musawara.id
RESEND_API_KEY                 # optional: careers email notifications
CAREERS_NOTIFY_FROM
CAREERS_NOTIFY_TO
```

Content is prerendered at build time, so **publishing a change in Supabase
requires a redeploy**. Trigger one from the Pages dashboard, or add a Deploy
Hook and call it after editing content.

### What static export costs

`output: 'export'` rules out Server Actions, rewrites, redirects, headers, ISR,
and the default `next/image` loader. Concretely:

- The careers form posts to a Cloudflare Pages Function
  (`functions/api/apply.ts`) rather than a Server Action.
- `/nuralive/price-calculator` resolves because Cloudflare Pages serves a
  directory index; there is no rewrite. Verified against a directory-index
  static server, not against Cloudflare itself — confirm on first deploy.
- `/work/[slug]` falls back to the three known brand slugs when the database is
  empty, because static export fails outright on a dynamic route with no params.

Moving to `@opennextjs/cloudflare` on Workers would restore all of it, and will
probably be necessary for the Phase 2 admin dashboard, which needs auth and SSR.

## Database

```bash
# In the Supabase SQL editor, in order:
supabase/migrations/0001_public_site.sql   # schema + RLS
supabase/seed.sql                          # clients, case studies, draft rows
```

`supabase/seed-preview.sql` publishes the draft figures for **local design
review only**. Never run it against production — it marks unconfirmed numbers as
verified.

RLS is enabled on every table. Anonymous visitors can read only rows where
`is_published` is true, and can insert into `job_applications` but never read it.

### Publishing figures

Two spec rules are enforced as CHECK constraints, not as review discipline:

| Constraint | Effect |
|---|---|
| `published_metric_must_be_verified` | A `metric` ledger row cannot be published until `verified_at` is set by hand. |
| `published_role_must_show_salary` | A job opening cannot be published without both `salary_min` and `salary_max`. |

So publishing a number is a deliberate two-step act:

```sql
update ledger_entries
set verified_at = now(),
    source_note = 'IG insights export, <date range>',
    period      = 'Jan 2025 – Jun 2026',
    is_published = true
where id = '<row id>';
```

## Before launch

Everything below is unconfirmed and will ship wrong if not corrected.

- [ ] **Every ledger figure.** All seeded metrics are drafts from the spec. Confirm each against source data, then set `verified_at` and `is_published`.
- [ ] **Company contact details** in `src/lib/company.ts` — office address, email, and WhatsApp number are placeholders marked `NEEDS CONFIRMATION`.
- [ ] **Salary ranges** on both seeded roles.
- [ ] **Editorial pass on all Bahasa copy.** Case studies, services, and about-page copy are drafts written from the spec, not from interviews.
- [ ] **Domain** is musawara.id; set `NEXT_PUBLIC_SITE_URL` to match.
- [ ] Resend credentials, or careers notifications silently no-op (applications still save).
- [ ] Confirm the contact email domain — the Google Workspace account is on `musawaracreative.com`, not `musawara.id`.

## Design system

Palette is sampled from the official logo artwork in `public/logo/`, and
supersedes spec §6.3 where they conflict:

| Token | Hex | Use |
|---|---|---|
| `ink` | `#1F261F` | dark ground, body text |
| `paper` | `#F2F2F2` | page ground |
| `rule` | `#DCDBD7` | hairlines (derived, not sampled) |
| `purple` | `#7B23D8` | the only accent — links, focus, active |
| lime | `#CDFE64` | **figures only** |

Two rules the code enforces rather than documents:

1. **Lime is not a Tailwind colour.** It is a bare custom property read only by
   `.figure`, so `bg-lime` / `text-lime` utilities do not exist. If you want the
   accent somewhere that is not a numeral, the answer is no.
2. **Lime is illegal on paper** (≈1.03:1 contrast). `.figure` resolves to ink on
   the light ground and to lime inside `.u-inverted`. This is why the home
   ledger sits on the dark ground.

Type is TASA Orbiter (display, headings, figures) and TASA Explorer (body, UI),
self-hosted via `next/font`. Neither family has an italic or a monospace, so
`font-synthesis` is disabled and figures use `tabular-nums` for column alignment
instead of a monospaced face.

Motion is one staggered reveal on the home ledger and nothing else, disabled
under `prefers-reduced-motion`.

### Known issues

- Next has no font-metric overrides for the TASA families
  (`Failed to find font override values`), so the fallback is not metric-matched
  and there is minor layout shift on font swap. Fixable by self-hosting the
  files with explicit `size-adjust` values if it proves visible.
- Logo artwork is PNG because that is what the brand folder contains. Swap in
  SVG when exported and drop the `width`/`height` props in `src/components/Logo.tsx`.

## Verified

First load 223 KB (1 MB budget) · no console errors · no horizontal scroll at
375px · typecheck clean for both the app and `functions/` · static export builds
and every route resolves under directory-index serving, including
`/nuralive/price-calculator`.

Not verified: the migration SQL has never been executed against a real Postgres
(no Docker on the build machine), and nothing has been deployed to Cloudflare
yet.
