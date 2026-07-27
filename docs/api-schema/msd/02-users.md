# 02 — Users, Profile, My Account, Wishlist

## Entities

### User

| Field | Type | Required | Default | Description | Example |
|-------|------|----------|---------|-------------|---------|
| `id` | uuid | ✔ | | | |
| `name` | string | | null | Full display name | `"Asha Rao"` |
| `email` | string | | null | Unique, lowercased; null until provided | |
| `emailVerifiedAt` | timestamp | | null | | |
| `phone` | string | | null | E.164, unique; null for Google-only accounts | `+919812345678` |
| `phoneVerifiedAt` | timestamp | | null | | |
| `avatarMediaId` | uuid | | null | FK → MediaAsset | |
| `roles` | enum[] | ✔ | `["user"]` | `user \| partner \| admin \| marketing \| sales` | |
| `gender` | enum | | null | `female \| male \| other \| prefer_not_to_say` — some spas offer gender-specific services | |
| `dateOfBirth` | date | | null | Birthday offers | |
| `locale` | string | ✔ | `en-IN` | | |
| `status` | enum | ✔ | `active` | `active \| suspended \| deleted` | |
| `preferences` | UserPreferences | ✔ | defaults | Embedded (JSONB) | |
| `createdAt` / `updatedAt` | timestamp | ✔ | | | |

At least one of `email` / `phone` must be set and verified.

### UserPreferences (embedded)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | enum | `system` | `light \| dark \| system` |
| `marketingEmails` | bool | true | Newsletter / offers |
| `marketingSms` | bool | false | |
| `bookingReminders` | bool | true | Transactional reminders |
| `defaultCity` | string | null | Pre-fills search location |

### Address (0..n per user)

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `id` | uuid | ✔ | | |
| `userId` | uuid | ✔ | FK → User | |
| `label` | string | ✔ | `"Home"`, `"Office"` | |
| `line1` | string | ✔ | | |
| `line2` | string | | | |
| `city` | string | ✔ | | `"Mumbai"` |
| `state` | string | ✔ | | `"Maharashtra"` |
| `postalCode` | string | ✔ | 6-digit PIN | `"400050"` |
| `country` | string | ✔ | ISO 3166-1 alpha-2, default `IN` | |
| `lat` / `lng` | decimal | | Geocoded — enables "near home" search | |
| `isDefault` | bool | ✔ | One default per user | |

> Mirrors the existing frontend `Address` type in `apps/msd/src/types/index.ts`
> (adds `lat/lng`, `isDefault`, `userId`).

### WishlistItem

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | uuid | ✔ | Composite PK with `dealId` |
| `dealId` | uuid | ✔ | FK → Deal |
| `createdAt` | timestamp | ✔ | Sort order (newest first) |

Migrates the current `msd_wishlist` localStorage set. On first authenticated load
the frontend syncs local ids → `POST /me/wishlist/sync`.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/me` | user | Current user + preferences |
| PATCH | `/me` | user | Update name, gender, dob, locale, preferences |
| PUT | `/me/avatar` | user | Set avatar (`mediaId`) |
| POST | `/me/change-phone` | user | Start OTP challenge (`purpose: change_phone`) |
| POST | `/me/change-email` | user | Start OTP challenge (`purpose: change_email`) |
| DELETE | `/me` | user | Soft-delete account (status `deleted`, PII scrubbed after 30 days) |
| GET | `/me/addresses` | user | List addresses |
| POST | `/me/addresses` | user | Create |
| PATCH | `/me/addresses/:id` | user | Update |
| DELETE | `/me/addresses/:id` | user | Delete |
| GET | `/me/wishlist` | user | Wishlist deals (cursor paginated, hydrated `DealCardResponse`) |
| PUT | `/me/wishlist/:dealId` | user | Add |
| DELETE | `/me/wishlist/:dealId` | user | Remove |
| POST | `/me/wishlist/sync` | user | Merge localStorage ids on first login `{ dealIds: [] }` |
| GET | `/users` | admin, sales | Search/list users (offset paginated) |
| GET | `/users/:id` | admin, sales | Full user detail |
| PATCH | `/users/:id/status` | admin | Suspend / reactivate |

### GET /me — response

```json
{
  "id": "018f...",
  "name": "Asha Rao",
  "email": "asha@example.com",
  "emailVerifiedAt": "2026-07-01T10:00:00Z",
  "phone": "+919812345678",
  "phoneVerifiedAt": "2026-06-28T08:00:00Z",
  "avatarUrl": "https://cdn.myspadeal.com/u/018f.jpg",
  "roles": ["user"],
  "gender": "female",
  "preferences": { "theme": "system", "marketingEmails": true, "marketingSms": false, "bookingReminders": true, "defaultCity": "Mumbai" }
}
```

## Zod schemas

`UserResponseSchema`, `UserUpdateSchema`, `UserPreferencesSchema`,
`AddressCreateSchema`, `AddressResponseSchema`, `WishlistSyncSchema`.

## Open questions

- [ ] Account deletion: legal retention period for order/payment records (keep financial rows, scrub PII)?
- [ ] Is `gender` needed at signup or only optional in profile? (Some partners restrict services by gender.)
