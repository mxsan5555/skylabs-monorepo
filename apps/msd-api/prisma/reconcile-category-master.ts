/**
 * One-off reconciliation for the MSD Category Master's final 7-category business structure
 * (Hair & Nails, Health & Wellness, Massage, Product, Skin & Beauty, Spa & Retreats, Therapy).
 *
 * Why this exists instead of just rewriting `category-taxonomy.ts` and reseeding: this dev
 * database's category rows accumulated over time via a mix of the old 6-category demo seed and
 * ad-hoc admin/QA edits, so several target categories already exist — some inactive, some
 * correctly named but not carrying the live data, some carrying live Deal/Product/Therapist/
 * BranchCategoryAccess/VendorCategoryAccess relations but under a slightly different name (e.g.
 * "Skin Treatments" holds the real relations but the target name is "Skin Treatment"). A blind
 * upsert-by-slug (what the seed does) can't safely rename a row or pick the correct one of two
 * near-duplicate candidates — that needs an explicit, human-reviewed mapping, which is what this
 * script encodes. Every entry below was derived from a direct read of the live category tree
 * (id, name, isActive, sortOrder, and real relation counts) — not a guess.
 *
 * Safety: every mutation is either (a) a rename (same row id, so no relation is ever touched —
 * `categoryId` foreign keys are untouched everywhere), (b) an `isActive` flip, or (c) a
 * `sortOrder` change. No row is ever deleted, and no Deal/Product/Therapist/BranchCategoryAccess/
 * VendorCategoryAccess is ever reassigned to a different category. Each rename/reactivate action
 * asserts the row's current name matches what was observed at investigation time before mutating
 * — if it's since changed (e.g. an admin already edited it), the action is skipped with a warning
 * instead of blindly overwriting. Idempotent: safe to run more than once, becomes a no-op after
 * the first successful run (every assertion still holds, but the row is already in its target
 * state, so each `prisma.category.update` here is itself a no-op payload-wise on a rerun — pass a
 * fresh state check first so reruns print "already correct" instead of redundant writes).
 *
 * Legacy top-level categories not in the target list ("Hair", "Nails & Lashes", "Spa & Wellness")
 * — all currently ACTIVE with real Deal/Product/BranchCategoryAccess/VendorCategoryAccess rows
 * directly on them — are deactivated (never deleted) by the final step, which reuses the exact
 * same non-destructive "deactivate anything whose slug isn't in CATEGORY_TAXONOMY" logic
 * `deactivateRemovedTaxonomyRows()` in seed.ts already uses (duplicated here in miniature rather
 * than imported, since importing seed.ts would execute its whole `main()` as a module side
 * effect). Their Deals/Products keep their `categoryId` FK and stay fully purchasable via direct
 * links/search/vendor pages — `VISIBLE_DEAL_WHERE` never checks `Category.isActive` — they just
 * stop appearing in category-browse navigation, identical to how every other already-retired
 * category in this dataset already behaves.
 *
 * Run once per environment that has pre-existing drifted category data:
 *   npx dotenv -e apps/msd-api/.env.local -- tsx --tsconfig tsconfig.base.json apps/msd-api/prisma/reconcile-category-master.ts
 * (mirrors the `msd-api:prisma:seed` npm script's own invocation pattern — see package.json.)
 * A genuinely fresh database never needs this: `category-taxonomy.ts` already describes the
 * target 7-category hierarchy directly, so a first-ever seed creates it correctly with no
 * reconciliation step.
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { PrismaClient } from '../src/generated/prisma-client';
import { CATEGORY_TAXONOMY } from './category-taxonomy';

const prisma = new PrismaClient();

interface ReactivateAction {
  kind: 'reactivate';
  id: string;
  expectedName: string;
  sortOrder?: number;
}
interface RenameAction {
  kind: 'rename';
  id: string;
  expectedName: string;
  newName: string;
}
interface ReorderAction {
  kind: 'reorder';
  id: string;
  expectedName: string;
  sortOrder: number;
}
interface DeactivateAction {
  kind: 'deactivate';
  id: string;
  expectedName: string;
}
type Action = ReactivateAction | RenameAction | ReorderAction | DeactivateAction;

// Derived from a direct read of the live category tree (id, name, isActive, sortOrder, relation
// counts) at investigation time — see this file's own doc comment.
const ACTIONS: Action[] = [
  // ── Top-level sortOrder, matching the target display order (0-6) ──
  { kind: 'reorder', id: '2c46e832-55ad-4a5b-9c7c-10e938418dda', expectedName: 'Hair & Nails', sortOrder: 0 },
  { kind: 'reorder', id: '9ce038dc-7f7c-4436-be6f-c41539ab18dc', expectedName: 'Health & Wellness', sortOrder: 1 },
  { kind: 'reorder', id: '22212ca1-f410-4f91-b1d9-ea3841b7e942', expectedName: 'Massage', sortOrder: 2 },
  { kind: 'reorder', id: '3c986573-b344-46cf-b0ed-dc5b2e42aceb', expectedName: 'Product', sortOrder: 3 },
  { kind: 'reorder', id: 'b3b4eb5f-b13f-45e1-884b-f7b5e2dac883', expectedName: 'Skin & Beauty', sortOrder: 4 },
  { kind: 'reorder', id: '9da4c71c-fada-4de7-b0c8-aaad496873a8', expectedName: 'Spa & Retreats', sortOrder: 5 },
  { kind: 'reorder', id: '9a30d770-b537-43ce-a786-2af0374b1c16', expectedName: 'Therapy', sortOrder: 6 },

  // ── Reactivate top-level rows that already have the target name but are inactive ──
  { kind: 'reactivate', id: '2c46e832-55ad-4a5b-9c7c-10e938418dda', expectedName: 'Hair & Nails' },
  { kind: 'reactivate', id: '9ce038dc-7f7c-4436-be6f-c41539ab18dc', expectedName: 'Health & Wellness' },
  { kind: 'reactivate', id: '9da4c71c-fada-4de7-b0c8-aaad496873a8', expectedName: 'Spa & Retreats' },

  // ── Reactivate subcategory rows that already have the target name but are inactive ──
  { kind: 'reactivate', id: '06ffb28e-9fa4-483a-b619-ddfcc6ca390e', expectedName: 'Hair Treatment' }, // Hair & Nails
  { kind: 'reactivate', id: '721a37b1-3fb9-493a-abdb-847b7d58bda2', expectedName: 'Nails' }, // Hair & Nails
  { kind: 'reactivate', id: 'f8d69400-3c81-4119-809e-08d7b008518b', expectedName: 'Fitness' }, // Health & Wellness
  { kind: 'reactivate', id: 'd9db84f8-67cc-44d8-ba55-dbc9d1c06bf5', expectedName: 'Nutrition' }, // Health & Wellness
  { kind: 'reactivate', id: 'a3ebc0e2-474f-463d-80db-4526c4f18389', expectedName: 'Alternative Wellness' }, // Health & Wellness
  { kind: 'reactivate', id: 'b1aee19c-ac10-4cdf-8075-5edd070ab457', expectedName: 'Skincare' }, // Product
  { kind: 'reactivate', id: 'bb11df21-47b4-4db0-9a7e-02b8103758b1', expectedName: 'Beauty' }, // Product
  { kind: 'reactivate', id: '0acc44ff-6a0c-419e-8746-265286b43893', expectedName: 'Massage & Spa Products' }, // Product

  // ── Renames: same row, same relations — only the display name changes to the target spelling ──
  { kind: 'rename', id: '94b6e589-71d1-4203-a52d-38b404893fca', expectedName: 'Skin Treatments', newName: 'Skin Treatment' },
  { kind: 'rename', id: 'd0294af8-4ae3-4183-b9aa-27d1289928d3', expectedName: 'Makeup & Beauty Services', newName: 'Beauty Services' },
  { kind: 'rename', id: 'bd54f91d-8fb4-43b8-9161-70cd55a9219d', expectedName: 'Couple & Family Therapy', newName: 'Couple & Family' },

  // ── Tidy-up: a zero-relation stray duplicate under Product, not a target name ──
  { kind: 'deactivate', id: '71862c76-30a2-4522-a61e-6ad8a8d8e022', expectedName: 'skin' },
];

async function runActions() {
  let applied = 0;
  let skippedAlreadyCorrect = 0;
  let skippedNameMismatch = 0;

  for (const action of ACTIONS) {
    const row = await prisma.category.findUnique({ where: { id: action.id } });
    if (!row) {
      console.warn(`SKIP (not found): id=${action.id} expectedName="${action.expectedName}"`);
      continue;
    }
    if (action.kind === 'rename' && row.name === action.newName) {
      // Already renamed by a prior run of this script — not a mismatch, just already correct.
      skippedAlreadyCorrect += 1;
      continue;
    }
    if (row.name !== action.expectedName) {
      console.warn(
        `SKIP (name mismatch — likely already edited by an admin): id=${action.id} expected="${action.expectedName}" actual="${row.name}"`,
      );
      skippedNameMismatch += 1;
      continue;
    }

    if (action.kind === 'reactivate') {
      if (row.isActive && (action.sortOrder === undefined || row.sortOrder === action.sortOrder)) {
        skippedAlreadyCorrect += 1;
        continue;
      }
      await prisma.category.update({
        where: { id: action.id },
        data: { isActive: true, ...(action.sortOrder !== undefined ? { sortOrder: action.sortOrder } : {}) },
      });
      console.log(`REACTIVATED: "${row.name}" (id=${action.id})`);
      applied += 1;
    } else if (action.kind === 'reorder') {
      if (row.sortOrder === action.sortOrder) {
        skippedAlreadyCorrect += 1;
        continue;
      }
      await prisma.category.update({ where: { id: action.id }, data: { sortOrder: action.sortOrder } });
      console.log(`REORDERED: "${row.name}" (id=${action.id}) sortOrder -> ${action.sortOrder}`);
      applied += 1;
    } else if (action.kind === 'rename') {
      await prisma.category.update({ where: { id: action.id }, data: { name: action.newName } });
      console.log(`RENAMED: "${row.name}" -> "${action.newName}" (id=${action.id})`);
      applied += 1;
    } else if (action.kind === 'deactivate') {
      if (!row.isActive) {
        skippedAlreadyCorrect += 1;
        continue;
      }
      await prisma.category.update({ where: { id: action.id }, data: { isActive: false } });
      console.log(`DEACTIVATED: "${row.name}" (id=${action.id})`);
      applied += 1;
    }
  }

  return { applied, skippedAlreadyCorrect, skippedNameMismatch };
}

/** Mirrors seed.ts's `deactivateRemovedTaxonomyRows()` exactly (duplicated, not imported — see
 *  this file's own doc comment for why). Deactivates every category whose slug isn't in the
 *  current `CATEGORY_TAXONOMY` — catches the 3 legacy tops ("Hair", "Nails & Lashes",
 *  "Spa & Wellness") plus every now-unused near-duplicate row this script's renames left behind. */
