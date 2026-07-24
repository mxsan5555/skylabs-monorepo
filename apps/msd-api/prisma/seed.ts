/**
 * Seeds the msd DB with rows whose id/slug match the frontend's static
 * `apps/msd/src/data/{categories,deals}.ts` — so the (unchanged) storefront
 * pages, which still read those static arrays, resolve to real backend
 * records when a user adds one to a server-backed cart and checks out.
 *
 * Run: `npx prisma db seed --schema apps/msd-api/prisma/schema.prisma`
 */
import { PrismaClient, BusinessType } from '../src/generated/prisma';

const prisma = new PrismaClient();

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Delhi: { lat: 28.7041, lng: 77.1025 },
  Noida: { lat: 28.5355, lng: 77.391 },
};

function coordsFor(city: string) {
  return CITY_COORDS[city] ?? { lat: 20.5937, lng: 78.9629 };
}

const CATEGORIES = [
  {
    id: 'cat-1',
    slug: 'massage',
    name: 'Massage',
    icon: 'self_improvement',
    description: 'Swedish, deep tissue, Thai, hot stone and more from certified therapists.',
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
    description: 'Day spa packages, couples retreats, and full wellness escape experiences.',
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
    description: 'Facials, chemical peels, anti-ageing treatments, and more for glowing skin.',
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
    description: 'Manicures, pedicures, nail art, and hair treatments at top salons.',
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
    description: 'Yoga, meditation, acupuncture, physiotherapy and holistic wellness sessions.',
    subcategories: [
      { id: 'sc-5-1', slug: 'yoga', name: 'Yoga' },
      { id: 'sc-5-2', slug: 'meditation', name: 'Meditation' },
      { id: 'sc-5-3', slug: 'acupuncture', name: 'Acupuncture' },
      { id: 'sc-5-4', slug: 'physiotherapy', name: 'Physiotherapy' },
    ],
  },
];

const FEATURES = [
  'Couples', 'Group', 'Mobile Therapist', 'Organic Products', 'Private Room',
  'Pool Access', 'Outdoor', 'Steam Room', 'Sauna',
];

interface MockDeal {
  id: string;
  slug: string;
  title: string;
  providerName: string;
  categorySlug: string;
  subcategorySlug: string;
  description: string;
  image: string;
  imageAlt: string;
  gallery: string[];
  price: number;
  originalPrice?: number;
  priceUnit: string;
  duration: number;
  location: string;
  isFeatured: boolean;
  isHot: boolean;
  badge?: string;
  features: string[];
  included: string[];
  howToUse: string[];
}

