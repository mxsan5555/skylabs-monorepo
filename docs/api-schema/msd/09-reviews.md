# 09 — Reviews & Ratings

Yelp-style reviews attached to deals (and rolled up to companies). Only verified
purchasers can review; partners can reply once; admins moderate.

## Entities

### Review

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `userId` | uuid | ✔ | | Author | |
| `dealId` | uuid | ✔ | | Reviewed deal | |
| `companyId` | uuid | ✔ | | Denormalised for company rollups | |
| `orderItemId` | uuid | ✔ | | The redeemed purchase — **one review per order item**, proves "verified purchase" | |
| `rating` | int | ✔ | | 1–5 | `5` |
| `title` | string | | null | ≤80 chars | `"Best massage in Bandra"` |
| `body` | text | | null | ≤2000 chars; rating-only reviews allowed | |
| `photos` | MediaAsset[] | | `[]` | Max 5 | |
| `status` | enum | ✔ | `published` | `published \| pending \| hidden \| removed` (auto-publish; flagged → `pending`) | |
| `createdAt` / `updatedAt` | timestamp | ✔ | | Editable for 30 days | |

### PartnerReply (0..1 per review)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `reviewId` | uuid | ✔ | |
| `authorUserId` | uuid | ✔ | Must be a CompanyMember of the review's company |
| `body` | text | ✔ | ≤1000 chars |
| `createdAt` / `updatedAt` | timestamp | ✔ | |

### ReviewReport

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `reviewId` | uuid | ✔ | |
| `reportedByUserId` | uuid | ✔ | Consumer or partner |
| `reason` | enum | ✔ | `spam \| offensive \| fake \| off_topic \| personal_info \| other` |
| `note` | text | | |
| `status` | enum | ✔ | `open \| upheld \| dismissed` |

### Rating aggregates (computed, denormalised onto Deal + Company)

Recomputed on review create/update/moderation:

```json
{
  "ratingAvg": 4.8,
  "ratingCount": 214,
  "breakdown": { "5": 160, "4": 38, "3": 10, "2": 4, "1": 2 }
}
```

`breakdown` is served on deal/company detail for the histogram bar UI.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/deals/:slug/reviews` | public | Cursor paginated; `?sort=newest \| highest \| lowest \| helpful`, `?rating=5` filter; includes partner replies |
| GET | `/companies/:slug/reviews` | public | Across all the company's deals |
| POST | `/me/reviews` | user | Create `{ orderItemId, rating, title?, body?, mediaIds? }` — item must be `redeemed`, not yet reviewed |
| PATCH | `/me/reviews/:id` | user | Edit own, within 30 days |
| DELETE | `/me/reviews/:id` | user | Remove own (status `removed`) |
| GET | `/me/reviews` | user | My reviews + "pending review" prompts (redeemed items without a review) |
| POST | `/reviews/:id/report` | user, partner | File a report |
| POST | `/partner/reviews/:id/reply` | partner | Create/update the single reply |
| GET | `/admin/reviews?status=pending` | admin, marketing | Moderation queue (reported/flagged) |
| POST | `/admin/reviews/:id/moderate` | admin, marketing | `{ action: "publish" \| "hide" \| "remove", reportOutcome? }` |

Errors: `403 REVIEW_NOT_ELIGIBLE` (item not redeemed / not yours),
`409 REVIEW_ALREADY_EXISTS`.

## Zod schemas

`ReviewCreateSchema`, `ReviewUpdateSchema`, `ReviewResponseSchema`,
`ReviewListQuerySchema`, `PartnerReplySchema`, `ReviewReportSchema`,
`ReviewModerateSchema`, `RatingBreakdownSchema`.

## Open questions

- [ ] Auto-publish vs pre-moderation for first-time reviewers?
- [ ] "Helpful" votes on reviews (adds a vote entity) — v1 or later?
- [ ] Review incentives (points/credit) — product decision, affects fraud rules.
