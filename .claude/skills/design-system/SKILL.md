---
name: design-system
description: Rules for building or changing UI in app/ so every screen stays on the design system (tokens, shadcn on Base UI, sidebar shell). Use whenever you touch a component, page, or style under app/src.
---

# App design system

The app is a Vite + React 18 + Tailwind v4 workspace in `app/`, with
shadcn/ui components generated on top of **Base UI** (not Radix). Every
visual decision comes from the designer's Figma file; the link lives
outside this repo, ask the team for it. The code side of that file is
the token layer in `app/src/index.css`, the shell in
`app/src/components/shell/`, and the primitives in
`app/src/components/ui/`.

## Before writing any UI

1. Open the design frame for the screen or component you are changing
   and read its real values (sizes, spacing, colours, type). Do not
   design from memory or from the old screen.
2. Map every value to an existing token or component below. If there is
   no match, add the token to `app/src/index.css` first, in both
   `:root` and `.dark`, and then use it. Never inline the value.
3. Check what the shell already provides (page padding, header,
   breadcrumbs, actions) so the page does not repeat it.

## Tokens (source of truth: `app/src/index.css`)

Components use semantic classes only. The check script fails on raw
colours, so there is no judgment call here.

| Need                     | Use                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Page background / text   | `bg-background`, `text-foreground`, `text-foreground-secondary`, `text-foreground-disabled`                                             |
| Card or panel            | `rounded-xl border bg-card` (radius 10, hairline `border-border`)                                                                       |
| Popovers, menus          | `bg-popover text-popover-foreground`                                                                                                    |
| Primary action           | `bg-primary text-primary-foreground` (black on light, white on dark)                                                                    |
| Secondary surfaces       | `bg-secondary`, `bg-muted`, `bg-accent` (hover rows), `bg-surface`, `bg-surface-hover`, `bg-row-selected`                               |
| Dimmed text              | `text-muted-foreground`                                                                                                                 |
| Status                   | `bg-success text-success-foreground border-success-border`, same for `warning`, `info`, `error`, `purple`; `-soft` for the lighter tint |
| Destructive              | `bg-destructive`, `text-destructive`, `border-destructive`                                                                              |
| Inputs and focus         | `border-input`, `ring-ring`                                                                                                             |
| Sidebar                  | `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-accent`, `border-sidebar-border`                                                   |
| Chips, skeletons, toasts | `bg-chip text-chip-foreground`, `bg-skeleton`, `bg-toast text-toast-foreground`                                                         |
| Sui brand blue           | `text-sui`, `bg-sui/10` (coin icon and logo only)                                                                                       |

Rules:

- No hex, `rgb()`, `hsl()`, `oklch()`, `color-mix()` in components.
- No Tailwind palette shades (`bg-blue-500`, `text-gray-400`,
  `border-emerald-300`). `white` and `black` are allowed only for
  overlays and for the logo tile.
- Every new colour has a light value in `:root` and a dark value in
  `.dark`. The designs are light-only; derive the dark value from the
  neighbouring tokens and say in the PR that it needs design sign-off.
- Status colours are a coloured foreground over a translucent tint of
  the same hue, so they work on any surface. Keep that pattern.
- Blue is a status colour (`info`) or the Sui brand, never an accent.
  The theme is monochrome.

### Type

- Pixel-named scale with line-height and tracking baked in:
  `text-10`, `text-11`, `text-12`, `text-13`, `text-14`, `text-15`,
  `text-16`, `text-24`, `text-30`, `text-32`, `text-40`.
- Body and controls are `text-13`. Secondary text `text-12`. Labels and
  breadcrumbs `text-11 uppercase`. Chips `text-10 uppercase`. Page
  titles `text-30 font-bold`. Card titles `text-16 font-semibold`.
- No arbitrary sizes (`text-[13px]`). The default Tailwind scale
  (`text-sm`, `text-lg`) is legacy and goes away as screens are
  migrated; do not add new uses of it.
