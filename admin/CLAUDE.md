# UI standard for the admin app

Read this before building or changing any screen. It exists because screens used to be built from scratch each
time, which gave inconsistent and buggy UI. The rules below are enforced by `src/lib/uiStandard.test.ts`
(runs in `npm test`), so a screen that breaks them fails the build.

## Build from these, never from raw HTML

| Need | Use | Where |
|---|---|---|
| Text field, number, date, password | `<Input>` | `@/components/ui/input` |
| Multi-line text | `<Textarea>` | `@/components/ui/textarea` |
| Dropdown | `<NativeSelect>` (native, best on phones) | `@/components/ui/native-select` |
| Checkbox | `<Checkbox checked onCheckedChange>` | `@/components/ui/checkbox` |
| Button | `<Btn tone="primary \| secondary \| ghost \| danger">` | `components/kit` |
| Delete or other destructive | `<ConfirmBtn>` (two taps, no `confirm()`) | `components/kit` |
| Status label | `<Pill tone="good \| warn \| crit \| accent \| neutral">` | `components/kit` |
| Card or panel | `<Panel>` | `components/kit` |
| A number or small summary | `<Nested title>` (tinted holder, white card inside) | `components/kit` |
| A list of items | `<RowList>` (one surface, hairlines between rows) | `components/kit` |
| Page title | `<PageHeader title subtitle actions>` | `components/PageHeader` |
| Empty, loading, error | `<Empty>`, `<CardSkeleton>`, `<ErrorState>` | `components/kit`, `components/ui` |
| Overlay | `<Sheet>` (bottom on phones, right panel on desktop) | `components/kit` |
| Toast | `useNotify()` | `components/kit` |
| Kanban board (drag between columns) | `<Kanban>` (dnd-kit inside; never raw HTML5 drag) | `components/Kanban` |
| Table | TanStack Table with `components/reui/data-grid` | `components/reui` |

`/styleguide` (team only) shows every component in every state. If a state you need is missing there, add it
there first, then use it.

## Rules

1. **No raw `<select>`, `<textarea>` or `<input>`** (hidden file pickers excepted). Controls style themselves:
   44px tall on phones, 40px from tablet width. Pass layout classes only (`w-full`, `sm:w-auto`), never colour,
   border or radius. `NativeSelect`'s `className` sizes its wrapper.
2. **Colours and radii come from the theme tokens** in `src/index.css`, never hex. The one exception is a
   client's own `brand_color` fallback.
3. **Every data view has all three states**: loading (skeleton), empty (says what to do first), error (with retry).
4. **Check it at 375px wide** before calling a screen done: no horizontal scroll, nothing clipped, long titles
   wrap or truncate (`min-w-0` on flex and grid children that truncate; `grid-cols-1` instead of a bare `grid`).
5. **One primary button per view.** Destructive actions go through `ConfirmBtn`.
6. **Team pages use `PageHeader`** and live in the sidebar groups in `components/AdminShell.tsx`. The client
   scope (which client the team is looking at) comes from `useClientScope()`; do not add per-page client pickers.
7. **A raw `<button>` is for custom widgets only** (tabs, chips, icon buttons). The test keeps a short list of
   files where that is allowed; do not add to it for a plain button, use `Btn`.
8. Do not introduce another component library or a second styling system. Astryx was tried and rejected, see
   branch `trial/astryx`.

## When you change a shared component

Change it once in `components/ui` or `components/kit`, then check `/styleguide` and two real screens at 375px and
desktop width. Never fix a look by overriding it in one page.

## Look (reskin, Nov 2026)

Soft, rounded, floating: the team frame is a translucent sidebar card and a content card on a lavender wash
(tablet and up; phones stay full screen with the bottom tab bar). Rules that keep it consistent:

- Radii: pills (`rounded-full`) for buttons, tabs, chips and the active menu item; `rounded-xl` for inputs;
  `rounded-2xl` for panels; `rounded-3xl` for the shell cards. Set them in the shared components, not per page.
- Panels use `shadow-[var(--shadow-soft)]` and the hairline border. No heavier shadows.
- Active menu item is a white pill; the active tab is an ink (black) pill; the accent purple is for the one primary button.
- Section labels in menus are sentence case, not uppercase.
- Keep text on translucent surfaces at AA contrast (muted text is `text-muted`, never lighter).
- Team pages are left-aligned under the breadcrumb: cap a narrow page with `max-w-*` but never `mx-auto`, so every title starts at the same edge.
- No boxes everywhere: never wrap every item in its own bordered card. Group with a tinted surface (`Nested`, `RowList`,
  kanban columns), keep outlines for the one thing that needs them, and use sentence-case titles (no ALL CAPS headings).
