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
