import type { Category } from '../types';
import { DEALS } from './deals';

const getServiceCount = (slug: string) =>
  DEALS.filter(deal => deal.categorySlug === slug).length;
const catImg = (seed: string) => `https://picsum.photos/seed/msd-cat-${seed}/400/400`;

export const CATEGORIES: Category[] = [
  {
    id: 'cat-1',
    slug: 'massage',
    name: 'Massage',
    icon: 'self_improvement',
    serviceCount: getServiceCount('massage'),
    description: 'Swedish, deep tissue, Thai, hot stone and more from certified therapists.',
    image: catImg('massage'),
    imageAlt: 'Massage therapy session',
    subcategories: [
      { id: 'sc-1-1', slug: 'swedish', name: 'Swedish Massage' },
      { id: 'sc-1-2', slug: 'deep-tissue', name: 'Deep Tissue' },
      { id: 'sc-1-3', slug: 'thai', name: 'Thai Massage' },
      { id: 'sc-1-4', slug: 'hot-stone', name: 'Hot Stone' },
      { id: 'sc-1-5', slug: 'sports', name: 'Sports Massage' },
    ],
  },
  {
    id: 'cat-2',
    slug: 'spas-retreats',
    name: 'Spas & Retreats',
    icon: 'spa',
    serviceCount: getServiceCount('spas-retreats'),
    description: 'Day spa packages, couples retreats, and full wellness escape experiences.',
    image: catImg('spa'),
    imageAlt: 'Luxury spa retreat',
    subcategories: [
      { id: 'sc-2-1', slug: 'day-spa', name: 'Day Spa' },
      { id: 'sc-2-2', slug: 'couples', name: 'Couples Retreat' },
      { id: 'sc-2-3', slug: 'wellness-package', name: 'Wellness Package' },
      { id: 'sc-2-4', slug: 'detox', name: 'Detox & Cleanse' },
    ],
  },
  {
    id: 'cat-3',
    slug: 'skin-beauty',
    name: 'Skin & Beauty',
    icon: 'face_retouching_natural',
    serviceCount: getServiceCount('skin-beauty'),
    description: 'Facials, chemical peels, anti-ageing treatments, and more for glowing skin.',
    image: catImg('skin'),
    imageAlt: 'Facial skin treatment',
    subcategories: [
      { id: 'sc-3-1', slug: 'facial', name: 'Facials' },
      { id: 'sc-3-2', slug: 'peel', name: 'Chemical Peels' },
      { id: 'sc-3-3', slug: 'anti-ageing', name: 'Anti-Ageing' },
      { id: 'sc-3-4', slug: 'hydrafacial', name: 'HydraFacial' },
    ],
  },
  {
    id: 'cat-4',
    slug: 'hair-nails',
    name: 'Hair & Nails',
    icon: 'content_cut',
    serviceCount:getServiceCount('hair-nails'),
    description: 'Manicures, pedicures, nail art, and hair treatments at top salons.',
    image: catImg('nails'),
    imageAlt: 'Nail care and manicure',
    subcategories: [
      { id: 'sc-4-1', slug: 'manicure', name: 'Manicure' },
      { id: 'sc-4-2', slug: 'pedicure', name: 'Pedicure' },
      { id: 'sc-4-3', slug: 'nail-art', name: 'Nail Art' },
      { id: 'sc-4-4', slug: 'hair-spa', name: 'Hair Spa' },
    ],
  },
  {
    id: 'cat-5',
    slug: 'health-wellness',
    name: 'Health & Wellness',
    icon: 'favorite',
    serviceCount:getServiceCount('health-wellness'),
    description: 'Yoga, meditation, acupuncture, physiotherapy and holistic wellness sessions.',
    image: catImg('yoga'),
    imageAlt: 'Yoga and wellness session',
    subcategories: [
      { id: 'sc-5-1', slug: 'yoga', name: 'Yoga' },
      { id: 'sc-5-2', slug: 'meditation', name: 'Meditation' },
      { id: 'sc-5-3', slug: 'acupuncture', name: 'Acupuncture' },
      { id: 'sc-5-4', slug: 'physiotherapy', name: 'Physiotherapy' },
    ],
  },
];

const img = (seed: string, w = 400, h = 300) =>
  `https://picsum.photos/seed/msd-${seed}/${w}/${h}`;

export function getCategoryBySlug(slug: string): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug);
}

export { img as categoryImage };