// Mirrors apps/msd/src/data/deals.ts — id/slug/price/duration/location must match.
const DEALS: MockDeal[] = [
  { id: 'd-01', slug: 'serenity-spa-summer-glow', title: 'Summer Glow Package', providerName: 'Serenity Spa & Wellness', categorySlug: 'spas-retreats', subcategorySlug: 'day-spa', description: 'Signature massage, facial, and aromatherapy packages for complete mind-body relaxation.', image: 'https://picsum.photos/seed/msd-spa-glow/600/400', imageAlt: 'Relaxing spa treatment with essential oils', gallery: ['https://picsum.photos/seed/msd-spa-glow/600/400', 'https://picsum.photos/seed/msd-spa-glow-2/600/400', 'https://picsum.photos/seed/msd-spa-glow-3/600/400'], price: 2499, originalPrice: 3499, priceUnit: 'per session', duration: 90, location: 'Bandra West, Mumbai', isFeatured: true, isHot: false, badge: '30% OFF', features: ['Couples', 'Organic Products', 'Private Room'], included: ['Full body Swedish massage (60 min)', 'Brightening facial (20 min)', 'Aromatherapy session (10 min)', 'Herbal tea & refreshments'], howToUse: ['Book online and receive a confirmation SMS.', 'Arrive 10 minutes early to complete your wellness form.', 'Present your booking code at the reception.'] },
  { id: 'd-02', slug: 'urban-massage-swedish-bliss', title: 'Swedish Bliss', providerName: 'Urban Massage Studio', categorySlug: 'massage', subcategorySlug: 'swedish', description: 'Swedish deep tissue and Thai massage by certified therapists in a modern studio.', image: 'https://picsum.photos/seed/msd-massage-swedish/600/400', imageAlt: 'Swedish massage session at Urban Massage Studio', gallery: ['https://picsum.photos/seed/msd-massage-swedish/600/400', 'https://picsum.photos/seed/msd-massage-swedish-2/600/400'], price: 999, originalPrice: 1299, priceUnit: 'per session', duration: 60, location: 'Koramangala, Bangalore', isFeatured: true, isHot: false, features: ['Mobile Therapist'], included: ['Full body Swedish massage', 'Complimentary neck & shoulder focus', 'Post-session relaxation tea'], howToUse: ['Book your slot online.', 'Receive a therapist assignment notification.', 'Enjoy your session at the studio or at home.'] },
  { id: 'd-03', slug: 'glow-skin-clinic-hydra-facial', title: 'Hydra Glow Facial', providerName: 'Glow Skin Clinic', categorySlug: 'skin-beauty', subcategorySlug: 'hydrafacial', description: 'Advanced HydraFacial with deep cleanse, extraction, and intense hydration for luminous skin.', image: 'https://picsum.photos/seed/msd-facial-hydra/600/400', imageAlt: 'HydraFacial treatment at Glow Skin Clinic', gallery: ['https://picsum.photos/seed/msd-facial-hydra/600/400', 'https://picsum.photos/seed/msd-facial-hydra-2/600/400'], price: 3499, originalPrice: 4999, priceUnit: 'per session', duration: 45, location: 'Connaught Place, Delhi', isFeatured: true, isHot: true, badge: 'Hot', features: ['Organic Products', 'Private Room'], included: ['HydraFacial cleanse & exfoliation', 'Extractions (painless)', 'Serum infusion', 'LED light therapy', 'SPF moisturiser application'], howToUse: ['Arrive with a clean, makeup-free face.', 'Consultation with skin specialist included.', 'Avoid sun exposure for 24 hours post-treatment.'] },
  { id: 'd-04', slug: 'tranquil-thai-full-body', title: 'Thai Full Body', providerName: 'Tranquil Thai Retreat', categorySlug: 'massage', subcategorySlug: 'thai', description: 'Authentic Thai massage combining acupressure, stretching, and energy line work for total rejuvenation.', image: 'https://picsum.photos/seed/msd-thai-massage/600/400', imageAlt: 'Traditional Thai massage session', gallery: ['https://picsum.photos/seed/msd-thai-massage/600/400', 'https://picsum.photos/seed/msd-thai-massage-2/600/400'], price: 1499, originalPrice: 1999, priceUnit: 'per session', duration: 90, location: 'Hauz Khas, Delhi', isFeatured: false, isHot: false, features: ['Private Room', 'Organic Products'], included: ['Full body Thai massage', 'Traditional herbal compress', 'Ginger tea'], howToUse: ['Wear comfortable, loose clothing.', 'Inform therapist of any injuries or conditions.', 'Hydrate well after your session.'] },
  { id: 'd-05', slug: 'bliss-spa-couples-retreat', title: 'Couples Retreat', providerName: 'Bliss Spa & Resort', categorySlug: 'spas-retreats', subcategorySlug: 'couples', description: 'A romantic escape for two — side-by-side massages, jacuzzi, and candlelit relaxation lounge.', image: 'https://picsum.photos/seed/msd-couples-spa/600/400', imageAlt: 'Couples spa retreat with candles and rose petals', gallery: ['https://picsum.photos/seed/msd-couples-spa/600/400', 'https://picsum.photos/seed/msd-couples-spa-2/600/400'], price: 5999, originalPrice: 7999, priceUnit: 'per couple', duration: 120, location: 'Juhu, Mumbai', isFeatured: false, isHot: true, badge: 'Hot', features: ['Couples', 'Pool Access', 'Private Room'], included: ['Side-by-side Swedish massage (60 min each)', 'Jacuzzi session (30 min)', 'Champagne & fruit platter', 'Candlelit relaxation lounge'], howToUse: ['Book at least 2 days in advance.', 'Arrive together and enjoy a private check-in.', 'Bring swimwear for the jacuzzi.'] },
  { id: 'd-06', slug: 'zen-garden-anti-ageing-peel', title: 'Anti-Ageing Peel', providerName: 'Zen Garden Salon', categorySlug: 'skin-beauty', subcategorySlug: 'peel', description: 'Medical-grade chemical peel targeting fine lines, pigmentation, and uneven texture for visibly younger skin.', image: 'https://picsum.photos/seed/msd-skin-peel/600/400', imageAlt: 'Anti-ageing peel treatment at Zen Garden Salon', gallery: ['https://picsum.photos/seed/msd-skin-peel/600/400', 'https://picsum.photos/seed/msd-skin-peel-2/600/400'], price: 2999, priceUnit: 'per session', duration: 60, location: 'Indiranagar, Bangalore', isFeatured: false, isHot: false, features: ['Private Room', 'Organic Products'], included: ['Skin analysis', 'Glycolic acid peel', 'Soothing mask', 'SPF sunscreen'], howToUse: ['Discontinue retinoids 5 days before treatment.', 'Arrive with clean skin.', 'Avoid exfoliation for 1 week after.'] },
  { id: 'd-07', slug: 'nails-by-nisha-gel-manicure', title: 'Gel Manicure', providerName: 'Nails by Nisha', categorySlug: 'hair-nails', subcategorySlug: 'manicure', description: 'Long-lasting gel manicure with cuticle care, nail shaping, and a colour of your choice.', image: 'https://picsum.photos/seed/msd-manicure/600/400', imageAlt: 'Gel manicure at Nails by Nisha', gallery: ['https://picsum.photos/seed/msd-manicure/600/400', 'https://picsum.photos/seed/msd-manicure-2/600/400'], price: 799, originalPrice: 999, priceUnit: 'per session', duration: 45, location: 'Vile Parle, Mumbai', isFeatured: false, isHot: false, features: ['Organic Products'], included: ['Cuticle care & shaping', 'Gel base + colour + top coat', '200+ colour options', 'UV cure'], howToUse: ['Book your preferred time slot.', 'Choose your gel colour from the catalogue.', 'Gel lasts 2–3 weeks with proper care.'] },
  { id: 'd-08', slug: 'pure-bliss-spa-pedicure', title: 'Spa Pedicure', providerName: 'Pure Bliss Studio', categorySlug: 'hair-nails', subcategorySlug: 'pedicure', description: 'Luxurious spa pedicure with foot soak, exfoliation, massage, and gel colour finish.', image: 'https://picsum.photos/seed/msd-pedicure/600/400', imageAlt: 'Spa pedicure treatment at Pure Bliss Studio', gallery: ['https://picsum.photos/seed/msd-pedicure/600/400', 'https://picsum.photos/seed/msd-pedicure-2/600/400'], price: 999, priceUnit: 'per session', duration: 60, location: 'Powai, Mumbai', isFeatured: false, isHot: false, features: ['Organic Products'], included: ['Lavender foot soak', 'Sugar scrub exfoliation', 'Callus removal', '15-min foot massage', 'Gel colour of choice'], howToUse: ['Book your slot and arrive clean.', 'Wear open-toe footwear after the session.', 'Avoid wetting nails for 2 hours.'] },
  { id: 'd-09', slug: 'mindful-yoga-morning-flow', title: 'Morning Flow Yoga', providerName: 'Mindful Yoga Studio', categorySlug: 'health-wellness', subcategorySlug: 'yoga', description: 'Energising morning vinyasa flow for all levels — breathwork, stretching, and mindfulness in one session.', image: 'https://picsum.photos/seed/msd-yoga-flow/600/400', imageAlt: 'Morning yoga flow session at Mindful Yoga Studio', gallery: ['https://picsum.photos/seed/msd-yoga-flow/600/400', 'https://picsum.photos/seed/msd-yoga-flow-2/600/400'], price: 599, originalPrice: 799, priceUnit: 'per class', duration: 60, location: 'HSR Layout, Bangalore', isFeatured: false, isHot: false, features: ['Group'], included: ['Guided vinyasa flow', 'Pranayama (breathwork)', 'Guided meditation', 'Yoga mat & props provided'], howToUse: ['Book at least 1 hour before class.', 'Wear comfortable, stretchy clothing.', 'Arrive 5 minutes early.'] },
  { id: 'd-10', slug: 'detox-body-wrap', title: 'Detox Body Wrap', providerName: 'Serenity Spa & Wellness', categorySlug: 'spas-retreats', subcategorySlug: 'detox', description: 'Full body detox wrap with seaweed and clay — draws out toxins, firms skin, and leaves you glowing.', image: 'https://picsum.photos/seed/msd-detox-wrap/600/400', imageAlt: 'Detox body wrap treatment', gallery: ['https://picsum.photos/seed/msd-detox-wrap/600/400', 'https://picsum.photos/seed/msd-detox-wrap-2/600/400'], price: 3999, originalPrice: 5499, priceUnit: 'per session', duration: 90, location: 'Bandra West, Mumbai', isFeatured: false, isHot: true, badge: '25% OFF', features: ['Private Room', 'Organic Products'], included: ['Body exfoliation scrub', 'Seaweed & clay wrap application', '45-min wrap rest with calming music', 'Warm shower', 'Hydrating body lotion'], howToUse: ['Avoid eating 1 hour before the session.', 'Drink plenty of water afterwards.', 'Wear old underwear — the clay can stain.'] },
  { id: 'd-11', slug: 'hot-stone-deep-relax', title: 'Hot Stone Relaxation', providerName: 'The Stone Sanctuary', categorySlug: 'massage', subcategorySlug: 'hot-stone', description: 'Heated basalt stones melt away tension while your therapist works deep into muscle fibres.', image: 'https://picsum.photos/seed/msd-hot-stone/600/400', imageAlt: 'Hot stone massage treatment', gallery: ['https://picsum.photos/seed/msd-hot-stone/600/400', 'https://picsum.photos/seed/msd-hot-stone-2/600/400'], price: 2199, originalPrice: 2799, priceUnit: 'per session', duration: 75, location: 'Andheri West, Mumbai', isFeatured: true, isHot: false, features: ['Private Room'], included: ['Hot basalt stone placement', 'Full body massage with stones', 'Aromatherapy oil of choice', 'Warm towel finish'], howToUse: ['Suitable for all skin types.', 'Inform therapist if you have sensitive skin or medical conditions.', 'Stay hydrated post-session.'] },
  { id: 'd-12', slug: 'zenith-meditation-session', title: 'Guided Meditation', providerName: 'Zenith Wellness Centre', categorySlug: 'health-wellness', subcategorySlug: 'meditation', description: 'Science-backed guided meditation for stress relief, better sleep, and improved focus.', image: 'https://picsum.photos/seed/msd-meditation/600/400', imageAlt: 'Guided meditation session at Zenith Wellness Centre', gallery: ['https://picsum.photos/seed/msd-meditation/600/400', 'https://picsum.photos/seed/msd-meditation-2/600/400'], price: 499, priceUnit: 'per session', duration: 45, location: 'Koramangala, Bangalore', isFeatured: false, isHot: false, features: ['Group'], included: ['Guided breath awareness', 'Body scan meditation', 'Visualisation exercise', 'Personalised post-session notes'], howToUse: ['No experience required.', 'Wear comfortable clothing.', 'Sessions available in English and Hindi.'] },
  { id: 'd-13', slug: 'revive-sports-massage', title: 'Sports Recovery Massage', providerName: 'Revive Physiotherapy', categorySlug: 'massage', subcategorySlug: 'sports', description: 'Deep tissue sports massage targeting fatigued muscles, joint stiffness, and post-workout recovery.', image: 'https://picsum.photos/seed/msd-sports-massage/600/400', imageAlt: 'Sports recovery massage at Revive Physiotherapy', gallery: ['https://picsum.photos/seed/msd-sports-massage/600/400', 'https://picsum.photos/seed/msd-sports-massage-2/600/400'], price: 1799, priceUnit: 'per session', duration: 60, location: 'Whitefield, Bangalore', isFeatured: false, isHot: false, features: ['Mobile Therapist'], included: ['Sport-specific assessment', 'Deep tissue massage', 'Stretching & mobility work', 'Recovery foam rolling'], howToUse: ['Book within 48 hours of intense exercise.', 'Inform therapist of injury history.', 'Arrive in sportswear.'] },
  { id: 'd-14', slug: 'glow-skin-classic-facial', title: 'Classic Brightening Facial', providerName: 'Glow Skin Clinic', categorySlug: 'skin-beauty', subcategorySlug: 'facial', description: 'Deep-cleansing facial with vitamin C serum, brightening mask, and lymphatic drainage for an instant glow.', image: 'https://picsum.photos/seed/msd-facial-classic/600/400', imageAlt: 'Classic brightening facial treatment', gallery: ['https://picsum.photos/seed/msd-facial-classic/600/400', 'https://picsum.photos/seed/msd-facial-classic-2/600/400'], price: 1499, originalPrice: 1999, priceUnit: 'per session', duration: 60, location: 'Connaught Place, Delhi', isFeatured: true, isHot: false, features: ['Private Room', 'Organic Products'], included: ['Double cleanse', 'Steam & extractions', 'Vitamin C serum', 'Brightening mask', 'SPF moisturiser'], howToUse: ['Arrive with a clean face.', 'Avoid retinoids 3 days before.', 'Use SPF 50 daily post-treatment.'] },
  { id: 'd-15', slug: 'serene-hair-spa', title: 'Keratin Hair Spa', providerName: 'Serene Salon & Spa', categorySlug: 'hair-nails', subcategorySlug: 'hair-spa', description: 'Intensive keratin hair spa that repairs damage, reduces frizz, and adds brilliant shine.', image: 'https://picsum.photos/seed/msd-hair-spa/600/400', imageAlt: 'Keratin hair spa treatment at Serene Salon', gallery: ['https://picsum.photos/seed/msd-hair-spa/600/400', 'https://picsum.photos/seed/msd-hair-spa-2/600/400'], price: 1999, originalPrice: 2799, priceUnit: 'per session', duration: 90, location: 'Sector 18, Noida', isFeatured: false, isHot: true, badge: 'Hot', features: ['Organic Products'], included: ['Clarifying shampoo wash', 'Keratin treatment application', 'Steam processing', 'Blow-dry & iron finish', 'Leave-in conditioner'], howToUse: ['Do not wash hair for 72 hours after treatment.', 'Use sulphate-free shampoo to maintain results.', 'Results last 3–4 months.'] },
];

