# System Specification & Technical Prompt: Member Management & Service Catalog

## 1. Domain Overview & High-Level Entity Flow
We are architecting a multi-entity business catalog system centered around a **Member (Business Owner / Merchant)**. 

### Core Business Rules:
1. **Onboarding Sequence:** 
   - A `Member` is initially created with basic profile information.
   - Additional details (Branches, Deals, Therapists, Products) are managed in secondary flows.
2. **Branch-First Dependency:**
   - A Member **must** create at least one `Branch` before creating any `Deal` or assigning a `Therapist`.
   - `Branch` creation requires state selection (`state_id` / `state_code`).
3. **Deals & Pricing Packages:**
   - A `Deal` belongs strictly to a specific `Branch`.
   - A single `Deal` can have one or many `Pricing Packages` (one-to-many relationship).
   - A Member can have multiple Deals across their Branches.
4. **Therapist Association:**
   - A `Therapist` is associated with a specific `Branch`.
   - When configuring a `Deal`, assigning a Therapist is **optional** (zero, one, or multiple Therapists per Deal).
   - In-deal inline creation: If a Therapist does not yet exist, the user can create a new Therapist inline while configuring the Deal.
5. **Product Catalog Isolation:**
   - `Products` belong directly to the `Member` (account level).
   - Products are **not** bound to any specific Branch (`branch_id` is null / unassociated).

---

## 2. Entity-Relationship Data Model (Database Schema Guidance)

### 2.1. `members`
- `id`: UUID / Primary Key
- `<PLACEHOLDER: member_initial_fields>` (e.g., `email`, `phone_number`, `password_hash`, `business_name`, `legal_entity_type`)
- `<PLACEHOLDER: member_additional_fields>` (e.g., `bio`, `logo_url`, `website`, `tax_id`, `onboarding_status`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 2.2. `branches`
- `id`: UUID / Primary Key
- `member_id`: UUID (Foreign Key -> `members.id`, ON DELETE CASCADE)
- `state`: String / Enum / Foreign Key (Required: State code or ID)
- `<PLACEHOLDER: branch_fields>` (e.g., `branch_name`, `address_line_1`, `address_line_2`, `city`, `postal_code`, `contact_phone`, `operating_hours_json`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 2.3. `therapists`
- `id`: UUID / Primary Key
- `member_id`: UUID (Foreign Key -> `members.id`, ON DELETE CASCADE)
- `branch_id`: UUID (Foreign Key -> `branches.id`, ON DELETE RESTRICT)
- `<PLACEHOLDER: therapist_fields>` (e.g., `first_name`, `last_name`, `specialization`, `license_number`, `avatar_url`, `is_active`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 2.4. `deals`
- `id`: UUID / Primary Key
- `member_id`: UUID (Foreign Key -> `members.id`, ON DELETE CASCADE)
- `branch_id`: UUID (Foreign Key -> `branches.id`, ON DELETE CASCADE)
- `<PLACEHOLDER: deal_fields>` (e.g., `title`, `description`, `terms_conditions`, `category`, `start_date`, `end_date`, `is_published`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 2.5. `deal_pricing_packages` (Child Table of Deals)
- `id`: UUID / Primary Key
- `deal_id`: UUID (Foreign Key -> `deals.id`, ON DELETE CASCADE)
- `<PLACEHOLDER: package_fields>` (e.g., `package_name`, `price`, `discounted_price`, `currency`, `duration_minutes`, `features_list`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

### 2.6. `deal_therapists` (Junction Table: Many-to-Many between Deals and Therapists)
- `id`: UUID / Primary Key
- `deal_id`: UUID (Foreign Key -> `deals.id`, ON DELETE CASCADE)
- `therapist_id`: UUID (Foreign Key -> `therapists.id`, ON DELETE CASCADE)
- *Constraint:* Unique composite index on `(deal_id, therapist_id)`.
- *Validation Check:* Ensure `therapists.branch_id == deals.branch_id`.

### 2.7. `products`
- `id`: UUID / Primary Key
- `member_id`: UUID (Foreign Key -> `members.id`, ON DELETE CASCADE)
  *(Notice: Explicitly NO `branch_id` relationship)*
- `<PLACEHOLDER: product_fields>` (e.g., `product_name`, `sku`, `category`, `retail_price`, `inventory_count`, `description`, `image_urls`)
- `created_at`: Timestamp
- `updated_at`: Timestamp

---

## 3. OpenAPI 3.0 / REST API Endpoint Blueprint

### Member Profile
- `POST /api/v1/members` — Initial member registration (`<PLACEHOLDER: member_initial_fields>`).
- `PATCH /api/v1/members/{member_id}` — Update additional details (`<PLACEHOLDER: member_additional_fields>`).
- `GET /api/v1/members/{member_id}` — Fetch member profile.

### Branches
- `POST /api/v1/members/{member_id}/branches` — Create a branch.
  - **Required Body:** `state`, `<PLACEHOLDER: branch_fields>`.
- `GET /api/v1/members/{member_id}/branches` — List all branches for a member.
- `GET /api/v1/branches/{branch_id}` — Get single branch details.

### Therapists
- `POST /api/v1/branches/{branch_id}/therapists` — Create a therapist assigned to a specific branch.
  - **Required Body:** `<PLACEHOLDER: therapist_fields>`.
- `GET /api/v1/branches/{branch_id}/therapists` — List all therapists available for this branch.

### Deals & Packages
- `POST /api/v1/branches/{branch_id}/deals` — Create a new deal with packages and therapist assignment.
  - **Request Body Contract:**
    ```json
    {
      "<PLACEHOLDER: deal_fields>": "value",
      "pricing_packages": [
        {
          "<PLACEHOLDER: package_fields>": "value"
        }
      ],
      "therapist_ids": ["uuid-optional-1", "uuid-optional-2"],
      "inline_new_therapists": [
        {
          "<PLACEHOLDER: therapist_fields>": "value"
        }
      ]
    }
    ```
- `GET /api/v1/branches/{branch_id}/deals` — List deals for a specific branch.
- `GET /api/v1/deals/{deal_id}` — Get deal details, including nested pricing packages and assigned therapists.

### Products
- `POST /api/v1/members/{member_id}/products` — Create a member-level product (independent of branch).
  - **Required Body:** `<PLACEHOLDER: product_fields>`.
- `GET /api/v1/members/{member_id}/products` — List all products belonging to a member.

---

## 4. Business Logic, Validation Rules & Security Constraints

1. **Prerequisite Gating:**
   - Attempting to call `POST /api/v1/branches/{branch_id}/deals` must fail with `404 Not Found` or `400 Bad Request` if `branch_id` does not exist or does not belong to the authenticated member.
2. **Branch Match Validation (Data Integrity):**
   - If `therapist_ids` are passed during deal creation/update, the service layer must verify that all provided `therapist_id` records have a `branch_id` matching the target deal's `branch_id`. Disallow cross-branch therapist assignment.
3. **Array Boundaries:**
   - `pricing_packages`: Minimum 1 required (`minItems: 1`).
   - `therapist_ids`: Optional (`minItems: 0`).
4. **Atomic Transactions (ACID):**
   - Deal creation with `pricing_packages` and `inline_new_therapists` must be executed within a single database transaction. If any package or therapist insertion fails, rollback the entire deal creation.
5. **Authorization & Multi-Tenancy:**
   - Enforce Row-Level Security (RLS) or tenant middleware checking that `member_id` from the JWT/Session owns the resource (`branch`, `therapist`, `deal`, `product`) before granting write or read access.