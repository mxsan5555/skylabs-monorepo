/**
 * Canonical category taxonomy used by the MSD seed.
 *
 * Structure: Category -> Subcategory.
 * This file is the single source of truth for category names, slugs and types.
 *
 * The taxonomy intentionally contains the six categories requested by the current
 * business structure. Subcategories do not have a third-level Type.
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
        children: [],
      },
      {
        name: 'Head & Neck Massage',
        slug: 'head-neck-massage',
        children: [],
      },
      {
        name: 'Foot Massage',
        slug: 'foot-massage',
        children: [],
      },
      {
        name: 'Prenatal Massage',
        slug: 'prenatal-massage',
        children: [],
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
        children: [],
      },
      {
        name: 'Steam & Sauna',
        slug: 'steam-sauna',
        children: [],
      },
      {
        name: 'Retreats',
        slug: 'retreats',
        children: [],
      },
      {
        name: 'Body Treatments',
        slug: 'body-treatments',
        children: [],
      },
      {
        name: 'Wellness',
        slug: 'wellness',
        children: [],
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
        children: [],
      },
      {
        name: 'Hair Treatments',
        slug: 'hair-treatments',
        children: [],
      },
      {
        name: 'Hair Coloring',
        slug: 'hair-coloring',
        children: [],
      },
      {
        name: 'Hair Care',
        slug: 'hair-care',
        children: [],
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
        children: [],
      },
      {
        name: 'Skin Treatments',
        slug: 'skin-treatments',
        children: [],
      },
      {
        name: 'Hair Removal',
        slug: 'hair-removal',
        children: [],
      },
      {
        name: 'Makeup & Beauty Services',
        slug: 'makeup-beauty-services',
        children: [],
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
        children: [],
      },
      {
        name: 'Pedicure',
        slug: 'pedicure',
        children: [],
      },
      {
        name: 'Nail Extensions',
        slug: 'nail-extensions',
        children: [],
      },
      {
        name: 'Nail Art',
        slug: 'nail-art',
        children: [],
      },
      {
        name: 'Eyelash Services',
        slug: 'eyelash-services',
        children: [],
      },
      {
        name: 'Eyebrow Services',
        slug: 'eyebrow-services',
        children: [],
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
        children: [],
      },
      {
        name: 'Physical Therapy',
        slug: 'physical-therapy',
        children: [],
      },
      {
        name: 'Specialized Therapy',
        slug: 'specialized-therapy',
        children: [],
      },
      {
        name: 'Couple & Family Therapy',
        slug: 'couple-family-therapy',
        children: [],
      },
    ],
  },
];