function slugifyCompany(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function main() {
  console.log('Seeding categories...');
  for (const [ci, cat] of CATEGORIES.entries()) {
    await prisma.category.upsert({
      where: { id: cat.id },
      update: {},
      create: {
        id: cat.id,
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        description: cat.description,
        sortOrder: ci,
        subcategories: {
          create: cat.subcategories.map((sc, si) => ({
            id: sc.id,
            slug: sc.slug,
            name: sc.name,
            sortOrder: si,
          })),
        },
      },
    });
  }

  console.log('Seeding features...');
  for (const name of FEATURES) {
    await prisma.feature.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log('Seeding cancellation policy...');
  const policy = await prisma.cancellationPolicy.upsert({
    where: { id: 'cp-flexible-24h' },
    update: {},
    create: {
      id: 'cp-flexible-24h',
      name: 'Flexible 24h',
      description: 'Cancel up to 24 hours before your booking for a full refund.',
      freeCancelHoursBefore: 24,
      partialRefundPct: 0,
    },
  });

  console.log('Seeding companies + locations...');
  const companyIdByName = new Map<string, string>();
  for (const deal of DEALS) {
    if (companyIdByName.has(deal.providerName)) continue;
    const slug = slugifyCompany(deal.providerName);
    const [locName, city] = deal.location.split(',').map((s) => s.trim());
    const { lat, lng } = coordsFor(city ?? '');
    const company = await prisma.company.upsert({
      where: { slug },
      update: {},
      create: {
        slug,
        displayName: deal.providerName,
        legalName: `${deal.providerName} Pvt. Ltd.`,
        businessType: BusinessType.PVT_LTD,
        pan: 'AAAAA0000A',
        about: deal.description,
        contactEmail: `contact@${slug}.example.com`,
        contactPhone: '+919800000000',
        status: 'VERIFIED',
        locations: {
          create: [
            {
              name: locName ?? deal.location,
              line1: locName ?? deal.location,
              city: city ?? locName ?? deal.location,
              state: '',
              postalCode: '000000',
              lat,
              lng,
              openingHours: {
                create: Array.from({ length: 7 }, (_, weekday) => ({
                  weekday,
                  isClosed: false,
                  opensAt: '10:00',
                  closesAt: '21:00',
                })),
              },
            },
          ],
        },
      },
      include: { locations: true },
    });
    companyIdByName.set(deal.providerName, company.id);
  }

  console.log('Seeding deals...');
  for (const deal of DEALS) {
    const companyId = companyIdByName.get(deal.providerName)!;
    const company = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      include: { locations: true },
    });
    const location = company.locations[0];
    const category = CATEGORIES.find((c) => c.slug === deal.categorySlug)!;
    const subcategory = category.subcategories.find((s) => s.slug === deal.subcategorySlug);

    await prisma.deal.upsert({
      where: { id: deal.id },
      update: {},
      create: {
        id: deal.id,
        slug: deal.slug,
        companyId: company.id,
        title: deal.title,
        shortDescription: deal.description,
        description: deal.description,
        heroImageUrl: deal.image,
        heroImageAlt: deal.imageAlt,
        gallery: deal.gallery.map((url) => ({ url, alt: deal.imageAlt })),
        badge: deal.badge ?? null,
        features: deal.features,
        included: deal.included,
        notIncluded: [],
        howToUse: deal.howToUse,
        finePrint: 'Valid for one redemption per voucher. Non-transferable. Prior booking required.',
        cancellationPolicyId: policy.id,
        redeemByDaysAfterPurchase: 90,
        isFeatured: deal.isFeatured,
        status: 'LIVE',
        publishedAt: new Date(),
        pricingPlans: {
          create: [
            {
              name: `${deal.duration} min session`,
              durationMinutes: deal.duration,
              priceAmount: deal.price * 100,
              originalPriceAmount: deal.originalPrice ? deal.originalPrice * 100 : null,
              sortOrder: 0,
            },
          ],
        },
        categoryLinks: {
          create: [
            {
              categoryId: category.id,
              subcategoryId: subcategory?.id ?? null,
              isPrimary: true,
            },
          ],
        },
        locationLinks: {
          create: [{ locationId: location.id }],
        },
      },
    });
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
