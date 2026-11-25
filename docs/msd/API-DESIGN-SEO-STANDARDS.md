# MSD and MSD API: API Design and SEO Standards

This document explains how the MSD storefront (`apps/msd`) and its independent backend
(`apps/msd-api`) are designed, which industry practices are already present, and which items
remain gaps or scaling work. It describes the repository as it exists; it is not a claim of
certification or a guarantee of search ranking.

## Short answer

**Yes, SEO is part of the public storefront design.** MSD uses server/build-time prerendering,
page-level metadata, canonical URLs, structured data, and crawler files. The API supports this
by serving validated, public catalog and CMS content, including stable slugs and listing data.

SEO is primarily implemented by the **web pages and rendered HTML**, not by adding SEO tags to
JSON API responses. An API can make SEO pages possible, but it does not itself guarantee that
Google indexes or ranks them.

## System boundary

```text
Search crawler / visitor
          |
          v
apps/msd: public route -> prerendered HTML + page metadata + structured data
          |
          v
apps/msd-api: /api/v1/catalog/* -> validated public data
          |
          v
PostgreSQL (through Prisma)
```

- **Storefront:** React 19 + Vite; public routes, page content, SEO head tags, JSON-LD and
  prerender generation live in `apps/msd`.
- **API:** Express + TypeScript + Prisma + PostgreSQL; public catalog reads are kept separate from
  authenticated/admin routes. The public catalog router intentionally does not use authentication
  middleware and reads through explicit public service functions and field selections.
- **API base:** `/api/v1`; local development uses port 3333. The web app's API URL is configured
  with environment variables; build-time prerendering uses `PRERENDER_API_URL` or `VITE_API_URL`.
- **Source of truth:** route handlers, Zod schemas, services and the SEO/prerender code are
  authoritative. The endpoint inventory in `API.md` is generated documentation and has a dated
  OpenAPI coverage snapshot; check the current code before treating historical counts as current.

## API design practices in MSD

| Practice | How MSD applies it | Why it matters |
|---|---|---|
| Versioned routes | API paths are under `/api/v1`; breaking changes should use a new major path version, while additive changes can remain compatible. | Enables clients to evolve without silently breaking. |
| Resource-oriented routes | Public resources use paths such as `/catalog/deals`, `/catalog/products`, `/catalog/therapists`, `/catalog/categories/:slug`, and `/catalog/blog-posts/:slug`. | Makes the API discoverable and keeps related operations grouped. |
| HTTP semantics | Reads use `GET`; errors map to meaningful status codes such as 400, 401, 403, 404, 409, 422, 429 and 500. | Lets clients and infrastructure handle outcomes consistently. |
| Schema validation | Zod validates public query and path inputs before services run. For example, catalog listing schemas constrain page sizes, search length, UUID filters, tags, prices, coordinates and sort values. Invalid input is rejected rather than trusted. | Limits invalid data and reduces unexpected backend behavior. |
| Stable response envelope | Success responses use `{ data, error: null, meta? }`; failures use `{ data: null, error: { code, message, details? } }`. Lists include pagination metadata such as `total`, `page` and `pageSize`. | Gives web clients one predictable contract. |
| OpenAPI documentation | The API uses Zod schemas with `zod-to-openapi`; Swagger UI is served at `/docs`. | Supports review, testing and client integration. |
| Public/private boundary | `/catalog/*` exposes deliberate public read models; protected operations use server-side authentication and permission checks. | Avoids treating frontend visibility as the security boundary and avoids returning admin-only data in public reads. |
| Pagination and filtering | Catalog lists support validated paging, filters, sorting and facets. Sorting/filtering occurs in the API so pages remain consistently ordered across pagination. | Supports efficient catalog browsing and consistent search results. |
| Slug-based public identity | Public content and catalog routes use readable slugs where available; deal lookup accepts an ID or current/old slug and returns the canonical current slug. | Produces durable, shareable URLs while keeping database IDs separate. |
| Deprecation signaling | The legacy public promotions endpoint sets a `Deprecation` header and a successor `Link`. | Allows a controlled migration instead of removing an endpoint unexpectedly. |

### Example public API flow

1. A prerender loader requests public category, location and catalog data from
   `/api/v1/catalog/*`.
2. The API validates the query, applies public-visibility rules, and returns a stable envelope.
3. The storefront renders the route and metadata using real catalog/content data.
4. After hydration, the browser can request updated listing data through the same public API.

The public deal detail endpoint, for example, accepts a slug or ID and returns the fields the
deal page needs. Search/list routes support category, location, price, tag and business filters;
facets supply counts for the filter UI.

## SEO practices currently implemented

### 1. Crawlable, rendered public pages

The storefront has build-time prerendering. It fetches public API data and renders HTML for routes
such as the home page, categories, category/city pages, deal/product/therapist listings and deal
detail pages. This means crawlers can receive page content and metadata in the initial HTML rather
than needing to execute the entire client application first.

The prerender process has timeouts and a production-build policy for unavailable API data. If a
route's data cannot be loaded, the process can skip that route with a warning; the SPA remains the
fallback for application navigation.

### 2. Per-page head metadata

The shared `Seo` component sets:

- Page-specific `<title>` and meta description.
- A canonical link and matching Open Graph URL when the configured site URL is available.
- Open Graph title, description, site name and image.
- Twitter card and image metadata.
- Optional `noindex, nofollow` or `noindex, follow`.

Page-specific text and imagery are chosen by the page. A brand image is used when a page has no
share image. Private, transactional and search routes can be kept out of search indexes using
`noindex`.

### 3. URL design and canonicalization