- `font-sans` is the UI face, `font-mono` for addresses, digests, hex
  and amounts that need alignment. Tables get `tabular-nums`
  automatically.

### Spacing and shape

- Radius: `rounded-md` (6) on controls, `rounded-xl` (10) on cards,
  `rounded-2xl` (12) on dialogs and table shells. Pills use
  `rounded-full`.
- No shadows except `shadow-toast`. Depth comes from borders and
  surface changes.
- Page content starts with the `page-shell` utility (page padding) and
  a `PageHeader`; do not add a max-width.
- Control heights: buttons `h-9` (default) and `h-7` (sm); menu rows
  `h-9`; sidebar rows `h-8`. Icons inside controls are `size-4`.

## Components

- Reuse `app/src/components/ui/` before writing markup. Add missing
  shadcn components with `npx shadcn@latest add <name>` from `app/`
  (this repo uses the `base-nova` style), then adjust them to the rules
  here.
- Base UI, not Radix: compose with the `render` prop, never `asChild`.
  State attributes are `data-open`, `data-active`, `data-checked`.
  Menu labels and items go inside a `DropdownMenuGroup`. Menu and
  popover triggers must be the element that owns the ref: render a
  plain `DropdownMenuTrigger` with classes, not a trigger wrapping a
  `Button`.
- React 18: any generated wrapper that a form or a ref consumer may
  touch (`Button`, `Input`, `Textarea`, `Checkbox`, `Switch`, ...) is
  wrapped in `React.forwardRef`.
- Every interactive root carries `cursor-pointer` itself: buttons, menu
  items, select items, tabs, switches, rows that navigate. Never add a
  global or `@layer base` cursor rule. Generated shadcn items ship with
  `cursor-default`; replace it.
- Page chrome: `PageHeader` (title, breadcrumb, address with copy,
  description, actions) on every page. Status pills are `Chip`.
  Tabs are the custom `Tabs` (`underline` or `pills`). Dialogs go
  through `Modal` / `ModalHeader` / `ModalContent` / `ModalActions`.
- Tooltips on every icon-only control, including the collapsed sidebar
  rail.
- Feedback states are shared: `toast` from `@/lib/toast` (never `sonner`
  directly; errors persist with a close button, everything else closes
  after four seconds, `link` adds the underlined action), `Skeleton`,
  `SkeletonRows` and `SkeletonPage` from `ui/skeleton` for loading
  (shaped like the content, no spinners), and `EmptyState` / `ErrorState`
  from `ui/empty-state` for nothing-here and failed-to-load.
- Give new interactive elements a stable `data-testid` so the e2e suite
  can find them.

## Layout and themes

- Desktop layout is the shell: 232px sidebar, 48px icon rail when
  collapsed (auto-collapses below 1280px), a Sheet below 768px. Pages
  never assume a fixed width beyond that.
- Light and dark both ship. Check every change in both; the theme
  picker is in the sidebar footer.
- Designs come at 1440 wide only. Decide the mobile layout yourself,
  stacking the header actions under the title and letting tables scroll
  horizontally.

## Before you finish

From `app/`:

```bash
bun run lint
```

This runs ESLint and the design token check
(`scripts/check-design-tokens.ts`). The check fails on raw colours,
palette shades and arbitrary text sizes, and reports how much of the
legacy text scale is left (`--verbose` lists the files, `--strict`
fails on them). A line that must keep a raw value ends in
`// design-tokens-ignore`, with a reason next to it.

Then:

- Compare the result with the design frame at 1440 and at a phone
  width, in light and dark.
- Run the Playwright suite from `e2e/` with `bun run test`. If another
  checkout shares the default database, point `E2E_DATABASE_URL`,
  `E2E_API_PORT` and `E2E_APP_PORT` at values of your own.
- In the PR, list any value you invented (dark colours, hover and
  disabled states, mobile layout) so design can review it.
