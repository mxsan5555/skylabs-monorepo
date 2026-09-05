# MSD API Schema Draft
> Status: Draft for review — no code has been changed yet.

---

## Why This Change

The current `Deal` type has one price, one duration, and one `included` list. In reality each service a provider offers comes in multiple tiers (e.g. 60 min Classic / 90 min Signature / 120 min Premium). This file captures the correct shape so the backend developer can build exact endpoints against it and the frontend can be updated to match.

---

## Data Hierarchy

```
Platform Category
  └── (optional) Subcategory

Service Provider  (the business — spa, studio, clinic)
  └── Deal  (a service/treatment they offer)
        └── DealOption[]  (price/duration/inclusion variants)
              + MarketingTag[]  (hot-deal, super-saver, deal-of-day, featured, new-arrival)
```

---

## TypeScript Interfaces

### `MarketingTag`
```typescript
export type MarketingTag =
  | 'featured'
  | 'hot-deal'
  | 'super-saver'
  | 'deal-of-day'
  | 'new-arrival';
```

### `DealOption`
One pricing / timing / inclusion variant of a deal. A deal always has ≥1 option.

```typescript
export interface DealOption {
  id: string;             // 'opt-02-a'
  label: string;          // '60 min Classic' | 'Signature' | 'Premium'
  duration: number;       // 60
  durationUnit: string;   // 'min' | 'hrs'
  price: number;          // 999
  originalPrice?: number; // 1299
  discount?: number;      // 23  (percentage, pre-computed)
  priceLevel: '$' | '$$' | '$$$';
  priceUnit: string;      // 'per session' | 'per person' | 'per couple'
  included: string[];     // what is included in THIS option only
  isPopular?: boolean;    // true on the one option to highlight by default
}
```

### `Provider`
The business entity the marketing team visits to collect deal information.

```typescript
export interface Provider {
  id: string;             // 'prv-01'
  slug: string;           // 'urban-massage-studio'
  name: string;
  description: string;
  address: string;
  city: string;
  location: string;       // display string: 'Koramangala, Bangalore'
  coordinates?: { lat: number; lng: number };
  phone: string;
  email?: string;
  website?: string;
  image: string;
  imageAlt: string;
  gallery: string[];
  rating: number;         // aggregate across all their deals
  reviews: number;
  isOpen: boolean;
  openingHours?: string;  // '9am – 9pm'
  features: string[];     // amenities: 'Couples', 'Private Room', 'Sauna', etc.
}
```

### `Deal`
A service offering by a provider. The flat `price / duration / included` fields are gone — they now live in `options[]`.

```typescript
export interface Deal {
  id: string;
  slug: string;
  title: string;
  providerId: string;       // FK → Provider.id
  providerName: string;     // denormalized for display
  categorySlug: string;
  subcategorySlug?: string; // optional — not all categories have subcategories
  description: string;
  image: string;
  imageAlt: string;
  gallery: string[];
  options: DealOption[];    // 1 or more variants
  features: string[];       // deal-level features (can differ from provider amenities)
  howToUse: string[];
  rating: number;
  reviews: number;
  distance?: number;        // km — computed at runtime from user location; null in static data
  location: string;         // display string, inherited from provider
  isOpen: boolean;
  tags: MarketingTag[];     // [] if no marketing tag applies
  badge?: string;           // display label: '30% OFF' | 'Deal of the Day'
}
```

### `Category` (shape unchanged)
```typescript
export interface Subcategory {
  id: string;
  slug: string;
  name: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  icon: string;
  serviceCount: number;
  description: string;
  image: string;
  imageAlt: string;
  subcategories: Subcategory[]; // empty [] when category has no subcategories
}
```

---

## Raw Sample Data

### Providers

```typescript
[
  {
    id: 'prv-01',
    slug: 'urban-massage-studio',
    name: 'Urban Massage Studio',
    description: 'Modern wellness studio with certified therapists offering Swedish, deep tissue, and Thai massage.',
    address: '12, 3rd Floor, Jyoti Nivas College Rd',
    city: 'Bangalore',
    location: 'Koramangala, Bangalore',
    phone: '+91 98765 43210',
    email: 'hello@urbanmassage.in',
    rating: 4.6,
    reviews: 612,
    isOpen: true,
    openingHours: '9am – 9pm',
    features: ['Mobile Therapist', 'Certified Therapists', 'Online Booking', 'Couples Rooms'],
  },
  {
    id: 'prv-02',
    slug: 'serenity-spa-wellness',
    name: 'Serenity Spa & Wellness',
    description: 'Luxury day spa offering signature packages, aromatherapy, and couples retreats in the heart of Bandra.',
    address: '48B, Linking Road',
    city: 'Mumbai',
    location: 'Bandra West, Mumbai',
    phone: '+91 99887 76655',
    rating: 4.8,
    reviews: 431,
    isOpen: true,
    openingHours: '10am – 8pm',
    features: ['Couples', 'Organic Products', 'Private Room', 'Steam Room'],
  },
]
```

