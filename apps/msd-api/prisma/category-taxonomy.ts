/**
 * Canonical category taxonomy used by the MSD seed.
 *
 * Structure: Category -> Subcategory -> (optional) Type.
 * This file is the single source of truth for category names, slugs and types.
 *
 * Final 7-category business structure (Hair & Nails, Health & Wellness, Massage, Product,
 * Skin & Beauty, Spa & Retreats, Therapy — in this display order). Slugs for renamed
 * subcategories, and for every 3rd-tier ("Type") leaf below, intentionally point at the
 * pre-existing row that already carries real Deal/Product/Therapist relations (verified via a
 * direct read of the live category tree, not guessed) — see `reconcile-category-master.ts`'s own
 * doc comment for the full reasoning — so `seedCategoryTaxonomy`'s upsert-by-slug lands on the
 * correct row on every environment, never creating a duplicate.
 *
 * The 3 entries marked `legacy: true` (Hair, Spa & Wellness, Nails & Lashes) are the pre-final-
 * structure categories — kept here (not deleted from this file) only because a chunk of the demo
 * `PRODUCT_SEEDS`/`SERVICE_DEAL_SEEDS`/vendor category-access grants in `seed.ts` still resolve
 * their `categoryId` through these slugs; removing them here would break `categoryIdBySlug`
 * lookups for that demo data on a fresh database. `seedCategoryTaxonomy` creates them `isActive:
 * false` from the start (see the `legacy` flag below) so a fresh install never shows them in
 * navigation; on an already-existing, previously-drifted database (where they may have been
 * active), `reconcile-category-master.ts` is what retires them — see that script's own doc
 * comment. Their own subcategory slugs below are exactly what's live in the dev database today
 * (confirmed by direct query) — several demo `subcategorySlug` values that read as "legacy"
 * (`hair-coloring`, `manicure`, `pedicure`, `nail-art`) actually already resolve to 3rd-tier rows
 * nested under the FINAL structure's own "Hair Treatment"/"Nails" subcategories, not under the
 * legacy tops — kept there below, not duplicated under the legacy blocks.
 */

export type TaxonomyType = 'SERVICE' | 'PRODUCT' | 'THERAPY';

export interface TaxonomySub {
  name: string;
  slug: string;
  children: TaxonomySub[];
}

export interface TaxonomyTop {
  name: string;
  slug: string;
  type: TaxonomyType;
  children: TaxonomySub[];
  /** True for a pre-final-structure category kept only so demo seed data's categoryId lookups
   *  still resolve — created inactive, never shown in the final 7-category nav. */
  legacy?: boolean;
}

