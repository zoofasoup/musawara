# Musawara

Public website for Musawara Creative (PT Musacreativa Digital Nusantara), the
in-house creative team of MUSA Group.

## Platform

| Host | Responsibility | Worker |
| --- | --- | --- |
| `musawara.id` | Next.js static export and platform API | `musawara-id` |
| `app.musawara.id` | Internal team SPA | `musawara-portal` |
| `portal.musawara.id` | Client SPA with tenant-scoped API access | `musawara-portal` |
| `go.musawara.id` | Small public tools | `musawara-go` |

The app and portal share the Vite frontend in `admin/`. Their Worker forwards
requests to the main Worker through a Cloudflare service binding. The main
Worker uses D1 for platform data and Supabase for public content and applications.

## Development and verification

Use Node 22 or newer, then install both lockfiles.

```bash
npm ci
npm ci --prefix admin
npm run check
npm test --prefix admin
npm run build
```

`npm run dev` serves the public site. Without Supabase credentials it uses
development fixtures containing unverified figures. A production build with no
Supabase credentials produces empty content and keeps the static pages available.
See `.env.example` for build environment variables.

To test the Workers locally, apply D1 migrations with
`npx wrangler d1 migrations apply musawara-ads --local -c wrangler.noR2.jsonc`.
Build the assets and run `wrangler dev --local` with the main, portal and Go
configs in separate terminals and on different ports. Keep local secrets in
`.dev.vars` and use only staging accounts and test data.

## Deploying with Cloudflare Workers

The Next.js site exports to `out/` and the build copies the Vite bundle into
`out/admin/`. Publishing Supabase content requires a new site build.
Set `NEXT_PUBLIC_SITE_URL=https://musawara.id` and enable
`NEXT_PUBLIC_SITE_INDEXABLE` when the public content is approved.

Use `wrangler.jsonc` when the production Worker has its `MEDIA` binding.
`wrangler.noR2.jsonc` is the production config for the account without that
bucket. Check the active bindings and Worker versions before choosing. The
portal and Go configurations are in their respective directories. Run
`npx wrangler deploy --dry-run -c <config>` before a deployment. Keep the
production Worker names, service binding and scheduled jobs intact.

The careers form needs `CAREERS_ENABLED=true` and an HTTPS
`CAREERS_PRIVACY_URL` at build time. Set `CAREERS_ENABLED=true` in the deployed
Worker config after the Supabase migration and staging checks. Configure
`SUPABASE_URL` and `SUPABASE_SECRET_KEY` on the Worker. Optionally set
`RESEND_API_KEY`, `CAREERS_NOTIFY_FROM`, and `CAREERS_NOTIFY_TO` for notifications.

## Database

```bash
# In the Supabase SQL editor, in order:
supabase/migrations/0001_public_site.sql   # schema + RLS
supabase/migrations/0002_worker_only_applications.sql
supabase/seed.sql                          # optional seed for a fresh project
```

`supabase/seed-preview.sql` publishes the draft figures for **local design
review only**. Never run it against production — it marks unconfirmed numbers as
verified.

RLS is enabled on every table. RLS controls published content reads. The careers Worker uses its server-only
Supabase key when it stores applications. Anonymous and authenticated browser
roles have no access to that table.

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

- Confirm the published portfolio, copy, company address, contact channels,
  ledger figures, and any salary ranges with their owners.
- Verify HTTPS redirects and the canonical host. Review staff MFA, client
  isolation, invite and share-link access, and sensitive integration secrets.
- Verify accessibility with keyboard and screen reader, including on mobile.
- Verify alerting, cron health, backups and rollback on a staging environment.

## Design system

The public site follows the app theme in `admin/src/index.css`:

| Token | Hex | Use |
|---|---|---|
| `ink` | `#141824` | dark ground, body text |
| `paper` | `#FFFFFF` | page ground |
| `rule` | `#E0E3EC` | hairlines |
| `purple` | `#7A2DE3` | accent — links, focus, active |
| lime | `#CDFE64` | **figures only** |

Two rules the code enforces rather than documents:

1. **Lime is not a Tailwind colour.** It is a bare custom property read only by
   `.figure`, so `bg-lime` / `text-lime` utilities do not exist. If you want the
   accent somewhere that is not a numeral, the answer is no.
2. **Lime is illegal on paper** (≈1.03:1 contrast). `.figure` resolves to ink on
   the light ground and to lime inside `.u-inverted`. This is why the home
   ledger sits on the dark ground.

Type is TASA Explorer (display and headings) and TASA Orbiter (body, UI, figures),
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

## Release verification

Run the typecheck, admin test suite and production build for each candidate.
Verify the real deployment with the configured data and credentials, including
the portal, Go, the calculator, redirects and the 404 page.