---

### Deals

#### Deal d-02 — Swedish Massage (Urban Massage Studio)
3 options: 60 min / 90 min / 120 min

```typescript
{
  id: 'd-02',
  slug: 'urban-massage-studio-swedish-massage',
  title: 'Swedish Massage',
  providerId: 'prv-01',
  providerName: 'Urban Massage Studio',
  categorySlug: 'massage',
  subcategorySlug: 'swedish',
  description: 'Classic Swedish relaxation massage by certified therapists. Choose your duration and depth.',
  rating: 4.6,
  reviews: 389,
  location: 'Koramangala, Bangalore',
  isOpen: true,
  tags: ['super-saver'],
  badge: 'Super Saver',
  features: ['Mobile Therapist', 'Certified Therapists'],
  howToUse: [
    'Book your slot and select an option online.',
    'Receive a therapist assignment SMS within 30 minutes.',
    'Present your booking code at the studio or let the mobile therapist in.',
  ],
  options: [
    {
      id: 'opt-02-a',
      label: '60 min Classic',
      duration: 60,
      durationUnit: 'min',
      price: 999,
      originalPrice: 1299,
      discount: 23,
      priceLevel: '$',
      priceUnit: 'per session',
      included: [
        'Full body Swedish massage',
        'Complimentary neck & shoulder focus',
      ],
      isPopular: false,
    },
    {
      id: 'opt-02-b',
      label: '90 min Signature',
      duration: 90,
      durationUnit: 'min',
      price: 1399,
      originalPrice: 1799,
      discount: 22,
      priceLevel: '$',
      priceUnit: 'per session',
      included: [
        'Full body Swedish massage',
        'Neck & shoulder deep focus',
        'Foot reflexology (10 min)',
        'Post-session herbal tea',
      ],
      isPopular: true,
    },
    {
      id: 'opt-02-c',
      label: '120 min Premium',
      duration: 120,
      durationUnit: 'min',
      price: 1799,
      originalPrice: 2399,
      discount: 25,
      priceLevel: '$$',
      priceUnit: 'per session',
      included: [
        'Full body Swedish massage',
        'Hot stone add-on',
        'Neck, shoulder & back deep focus',
        'Foot reflexology (15 min)',
        'Aromatherapy oil of your choice',
        'Post-session herbal tea & snacks',
      ],
      isPopular: false,
    },
  ],
}
```

---

#### Deal d-03 — Traditional Thai Massage (Urban Massage Studio)
2 options: 60 min / 90 min

```typescript
{
  id: 'd-03',
  slug: 'urban-massage-studio-thai-massage',
  title: 'Traditional Thai Massage',
  providerId: 'prv-01',
  providerName: 'Urban Massage Studio',
  categorySlug: 'massage',
  subcategorySlug: 'thai',
  description: 'Authentic Thai stretching and pressure-point therapy. No oils — wear comfortable clothing.',
  rating: 4.5,
  reviews: 187,
  location: 'Koramangala, Bangalore',
  isOpen: true,
  tags: [],
  features: ['Certified Therapists'],
  howToUse: [
    'Book online. Wear loose, comfortable clothing — no oils used.',
    'Arrive 5 minutes early to fill a brief health form.',
    'Present your booking code at reception.',
  ],
  options: [
    {
      id: 'opt-03-a',
      label: '60 min',
      duration: 60,
      durationUnit: 'min',
      price: 1199,
      originalPrice: 1499,
      discount: 20,
      priceLevel: '$',
      priceUnit: 'per session',
      included: [
        'Traditional Thai stretching',
        'Pressure point therapy',
      ],
      isPopular: false,
    },
    {
      id: 'opt-03-b',
      label: '90 min',
      duration: 90,
      durationUnit: 'min',
      price: 1599,
      originalPrice: 1999,
      discount: 20,
      priceLevel: '$',
      priceUnit: 'per session',
      included: [
        'Traditional Thai stretching',
        'Pressure point therapy',
        'Back walk technique',
        'Herbal compress application',
      ],
      isPopular: true,
    },
  ],
}
```

---

#### Deal d-01 — Summer Glow Package (Serenity Spa & Wellness)
3 options: Essential / Signature / Luxe