export const CATEGORY_TAXONOMY: TaxonomyTop[] = [
  {
    name: 'Hair & Nails',
    slug: 'hair-nails',
    type: 'SERVICE',
    children: [
      { name: 'Haircut & Styling', slug: 'haircut-styling', children: [] },
      {
        name: 'Hair Treatment',
        slug: 'hair-treatment',
        // Pre-existing 3rd-tier row, real relations via demo Product seed data.
        children: [{ name: 'Hair Coloring', slug: 'hair-coloring', children: [] }],
      },
      {
        name: 'Nails',
        slug: 'nails',
        // Pre-existing 3rd-tier rows, real relations via demo Deal/Product seed data.
        children: [
          { name: 'Manicure', slug: 'manicure', children: [] },
          { name: 'Pedicure', slug: 'pedicure', children: [] },
          { name: 'Nail Art', slug: 'nail-art', children: [] },
        ],
      },
    ],
  },
  {
    name: 'Health & Wellness',
    slug: 'health-wellness',
    type: 'SERVICE',
    children: [
      { name: 'Fitness', slug: 'fitness', children: [] },
      { name: 'Nutrition', slug: 'nutrition', children: [] },
      { name: 'Wellness', slug: 'wellness', children: [] },
      { name: 'Alternative Wellness', slug: 'alternative-wellness', children: [] },
    ],
  },
  {
    name: 'Massage',
    slug: 'massage',
    type: 'SERVICE',
    children: [
      { name: 'Body Massage', slug: 'body-massage', children: [] },
      { name: 'Head & Neck Massage', slug: 'head-neck-massage', children: [] },
      { name: 'Foot Massage', slug: 'foot-massage', children: [] },
      { name: 'Prenatal Massage', slug: 'prenatal-massage', children: [] },
    ],
  },
  {
    name: 'Product',
    slug: 'product',
    type: 'PRODUCT',
    children: [
      { name: 'Skincare', slug: 'skincare', children: [] },
      { name: 'Hair Care', slug: 'hair-care', children: [] },
      { name: 'Wellness', slug: 'wellness-products', children: [] },
      { name: 'Beauty', slug: 'beauty', children: [] },
      { name: 'Massage & Spa Products', slug: 'massage-spa-products', children: [] },
    ],
  },
  {
    name: 'Skin & Beauty',
    slug: 'skin-beauty',
    type: 'SERVICE',
    children: [
      { name: 'Facial', slug: 'facial', children: [] },
      // Real relations live on the pre-existing "Skin Treatments" (plural) row — reused by slug,
      // not the empty "Skin Treatment" duplicate. See reconcile-category-master.ts.
      { name: 'Skin Treatment', slug: 'skin-treatments', children: [] },
      { name: 'Hair Removal', slug: 'hair-removal', children: [] },
      // Real relations live on the pre-existing "Makeup & Beauty Services" row.
      { name: 'Beauty Services', slug: 'makeup-beauty-services', children: [] },
    ],
  },
  {
    name: 'Spa & Retreats',
    slug: 'spa-retreats',
    type: 'SERVICE',
    children: [
      { name: 'Spa Treatments', slug: 'spa-treatments', children: [] },
      { name: 'Steam & Sauna', slug: 'steam-sauna', children: [] },
      { name: 'Retreats', slug: 'retreats', children: [] },
      { name: 'Body Treatments', slug: 'body-treatments', children: [] },
    ],
  },
  {
    name: 'Therapy',
    slug: 'therapy',
    type: 'THERAPY',
    children: [
      { name: 'Mental Wellness', slug: 'mental-wellness', children: [] },
      { name: 'Physical Therapy', slug: 'physical-therapy', children: [] },
      { name: 'Specialized Therapy', slug: 'specialized-therapy', children: [] },
      // Real relations live on the pre-existing "Couple & Family Therapy" row.
      { name: 'Couple & Family', slug: 'couple-family-therapy', children: [] },
    ],
  },

  // ── Legacy (pre-final-structure) — see this file's own doc comment. ──
  {
    name: 'Hair',
    slug: 'hair',
    type: 'SERVICE',
    legacy: true,
    children: [
      { name: 'Haircut & Styling', slug: 'hair-haircut-styling', children: [] },
      { name: 'Hair Treatments', slug: 'hair-treatments', children: [] },
      { name: 'Hair Coloring', slug: 'hair-coloring-services', children: [] },
      { name: 'Bridal & Extensions', slug: 'hair-bridal', children: [] },
    ],
  },
  {
    name: 'Spa & Wellness',
    slug: 'spa-wellness',
    type: 'SERVICE',
    legacy: true,
    children: [
      { name: 'Body Treatments', slug: 'spa-body-treatments', children: [] },
      { name: 'Steam & Sauna', slug: 'spa-steam-sauna', children: [] },
      { name: 'Aromatherapy', slug: 'aromatherapy-spa', children: [] },
      { name: 'Bridal & Special Packages', slug: 'spa-bridal', children: [] },
    ],
  },
  {
    name: 'Nails & Lashes',
    slug: 'nails-lashes',
    type: 'SERVICE',
    legacy: true,
    children: [
      {
        name: 'Nail Services',
        slug: 'nail-services',
        children: [{ name: 'Acrylic Nails', slug: 'acrylic-nails', children: [] }],
      },
      {
        name: 'Lash Services',
        slug: 'lash-services',
        children: [
          { name: 'Eyelash Extensions', slug: 'eyelash-extensions', children: [] },
          { name: 'Lash Lift', slug: 'lash-lift', children: [] },
          { name: 'Lash Lamination', slug: 'lash-lamination', children: [] },
        ],
      },
      { name: 'Nail Extensions', slug: 'nail-extensions', children: [] },
      { name: 'Eyelash Services', slug: 'eyelash-services', children: [] },
      { name: 'Eyebrow Services', slug: 'eyebrow-services', children: [] },
    ],
  },
];
