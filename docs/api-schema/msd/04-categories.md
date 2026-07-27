# 04 — Categories & Subcategories

Two-level taxonomy (matches the current frontend: 5 categories, each with subcategories).
Deals attach to **multiple** category/subcategory pairs (see 05-deals `DealCategory`).

## Entities

### Category

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `slug` | string | ✔ | | Unique, kebab-case, used in URLs `/category/:slug` | `"massage"` |
| `name` | string | ✔ | | | `"Massage"` |
| `description` | string | ✔ | | Shown in category hero | |
| `icon` | string | ✔ | | Material Symbols name (matches frontend usage) | `"self_improvement"` |
| `imageMediaId` | uuid | | null | Category tile image | |
| `heroMediaId` | uuid | | null | Category page banner | |
| `metaTitle` | string | | null | SEO `<title>` override | |
| `metaDescription` | string | | null | SEO description | |
| `sortOrder` | int | ✔ | 0 | Display ordering | |
| `isActive` | bool | ✔ | true | Inactive = hidden from consumers, deals keep the link | |
| `dealCount` | int | computed | | Live deals in this category — **computed, not stored** | `12` |

### Subcategory

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `categoryId` | uuid | ✔ | | FK → Category | |
| `slug` | string | ✔ | | Unique **within the category** | `"deep-tissue"` |
| `name` | string | ✔ | | | `"Deep Tissue"` |
| `description` | string | | null | | |
| `sortOrder` | int | ✔ | 0 | Tab ordering on category page | |
| `isActive` | bool | ✔ | true | | |
| `dealCount` | int | computed | | | |

> Mirrors frontend `Category`/`Subcategory` in `apps/msd/src/types/index.ts`. The
> frontend's `serviceCount` maps to computed `dealCount`. The static counts currently
> duplicated in `content.json` nav go away — nav reads this API (see 11-content-navigation).

## Relationships

- `Category 1..n Subcategory`
- `Deal n..n (Category, Subcategory)` via `DealCategory` join (05-deals)
- Deactivating a category does not orphan deals; they stay reachable by other categories.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/categories` | public | Active categories + nested active subcategories + counts. Cached (ETag), powers nav + home grid |
| GET | `/categories/:slug` | public | One category + subcategories + SEO meta (category page) |
| POST | `/admin/categories` | admin, marketing | Create |
| PATCH | `/admin/categories/:id` | admin, marketing | Update (slug immutable once deals reference it) |
| POST | `/admin/categories/:id/subcategories` | admin, marketing | Create subcategory |
| PATCH | `/admin/subcategories/:id` | admin, marketing | Update |
| PUT | `/admin/categories/reorder` | admin, marketing | `{ orderedIds: [] }` |

### GET /categories — response

```json
{
  "items": [
    {
      "id": "018f...",
      "slug": "massage",
      "name": "Massage",
      "description": "Swedish, deep tissue, Thai, hot stone and more from certified therapists.",
      "icon": "self_improvement",
      "image": { "url": "https://cdn...", "alt": "Massage therapy session", "width": 400, "height": 400 },
      "dealCount": 12,
      "subcategories": [
        { "id": "018f...", "slug": "swedish", "name": "Swedish Massage", "dealCount": 4 }
      ]
    }
  ]
}
```

## Zod schemas

`CategoryResponseSchema`, `CategoryDetailResponseSchema`, `CategoryCreateSchema`,
`CategoryUpdateSchema`, `SubcategoryCreateSchema`, `CategoryReorderSchema`.

## Open questions

- [ ] Do we ever need a 3rd taxonomy level (e.g. Massage → Thai → Couples Thai)? Current design says no — features/tags cover it.
- [ ] Who owns taxonomy edits day-to-day: `marketing` alone or `admin` only?
