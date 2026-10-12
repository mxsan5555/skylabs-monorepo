# docs

Reference and design documents for the monorepo. The main guides live at the repo root:
`CLAUDE.md` (conventions), `ARCHITECTURE.md` (layout), `DEVELOPER_PROCESS.md` (how-to),
`DEPLOYMENT.md` (hosting), `PLANNING.md` (scope), `TASK.md` (done / next).

| Path | What it is |
|---|---|
| `api-schema/msd/` | Original msd API design contract (conventions, auth, users, companies, categories, deals, search). Written before the API was built; each file notes where the shipped API differs. The live contract is the OpenAPI spec at msd-api `/docs`. |
| `MERA_DRIVER_ARCHITECTURE.md` | mera-driver + mera-driver-api domain architecture: modules, data model, what is real vs stubbed. |
| `superpowers/specs/` | Approved design specs, one per feature (date-prefixed). |
| `superpowers/plans/` | Task-by-task implementation plans for those specs. |

## msd storefront work (September 2026)

All shipped on branch `feature/msd-frontend-fix-sandeep-17sep26`.

| Date | Spec | Plan | What shipped |
|---|---|---|---|
| 2026-09-22 | `2026-09-22-msd-shell-home-design.md` | `2026-09-22-msd-shell-01-foundation-header.md`, `…-02-footer-seo.md`, `…-03-home.md`, `2026-09-24-msd-shell-04-prerender.md` | Site header/footer, home page, SEO, build-time prerender with hydration |
| 2026-09-24 | `2026-09-24-msd-category-page-design.md` | `2026-09-24-msd-category-page.md` | `PageSection` / `CardGrid` / `SectionHead as="h1"`; home on `PageSection`; category page rebuilt with no page CSS; home 60/30/10 colour pass |
| 2026-09-25 | `2026-09-25-msd-category-toolbar-design.md` | `2026-09-25-msd-category-toolbar.md` | Pills, clamped description, toolbar, sort, 12-per-page lazy loading, `DealMap` (Leaflet + OSM, Google behind `VITE_MAP_PROVIDER`), explore map fixed |
| 2026-09-25 | `2026-09-25-msd-category-filters-design.md` | `2026-09-25-msd-category-filters.md` | Filter side panel (location, distance, price, business, branches), price/distance sorts, List/Grid/Map switch, `sky-product-card` horizontal layout, catalog API sorts/filters/facets |

Follow-ups from this work are tracked in `TASK.md` (`### msd shell — follow-ups`).
