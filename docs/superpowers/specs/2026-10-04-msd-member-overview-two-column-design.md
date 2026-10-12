# msd admin: Member (Vendor) detail Overview — 70/30 two-column redesign

Date: 2026-10-04
App: `apps/msd` (React 19 + Vite), admin console
Builds on: `~/.claude/plans/http-localhost-4200-account-vendors-f01e-zippy-cascade.md` (task 7 of 11 — this
spec; task 8 builds exactly what is specified here) and `docs/superpowers/specs/2026-09-28-vendor-branch-management-design.md`
(the already-shipped Branches/Deals/Therapists CRUD pages this Overview links out to).
Touches: `apps/msd/src/app/pages/account/vendors/vendor-detail-page.tsx` (the `!section` branch only —
roughly lines 362–391 today, plus `SetupCard`/`NavCard`/`MemberSummaryCard` below it). No other section
(`profile`, `branches`, `deals`, `therapists`, `products`, `customers`, `orders`) changes.

## Why

The current Overview is a single left-hand column of two stacked `CardGrid` sections (four
"Setup progress" tiles, then two "Records" tiles) with the member's profile card pinned to the
right only by a CSS grid that already exists (`.summary-layout`, `styles.css:133`) but is
under-used by today's content — the admin scrolls past "Setup progress" and "Records" as two
separate headed sections before the identity card ever changes, and the four setup tiles and
the two record tiles read as equally-weighted, undifferentiated grids with no visual story
("do this first"). The stakeholder asked for a workspace-style page where the member's identity
(right) and the most-used actions (left) are both visible without scrolling, and where the one
mandatory first action — adding a branch — is unmistakable rather than just another tile in a
row of four.

## Data facts (`vendor-setup.ts`, verified)

`SetupStep` (`vendor-setup.ts:5-17`): `{ key, label, done, locked, lockedReason?, missing: string[], count? }`.
`getSetupSteps(vendor)` returns one step per key (`profile | branches | deals | therapists | products`).
This spec's counter cards map 1:1 onto the four non-profile steps and change nothing about how
`getSetupSteps` computes them — only how their state is drawn.

Lock rules, already correct in code (Task 1 of the plan fixed Products):

- **Branches** — `locked = !profileDone`. Unlocks once the profile is complete. No branch
  dependency on anything else.
- **Deals**, **Therapists** — `locked = !branchDone` (`branchDone = vendor._count.branches > 0`).
  Each locked until at least one branch exists, independently of each other.
- **Products** — `locked = !profileDone`. Independent of branches. **Never** shows the locked
  state once the profile is done, even with zero branches.
- **Customers**, **Orders** — never locked; not `SetupStep`s at all, always reachable.

`step.done` is `count > 0` for deals/therapists/products, and `branchTotal > 0` for branches.
`stepText(step)` (`vendor-detail-page.tsx:450-462`) already produces the right copy for two of
the three states this spec needs — locked → `step.lockedReason`; unlocked — `{missing[0] or
count} · {Add|Edit}` keyed off `step.done`. This spec reuses `stepText()` unchanged for every
card except the Branches zero-item case (see §2c), which needs one special-cased word.

## Routes

No new routes. This is a visual restructure of the existing `/account/vendors/:vendorId`
Overview route (`!section` branch of `VendorDetailPage`). Every card's destination is an
existing route already shipped by Tasks 1–6: `/account/vendors/:id/branches`,
`/account/vendors/:id/deals`, `/account/vendors/:id/therapists`, `/account/vendors/:id/products`.
Customers/Orders stay on the Overview page itself (no navigation — see §3).

## 1. Layout grid

Reuse `.summary-layout` (`styles.css:133-138`) exactly as it exists today — do not introduce a
new grid class:

```css
.summary-layout { display: grid; grid-template-columns: 7fr 3fr; gap: 20px; align-items: start; }
@media (max-width: 900px) { .summary-layout { grid-template-columns: 1fr; } }
```

- **Desktop/wide-tablet (≥901px)**: two columns, 70% left / 30% right, 20px gap. This is wider
  than the CLAUDE.md desktop breakpoint (905px) by 4px purely because that's the breakpoint
  `.summary-layout` already ships at for the `two-pane` class it shares a media query with —
  not worth a second breakpoint for 4px, so this spec keeps the existing number.
