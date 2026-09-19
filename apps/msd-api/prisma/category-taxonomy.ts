/**
 * The canonical 7-category taxonomy (Category → Subcategory → Type) — the single source of
 * truth consumed by BOTH `prisma/seed.ts` (idempotent find-or-create on every `npx prisma db
 * seed` run) and the one-off live-data-reset backfill script
 * (`.scratch-backup/reset-category-taxonomy.ts`), so the two can never drift apart.
 *
 * Slugs are globally unique (Category.slug is a DB-level unique column, not scoped per parent),
 * so a handful of names that are reused across different branches of the tree (e.g. "Foot
 * Massage" as both a Subcategory and a Type nested under it, or "Body Scrub" appearing under
 * both a service Subcategory and the Product tree) carry an explicitly disambiguated `slug`
 * distinct from their kebab-cased `name` — called out inline below.
 */

export type TaxonomyType = 'SERVICE' | 'PRODUCT' | 'THERAPY';

export interface TaxonomyLeaf {
  name: string;
  slug: string;
}

export interface TaxonomySub {
  name: string;
  slug: string;
  children: TaxonomyLeaf[];
}

export interface TaxonomyTop {
  name: string;
  slug: string;
  type: TaxonomyType;
  children: TaxonomySub[];
}

export const CATEGORY_TAXONOMY: TaxonomyTop[] = [
  {
    name: 'Massage',
    slug: 'massage',
    type: 'SERVICE',
    children: [
      {
        name: 'Body Massage',
        slug: 'body-massage',
        children: [
          { name: 'Swedish Massage', slug: 'swedish-massage' },
          { name: 'Deep Tissue Massage', slug: 'deep-tissue-massage' },
          { name: 'Aromatherapy Massage', slug: 'aromatherapy-massage' },
          { name: 'Balinese Massage', slug: 'balinese-massage' },
          { name: 'Thai Massage', slug: 'thai-massage' },
          { name: 'Sports Massage', slug: 'sports-massage' },
          { name: 'Hot Stone Massage', slug: 'hot-stone-massage' },
          { name: 'Couple Massage', slug: 'couple-massage' },
        ],
      },
      {
        name: 'Head & Neck Massage',
        slug: 'head-neck-massage',
        children: [
          { name: 'Head Massage', slug: 'head-massage' },
          { name: 'Head & Shoulder Massage', slug: 'head-shoulder-massage' },
          { name: 'Neck & Shoulder Massage', slug: 'neck-shoulder-massage' },
        ],
      },
      {
        name: 'Foot Massage',
        slug: 'foot-massage',
        children: [
          // Disambiguated slug — "Foot Massage" the Type would otherwise collide with its own
          // parent Subcategory's slug ("foot-massage").
          { name: 'Foot Massage', slug: 'foot-massage-therapy' },
          { name: 'Reflexology', slug: 'reflexology' },
        ],
      },
      {
        name: 'Prenatal Massage',
        slug: 'prenatal-massage',
        children: [
          // Disambiguated slug — same reasoning as "Foot Massage" above.
          { name: 'Prenatal Massage', slug: 'prenatal-massage-therapy' },
        ],
      },
    ],
  },
  {
    name: 'Spa & Wellness',
    slug: 'spa-wellness',
    type: 'SERVICE',
    children: [
      {
        name: 'Spa Treatments',
        slug: 'spa-treatments',
        children: [
          { name: 'Full Body Spa', slug: 'full-body-spa' },
          { name: 'Spa Therapy', slug: 'spa-therapy' },
          { name: 'Couple Spa', slug: 'couple-spa' },
          { name: 'Luxury Spa', slug: 'luxury-spa' },
        ],
      },
      {
        name: 'Steam & Sauna',
        slug: 'steam-sauna',
        children: [
          { name: 'Steam Bath', slug: 'steam-bath' },
          { name: 'Sauna', slug: 'sauna' },
          // Disambiguated slug — collides with the parent Subcategory's own slug otherwise.
          { name: 'Steam & Sauna', slug: 'steam-sauna-combo' },
        ],
      },
      {
        name: 'Retreats',
        slug: 'retreats',
        children: [
          { name: 'Wellness Retreat', slug: 'wellness-retreat' },
          { name: 'Couple Retreat', slug: 'couple-retreat' },
          { name: 'Weekend Retreat', slug: 'weekend-retreat' },
          { name: 'Luxury Retreat', slug: 'luxury-retreat' },
        ],
      },
      {
        name: 'Body Treatments',
        slug: 'body-treatments',
        children: [
          { name: 'Body Scrub', slug: 'body-scrub' },
          { name: 'Body Polish', slug: 'body-polish' },
          { name: 'Body Wrap', slug: 'body-wrap' },
        ],
      },
      {
        name: 'Wellness',
        slug: 'wellness',
        children: [
          { name: 'Stress Management', slug: 'stress-management' },
          { name: 'Sleep Wellness', slug: 'sleep-wellness' },
          { name: 'Lifestyle Coaching', slug: 'lifestyle-coaching' },
        ],
      },
    ],
  },
  {
    name: 'Hair',
    slug: 'hair',
    type: 'SERVICE',
    children: [
      {
        name: 'Haircut & Styling',
        slug: 'haircut-styling',
        children: [
          { name: 'Haircut', slug: 'haircut' },
          { name: 'Hair Styling', slug: 'hair-styling' },
          { name: 'Blow Dry', slug: 'blow-dry' },
          { name: 'Hair Wash', slug: 'hair-wash' },
        ],
      },
      {
        name: 'Hair Treatments',
        slug: 'hair-treatments',
        children: [
          { name: 'Hair Spa', slug: 'hair-spa' },
          { name: 'Keratin Treatment', slug: 'keratin-treatment' },
          { name: 'Hair Smoothening', slug: 'hair-smoothening' },
          { name: 'Hair Straightening', slug: 'hair-straightening' },
          { name: 'Hair Coloring', slug: 'hair-coloring' },
          { name: 'Scalp Treatment', slug: 'scalp-treatment' },
        ],
      },
      {
        name: 'Hair Coloring',
        slug: 'hair-coloring-cat',
        children: [
          { name: 'Hair Coloring', slug: 'hair-coloring-service' },
          { name: 'Highlights', slug: 'highlights' },
          { name: 'Balayage', slug: 'balayage' },
          { name: 'Root Touch-Up', slug: 'root-touch-up' },
        ],
      },
      {
        name: 'Hair Care',
        slug: 'hair-care-services',
        children: [
          { name: 'Hair Wash & Condition', slug: 'hair-wash-condition' },
          { name: 'Scalp Care', slug: 'scalp-care' },
          { name: 'Hair Repair Treatment', slug: 'hair-repair-treatment' },
        ],
      },
    ],
  },
  {
    name: 'Skin & Beauty',
    slug: 'skin-beauty',
    type: 'SERVICE',
    children: [
      {
        name: 'Facial',
        slug: 'facial',
        children: [
          { name: 'Classic Facial', slug: 'classic-facial' },
          { name: 'Hydrafacial', slug: 'hydrafacial' },
          { name: 'Anti-Aging Facial', slug: 'anti-aging-facial' },
          { name: 'Acne Facial', slug: 'acne-facial' },
          { name: 'Brightening Facial', slug: 'brightening-facial' },
          { name: 'Gold Facial', slug: 'gold-facial' },
          { name: 'Oxy Facial', slug: 'oxy-facial' },
        ],
      },
      {
        name: 'Skin Treatments',
        slug: 'skin-treatments',
        children: [
          { name: 'Acne Treatment', slug: 'acne-treatment' },
          { name: 'Pigmentation Treatment', slug: 'pigmentation-treatment' },
          { name: 'Skin Rejuvenation', slug: 'skin-rejuvenation' },
          { name: 'Skin Brightening', slug: 'skin-brightening' },
        ],
      },
      {
        name: 'Hair Removal',
        slug: 'hair-removal',
        children: [
          { name: 'Waxing', slug: 'waxing' },
          { name: 'Full Body Waxing', slug: 'full-body-waxing' },
          { name: 'Threading', slug: 'threading' },
          { name: 'Laser Hair Removal', slug: 'laser-hair-removal' },
        ],
      },
      {
        name: 'Makeup & Beauty Services',
        slug: 'makeup-beauty-services',
        children: [
          { name: 'Makeup', slug: 'makeup' },
          { name: 'Bridal Makeup', slug: 'bridal-makeup' },
          { name: 'Party Makeup', slug: 'party-makeup' },
          { name: 'Eyebrow Shaping', slug: 'eyebrow-shaping' },
          { name: 'Eyelash Tinting', slug: 'eyelash-tinting' },
          { name: 'Eyelash Extensions', slug: 'eyelash-extensions' },
        ],
      },
    ],
  },
  {
    name: 'Nails & Lashes',
    slug: 'nails-lashes',
    type: 'SERVICE',
    children: [
      {
        name: 'Manicure',
        slug: 'manicure',
        children: [
          { name: 'Classic Manicure', slug: 'classic-manicure' },
          { name: 'Gel Manicure', slug: 'gel-manicure' },
          { name: 'Acrylic Manicure', slug: 'acrylic-manicure' },
          { name: 'French Manicure', slug: 'french-manicure' },
        ],
      },
      {
        name: 'Pedicure',
        slug: 'pedicure',
        children: [
          { name: 'Classic Pedicure', slug: 'classic-pedicure' },
          { name: 'Gel Pedicure', slug: 'gel-pedicure' },
          { name: 'Spa Pedicure', slug: 'spa-pedicure' },
          { name: 'French Pedicure', slug: 'french-pedicure' },
        ],
      },
      {
        name: 'Nail Extensions',
        slug: 'nail-extensions',
        children: [
          { name: 'Acrylic Extensions', slug: 'acrylic-extensions' },
          { name: 'Gel Extensions', slug: 'gel-extensions' },
          { name: 'Fiberglass Extensions', slug: 'fiberglass-extensions' },
        ],
      },
      {
        name: 'Nail Art',
        slug: 'nail-art',
        children: [
          { name: 'Hand-Painted Nail Art', slug: 'hand-painted-nail-art' },
          { name: '3D Nail Art', slug: '3d-nail-art' },
          { name: 'Nail Stickers & Decals', slug: 'nail-stickers-decals' },
          { name: 'Glitter & Foil Nails', slug: 'glitter-foil-nails' },
        ],
      },
      {
        name: 'Eyelash Services',
        slug: 'eyelash-services',
        children: [
          { name: 'Eyelash Extensions', slug: 'eyelash-extensions-service' },
          { name: 'Eyelash Tinting', slug: 'eyelash-tinting-service' },
          { name: 'Eyelash Lift', slug: 'eyelash-lift' },
          { name: 'Lash Fill', slug: 'lash-fill' },
        ],
      },
      {
        name: 'Eyebrow Services',
        slug: 'eyebrow-services',
        children: [
          { name: 'Eyebrow Shaping', slug: 'eyebrow-shaping-service' },
          { name: 'Eyebrow Tinting', slug: 'eyebrow-tinting' },
          { name: 'Eyebrow Threading', slug: 'eyebrow-threading' },
          { name: 'Eyebrow Waxing', slug: 'eyebrow-waxing' },
        ],
      },
    ],
  },
  {
    name: 'Therapy',
    slug: 'therapy',
    type: 'THERAPY',
    children: [
      {
        name: 'Mental Wellness',
        slug: 'mental-wellness',
        children: [
          { name: 'Counseling', slug: 'counseling' },
          { name: 'Psychotherapy', slug: 'psychotherapy' },
          { name: 'Stress Therapy', slug: 'stress-therapy' },
          { name: 'Anxiety Support', slug: 'anxiety-support' },
          { name: 'Relationship Counseling', slug: 'relationship-counseling' },
        ],
      },
      {
        name: 'Physical Therapy',
        slug: 'physical-therapy',
        children: [
          { name: 'Physiotherapy', slug: 'physiotherapy' },
          { name: 'Sports Physiotherapy', slug: 'sports-physiotherapy' },
          { name: 'Rehabilitation Therapy', slug: 'rehabilitation-therapy' },
        ],
      },
      {
        name: 'Specialized Therapy',
        slug: 'specialized-therapy',
        children: [
          { name: 'Occupational Therapy', slug: 'occupational-therapy' },
          { name: 'Speech Therapy', slug: 'speech-therapy' },
          { name: 'Behavioral Therapy', slug: 'behavioral-therapy' },
        ],
      },
      {
        name: 'Couple & Family Therapy',
        slug: 'couple-family-therapy',
        children: [
          { name: 'Couple Therapy', slug: 'couple-therapy' },
          { name: 'Family Counseling', slug: 'family-counseling' },
          { name: 'Relationship Therapy', slug: 'relationship-therapy' },
        ],
      },
    ],
  },
  {
    name: 'Product',
    slug: 'product',
    type: 'PRODUCT',
    children: [
      {
        name: 'Skincare',
        slug: 'skincare',
        children: [
          { name: 'Face Wash', slug: 'face-wash' },
          { name: 'Moisturizer', slug: 'moisturizer' },
          { name: 'Serum', slug: 'serum' },
          { name: 'Sunscreen', slug: 'sunscreen' },
          { name: 'Face Mask', slug: 'face-mask' },
          { name: 'Cleanser', slug: 'cleanser' },
        ],
      },
      {
        name: 'Hair Care',
        slug: 'hair-care',
        children: [
          { name: 'Shampoo', slug: 'shampoo' },
          { name: 'Conditioner', slug: 'conditioner' },
          { name: 'Hair Oil', slug: 'hair-oil' },
          { name: 'Hair Serum', slug: 'hair-serum' },
          { name: 'Hair Mask', slug: 'hair-mask' },
        ],
      },
      {
        name: 'Wellness',
        // Disambiguated slug — collides with Spa & Wellness > Wellness otherwise.
        slug: 'wellness-products',
        children: [
          { name: 'Essential Oils', slug: 'essential-oils' },
          { name: 'Massage Oils', slug: 'massage-oils' },
          { name: 'Wellness Kits', slug: 'wellness-kits' },
          { name: 'Self Care Kits', slug: 'self-care-kits' },
        ],
      },
      {
        name: 'Beauty',
        slug: 'beauty',
        children: [
          // Disambiguated slug — collides with Skin & Beauty > Makeup & Beauty Services > Makeup
          // otherwise.
          { name: 'Makeup', slug: 'makeup-product' },
          { name: 'Beauty Tools', slug: 'beauty-tools' },
          { name: 'Nail Care', slug: 'nail-care' },
          { name: 'Personal Care', slug: 'personal-care' },
        ],
      },
      {
        name: 'Massage & Spa Products',
        slug: 'massage-spa-products',
        children: [
          { name: 'Massage Oil', slug: 'massage-oil' },
          // Disambiguated slug — collides with Spa & Wellness > Body Treatments > Body Scrub
          // otherwise.
          { name: 'Body Scrub', slug: 'body-scrub-product' },
          { name: 'Body Lotion', slug: 'body-lotion' },
          { name: 'Spa Kit', slug: 'spa-kit' },
        ],
      },
    ],
  },
];