Public links use centralized URL helpers for deals, products, therapists and vendors, plus shared
category/city path builders. Deal slugs are intended to remain stable after publication; old
slugs continue to resolve, while the page canonicalizes to the current slug. The storefront also
uses real links for navigable category/listing choices so those destinations are discoverable.

Search-result/filter state may be represented in query parameters for user experience. It should
not automatically create an indexable landing page for every parameter combination; curated
indexable routes and canonical URLs are used to avoid uncontrolled duplicate URLs.

### 4. Structured data

The storefront has JSON-LD helpers for `Organization`, `WebSite`/`SearchAction`, `BreadcrumbList`,
`ItemList`, `FAQPage`, `WebPage` subtypes and `HowTo`. Organization and WebSite data can be included
on public pages; page-specific JSON-LD is passed through `Seo`. The JSON serializer escapes
script-sensitive characters before embedding data in HTML.

Structured data must describe visible, genuine page content. The code intentionally avoids
invented ratings/reviews because the review system does not currently provide that data.

### 5. Sitemap, robots and AI-crawler context

The prerender build writes:

- `sitemap.xml` from configured public paths, rendered routes and visible catalog slugs.
- `robots.txt` that allows public crawling, disallows private application areas, and points to the
  sitemap.
- `llms.txt` with a site summary and selected public links.

Sitemap URLs use absolute URLs and therefore require the public site URL configuration. The sitemap
does not fabricate `lastmod` timestamps when reliable per-URL modification dates are unavailable.

### 6. Content and data quality

SEO-facing titles, descriptions, headings, links and structured data are built from real
storefront content and public API records. Public visibility is decided server-side, so hidden or
inactive catalog entries should not be exposed by the public catalog services.

## What this means by “industry-level”

MSD already follows several common production practices: versioned API paths, request validation,
stable response/error contracts, OpenAPI/Swagger, server-side authorization for protected routes,
public read models, human-readable URLs, prerendered HTML, canonical metadata, structured data and
sitemap/robots generation.

“Industry-level” is not a single formal certification. Readiness also depends on operational
checks: complete and current API documentation, monitoring, caching/performance, accessibility,
security testing, production crawl validation, structured-data validation and reliable content
workflows. The practices above are implemented to varying degrees; the remaining gaps below should
not be represented as already solved.

## Known gaps and items to verify

1. **OpenAPI completeness:** `docs/msd/API.md` records a snapshot from 2026-10-17 of 347 mounted
   routes and 255 documented routes, with 92 undocumented at that time. This is historical, not a
   current count. Close the gap and add/maintain a CI coverage check before claiming every route
   has an OpenAPI contract.
2. **SEO route coverage:** the sitemap builder includes deal, product and therapist slugs. The
   prerender route builder explicitly builds deal details, but not product/therapist detail routes.
   Verify each sitemap URL returns a useful, canonical, indexable page and decide whether those
   detail pages also need prerendering.
3. **Catalog scale:** product/therapist sitemap slug loading is currently a single page capped at
   500 per catalog; deal prerender slug loading has a configured cap of 2,000. Add pagination and
   sitemap splitting/index files if catalog size grows beyond these limits.
4. **Robots vs. `noindex`:** `robots.txt` disallows private routes. A crawler blocked from a URL
   may not fetch its `noindex` tag; use robots rules primarily for crawl control, and ensure
   indexable content is not accidentally blocked. Validate actual production behavior.
5. **Last-modified metadata:** sitemap entries currently omit `lastmod` instead of using a
   misleading build timestamp. Add it only when each URL has a trustworthy modification date.
6. **Prerender freshness and reliability:** production prerender depends on the API and configured
   site URL. Monitor missing/failed route loads and verify deployed HTML, sitemap and robots files
   after releases.
7. **SEO outcomes:** metadata and structured data do not guarantee rankings or rich results.
   Measure indexing, crawl errors, Core Web Vitals and search performance with the production
   search-engine tools.

## Practical review checklist

- [ ] Public route responds successfully and renders meaningful content without relying on client
      JavaScript alone.
- [ ] Each indexable route has a unique, accurate title and description.
- [ ] Canonical URL matches the intended public URL and is absolute in production.
- [ ] Private, duplicate, empty or internal pages have the intended indexing policy.
- [ ] Sitemap entries resolve, are public, and are not thin/empty pages.
- [ ] Structured data matches visible content and passes Google's Rich Results Test/schema checks
      when relevant.
- [ ] Public API inputs and response fields are documented and validated; protected data is never
      included in the public read model.
- [ ] API changes preserve the response contract or document a compatible migration.
- [ ] Production crawling, indexing and performance are monitored rather than inferred from a
      successful local build.

## Repository references

- Storefront module rules and SEO decisions: [`PLANNING.md`](PLANNING.md) §4 and §2.7.
- API conventions and endpoint inventory: [`API.md`](API.md) §0 and §4.
- Storefront code map and prerender architecture: [`ARCHITECTURE.md`](ARCHITECTURE.md) §0 and §4.
- SEO component: `apps/msd/src/app/seo/seo.tsx`.
- JSON-LD builders: `apps/msd/src/app/seo/jsonld.ts`.
- Public URL builders: `apps/msd/src/app/seo/public-urls.ts`.
- Prerender routes and crawler files: `apps/msd/prerender/routes.ts`,
  `apps/msd/prerender/crawler-files.ts` and `apps/msd/prerender/prerender.ts`.
- Public API routes, validation and response envelope:
  `apps/msd-api/src/routes/catalog.routes.ts`, `apps/msd-api/src/schemas/catalog.schema.ts` and
  `apps/msd-api/src/lib/http.ts`.