- Charts: dotted horizontal grid only, light bars with the hovered bar solid, dark tooltip.
- Tabs are a grey pill track with a white active pill; black is for nothing but the primary action.

## Local dummy data
`dev/make-seed.py` writes `dev/seed-dummy.sql`: a made-up client (id 900, "Musafar Dummy") with 75 days of ad data, sales, creatives and alerts. Apply it to the **local** D1 only, from the repo root: `npx wrangler d1 execute musawara-ads --local -c wrangler.noR2.jsonc --file admin/dev/seed-dummy.sql`. Then open `/admin/c/900`.

## Navigation rule
Sidebar = work that spans clients (Overview, Clients, Approvals queue, Planning, Board, Spend, CRM, Settings). Everything about one client lives under `/c/:id`, in `ClientFrame`'s menu bar: Overview, Ads, Sales, Alerts always (team), Organic and Shopee only when the client has that source connected, and working material (Approvals, Assets, Brand knowledge, Onboarding, and "Connect Instagram/Shopee" while unconnected) under More. Report and Sync now are buttons on the Overview. Cross-client pages filter with `ClientFilter`; there is no global client switcher. Pages inside `/c/:id` read the client from the route (`ClientScopeOverride`), so a new client page is a route in `App.tsx` plus an entry in `ClientFrame`. Old addresses (/shopee, /organic, /conversions, /assets) redirect to the chosen client. The trend (`MetricTrend`) shows one metric at a time (spend, leads, purchases); do not add ratios or a second axis to it.

## Glass (phone chrome)
`lib/glass.ts` holds the liquid-glass material. Use it only for floating chrome: the phone top bar and tab bar, bottom sheets, select/menu popups, the client menu bar on phones. Never on content cards, never glass on glass. Anything glass carries `data-glass` so `index.css` makes it solid for reduced transparency / more contrast.

## Feel (apple-design rules in use)
Press feedback on touch-down (`.press`, 100 ms); the phone tab bars have one glass pill that glides to the active tab; bottom sheets drag to dismiss from the handle (1:1 tracking, rubber-band when pulled up, release velocity projected with the 0.998 deceleration form decides dismiss or settle); headings track tighter as they grow (index.css); glass turns solid for reduced transparency / more contrast, and animations shorten under reduced motion. Do not drive gestures with CSS keyframes; start any new animation from the element's live on-screen value.

## Standard pieces (use these, do not hand-write)
Banners: `Callout` (tone, title, `to` link, `action`, `compact`). Tables: `DataTable` (columns with `numeric`/`hideBelow`, `onRowClick`, `empty`); EntityTable and the sales data-grid are not on it yet. Labelled form controls: `FormField` + `FormGrid` (the CRM `Field` is the same component). Every one has a demo and its states in /styleguide.

## One of each
Status colour: `TONE` / `Tone` in `lib/tone.ts` (neutral, good, warn, crit, info, accent). `Pill` (sizes sm/default/lg, `dot`, `busy`), `Callout`, `StatusBadge`, the CPA chip and dots in Planning all read it; do not write new `bg-good/12 text-good` strings. Empty state: `Empty` from kit (one component, `compact` inside cards). Choosing a value: `Segmented`; moving between pages: `PillNav`; panels inside a page: `Tabs`. No hand-made radiogroups. Left to move: the status chips in Approvals and the recipient filter in CRM broadcasts.

## Motion
Tokens in index.css: `--ease-spring` (punchy, small overshoot) and `--ease-out`. Pressed: scale 0.94 in 60 ms, spring back in 280 ms (all buttons, tabs, radios, `.press`). Things that appear (select, menu, popover, dialog) use `pop-in`: scale + blur 10px to 0. Anything whose value changes blurs in with `swap-in` via a changing `key` (StatTile, KpiCard, tab totals, counts); moving to another section of the app blurs the new page in, moving between one client's tabs keeps the client header still. "Pick one" controls (Segmented, PillNav) share `SlidingTrack`: one tile glides to the chosen option. Nested corners: inner radius = outer minus padding (chat bubbles: bubble rounded-2xl, 4px padding, media rounded-xl). Reduced motion shortens everything (index.css).