- **Mobile + narrow tablet (≤900px)**: single column, full width, 20px vertical gap between
  stacked blocks (CardGrid's own row gap still applies inside the counter-card row).
- **Stacking order on narrow screens**: counter cards (§2) → Customers/Orders switcher (§3) →
  Profile summary card (§4), in that order, top to bottom. This is the DOM order already used
  today (left-column content before the right-column `<section>`) with no CSS `order` override,
  so Task 8 gets this for free by keeping the same JSX nesting — it does **not** need new
  responsive logic. Rationale: on a phone, the admin's next action (add a branch, open Deals)
  is more urgent than re-reading identity they already know; the profile card is confirmable by
  scrolling, not the first thing needed.

No stepper, no new shared-ui component. Every piece below composes `sky-tile-card`,
`sky-card`/`List`/`Divider`/`FilledButton`/`OutlinedButton` (all already imported in this file)
and `ChipNav` (already used elsewhere in `apps/msd`), per this repo's "shared-ui stays
app-neutral, reuse at the component level" rule.

## 2. The four counter cards (left, row 1)

Component: `sky-tile-card` (unchanged choice — already used for this exact job as `SetupCard`;
no concrete reason to switch away from it). Wrapped in the existing `CardGrid layout="compact"`
(`card-grid.tsx:14` — 160px-minimum auto-fill columns). Kept deliberately unchanged from today's
`CardGrid` usage: the 70%-column width (≈879px at a 1280px page) divided by 160px-min columns
with a 24px gap naturally lands all four cards on one row at desktop/tablet widths and wraps to
2×2 at mobile widths (≈343px container ÷ 160px columns ≈ 2) — the fixed count of 4 cards makes
`compact`'s auto-fill behave like an explicit 4-column/2-column grid without writing one.

Order (unchanged): Branches, Deals, Therapists, Products — the unlock order, left to right.

Three states, keyed off `step.locked` / `step.done` / `step.count`:

### a. Locked (disabled — only reachable by Branches/Deals/Therapists pre-prerequisite; never Products)

- `color="tertiary"` `variant="filled"` `icon="lock"` `icon-style="surface"` — exactly today's
  `SetupCard` locked styling (CLAUDE.md: "locked/warning states use the tertiary role exactly as
  SetupCard already does today"). No new color.
- `headline` = `step.label` (e.g. "Deals"). `text` = `stepText(step)` = `step.lockedReason`
  ("Finish the profile first" / "Add a branch first").
- **No `href`.** `sky-tile-card` renders no anchor when `href` is omitted, so the card is plain
  text — not in the tab order, not a link, not announced as interactive. This stays correct for
  the disabled state: there is genuinely nothing to activate, and WCAG 2.2 doesn't require a
  non-actionable element to be focusable. A screen reader's linear/virtual-cursor reading still
  encounters the headline + lock reason as static text, so the "why" is never silently lost —
  only the (non-existent) action is skipped. No `aria-disabled` needed since there's no
  interactive role to begin with.

### b. Unlocked, zero items ("Add")

- `href` = that section's route, so the whole tile is a focusable, keyboard-activatable link
  (`md-ripple` + `md-focus-ring` state layer already built into `sky-tile-card` per
  `m3-surface.ts:126-134` — Tab reaches it, Enter/Space activates it, and the M3 focus ring is
  never suppressed).
- `icon` = `STEP_ICON[step.key]` (`store` / `sell` / `spa` / `inventory_2` — unchanged from
  today). `icon-style="surface"` for Deals/Therapists/Products (neutral icon chip, matching the
  rest of the app's "not done" tiles).
- `headline` = `step.label`. `text` = `stepText(step)` → `"No {noun} yet · Add"` (unchanged
  logic; `step.done` is `false` so the suffix is already "Add").
- **Colour, Deals/Therapists/Products**: `color="surface-high"` `variant="filled"`. Deliberately
  *not* `tertiary` (that's reserved for locked/warning, per the house colour rule) and *not*
  `secondary` (that's reserved for done, so "done" stays visually distinct from "needs action").
  `surface-high` reads as a calm, neutral "ready" tile — one step up in emphasis from the plain
  `surface` used by Customers/Orders (§3), since these three *do* need an action, just not an
  urgent one.
- **Colour, Branches specifically — the "start here" treatment**: `color="primary"`
  `variant="filled"` `icon-style="filled"` (i.e. omit the attribute — `sky-tile-card`'s default
  icon fill is the accent/primary pair, per `m3-surface.ts:149-162`). `text` overrides
  `stepText()`'s generic "No branch yet · Add" with **"No branch yet · Start here"** — the one
  hardcoded copy exception in this spec, applied only when `step.key === 'branches' &&
  !step.done && !step.locked`.
  - **Justification against the 60/30/10 rule**: `primary` is the same M3 role every
    `FilledButton` in this app already uses as its container colour — it is this codebase's one
    reserved "this is the action to take" colour, the 10% slice. Branches is the single
    mandatory gateway (nothing else unlocks until it exists), so giving it the same visual
    weight as a primary CTA button is consistent with the convention, not a new one: there is
    exactly one `primary`-coloured tile on the page at this state, same as there would be
    exactly one primary button. The moment a branch exists, this card drops to the same
    `secondary` "done" treatment as every other done tile (§2c) — the distinguishing colour is
    transitional, present only while it's true that nothing else can be done yet.

### c. Unlocked, has items ("count + Edit")

- `href` = that section's list route (unchanged).
- `icon="check_circle"`, `icon-style="surface"`. `color="secondary"` `variant="filled"` —
  unchanged from today's "done" `SetupCard` styling.
- `headline` = `step.label`. `text` = `stepText(step)` → `"{count} added · Edit"` or, when live
  counts differ from total (e.g. a deal paused), `"{live} of {total} live · Edit"` — unchanged,
  already handled by `formatCount`/`stepText`.

### Keyboard/focus/ARIA summary for the row

- Locked cards: no link, not focusable, text content still readable by assistive tech in
  document order (confirms current behaviour is correct — no change).
- Unlocked cards (both b and c): one stretched anchor per tile (`.stretch` in `m3-surface.ts:136-142`),
  visible `md-focus-ring` on `:focus-visible` (never removed, per the non-negotiable), label is
  the tile's own headline + text content read together (no separate `aria-label` needed — the
  text already states the entity and the action, e.g. "Branches, No branch yet, Start here").
  Touch target: `sky-tile-card`'s full surface is well over the 48×48px minimum at any grid
  width used here (160px min column).
- Colour is never the only signal: every state also carries a distinct icon (`lock` vs the
  entity icon vs `check_circle`) and distinct trailing copy ("Start here" / "Add" / "Edit"), so
  colour-blind users get the same information through icon + text.

## 3. Customers/Orders switcher (left, row 2)

Replaces today's "Records" `CardGrid` of two `NavCard`s (`vendor-detail-page.tsx:377-383`) —
Customers and Orders are never locked, so a row of navigation tiles was actually hiding a
simpler pattern: a two-way switch over content that's already on this page's own component tree
(`VendorDetailCustomers`, `VendorDetailOrders`), reusing the single-select `ChipNav` component
(`apps/msd/src/app/components/chip-nav/chip-nav.tsx`) per its real signature:

```tsx
<ChipNav
  items={[{ value: 'customers', label: 'Customers' }, { value: 'orders', label: 'Orders' }]}
  value={recordsTab}           // new local state, default 'customers'
  onSelect={setRecordsTab}
  ariaLabel="Member records"
/>
{recordsTab === 'customers'
  ? <VendorDetailCustomers token={token} vendorId={vendor.id} />
  : <VendorDetailOrders token={token} vendorId={vendor.id} />}
```

- `recordsTab` is local `useState<'customers' | 'orders'>('customers')` on `VendorDetailPage`,
  reset on mount (no URL state — unlike the four counter cards, this switch never navigates
  away from Overview, so there's nothing to deep-link or restore on back-navigation).
  `ChipNav` renders `md-filter-chip`s in an `md-chip-set`, each individually focusable
  (native chip tab stop + `aria-selected` semantics come from `md-filter-chip` itself); no
  additional ARIA needed beyond the `ariaLabel` prop already on the component.
- Section heading: keep the existing `<h2 className="section-title">` pattern, but the heading
  text becomes generic ("Records") since the chip row — not an `<h2>` per tab — now names which
  table is showing; the live region for load/empty/error states inside
  `VendorDetailCustomers`/`VendorDetailOrders` is unchanged (neither component is touched by
  this spec beyond being rendered conditionally instead of behind a `NavCard` link).
- No lock state applies here, so `ChipNav` never needs a disabled chip — this is the one part of
  the left column with no "locked" concept, which is exactly why it doesn't belong in the §2
  counter-card family and gets its own row.

## 4. Right column — the evolved `MemberSummaryCard`

Stays the same `sky-card` with three `List`/`Divider` groups (identity, what's missing, profile
action) exactly as shipped (`vendor-detail-page.tsx:486-535`) — no change to that markup. Added
below the existing `FilledButton` ("Add profile"/"Edit profile"):

```tsx
{isSuperAdmin && (
  <>
    <Divider />
    <OutlinedButton
      icon={vendor.status === 'ACTIVE' ? 'toggle_off' : 'toggle_on'}
      onClick={() => setSuperadminPending(vendor.status === 'ACTIVE' ? 'superadmin_deactivate' : 'superadmin_activate')}
    >
      {vendor.status === 'ACTIVE' ? 'Deactivate member' : 'Activate member'}
    </OutlinedButton>
  </>
)}
```

- **Placement**: below a second `Divider`, after the existing "Add/Edit profile" `FilledButton`
  — a fourth, visually separated group at the bottom of the same card, not merged into the
  profile action group. This reads as "the normal thing to do" (edit profile) versus "the rare,
  higher-stakes thing" (flip the member's live status) without needing a second card.
- **Visual distinction from "Edit profile"**: `OutlinedButton`, not `FilledButton` — this app's
  existing `ACTION_COPY`-driven confirmations (`vendor-detail-page.tsx:332-357`) already use
  `FilledButton` for the confirm action and `TextButton` for cancel, so using the *unfilled*
  variant here for the trigger itself (before any confirmation) signals "this is not the
  primary thing to do on this card" purely through weight, not colour — no new colour role is
  spent on it. The icon (`toggle_off`/`toggle_on`) matches the icon already used for `deactivate`
  in `ACTION_COPY` (`vendor-detail-page.tsx:77`), so the same action reads the same way wherever
  it appears on the page.
- **Gating mechanism (for Task 9 to wire)**: `useAuth()`'s `bootstrap.roles` is
  `Pick<Role,'id'|'key'|'name'|'isSuperAdmin'>[]` — there is no ready-made `isSuperAdmin`
  boolean today. The local `isSuperAdmin` used above is computed as
  `bootstrap.roles.some((r) => r.isSuperAdmin)`. This spec only places the control and its
  copy; Task 9 wires the real `useAuth()` read, the confirmation flow, and the API call.
- **Confirmation copy** — mirrors the existing `ACTION_COPY` record shape
  (`vendor-detail-page.tsx:75-80`) so Task 9 can add two entries to that same table rather than
  invent a new confirmation pattern:

  | key | icon | title | body | confirm | needsReason |
  |---|---|---|---|---|---|
  | `superadmin_deactivate` | `toggle_off` | "Deactivate this member" | "Their deals and products stop showing on the website. This is the SuperAdmin-level control — use it even if a support action was already tried." | "Deactivate member" | `true` |
  | `superadmin_activate` | `toggle_on` | "Activate this member" | "Their deals and products become visible on the website again." | "Activate member" | `false` |

  Both go through the same confirm-dialog `sky-feature-card` the page already renders for
  `pending` (`vendor-detail-page.tsx:332-357`) — no new confirmation UI, just two more
  `PendingAction` variants. Unlike the header `ChoiceMenu`'s existing instant `doActivate()`
  (`vendor-detail-page.tsx:211-219`, no confirmation today), **both** directions of the
  superadmin control require confirmation — it is meant to read as the stricter path, so it
  should not skip the step the weaker, already-existing Activate skips.
- **Flag for Task 9**: this control calls the same `setVendorStatus(token, vendor.id, 'ACTIVE' |
  'INACTIVE', reason?)` the header `ChoiceMenu`'s Activate/Deactivate already calls
  (`vendor-detail-page.tsx:211-219`, `238-240`) — it is an additional, stricter-gated entry
  point to the same state transition, not a new transition. Task 9 should decide (and the user
  should confirm) whether the header menu's own Activate/Deactivate stays available to any
  `vendors:status_change` holder once this control exists, or whether that capability narrows to
  SuperAdmin only everywhere. This spec does not resolve that question — it only places the new
  control.
- **Keyboard/focus/ARIA**: `OutlinedButton` is a standard focusable `md-outlined-button` — same
  focus-ring behaviour as every other button on this page, nothing new to specify. Because the
  control is conditionally rendered (not merely disabled) for non-SuperAdmins, there is no
  "greyed out but visible" state to design — it is absent from the DOM entirely for anyone who
  cannot use it, which is both the simplest implementation and avoids advertising an action a
  given admin can never take.

## Out of scope

- **Branches' list CardGrid → data-table conversion** — same implementation pass (Task 8) per
  the plan, but a separate concern from this layout spec: Branches' own list page
  (`branches-list-page.tsx`) is untouched by anything in this document; only the Overview card
  that links to it changes.
- **The actual SuperAdmin permission check and API wiring** — Task 9. This spec places the
  control, its copy, and its confirmation-table shape; it does not add `isSuperAdmin` to
  `useAuth()`, does not add the two `ACTION_COPY`-style rows to real code, and does not touch
  `setVendorStatus`.
- **Legacy page cleanup** (`branch-list.tsx`, `deal-list.tsx`, `therapist-list.tsx`,
  `vendor-branches.tsx`) — Task 10.
- **Deal↔Therapist many-to-many linking UI** — already shipped/covered by Tasks 2–5 of the plan;
  unrelated to the Overview page.
- Any change to `getSetupSteps`, `missingProfileParts`, `isSetupComplete`, or `getMissingPoints`
  in `vendor-setup.ts` — this spec reads that module's output, it does not change it.

## Testing

Same conventions as the rest of this plan's work: Vitest + Testing Library, asserting on
rendered `sky-*` element attributes (not shadow-DOM internals, per this repo's documented
jsdom/@lit/react gap). Per component touched in Task 8:

- **Counter-card row**: one test per state per entity — locked renders no `href` attribute and
  the correct `lockedReason` text; unlocked-empty renders the section route as `href` and the
  correct "Add" copy, with a dedicated assertion that Branches-while-empty gets `color="primary"`
  and the "Start here" copy while Deals/Therapists/Products-while-empty get `color="surface-high"`
  and the generic "Add" copy; unlocked-with-items renders `color="secondary"`,
  `icon="check_circle"`, and the count text. Also assert Products never renders the locked state
  once the profile is done, regardless of `vendor._count.branches` (the Task 1 bug this page
  must not regress).
- **Customers/Orders switcher**: default render shows Customers; clicking the Orders chip (fire
  a click on the rendered `md-filter-chip`) switches the rendered child to `VendorDetailOrders`
  and back; `ChipNav`'s existing test file (`chip-nav.test.tsx`) already covers the component
  itself, so this page's test only needs to cover the state wiring, not `ChipNav` internals.
- **Right column / SuperAdmin control**: render with a `bootstrap.roles` fixture that has
  `isSuperAdmin: false` and assert the control is absent from the DOM; render with
  `isSuperAdmin: true` and assert it is present, with the correct icon/label for both `ACTIVE`
  and non-`ACTIVE` vendor fixtures; a confirm-dialog test mirroring the existing
  `reject`/`deactivate`/`suspend` pending-action tests already in this file's test suite.
- **Layout**: a narrow-viewport (or `useMediaQuery` mock) test asserting DOM order is counter
  cards → switcher → profile card, confirming no `order` CSS is relied on for the stack to read
  correctly without CSS applied in jsdom.
- `npx nx run msd:lint`, `npx nx run msd:test -- vendor-detail-page`, `tsc --noEmit`, same as
  every prior task in this plan; manual pass in `npx nx serve msd` against a fresh
  "profile incomplete" vendor, a "profile done, no branch" vendor, and a fully-set-up vendor, to
  see all three counter-card states and the empty-branch "Start here" tile render correctly.
