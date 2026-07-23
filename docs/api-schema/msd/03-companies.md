# 03 — Companies (Partners), Locations, Verification, Staff

The core partner entity: a spa/wellness business that registers, gets verified by MSD,
and lists deals. Modeled on Yelp business profiles (hours, amenities, photos) and
Groupon merchant records (legal + redemption info).

## Entities

### Company

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `slug` | string | ✔ | | Unique, immutable after verification | `"serenity-spa-wellness"` |
| `displayName` | string | ✔ | | Public brand name | `"Serenity Spa & Wellness"` |
| `legalName` | string | ✔ | | Registered legal entity name | `"Serenity Wellness Pvt. Ltd."` |
| `businessType` | enum | ✔ | | `proprietorship \| partnership \| pvt_ltd \| llp \| other` | |
| `gstin` | string | | null | 15-char GST number (validated format) | `"27AAPFU0939F1ZV"` |
| `pan` | string | ✔ | | 10-char PAN (validated format) | `"AAPFU0939F"` |
| `licenseNumber` | string | | null | Trade/establishment licence | |
| `licenseMediaId` | uuid | | null | Uploaded licence document | |
| `about` | text | ✔ | | Public description (plain text, 2000 max) | |
| `tagline` | string | | null | Short line under the name | |
| `foundedYear` | int | | null | | `2015` |
| `logoMediaId` | uuid | | null | | |
| `coverMediaId` | uuid | | null | Profile hero image | |
| `contactEmail` | string | ✔ | | Business contact (not login) | |
| `contactPhone` | string | ✔ | | E.164 | |
| `website` | string | | null | | |
| `socialLinks` | SocialLink[] | | `[]` | JSONB `{ platform, url }`, platform: `instagram \| facebook \| x \| youtube \| linkedin` | |
| `amenities` | string[] | ✔ | `[]` | Company-wide, from the shared amenity vocabulary (see 05-deals Features) | `["Private Room","Sauna"]` |
| `status` | enum | ✔ | `draft` | Verification lifecycle below | |
| `rejectionReason` | text | | null | Set when `rejected` | |
| `verifiedAt` | timestamp | | null | | |
| `ratingAvg` | decimal(2,1) | ✔ | 0 | Computed from reviews | `4.8` |
| `ratingCount` | int | ✔ | 0 | | `214` |
| `commissionPct` | decimal | | null | MSD commission — **internal, never in public responses** | |
| `payout` | PayoutDetails | | null | Bank details — **internal/partner only** | |
| `createdAt` / `updatedAt` | timestamp | ✔ | | | |

### PayoutDetails (embedded, partner+admin visibility only)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountHolder` | string | ✔ | |
| `accountNumber` | string | ✔ | Stored encrypted, responses masked (`"XXXX1234"`) |
| `ifsc` | string | ✔ | |
| `upiId` | string | | Alternative to bank account |

### CompanyMember (who can manage the company)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `companyId` | uuid | ✔ | |
| `userId` | uuid | ✔ | Must hold `partner` role |
| `memberRole` | enum | ✔ | `owner \| manager` — owner: everything incl. payout; manager: deals, locations, replies |
| `createdAt` | timestamp | ✔ | |

One `owner` minimum. A user can belong to multiple companies.

### Location (1..n per company — multi-branch)

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `companyId` | uuid | ✔ | | | |
| `name` | string | ✔ | | Branch label | `"Bandra West"` |
| `line1`, `line2`, `city`, `state`, `postalCode`, `country` | | | | Same shape as user Address | |
| `landmark` | string | | null | `"Opposite Linking Road"` | |
| `lat` / `lng` | decimal | ✔ | | Drives distance + map search | `19.0596, 72.8295` |
| `phone` | string | | null | Branch phone, falls back to company | |
| `amenities` | string[] | ✔ | `[]` | Branch-level overrides/additions | |
| `photos` | MediaAsset[] | | `[]` | | |
| `isActive` | bool | ✔ | true | Hidden branches keep history | |

### OpeningHours (7 rows per location)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `locationId` | uuid | ✔ | | |
| `weekday` | int | ✔ | 0 = Sunday … 6 = Saturday | |
| `isClosed` | bool | ✔ | | |
| `opensAt` / `closesAt` | time | | `"10:00"` / `"21:00"` | |
| `breakStart` / `breakEnd` | time | | Optional midday closure | |

### HolidayOverride (0..n per location)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `locationId` | uuid | ✔ | |
| `date` | date | ✔ | |
| `isClosed` | bool | ✔ | Or special hours below |
| `opensAt` / `closesAt` | time | | |
| `note` | string | | `"Diwali"` |

The consumer-facing `isOpen` boolean (used on deal cards today) is **computed** from
hours + overrides at request time — never stored.

### StaffMember (0..n per location, optional)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | uuid | ✔ | |
| `locationId` | uuid | ✔ | |
| `name` | string | ✔ | |
| `title` | string | ✔ | `"Senior Therapist"` |
| `specialties` | string[] | | `["Deep Tissue","Thai"]` |
| `photoMediaId` | uuid | | |
| `isActive` | bool | ✔ | |

## Enums

**Company.status**: `draft → submitted → under_review → verified | rejected`; verified
can become `suspended` (admin) and back. Only `verified` companies can publish deals;
suspension pauses all their live deals.

## Endpoints

### Partner (auth: `partner`, scoped to own companies via CompanyMember)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/partners/apply` | Existing consumer requests `partner` role (auto-grant or reviewed — open question) |
| POST | `/partner/companies` | Create company (status `draft`) |
| GET | `/partner/companies` | My companies |
| GET | `/partner/companies/:id` | Full detail incl. payout (masked) |
| PATCH | `/partner/companies/:id` | Update draft/verified fields (legal-field changes on a verified company → back to `under_review`) |
| POST | `/partner/companies/:id/submit` | `draft → submitted` (validates required fields) |
| PUT | `/partner/companies/:id/payout` | Set payout details (owner only) |
| POST | `/partner/companies/:id/members` | Invite manager (by phone/email) |
| DELETE | `/partner/companies/:id/members/:userId` | Remove member (owner only) |
| POST | `/partner/companies/:id/locations` | Add branch |
| PATCH | `/partner/locations/:id` | Update branch |
| PUT | `/partner/locations/:id/hours` | Replace weekly hours (7 rows) |
| POST | `/partner/locations/:id/holiday-overrides` | Add override |
| CRUD | `/partner/locations/:id/staff` | Staff management |

### Admin

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/companies?status=submitted` | Verification queue |
| POST | `/admin/companies/:id/review` | `{ action: "approve" \| "reject", reason? }` |
| POST | `/admin/companies/:id/suspend` / `/reinstate` | |

### Public (consumer)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/companies/:slug` | Public profile: display fields, locations, hours, computed `isOpenNow`, rating, live deal count. **Excludes** legal, payout, commission |
| GET | `/companies/:slug/deals` | Live deals for the company |
| GET | `/companies/:slug/reviews` | See 09-reviews |

## Zod schemas

`CompanyCreateSchema`, `CompanyUpdateSchema`, `CompanySubmitSchema`,
`CompanyPublicResponseSchema`, `CompanyPartnerResponseSchema` (superset),
`LocationCreateSchema`, `OpeningHoursPutSchema`, `StaffMemberSchema`,
`CompanyReviewActionSchema`.

## Open questions

- [ ] Is `partner` role auto-granted on apply, or does sales approve first?
- [ ] KYC depth for verification: is PAN + optional GST enough, or also bank-account penny-drop?
- [ ] Commission: flat % per company vs per deal category?
