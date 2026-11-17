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
