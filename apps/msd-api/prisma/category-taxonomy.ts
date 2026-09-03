/**
 * The canonical 8-category taxonomy (Category → Subcategory → Type) — the single source of
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
    name: 'Spa & Retreats',
    slug: 'spa-retreats',
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
        name: 'Skin Treatment',
        slug: 'skin-treatment',
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
        name: 'Beauty Services',
        slug: 'beauty-services',
        children: [
          { name: 'Makeup', slug: 'makeup' },
          { name: 'Bridal Makeup', slug: 'bridal-makeup' },
          { name: 'Party Makeup', slug: 'party-makeup' },
          { name: 'Eyebrow', slug: 'eyebrow' },
          { name: 'Eyelash', slug: 'eyelash' },
        ],
      },
    ],
  },
  {
    name: 'Hair & Nails',
    slug: 'hair-nails',
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
        name: 'Hair Treatment',
        slug: 'hair-treatment',
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
        name: 'Nails',
        slug: 'nails',
        children: [
          { name: 'Manicure', slug: 'manicure' },
          { name: 'Pedicure', slug: 'pedicure' },
          { name: 'Gel Nails', slug: 'gel-nails' },
          { name: 'Nail Extension', slug: 'nail-extension' },
          { name: 'Nail Art', slug: 'nail-art' },
        ],
      },
    ],
  },
  {
    name: 'Health & Wellness',
    slug: 'health-wellness',
    type: 'SERVICE',
    children: [
      {
        name: 'Fitness',
        slug: 'fitness',
        children: [
          { name: 'Personal Training', slug: 'personal-training' },
          { name: 'Yoga', slug: 'yoga' },
          { name: 'Pilates', slug: 'pilates' },
          { name: 'Meditation', slug: 'meditation' },
        ],
      },
      {
        name: 'Nutrition',
        slug: 'nutrition',
        children: [
          { name: 'Diet Consultation', slug: 'diet-consultation' },
          { name: 'Nutrition Consultation', slug: 'nutrition-consultation' },
          { name: 'Weight Management', slug: 'weight-management' },
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
      {
        name: 'Alternative Wellness',
        slug: 'alternative-wellness',
        children: [
          { name: 'Ayurveda', slug: 'ayurveda' },
          { name: 'Naturopathy', slug: 'naturopathy' },
          { name: 'Acupressure', slug: 'acupressure' },
          { name: 'Acupuncture', slug: 'acupuncture' },
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
        name: 'Couple & Family',
        slug: 'couple-family',
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
        // Disambiguated slug — collides with Health & Wellness > Wellness otherwise.
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
          // Disambiguated slug — collides with Skin & Beauty > Beauty Services > Makeup
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
          // Disambiguated slug — collides with Spa & Retreats > Body Treatments > Body Scrub
          // otherwise.
          { name: 'Body Scrub', slug: 'body-scrub-product' },
          { name: 'Body Lotion', slug: 'body-lotion' },
          { name: 'Spa Kit', slug: 'spa-kit' },
        ],
      },
    ],
  },
  {
    // Added beyond the user's original 7 requested categories — approved after research found
    // live vendor "Elite Home Services" has real Deals here with no other home in the taxonomy.
    // Two-level only (no Type tier), matching what already existed pre-reset.
    name: 'Home Services',
    slug: 'home-services',
    type: 'SERVICE',
    children: [
      { name: 'Cleaning', slug: 'cleaning', children: [] },
      { name: 'Appliance Repair', slug: 'appliance-repair', children: [] },
    ],
  },
];
