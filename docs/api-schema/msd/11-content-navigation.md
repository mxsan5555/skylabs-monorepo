# 11 — Content & Navigation (Header/Footer Links, Home Sections)

API-served version of what `apps/msd/src/content.json` holds today, so marketing can
edit copy and links without a redeploy. **Split rule**: anything a non-developer might
change (links, headings, promos, banners) moves to the API; pure UI microcopy (button
labels, form field labels, empty states) **stays in content.json**.

## Entities

### NavLink (header/footer link rows)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `menu` | enum | ✔ | Which collection: `header_primary \| footer_quick_links \| footer_support \| footer_legal \| footer_social` | |
| `label` | string | ✔ | | `"Explore Deals"` |
| `url` | string | ✔ | Internal path or absolute URL | `"/explore"` |
| `icon` | string | | Material Symbol (social links) | `"photo_camera"` |
| `isExternal` | bool | ✔ | Renders `target=_blank` + `rel` | |
| `sortOrder` | int | ✔ | | |
| `isActive` | bool | ✔ | | |

Header/footer **category** links are *not* NavLinks — they come from `GET /categories`
(04) so counts and names never drift.

### HomeSection (ordered home-page rails)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `kind` | enum | ✔ | `hero \| deal_rail \| category_grid \| promo_banner` | |
| `heading` | string | | Section heading | `"Hot Right Now"` |
| `subheading` | string | | | |
| `seeAllUrl` | string | | "See all" target | `"/explore?hot=true"` |
| `dealSource` | object | | For `deal_rail`: `{ "filter": "featured" \| "hot" \| "category", "categorySlug"? }` — resolves via `GET /deals` (06) | |
| `promo` | object | | For `promo_banner`: `{ chip, heading, body, ctaLabel, ctaUrl, mediaId? }` — covers today's Gift Card + Welcome Offer cards | |
| `sortOrder` | int | ✔ | | |
| `isActive` | bool | ✔ | | |
| `startsAt` / `endsAt` | timestamp | | Scheduled campaigns | |

### SiteSetting (key–value, admin-managed)

Small singleton config: `siteName`, `tagline`, `siteDescription`, `copyrightText`,
`trustBadges` (array `{ icon, text }`), `newsletter` copy block, price-level bands
(referenced by 06-search), support email/phone. Served in one bundle.

### NewsletterSubscription (footer form)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `email` | string | ✔ | Unique |
| `userId` | uuid | | Linked when a logged-in user subscribes |
| `status` | enum | ✔ | `subscribed \| unsubscribed` |
| `source` | string | ✔ | `"footer"`, `"checkout"` |
| `createdAt` / `unsubscribedAt` | timestamp | | |

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/content/site` | public | One bundle: SiteSettings + all active NavLinks grouped by menu + SEO meta defaults. Heavily cached (ETag), fetched once at app boot |
| GET | `/content/home` | public | Active HomeSections in order, with `deal_rail` sources resolved to `DealCardResponse[]` (or left as queries — open question) |
| POST | `/newsletter/subscribe` | public | `{ email }` — idempotent, double-opt-in email |
| POST | `/newsletter/unsubscribe` | public | Signed token from email link |
| CRUD | `/admin/nav-links` | admin, marketing | Manage link collections |
| CRUD | `/admin/home-sections` | admin, marketing | Manage home layout + scheduling |
| PATCH | `/admin/site-settings` | admin, marketing | Update settings bundle |

### GET /content/site — response (abridged)

```json
{
  "site": { "name": "MSD", "fullName": "MySpaDeal", "tagline": "India's wellness marketplace", "description": "Discover and book…" },
  "nav": {
    "header_primary":     [ { "label": "Explore", "url": "/explore", "isExternal": false } ],
    "footer_quick_links": [ { "label": "Home", "url": "/" } ],
    "footer_support":     [ { "label": "Help Center", "url": "/help" } ],
    "footer_legal":       [ { "label": "Privacy Policy", "url": "/privacy" } ],
    "footer_social":      [ { "label": "Instagram", "url": "https://instagram.com/myspadeal", "icon": "photo_camera", "isExternal": true } ]
  },
  "trustBadges": [ { "icon": "verified", "text": "200+ Partner Spas" } ],
  "priceLevels": [ { "value": "$", "label": "Budget (₹499–₹1,499)", "min": 49900, "max": 149900 } ],
  "copyright": "MySpaDeal Pvt. Ltd. All rights reserved."
}
```

> Frontend migration: header/footer components switch from importing `content.json`
> sections to this bundle (fetched once, cached in memory + localStorage fallback).
> The `content.json` file keeps UI microcopy only.

## Zod schemas

`SiteContentResponseSchema`, `HomeContentResponseSchema`, `NavLinkSchema`,
`HomeSectionSchema`, `SiteSettingsUpdateSchema`, `NewsletterSubscribeSchema`.

## Open questions

- [ ] `GET /content/home`: resolve deal rails server-side (one request, heavier cache) vs return source queries the client executes (fresher, more requests)? Recommend server-side resolved with 60s cache.
- [ ] Blog content: stays as the current static frontend data or joins this API later? (Out of scope here.)
- [ ] Double-opt-in newsletter required for compliance? Assumed yes via Resend.