async function deactivateRemovedTaxonomyRows(): Promise<number> {
  const activeSlugs = new Set<string>();
  for (const top of CATEGORY_TAXONOMY) {
    activeSlugs.add(top.slug);
    for (const sub of top.children) activeSlugs.add(sub.slug);
  }
  const existing = await prisma.category.findMany({ select: { id: true, slug: true, name: true, isActive: true } });
  const toDeactivate = existing.filter((row) => !activeSlugs.has(row.slug) && row.isActive);
  if (!toDeactivate.length) return 0;
  for (const row of toDeactivate) console.log(`RETIRED (not in target taxonomy): "${row.name}" (slug=${row.slug})`);
  const result = await prisma.category.updateMany({
    where: { id: { in: toDeactivate.map((r) => r.id) } },
    data: { isActive: false },
  });
  return result.count;
}

async function main() {
  console.log('--- Category Master reconciliation: applying id-pinned actions ---');
  const { applied, skippedAlreadyCorrect, skippedNameMismatch } = await runActions();
  console.log('--- Category Master reconciliation: retiring legacy categories ---');
  const retired = await deactivateRemovedTaxonomyRows();
  console.log(
    `Done. Applied ${applied} change(s), ${skippedAlreadyCorrect} already correct, ${skippedNameMismatch} skipped (name mismatch), ${retired} legacy row(s) retired.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
