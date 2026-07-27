# Skill: Skylabs SEO + GEO + AEO + Analytics

SEO, GEO, AEO, and analytics implementation for msd and mera-driver.

## SEO Per App

### msd (React 19)
React 19 natively hoists `<title>` and `<meta>` from JSX to `<head>`.

```tsx
// Inside any page component:
export default function CategoryPage({ category }: { category: Category }) {
  return (
    <>
      <title>{category.name} Deals | MSD</title>
      <meta name="description" content={`Find the best ${category.name} massage deals near you. Book online instantly.`} />
      <meta name="robots" content="index, follow" />
    </>
  );
}

// Account pages — always noindex:
<meta name="robots" content="noindex, nofollow" />
```

### mera-driver (Angular 21)
Set the page title via the route `title` field (best practice):
```ts
// app.routes.ts
{ path: 'home', component: HomeComponent, title: 'Book a Driver Near You | Mera Driver' }
```

Inject `Meta` for meta description and robots:
```ts
import { Meta } from '@angular/platform-browser';
import { inject } from '@angular/core';

export class HomeComponent {
  constructor() {
    inject(Meta).updateTag({ name: 'description', content: 'Book a reliable driver in minutes...' });
  }
}
```

Account pages — add `{ name: 'robots', content: 'noindex, nofollow' }`.

## Open Graph Tags (every public page)
```html
<meta property="og:title" content="Page Title | App Name" />
<meta property="og:description" content="140–155 char description" />
<meta property="og:image" content="https://domain/assets/og-image.jpg" />
<meta property="og:url" content="https://domain/page-path" />
<meta property="og:type" content="website" />
<meta name="twitter:card" content="summary_large_image" />
```
OG image: 1200×630px. One per page or a universal branded fallback.

## JSON-LD Structured Data

### msd — LocalBusiness (in index.html or root layout)
```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "MSD — Massage Deals",
  "description": "Curated massage and wellness deals. Book online instantly.",
  "url": "https://msd.skylabs.in",
  "@id": "https://msd.skylabs.in/#business",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://msd.skylabs.in/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

### mera-driver — Service (in index.html or root layout)
```json
{
  "@context": "https://schema.org",
  "@type": "Service",
  "name": "Mera Driver",
  "description": "On-demand driver booking. Professional drivers, fast arrival.",
  "url": "https://meradriver.skylabs.in",
  "@id": "https://meradriver.skylabs.in/#service"
}
```

### BreadcrumbList (category + detail pages)
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "/" },
    { "@type": "ListItem", "position": 2, "name": "Relaxation", "item": "/category/relaxation" },
    { "@type": "ListItem", "position": 3, "name": "Swedish Massage", "item": "/deals/swedish-massage-60min" }
  ]
}
```

### FAQ Schema (support + help pages)
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "How do I book a massage deal?",
      "acceptedAnswer": { "@type": "Answer", "text": "Browse deals, select one, and checkout in under 2 minutes." }
    }
  ]
}
```

## GEO + AEO Best Practices
- Write direct, factual H1/H2 headings that answer what the page is about
- Use a one-sentence summary at the top of each page (AI snippets extract this)
- Avoid keyword stuffing — write for the user; verify search intent separately
- Name specific locations, services, and prices where relevant (helps local SEO and AI answers)
- Keep sentences short (under 20 words for AI readability)

## noindex Rules
| Route pattern | Both apps |
|---------------|-----------|
| `/account/*` | noindex, nofollow |
| `/auth/*` | noindex, nofollow |
| `/checkout/*` | noindex, nofollow |
| `/cart` | noindex, nofollow |

## GA4 + GTM

### Setup
- Each app has its own GA4 property (never mix msd and mera-driver data)
- GTM container snippet goes in `<head>` of `index.html` for each app

### Event Schema (no PII)
```js
// Push events via dataLayer:
window.dataLayer = window.dataLayer || [];
window.dataLayer.push({
  event: 'view_deal',           // snake_case always
  deal_id: '123',               // IDs only — never names, emails, phones
  category: 'relaxation',
  price: 999,
  currency: 'INR',
});
```

### msd Standard Events
| Event name | When to fire |
|-----------|-------------|
| `view_deal` | Deal detail page loaded |
| `add_to_cart` | Add to cart clicked |
| `begin_checkout` | Checkout page loaded |
| `purchase` | Order confirmed |
| `search` | Search submitted |
| `view_category` | Category page loaded |

### mera-driver Standard Events
| Event name | When to fire |
|-----------|-------------|
| `view_driver_profile` | Driver detail viewed |
| `booking_started` | Booking flow initiated |
| `booking_confirmed` | Booking confirmed |
| `driver_search` | Driver search submitted |

### Consent Mode
Implement Google Consent Mode v2 before enabling GA4 in production:
```js
gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
});
// Update after user consents:
gtag('consent', 'update', { analytics_storage: 'granted' });
```

## Sitemap
Generate `sitemap.xml` at build time. Include public pages only — exclude `/account/*`, `/auth/*`, `/cart`, `/checkout/*`.
Place at `apps/<app>/public/sitemap.xml` and reference in `robots.txt`:
```
User-agent: *
Disallow: /account/
Disallow: /auth/
Sitemap: https://domain/sitemap.xml
```
