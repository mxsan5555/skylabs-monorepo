# msd admin: vendor branch management (Branches, and Deals/Therapists inside a branch)

Date: 2026-09-28
App: `apps/msd` (React 19 + Vite), admin console
Builds on: `~/.claude/plans/our-backend-admin-layout-snug-sloth.md` (the approved member-console plan; this is step 3, and folds step 4/5's branch-scoped content in with it) and this session's already-shipped Overview page (`vendor-detail-page.tsx`, `vendor-setup.ts`).
Replaces: the admin path through `VendorBranches`/`BranchDialog`/`DealDialog` (`vendor-branches.tsx`) and the branch-scoped parts of `WizardTherapistFormDialog` (`vendor-wizard-therapists.tsx`), for the **admin** console only.

## Why

The Overview page (shipped this session) tells an admin *that* branches/deals/therapists exist and what's missing, but there was no way to actually add or edit one without going through the old dialog-heavy `VendorBranches` component, which this redesign was meant to retire. Live review on a freshly-created vendor (`/account/vendors/ee01e0a5-546a-4648-9cc1-f4d315a95819`) surfaced the gap directly: no visible way to add a branch, no detail page for any branch/deal/therapist, popups still used for add/edit, and the Overview's setup-progress cards didn't make the unlock order clear enough.

## Data facts (verified, `apps/msd-api/prisma/schema.prisma`)

- **Branch**: `vendorId` only. No dependency on anything else.
- **Deal**, **Therapist**: both carry `vendorId` **and** `branchId` — genuinely branch-scoped.
- **Product**: `vendorId` only, no `branchId` — **never** branch-scoped. A branch card cannot show a real product count.

This confirms the user's own statement of the rule: branch is the root; deals and therapists live inside a branch; products are vendor-level and unrelated to branches.

## Routes (new, under the existing `/account/vendors/:vendorId` tree)

```
/account/vendors/:id/branches                            Branches — card grid
/account/vendors/:id/branches/new                         Add branch
/account/vendors/:id/branches/:branchId                   Edit branch
/account/vendors/:id/branches/:branchId/deals              Deals table, scoped to this branch
/account/vendors/:id/branches/:branchId/deals/new           Add deal
/account/vendors/:id/branches/:branchId/deals/:dealId        Edit deal
/account/vendors/:id/branches/:branchId/therapists           Therapists table, scoped to this branch
/account/vendors/:id/branches/:branchId/therapists/new       Add therapist
/account/vendors/:id/branches/:branchId/therapists/:tId       Edit therapist
```

Breadcrumb grows one crumb per level via the existing `useSetBreadcrumbs` (`admin/breadcrumb-context.tsx`), e.g. `Account › Members › All Member › {business} › Branches › Lower Parel Branch › Deals › Designer Nail Art`. Every non-final crumb is a link back to that level.

`VendorDetailPage`'s existing `/account/vendors/:id/:section` route already matches `section="branches"` for the list; the nested routes above are new `<Route>` entries alongside it in `routes.tsx`, each its own top-level page component (not folded into `VendorDetailPage`).

## 1. Branches list (card grid)

- Header: "Branches" + a live count, **"+ Add branch"** button top-right (`page-head__actions`, same placement as the Members list's "Add member").
- Cards: `CardGrid` (existing component), one `sky-feature-card` per branch — `color="none" variant="outlined"` (shared-ui's own "Outlined, no fill" preset, `/showcase#feature-card`). Content: branch name, "{state}, {city} · {status}", two count chips — "N Deals ›" and "N Therapists ›" — each a real link to that branch's Deals/Therapists route. Actions slot: **Edit** (→ the branch's edit page) and **Deactivate**/**Activate** (`setBranchStatus`, toggles `isActive`; existing `useConfirmDialog` for the deactivate confirmation, a yes/no confirmation, not a form, so it stays outside the "no popups for CRUD" rule).
  - **No hard delete for branches** — there is no `deleteBranch` API (a branch cascades to its deals/therapists/orders, so this was always deactivate-only, matching the old `VendorBranches` UI). Deal and Therapist rows *do* get a real Delete (`deleteDeal`/`deleteVendorTherapist` both exist).
- No Products chip (see Data facts above).
- Empty state: no cards, just the "+ Add branch" button and a line explaining a branch is needed before deals/therapists/products can be added — consistent wording with the Overview's `setupHint`.

## 2. Add/Edit branch

Single page, `sky-accordion` sections (same "one thing at a time, plain language" approach as the rest of this redesign):

1. **Location** — Branch Name (required), Address, **State** (required, select), City (select, depends on State), PIN Code, Map Location (Google Maps URL). Every field except State starts disabled; picking a State enables the rest — this was already an approved rule from the original plan, just not built yet.
2. **Opening Hours** — the existing `OpeningHoursEditor` (from `vendor-branches.tsx`), reused as-is.
3. **Category Access** (admin-only, permission gated) — the existing Service/Therapy/Product category checkbox tree, reused as-is; unchanged behaviour (still drives what categories Deals/Products for this branch can use).

Save posts to the existing `createBranch`/`updateBranch` API functions (`api/rbac/vendors.ts`, verified present) — no backend change. On create, redirect to the new branch's edit page (so Opening Hours/Category Access can be filled in next) rather than back to the list, matching how "Add vendor" already lands you in the profile wizard rather than bouncing you back to the list.

## 3. Deals / Therapists inside a branch

Two parallel, near-identical page pairs (list + add/edit), one per entity, each scoped by `:branchId` from the URL — so **no Branch picker field** in either form; that removes a field the old `DealDialog`/`WizardTherapistFormDialog` needed only because they weren't already inside a branch's own page.

- **List**: `sky-data-table` (existing component/pattern, same as the Therapists table already shipped this session), header shows the branch name, "+ Add deal"/"+ Add therapist" button top-right. Row actions: Edit (→ that row's edit page), Delete (existing confirm dialog).
  - Deal columns: Title, Price (from its cheapest package), Status, Actions.
  - Therapist columns: Person Name, Specialization, Experience, Status, Actions.
- **Add/Edit**: single page, same field groups the old dialogs already validated (Deal: Category/Subcategory, Title, Slug, description fields, Packages repeater, Media; Therapist: Type, Person Name, Gender, Specialization, Bio, Experience, Media), reusing the existing `createDeal`/`updateDeal`/`deleteDeal` and `createVendorTherapist`/`updateVendorTherapist`/`deleteVendorTherapist` API functions (all verified present in `api/rbac/vendors.ts`) — no backend change.

`listDeals(token, vendorId, branchId)` is already branch-scoped server-side. Therapists have no equivalent — `listVendorTherapistsForAdmin(token, vendorId)` returns every therapist across all branches — so the branch-scoped Therapists list filters that result by `branchId` client-side (the field is present on `AdminTherapist`/`Therapist`, verified). Small enough list per vendor that this needs no new endpoint.

## Structural change: the Overview's top-level Therapists tab goes away

Today `VendorDetailPage` has a standalone `section="therapists"` tab — a read-only, cross-branch table of every therapist this vendor has, with delete only. Once therapists are fully managed (add/edit/delete) per-branch, that tab becomes a second, weaker place to do the same job — the exact "same data edited in two places" problem the original redesign was meant to remove (it already happened once, with Branches/Deals split between the old Overview tabs and the wizard).

This spec removes it: `SECTIONS` drops `'therapists'`, `TherapistsTab`/`toTherapistRow`/`THERAPIST_COLUMNS` are deleted from `vendor-detail-page.tsx`, and the Overview's "Therapists" setup-progress card points at `branches` instead of its own section (`STEP_SECTION.therapists = 'branches'`), matching how `deals` already works. `listVendorTherapistsForAdmin` (the API call `TherapistsTab` used) stays — the new branch-scoped Therapists list calls the same function and filters its result to the current `branchId` (see "Deals / Therapists inside a branch" above).

## Out of scope (unchanged this round)

- **Products** — still vendor-level, still reached via the Overview's "Products" card into the profile wizard; its own page is a later round, unaffected by anything here.
- **Vendor self-service** (`vendor-branches-deals.tsx`, `vendor-deals.tsx`, `vendor-therapists.tsx`, `vendor-products.tsx`) — keeps using the existing dialog components unchanged. Deduping admin and self-service onto one page family is its own later step (already tracked in `TASK.md`/the plan as step 7), not this one.
- No backend/API changes — every new page calls existing `api/rbac/vendors.ts` functions.

## Testing

Same conventions as the rest of this session's work: Vitest + Testing Library per new page component, asserting on rendered `sky-*` attributes (not shadow-DOM internals, per this repo's documented jsdom/@lit/react gap), `href`/breadcrumb correctness for navigation, and existing patterns for delete-confirm and category-access reuse. `nx run msd:lint`/`tsc --noEmit`/`nx run msd:test` per file touched, same as every prior round.