## Winners and boncos
One rule in `lib/rank.ts` (tested): judge against the client's own typical cost per lead, the median of items with leads. 20% or more below = Winning, up to 20% above = On par, up to 50% above = Watch, beyond that or no leads = Weak. `CampaignRanking` (campaigns by spend, with one budget suggestion; team and client) and `CreativeQuadrant` (every ad as a dot, team only, Ads tab) both use it, so colours and labels agree everywhere. Add new "good or bad" views on top of `rank()`, not with new thresholds.

## Guards (src/lib/uiStandard.test.ts)
The test file fails the build on: raw `<input>`, `<select>`, `<textarea>`; raw `<button>` outside the allowlist; old flat cards; hand-written `<label className="block …">` (use `FormField`); hand-written status tints `bg-good/1x` etc. (use `TONE`, `Pill`, `Callout`); the underline Tabs variant and hand-made radiogroups (use `Tabs` for panels, `Segmented` for a chosen value). If a guard blocks you, use the standard piece rather than adding to the allowlist.

## Deploy (production)
From the repo root with Node 24: rebuild the SPA into `out/` (`rm -rf out/admin/assets && (cd admin && npx vite build && cp -R dist/. ../out/admin/)`), then `npx wrangler deploy -c wrangler.noR2.jsonc` (the config is tracked; it is `wrangler.jsonc` without the R2 binding, until R2 is enabled). New migrations: `npx wrangler d1 migrations apply musawara-ads --remote -c wrangler.noR2.jsonc`. Check afterwards that app., portal. and go. answer 200 and `/api/auth/me` answers 401 logged out. Route guards: `src/lib/routes.test.ts` fails if a team page becomes public.

## Health, cron and backups
- `GET /api/health` (public, no secrets): `{ok, app}`, 503 if the database does not answer. `GET /api/health?deep=1` adds the last run of each scheduled job (`ads`, `organic`, `notion`) and answers 503 when one failed or has not run for 150 minutes. Point an uptime monitor at the deep URL. The hourly cron records each job in `app_settings` as `cron:<job>` (`worker/lib/health.ts`).
- Unhandled API errors and failed cron jobs write one JSON line each (`event: "unhandled"` / `"cron_failed"`) to the Workers logs (observability is on): search for the event name in the Cloudflare dashboard.
- Backups, two layers. (1) D1 Time Travel, on by default: restore the production database to any minute of the last 30 days with `npx wrangler d1 time-travel restore musawara-ads --timestamp=<ISO time> -c wrangler.noR2.jsonc` (`time-travel info` shows the current bookmark). (2) `scripts/backup-d1.sh` writes a dated SQL export to `~/musawara-backups` (not in git, it holds real data) and keeps the newest 30. To restore from an export, create a scratch database and `wrangler d1 execute <db> --remote --file <export.sql>`, check it, then decide.

## Language (English / Indonesian)
The code's own English text is the translation key. `lib/i18n.ts` holds the Indonesian dictionary (`ID`); a string with no entry stays English, so nothing breaks while it grows. `LangProvider` (main.tsx) remembers the choice (`ma_lang`, first visit follows the browser language); `LangSwitch` is the one flag button (sidebar, phone top bar and menu, portal header, login). Shared components translate their string props (PageHeader, SectionTitle, Bento, Nested, Empty, ErrorState, Btn, Pill, Callout, FormField, Segmented, DataTable headers, StatTile label, nav labels), so to translate a page you add its sentences to `ID`. Plain JSX text: `<T>Some text</T>`; in code: `const t = useT()`. Marketing metric names (Spend, Leads, CPL, CPA, ROAS, CTR) stay English on purpose. Dynamic sentences built with template strings are not translated yet.

## Roles and access
- `shared/permissions.ts` is the single source: team roles Owner / Ads / Content / CRM (`users.staff_role`), client roles Viewer / Approver (`users.client_role`), the features each opens, and `homePathFor`. `users.role` ('admin' | 'client') stays the audience (which host they sign in on).
- The Worker is the lock: the user, role and assigned clients (`user_clients`) are loaded from the database on every request, so a role change applies on the next click. No role = no access.
- Admin routes sit behind `requireStaff` plus a feature gate in `worker/routes/admin.ts` (`gate(...)`). Add every new admin route to a gate; anything left under `requireAdmin` (= the `settings` feature) is Owner-only. Per-client data: use `scopeSql(user, "col")` for lists, `canReachClient` / `reachVia` / `reachClient` for rows addressed by id, `clientFeature(feature)` for routes under `clientAccess`.
- Non-owner team members only reach assigned clients, and never company-wide rows. Client approvals: only an Approver decides.
- The SPA hides what a role cannot use (`useCan`, `Needs` in `App.tsx`, nav in `AdminShell`), but that is comfort only. `worker/routes/roles.test.ts` drives the real app for every role over every area; add new routes to its MATRIX.
- Migration 0025 adds the columns, `user_clients`, and backfills existing admins as Owner, clients as Approver, and unused invites likewise.
- **Deploy order is a hard constraint:** D1 backup (`scripts/backup-d1.sh`) → apply 0025 to the remote database → deploy the Worker. The new middleware reads `staff_role` / `client_role` on every request, so code live before the migration locks everyone out. The old code runs fine on the new (nullable) columns, so migrating first is safe. Never deploy from the main tree while it holds unreviewed work.