```typescript
{
  id: 'd-01',
  slug: 'serenity-spa-wellness-summer-glow',
  title: 'Summer Glow Package',
  providerId: 'prv-02',
  providerName: 'Serenity Spa & Wellness',
  categorySlug: 'spas-retreats',
  subcategorySlug: 'day-spa',
  description: 'Massage, facial, and aromatherapy combined. Three tiers — pick the depth of pampering you want.',
  rating: 4.8,
  reviews: 214,
  location: 'Bandra West, Mumbai',
  isOpen: true,
  tags: ['featured', 'hot-deal'],
  badge: 'Hot Deal',
  features: ['Couples', 'Organic Products', 'Private Room'],
  howToUse: [
    'Book online and receive a confirmation SMS.',
    'Arrive 10 minutes early to complete your wellness form.',
    'Present your booking code at the reception desk.',
  ],
  options: [
    {
      id: 'opt-01-a',
      label: 'Essential',
      duration: 60,
      durationUnit: 'min',
      price: 1999,
      originalPrice: 2499,
      discount: 20,
      priceLevel: '$$',
      priceUnit: 'per person',
      included: [
        'Swedish massage (45 min)',
        'Express brightening facial (15 min)',
      ],
      isPopular: false,
    },
    {
      id: 'opt-01-b',
      label: 'Signature',
      duration: 90,
      durationUnit: 'min',
      price: 2499,
      originalPrice: 3499,
      discount: 30,
      priceLevel: '$$',
      priceUnit: 'per person',
      included: [
        'Full body Swedish massage (60 min)',
        'Brightening facial (20 min)',
        'Aromatherapy session (10 min)',
        'Herbal tea & refreshments',
      ],
      isPopular: true,
    },
    {
      id: 'opt-01-c',
      label: 'Luxe',
      duration: 150,
      durationUnit: 'min',
      price: 3999,
      originalPrice: 5499,
      discount: 27,
      priceLevel: '$$$',
      priceUnit: 'per person',
      included: [
        'Full body massage (90 min)',
        'Advanced facial with serum (30 min)',
        'Aromatherapy oil selection',
        'Foot soak & scrub (20 min)',
        'Refreshments & light snacks',
      ],
      isPopular: false,
    },
  ],
}
```

---

#### Deal d-04 — Couples Retreat (Serenity Spa & Wellness)
2 options: 90 min Classic / 120 min Signature

```typescript
{
  id: 'd-04',
  slug: 'serenity-spa-wellness-couples-retreat',
  title: 'Couples Retreat',
  providerId: 'prv-02',
  providerName: 'Serenity Spa & Wellness',
  categorySlug: 'spas-retreats',
  subcategorySlug: 'couples',
  description: 'Private couples suite with side-by-side treatments and a champagne finish.',
  rating: 4.9,
  reviews: 97,
  location: 'Bandra West, Mumbai',
  isOpen: true,
  tags: ['deal-of-day'],
  badge: 'Deal of the Day',
  features: ['Couples', 'Private Room', 'Organic Products'],
  howToUse: [
    'Book at least 48 hours in advance for the couples suite.',
    'Arrive together 15 minutes early.',
    'Present booking codes at reception — both names must match the booking.',
  ],
  options: [
    {
      id: 'opt-04-a',
      label: '90 min Classic',
      duration: 90,
      durationUnit: 'min',
      price: 4999,
      originalPrice: 5999,
      discount: 17,
      priceLevel: '$$$',
      priceUnit: 'per couple',
      included: [
        'Side-by-side Swedish massage (60 min)',
        'Shared aromatherapy session (20 min)',
        'Welcome drink',
      ],
      isPopular: false,
    },
    {
      id: 'opt-04-b',
      label: '120 min Signature',
      duration: 120,
      durationUnit: 'min',
      price: 6499,
      originalPrice: 8499,
      discount: 24,
      priceLevel: '$$$',
      priceUnit: 'per couple',
      included: [
        'Side-by-side Swedish massage (60 min)',
        'Express facial for each (20 min)',
        'Aromatherapy session (20 min)',
        'Jacuzzi access (20 min)',
        'Champagne & fruit platter',
      ],
      isPopular: true,
    },
  ],
}
```

---

## API Endpoints (for backend developer)

```
GET  /api/v1/categories                → Category[]
GET  /api/v1/categories/:slug          → Category (with subcategories)

GET  /api/v1/providers                 → Provider[]
GET  /api/v1/providers/:id             → Provider

GET  /api/v1/deals                     → Deal[] (options[] included)
     Query params:
       ?categorySlug=massage
       ?subcategorySlug=swedish
       ?tag=hot-deal|super-saver|deal-of-day|featured|new-arrival
       ?providerId=prv-01
       ?city=Bangalore
       ?search=swedish
       ?sort=popular|rating|price-asc|price-desc

GET  /api/v1/deals/:id                 → Deal (full, with all options)
```

---

## Files to Change (when approved)

| File | What changes |
|------|-------------|
| `apps/msd/src/types/index.ts` | Add `Provider`, `DealOption`, `MarketingTag`. Update `Deal` — remove flat `price/duration/included/isHot/isFeatured`, add `options[]`, `tags[]`, `providerId`. Make `subcategorySlug` optional. |
| `apps/msd/src/data/deals.ts` | Restructure all 15 deals to use `options[]`. Add `tags`, `providerId`. Remove `isFeatured`, `isHot`. |
| `apps/msd/src/data/providers.ts` | New file — `PROVIDERS: Provider[]` + `getProviderById` helper. |
| `apps/msd/src/data/categories.ts` | No schema change — ensure `subcategories: []` for any category that has none. |
| Pages using `deal.price` / `deal.duration` / `deal.included` | Update to read from `deal.options[selectedIndex]` — separate UI task after schema lands. |
