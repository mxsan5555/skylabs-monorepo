import type { Product } from '../types';

export const CATEGORY_LABELS: Record<string, string> = {
  day: 'Day',
  night: 'Night',
  'skin-care': 'Skin Care',
};

const RETURN_POLICY =
  'Non-returnable after opening. Refund or replacement requests are accepted within 5 days of delivery for damaged or defective items with photo evidence.';

export const PRODUCTS: Product[] = [
  {
    id: 'p-01',
    slug: 're-furesh-gelling-mask',
    name: 'Celigin Re Furesh Gelling Mask (25gm x 10ea) with CosCor 5,000ppm',
    brand: 'CELIGIN',
    categorySlug: 'skin-care',
    description:
      'Korean sheet mask made with Tencel Cupra fabric infused with seaweed extract — delivers deep hydration, calms irritation, and leaves skin visibly refreshed after every use.',
    summary:
      'CELIGIN Re Furesh Gelling Mask uses Tencel Cupra fabric — a premium material derived from beechwood — infused with seaweed extract and CosCor 5,000ppm. The mask delivers natural moisture retention for deeply hydrated skin. Its excellent skin adhesion creates a snug fit, boosting skincare absorption for more effective results. The luxuriously soft texture glides smoothly, providing a soothing and refreshing feel suitable for even sensitive skin.',
    benefits: [
      'Brightens skin tone for a more radiant and even complexion',
      'Reduces the appearance of fine lines and wrinkles',
      'Deeply nourishes and refreshes tired, dull skin',
      'Helps calm irritation caused by external environmental factors',
      'Preps skin for makeup, enhancing smooth application and finish',
      'Supports a healthier, more revitalised look',
    ],
    howToUse: [
      'Cleanse your face thoroughly, then prep your skin with a toner pad.',
      'Open the mask and apply evenly, aligning with eyes and mouth.',
      'Leave on for 10–20 minutes and relax.',
      'Remove the mask gently.',
      'Pat remaining essence into the skin until fully absorbed.',
    ],
    ingredients:
      'Niacinamide (Vitamin B3), Centella Asiatica Extract, Laminaria Japonica (Seaweed), Curcuma Longa (Turmeric), Ocimum Sanctum (Holy Basil), Melia Azadirachta (Neem), Ficus Carica (Fig), Spirulina Platensis, Undaria Pinnatifida, Sodium Hyaluronate.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/172743296823HZCjKf.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/172743296823HZCjKf.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/172743296823HZCjKf.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/172743296823HZCjKf.jpg',
    ],
    imageAlt: 'CELIGIN Re Furesh Gelling Mask box with sheet masks',
    badge: 'New',
    price: 3368,
    originalPrice: 4812,
    discount: 30,
    isNew: true,
    isFeatured: true,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
  {
    id: 'p-02',
    slug: 'brightening-peeling-toner-pad',
    name: 'Celigin Brightening Peeling Toner Pad (50ml x 70ea)',
    brand: 'CELIGIN',
    categorySlug: 'day',
    description:
      'A dual-textured toner pad that gently exfoliates dead skin cells while delivering a burst of hydration — revealing a brighter, smoother complexion with every swipe.',
    summary:
      'CELIGIN Brightening Peeling Toner Pad combines physical and chemical exfoliation in one convenient pad. The textured side removes dead skin cells and unclogs pores, while the smooth side delivers niacinamide and hyaluronic acid deep into the skin. Use daily after cleansing for a lasting brightening effect and improved skin texture.',
    benefits: [
      'Dual-action exfoliation removes dead cells and unclogs pores',
      'Niacinamide visibly brightens and evens skin tone',
      'Hyaluronic acid delivers instant and lasting hydration',
      'Improves absorption of subsequent skincare products',
      'Gentle enough for daily use on all skin types',
    ],
    howToUse: [
      'After cleansing, take one pad from the container.',
      'Swipe the textured side over your face in gentle circular motions.',
      'Follow with the smooth side, pressing gently for absorption.',
      'Allow to dry before applying serum or moisturiser.',
      'Use morning or evening as part of your routine.',
    ],
    ingredients:
      'Niacinamide, Sodium Hyaluronate, Centella Asiatica Extract, AHA (Glycolic Acid), BHA (Salicylic Acid), Panthenol, Allantoin, Betaine.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/1734437650kfzFCSTV.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1734437650kfzFCSTV.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1734437650kfzFCSTV.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1734437650kfzFCSTV.jpg',
    ],
    imageAlt: 'CELIGIN Brightening Peeling Toner Pad jar with 70 pads',
    badge: 'New',
    price: 2327,
    originalPrice: 3325,
    discount: 30,
    isNew: true,
    isFeatured: true,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
  {
    id: 'p-03',
    slug: 'daily-sun-finish',
    name: 'Celigin Daily Sun Finish (50ml)',
    brand: 'CELIGIN',
    categorySlug: 'day',
    description:
      'A lightweight, broad-spectrum SPF finish that protects against UV damage while leaving a natural, non-greasy glow — your final step for complete daily skin protection.',
    summary:
      'CELIGIN Daily Sun Finish delivers broad-spectrum UVA/UVB protection in a featherlight formula that sits invisibly on all skin tones. Infused with skin-caring botanicals, it hydrates and soothes while shielding the skin from environmental aggressors. No white cast, no heaviness — just clean, protected skin ready for any day.',
    benefits: [
      'Broad-spectrum SPF shields against UVA and UVB damage',
      'Featherlight formula leaves no white cast on any skin tone',
      'Botanical extracts soothe and nourish skin throughout the day',
      'Non-greasy finish sits comfortably under or over makeup',
      'Protects against photoaging and hyperpigmentation',
    ],
    howToUse: [
      'Apply as the final step of your morning skincare routine.',
      'Dispense a pearl-sized amount and spread evenly over face and neck.',
      'Reapply every 2–3 hours when spending time outdoors.',
      'Can be worn alone or under makeup.',
    ],
    ingredients:
      'Titanium Dioxide, Zinc Oxide, Niacinamide, Centella Asiatica Extract, Hyaluronic Acid, Portulaca Oleracea Extract, Tocopherol (Vitamin E), Sodium Hyaluronate.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/17223335403s8DS87u.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17223335403s8DS87u.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17223335403s8DS87u.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17223335403s8DS87u.jpg',
    ],
    imageAlt: 'CELIGIN Daily Sun Finish SPF tube 50ml',
    badge: 'New',
    price: 2327,
    originalPrice: 3325,
    discount: 30,
    isNew: true,
    isFeatured: false,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
  {
    id: 'p-04',
    slug: 'cells-queen',
    name: "Celigin Cell's Queen (61gm)",
    brand: 'CELIGIN',
    categorySlug: 'night',
    description:
      "A premium anti-ageing cream that harnesses royal cell-renewal technology to visibly firm, lift, and rejuvenate mature skin — CELIGIN's most luxurious treatment.",
    summary:
      "CELIGIN Cell's Queen is an advanced anti-ageing treatment cream formulated with cell-renewal actives, peptides, and concentrated plant stem cells. Designed for mature skin, it targets deep wrinkles, loss of firmness, and uneven skin tone in one rich yet fast-absorbing formula. Use morning and evening for a visibly lifted and plumped complexion.",
    benefits: [
      'Visibly firms and lifts sagging skin with peptide technology',
      'Plant stem cells stimulate natural skin cell renewal',
      'Deep wrinkles appear smoother and less defined',
      'Rich yet fast-absorbing formula suitable for daily use',
      'Restores radiance and vibrancy to dull, mature skin',
    ],
    howToUse: [
      'After toner and serum, take a small amount onto your fingertips.',
      'Warm between fingers and press gently onto face, neck, and décolletage.',
      'Use upward, lifting motions for best results.',
      'Apply morning and evening as the final moisturising step.',
    ],
    ingredients:
      'Peptide Complex (Palmitoyl Tripeptide-1, Palmitoyl Tetrapeptide-7), Plant Stem Cell Extract, Niacinamide, Ceramide NP, Hyaluronic Acid, Squalane, Centella Asiatica Extract, Tocopherol.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/17344351719zSEFXiu.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17344351719zSEFXiu.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17344351719zSEFXiu.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17344351719zSEFXiu.jpg',
    ],
    imageAlt: "CELIGIN Cell's Queen premium anti-ageing cream jar 61gm",
    badge: 'New',
    price: 9933,
    originalPrice: 14191,
    discount: 30,
    isNew: true,
    isFeatured: true,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
  {
    id: 'p-05',
    slug: 'signature-cell-biome-duo',
    name: 'Celigin Signature Cell Biome Duo',
    brand: 'CELIGIN',
    categorySlug: 'skin-care',
    description:
      'A two-step biome-balancing duo — a skin-strengthening essence and a barrier-repairing serum — that works together to restore your skin microbiome and reveal a healthier complexion.',
    summary:
      "CELIGIN Signature Cell Biome Duo pairs a microbiome-balancing essence with a concentrated repair serum. The essence preps and hydrates, while the serum delivers high-potency actives directly into the skin. Used together, they strengthen the skin barrier, reduce redness and sensitivity, and build long-term skin resilience. A complete skin health duo in one beautifully packaged set.",
    benefits: [
      'Dual-step routine balances and restores the skin microbiome',
      'Essence preps skin and doubles absorption of the serum',
      'Serum delivers concentrated actives for targeted repair',
      'Reduces redness and sensitivity over consistent use',
      'Strengthens the skin barrier against daily environmental stress',
    ],
    howToUse: [
      'After cleansing, apply the essence by pressing gently into skin.',
      'Wait 30 seconds for the essence to absorb.',
      'Follow immediately with 2–3 drops of the serum.',
      'Press into skin using flat palms — do not rub.',
      'Complete with moisturiser and SPF in the morning.',
    ],
    ingredients:
      'Essence: Bifida Ferment Lysate, Lactobacillus Ferment, Beta-Glucan, Panthenol, Centella Asiatica. Serum: Niacinamide, Peptide Complex, Hyaluronic Acid, Ceramide, Squalane.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/17344357007I7fCduh.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17344357007I7fCduh.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17344357007I7fCduh.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/17344357007I7fCduh.jpg',
    ],
    imageAlt: 'CELIGIN Signature Cell Biome Duo essence and serum set',
    badge: 'New',
    price: 7350,
    originalPrice: 10500,
    discount: 30,
    isNew: true,
    isFeatured: true,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
  {
    id: 'p-06',
    slug: 'timeless-oil-mist',
    name: 'Celigin Timeless Oil Mist (50ml)',
    brand: 'CELIGIN',
    categorySlug: 'day',
    description:
      'A luxurious face oil mist that delivers a burst of nourishing botanicals and essential oils in one ultra-fine spray — for dewy, glowing skin anytime, anywhere.',
    summary:
      'CELIGIN Timeless Oil Mist blends lightweight botanical oils with skin-loving actives into a featherweight mist. Spritz over bare skin or makeup to instantly hydrate, set, and add a luminous finish. The ultra-fine nozzle delivers an even, non-greasy veil that absorbs in seconds without disturbing your look.',
    benefits: [
      'Instantly hydrates and refreshes skin mid-day without disturbing makeup',
      'Lightweight botanical oils deliver nourishment without greasiness',
      'Ultra-fine mist gives a natural, dewy glow in seconds',
      'Sets makeup and extends wear throughout the day',
      'Suitable for all skin types including oily and combination',
    ],
    howToUse: [
      'Shake gently before each use.',
      'Hold 20–25cm away from your face and close your eyes.',
      'Mist evenly over face for 1–2 seconds.',
      'Allow to dry naturally or gently press in with fingertips.',
      'Use over bare skin or makeup as often as needed.',
    ],
    ingredients:
      'Squalane, Jojoba Seed Oil, Rosehip Fruit Oil, Sea Buckthorn Fruit Oil, Niacinamide, Sodium Hyaluronate, Rosa Damascena Flower Water, Glycerin, Tocopherol.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/1734435837S7pdpsvP.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1734435837S7pdpsvP.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1734435837S7pdpsvP.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1734435837S7pdpsvP.jpg',
    ],
    imageAlt: 'CELIGIN Timeless Oil Mist spray bottle 50ml',
    badge: 'New',
    price: 2327,
    originalPrice: 3325,
    discount: 30,
    isNew: true,
    isFeatured: false,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
  {
    id: 'p-07',
    slug: 'royal-intensive-cream',
    name: 'Celigin Royal Intensive Cream (50ml)',
    brand: 'CELIGIN',
    categorySlug: 'night',
    description:
      'An intensively hydrating overnight cream enriched with royal jelly and ceramides — repairs the skin barrier while you sleep and delivers visibly plumper, softer skin by morning.',
    summary:
      'CELIGIN Royal Intensive Cream is a rich overnight treatment that works in sync with your skin\'s natural nighttime repair cycle. Royal jelly provides amino acids and fatty acids that nourish deeply, while ceramides reinforce the skin barrier to lock in moisture. Wake up to noticeably softer, plumper, and more radiant skin with consistent use.',
    benefits: [
      'Royal jelly delivers amino acids for overnight deep nourishment',
      'Ceramides reinforce the skin barrier and lock in moisture',
      'Rich formula absorbs fully — no transfer onto pillow',
      'Plumps and softens skin visibly overnight',
      'Repairs signs of daily stress including dryness and dullness',
    ],
    howToUse: [
      'As the final step of your evening skincare routine, take a pea-sized amount.',
      'Warm between fingertips and press gently over face and neck.',
      'Use upward strokes and allow full absorption before sleeping.',
      'Use nightly for best results. Morning use is optional in dry climates.',
    ],
    ingredients:
      'Royal Jelly Extract, Ceramide NP, Ceramide AP, Cholesterol, Sodium Hyaluronate, Niacinamide, Squalane, Shea Butter, Peptide Complex, Allantoin.',
    returnPolicy: RETURN_POLICY,
    image: 'https://www.celiginglobal.com/public/assets/images/thumbnails/1777444939UxpEgrjl.jpg',
    gallery: [
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1777444939UxpEgrjl.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1777444939UxpEgrjl.jpg',
      'https://www.celiginglobal.com/public/assets/images/thumbnails/1777444939UxpEgrjl.jpg',
    ],
    imageAlt: 'CELIGIN Royal Intensive Cream jar 50ml with royal jelly',
    badge: 'New',
    price: 5206,
    originalPrice: 7438,
    discount: 30,
    isNew: true,
    isFeatured: true,
    rating: 4.8,
    reviews: 156,
    affiliateUrl: "https://www.celiginglobal.com/product/re-furesh-gelling-mask-25gm-x-10ea-with-coscor-5000ppm",
  },
];

export function getProductById(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

export function getProductBySlug(slug: string): Product | undefined {
  return PRODUCTS.find((p) => p.slug === slug);
}

export function getProductsByCategory(categorySlug: string): Product[] {
  return PRODUCTS.filter((p) => p.categorySlug === categorySlug);
}

export function getFeaturedProducts(): Product[] {
  return PRODUCTS.filter((p) => p.isFeatured);
}

export function getNewProducts(): Product[] {
  return PRODUCTS.filter((p) => p.isNew);
}