## Sign-in (Better Auth)
- Better Auth 1.7 (`worker/lib/betterAuth.ts`, `makeAuth(env, origin)`) owns sessions (rows in `session`, revocable), password checks and two-factor (TOTP + backup codes). Password guessing is limited only by the Worker-level `AUTH_LIMITER` (30 per minute per IP): Better Auth does not rate-limit its server-side `api.*` calls, which `/login` uses. Its own two-factor endpoints do lock out. Per address, `/login` also pauses sign-in after 8 wrong passwords in 15 minutes (table `login_failures`, migration 0027; counted for unknown e-mails too so it reveals nothing; the cost is that someone can pause a known address for up to 15 minutes by guessing at it). Users stay in our `users` table (integer ids, our role columns); passwords live in `account` (`providerId='credential'`). Our PBKDF2 hasher is plugged in, so the old hashes work unchanged. `users.password_hash` is kept and kept in step on password changes, so a rollback to the previous release still logs everyone in.
- Our routes in `worker/routes/auth.ts` wrap it: `/login` (host gate, 2FA step), `/logout`, `/password` (signs out other devices), `/invites/*`, `/bootstrap`, `/reset` (one-time link). Only the Better Auth endpoints in `BA_PATHS` are reachable; sign-up, delete-user, change-email are closed. We create users ourselves (never through Better Auth): the user row, the `account` row and the invite's used mark go in one `DB.batch`.
- Owners (Settings → Team): "New password link" (24 h, one use; there is no e-mail sender yet) and "Reset 2FA" (removes the second factor and signs the person out).
- Staff two-factor is enforced by `REQUIRE_STAFF_MFA=true` (a Worker var, off by default). On, a team member without a second factor gets 403 `mfa_required` everywhere except sign-in and the enrol routes, and the SPA shows only the set-up screen. Turn it on only after every Owner has enrolled and saved backup codes.
- Needs the `nodejs_compat` flag (set in both wrangler configs). Better Auth cookies: `ma.session_token` (`__Secure-` prefix on https). `JWT_SECRET` signs them and also encrypts every TOTP secret and backup code at rest, so **never change `JWT_SECRET`** once anyone has enrolled (it already encrypts the stored Meta and Shopee tokens); a new value would break every second factor and those tokens.
- Tests: `worker/testkit/session.ts` gives a real session cookie for a seeded user (`sessionCookie(env, id, origin)`); seeded users that sign in with a password need `backfillAccounts(DB)`. Test emails must be valid (`a@x.test`), Better Auth validates them.
- The old `staff_mfa*` tables and `lib/mfa.ts` (another session's unfinished MFA) are unused; the tables are left in place (drop in a later migration).
- Cut-over: backup, apply migration 0026, deploy, then run once (idempotent, closes the gap for anyone created or re-passworded by the old code in between):
  `INSERT OR IGNORE INTO account (id, accountId, providerId, userId, password, createdAt, updatedAt) SELECT 'legacy-' || id, CAST(id AS TEXT), 'credential', CAST(id AS TEXT), password_hash, datetime('now'), datetime('now') FROM users WHERE CAST(id AS TEXT) NOT IN (SELECT userId FROM account WHERE providerId='credential');`
  Everyone is signed out once (old `ma_session` JWT cookies are no longer read). Rollback = redeploy the previous version; it reads `users.password_hash` and issues its own cookies. Rolling forward again needs the statement above again.

## CRM screen
- The CRM is an app-like screen: `AdminShell` gives `/crm/*` a window-high frame (nothing around it scrolls), `CrmLayout` fills it, the inbox panel fills what is left and each pane scrolls inside itself; other CRM pages scroll inside the frame. `lib/appLock.ts` also locks pinch/ctrl+wheel zoom and the viewport scale while a CRM page is open (browser Cmd/Ctrl +/- cannot be blocked).
- Links in message text are made clickable by `lib/linkify.ts` + `components/Linkified.tsx`: only http(s) and www. addresses, rendered as React nodes (no HTML), opened in a new tab with `noopener noreferrer nofollow`.
- The sidebar keeps identical row heights collapsed and open (`h-5` group rows, `h-11` header), so items do not move when it opens or closes.

## CRM pipeline and custom fields
- Per WhatsApp number (the switcher's number), stored on the platform in D1 (migration 0028), keyed by (gateway number id, phone); contacts stay in the gateway. Routes: `worker/routes/pipeline.ts` at `/api/pipeline?account=<id>` (CRM feature; non-owners only reach numbers linked to their clients via `lib/waAccounts.ts`, the same rule as the CRM proxy).
- Stages: name, colour (token names only), kind open/won/lost, order; a number gets New/Contacted/Interested/Proposal/Won/Lost on first use. A card = one contact on the board with stage, deal value (Rp), expected close, and a history of moves (`crm_stage_events`). Deleting a stage that has cards needs `move_to`.
- Fields: text, number, date, choice, yes/no, link; typed and validated server side; values per contact. Shown on the card sheet and the contact form; the Contacts table has Stage and Details columns.
- UI: `pages/crm/pipeline/` (board uses the shared `Kanban`; sheets for card, add contacts, customize). Deploy order: apply migration 0028, then deploy.
- Follow-ups, notes and owner (migration 0029): `worker/routes/crmTasks.ts` at `/api/crm-tasks?account=<id>` (tasks with due date and assignee, notes, per-contact timeline of notes + stage moves + tasks, `/summary` for the tab badge); a lead's `owner_user_id` is limited to Owners and CRM members assigned to the number's brand (`eligibleOwners` in `lib/crmGuard.ts`, which also holds the shared number-access middleware). `GET /api/pipeline/report` feeds the Funnel view (cards that ever reached each stage come from `crm_stage_events`, so history starts when the board is first used).
- Deploy order for the CRM data features: apply 0028 and 0029, then deploy.
- Ads, internal notes and required fields (migration 0030): the gateway (wa-crm, `messages.ad_json`, `extractAd` in `wa.js`) stores the Click-to-WhatsApp ad of a person's first message and returns it as `ad` on `GET /conversations/:phone`; `worker/routes/crmAds.ts` (`/api/crm-ads?account=&id=<Meta ad id>`) resolves it to our ad, ad set, campaign and picture from `entities`, limited to the number's brand. The inbox shows it as a card at the top of the thread (`inbox/AdCard.tsx`). The WhatsApp Web field names for ad context move between builds: `extractAd` reads several candidates, so check the first real ad message after a gateway update. Internal notes are the existing `crm_notes`; the thread shows them inline (amber, "not sent to the customer") and the composer has a Reply / Internal note switch (notes also work while WhatsApp is disconnected). `crm_field_defs.required` blocks moving a card INTO a Won stage until those fields have a value (import does not enforce it); `lib/crmPresets.ts` holds the brand field sets (Musafar, NurAlive) that Customize → Fields adds by label, idempotently.
- Detected answers: `pages/crm/inbox/detect.ts` (plain rules, browser only, tested in `src/lib/detect.test.ts`) reads recent chat for values of the number's custom fields and offers them above the composer ("From the chat"); nothing saves without a click.
- Gateway list speed: `/contacts?lite=1` (no notes) plus gzip; `useGateway` caches answers per number (cleared on sign-out) and `CrmLayout` preloads CRM screens. Anything memoised on gateway or pipeline data must use stable references: a new array each render once looped the broadcast recipient count.
- Templates may carry one attachment (gateway `/templates/:id/media`); picking the template in the chat or a broadcast attaches it.
- Import (Contacts → Import): the gateway still imports name, number, tags and notes. Stage, deal value, closing date, owner and custom-field columns of the same file go to `POST /api/pipeline/import` in groups of 100 after the contacts exist (`pipeline/importMap.ts` maps the columns; headers `Tahap/Stage`, `Nilai deal`, `Perkiraan closing`, `Pemilik/Owner/Responsible user`, and any column named like a custom field, with a trailing "(contact)" ignored). Owner names that are not on the number's team are ignored; empty cells never erase saved values. "Download template" builds a CSV from the number's own stages and fields (`pipeline/template.ts`).
