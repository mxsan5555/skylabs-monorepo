**# MSD DEAL AND PRODUCT FIELD MAPPING**


# Index

  Deal --- Consultation, Adjustments and Choice of Hydro Massage or Laser Therapy\
  Category --- Therapy\
  Sub Category --  Physical Therapy


**---**

**# PART 1: DEALS**

**---**

**## Deal 1**

**Category:** Therapy > Physical Therapy

**Title:** Consultation, Adjustments and Choice of Hydro Massage or Laser Therapy

**Slug:** consultation-adjustments-choice-of-hydro-massage-or-laser-therapy

**Short Description:** Patient needs are assessed in a preliminary consultation, followed by adjustments and therapy sessions for personalized care.

**Description:**

Struggling with chronic pain or a recent injury? This deal covers everything from an initial consultation to multiple adjustments and your choice of hydro massage or laser therapy sessions. Whether you are dealing with neck pain or back issues, these treatments are designed to help you feel better quickly.


**Notes:**

\- Appointment required, subject to availability.

\- Most insurances are also accepted as full payment.

\- Redeemable at three locations: Wilmington, Milford and Dover (Delaware).

**Policy:**

Appointment required. Merchant's standard cancellation policy applies (any fees not to exceed the Groupon price).

**Terms and Conditions:**

\- Consultation required before service. If you are ineligible, a refund will be provided.

\- Valid only for option purchased.

\- May be repurchased every 365 days.

\- Limit 1 per visit.

\- Limit 1 per person.

\- All goods or services must be used by the same person.

\- Promotional value expires 120 days after purchase. Amount paid never expires.

**Packages:**

 Duration ---    30 minutes\
 Selling Price --- 499\
Original Price ----  699 


**Therapist:**

**therapistType:** "Skin & Facial Therapy"\
**personName:** "Ananya Singh"\
**gender:** "Female"\
**specializationCategoryId:** "288dc59c-898e-45dd-b885-93e1160d4401"\
**bio:** " Ananya Singh provides professional wellness and personal-care services with a focus on customer comfort, hygiene, and personalized sessions."
experienceYears: 8



**---**

**# PART 2: PRODUCTS**

**---**

**## Product 1**

**Name:** Lavender and Sweet Almond Massage Oil, 100 ml

**Slug:** lavender-sweet-almond-massage-oil-100ml

**Brand:** Aurelle Botanicals

**Price:** $18.99

**Original Price:** $24.99

**Discount:** 24%

**Badge:** Best Seller

**Summary:** A silky, lightly scented massage oil that glides smoothly and leaves skin soft.

**Description:**

This massage oil blends nourishing sweet almond oil with calming lavender essential oil. It absorbs well without feeling greasy, so it works for full-body massage at home or for dry skin after a shower. The scent is soft and relaxing, suited to evening use. Pump bottle for easy, mess-free use. Suitable for most skin types. Patch test before first use.

**Ingredients:**

Prunus Amygdalus Dulcis (Sweet Almond) Oil, Helianthus Annuus (Sunflower) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Lavandula Angustifolia (Lavender) Oil, Tocopherol (Vitamin E). Contains nut oil.

**Return Policy:**

Unopened and unused items can be returned within 30 days of delivery for a full refund. Opened items cannot be returned for hygiene reasons unless damaged or defective. Please contact support within 7 days with photos if the item arrives damaged.

**---**

# PART 3: CONTENT → API → RESPONSE FIELD MAPPING

**Purpose:** This section maps the draft content to the API fields shown in the supplied request/response examples. It does not create or insert records.

**Environment:** Local development only  
**API base URL:** `http://localhost:3333/api/v1`  
**Status:** Draft; pending TL approval  
**Database writes:** None performed while preparing this document.


## 3.1 Deal API contract supplied by the team

### Create deal

- **Method:** `POST`
- **Full URL:** `http://localhost:3333/api/v1/vendors/0a9236ad-7b4f-40f4-9a33-7b398f8820d4/branches/e52b0d86-0a37-497e-8efe-11b1714ee930/deals`
- **Base URL:** `http://localhost:3333/api/v1`
- **Endpoint path:** `/vendors/{vendorId}/branches/{branchId}/deals`
- **Vendor ID:** `0a9236ad-7b4f-40f4-9a33-7b398f8820d4` `{path.vendorId}`
- **Branch ID:** `e52b0d86-0a37-497e-8efe-11b1714ee930` `{path.branchId}`
- **Authentication/permissions:** Not included in the supplied request capture; verify in backend route/middleware before documenting as public or protected.
- **Request Content-Type:** Expected to be JSON for the shown payload; confirm request headers in the actual client/Postman capture.


### Deal request payload — supplied example

```json
{
  "categoryId": "5a7db456-ae95-43a8-a22f-c39d4192df58",
  "subcategoryId": "a0341d91-eac4-43e6-8020-1aeb1dfcd4a8",
  "title": "Consultation, Adjustments and Choice of Hydro Massage or Laser Therapy",
  "slug": "consultation-adjustments-choice-of-hydro-massage-or-laser-therapy",
  "shortDescription": "Patient needs are assessed in a preliminary consultation, followed by adjustments and therapy sessions for personalized care.",
  "description": "Struggling with chronic pain or a recent injury? This deal covers everything from an initial consultation to multiple adjustments and your choice of hydro massage or laser therapy sessions. Whether you are dealing with neck pain or back issues, these treatments are designed to help you feel better quickly.",
  "durationMinutes": 30,
  "notes": "Appointment required, subject to availability.\n- Most insurances are also accepted as full payment.\n- Redeemable at three locations: Wilmington, Milford and Dover (Delaware).",
  "policy": "Appointment required. Merchant's standard cancellation policy applies (any fees not to exceed the Groupon price).",
  "termsAndConditions": "- Consultation required before service. If you are ineligible, a refund will be provided.\n- Valid only for option purchased.\n- May be repurchased every 365 days.\n- Limit 1 per visit.\n- Limit 1 per person.\n- All goods or services must be used by the same person.\n- Promotional value expires 120 days after purchase. Amount paid never expires.",
  "salePrice": "799",
  "originalPrice": "999",
  "packages": [
    {
      "durationMinutes": 30,
      "sellingPrice": 799,
      "originalPrice": 999
    }
  ],
  "therapistIds": [
    "cfb3a4b8-a958-4c61-b497-6ab7f6e11451"
  ]
}
```



### Deal response — supplied structure

The following is a shortened response example based on the supplied capture. Values are representative of that capture and are not a promise that future creations return the same IDs or status.

```json
{
  "data": {
    "id": "6c6a4cea-c455-4b84-94c7-46417442d18b",
    "vendorId": "0a9236ad-7b4f-40f4-9a33-7b398f8820d4",
    "branchId": "e52b0d86-0a37-497e-8efe-11b1714ee930",
    "categoryId": "5a7db456-ae95-43a8-a22f-c39d4192df58",
    "subcategoryId": "a0341d91-eac4-43e6-8020-1aeb1dfcd4a8",
    "title": "Consultation, Adjustments and Choice of Hydro Massage or Laser Therapy",
    "slug": "consultation-adjustments-choice-of-hydro-massage-or-laser-therapy",
    "shortDescription": "Patient needs are assessed in a preliminary consultation, followed by adjustments and therapy sessions for personalized care.",
    "description": "Struggling with chronic pain or a recent injury? This deal covers everything from an initial consultation to multiple adjustments and your choice of hydro massage or laser therapy sessions. Whether you are dealing with neck pain or back issues, these treatments are designed to help you feel better quickly.",
    "originalPrice": "999",
    "salePrice": "799",
    "discountPercent": null,
    "termsAndConditions": "Terms and conditions text",
    "status": "ACTIVE",
    "approvalStatus": "APPROVED",
    "durationMinutes": 30,
    "notes": "Appointment required, subject to availability.",
    "policy": "Appointment required. Merchant's standard cancellation policy applies.",
    "category": {
      "id": "5a7db456-ae95-43a8-a22f-c39d4192df58",
      "name": "Massage"
    },
    "subcategory": {
      "id": "a0341d91-eac4-43e6-8020-1aeb1dfcd4a8",
      "name": "Foot Massage"
    },
    "packages": [
      {
        "id": "322384ce-1416-4fc9-aad6-b4ee6c6f9b36",
        "dealId": "6c6a4cea-c455-4b84-94c7-46417442d18b",
        "durationMinutes": 30,
        "sellingPrice": "799",
        "originalPrice": "999",
        "isActive": true,
        "sortOrder": 0
      }
    ],
    "mediaImages": [],
    "mediaVideo": null,
    "therapists": [
      {
        "id": "cfb3a4b8-a958-4c61-b497-6ab7f6e11451",
        "personName": "Rohit Malhotra",
        "therapistType": "Board-Certified Chiropractor",
        "isActive": true
      }
    ]
  },
  "error": null
}
```

### Deal list/read endpoint

The supplied evidence includes the create endpoint only. A list/read endpoint for deals is **not specified in the provided capture**. Do not infer its path from the product API. Verify the actual MSD route registry and controller before adding a deal GET endpoint to this contract.


### Shared deal field mapping

Apply the following mapping to each deal where the source field exists:

| Source field | Mapping notation | Notes |
|---|---|---|
| Category name | `{Category.name}` | Resolve to the correct category ID; do not send a name unless the request schema accepts it |
| Subcategory name | `{Subcategory.name}` | Resolve to the correct subcategory ID and confirm its parent relationship |
| Source URL | `{NOT SHOWN IN DEAL PAYLOAD}` | Preserve as source/reference metadata unless the schema has an approved field |
| Source location | `{NOT SHOWN IN DEAL PAYLOAD}` | Do not assume this is the actual vendor branch address |
| Title | `{request.title -> response.data.title}` | Confirmed by Deal 1 sample |
| Slug | `{request.slug -> response.data.slug}` | Confirmed by Deal 1 sample |
| Short description | `{request.shortDescription -> response.data.shortDescription}` | Confirmed by Deal 1 sample |
| Description | `{request.description -> response.data.description}` | Confirmed by Deal 1 sample |
| Notes | `{request.notes -> response.data.notes}` | Confirmed by Deal 1 sample |
| Policy | `{request.policy -> response.data.policy}` | Confirmed by Deal 1 sample |
| Terms and conditions | `{request.termsAndConditions -> response.data.termsAndConditions}` | Confirmed by Deal 1 sample |
| Package label/name | `{NOT SHOWN IN PACKAGE PAYLOAD}` | Supplied package request contains duration/prices but no package name; verify schema before deciding how labels/options are displayed |
| Package duration | `{request.packages[i].durationMinutes -> response.data.packages[i].durationMinutes}` | Confirmed by sample |
| Package selling price | `{request.packages[i].sellingPrice -> response.data.packages[i].sellingPrice}` | Confirmed by sample |
| Package original price | `{request.packages[i].originalPrice -> response.data.packages[i].originalPrice}` | Confirmed by sample |
| Therapist type/name | `{response.data.therapists[i].therapistType/personName}` | Request accepts therapist IDs in the sample; names/types come from related records |
| Deal duration | `{request.durationMinutes -> response.data.durationMinutes}` | Confirmed by sample |
| Groupon terms/expiry | `{request.termsAndConditions -> response.data.termsAndConditions}` | Expiry is in text; no separate expiry field shown |
| Groupon policy | `{request.policy -> response.data.policy}` | No separate cancellation-policy enum shown |
| Status/approval | `{NOT SUPPLIED IN SAMPLE REQUEST}` | Returned by response; verify server defaults and permission controls |
| Media | `{response.data.mediaImages/mediaVideo}` | No media included in create request sample |
---

## 3.2 Product API contract supplied by the team

### List products

- **Method:** `GET`
- **Full URL:** `http://localhost:3333/api/v1/products?page=1&pageSize=10`
- **Endpoint path:** `/products`
- **Query parameters:** `page=1`, `pageSize=10`
- **Purpose:** List products; pagination response metadata was not included in the supplied capture.

### Create product

- **Method:** `POST`
- **Full URL:** `http://localhost:3333/api/v1/vendors/0a9236ad-7b4f-40f4-9a33-7b398f8820d4/products`
- **Endpoint path:** `/vendors/{vendorId}/products`
- **Vendor ID:** `0a9236ad-7b4f-40f4-9a33-7b398f8820d4` `{path.vendorId}`
- **Authentication/permissions:** Not included in the supplied request capture; verify route middleware.
- **Content-Type:** Expected JSON for the supplied payload; confirm actual request headers.

### Product request payload — supplied example

```json
{
  "name": "Lavender and Sweet Almond Massage Oil, 100 ml",
  "slug": "lavender-sweet-almond-massage-oil-100ml",
  "brand": "Aurelle Botanicals",
  "categoryId": "bc39439b-5364-47cd-8f7f-fe17c5469df0",
  "subcategoryId": "2a8f1bb4-36cb-4718-b730-6d27f288ca52",
  "description": "This massage oil blends nourishing sweet almond oil with calming lavender essential oil. It absorbs well without feeling greasy, so it works for full-body massage at home or for dry skin after a shower. The scent is soft and relaxing, suited to evening use. Pump bottle for easy, mess-free use. Suitable for most skin types. Patch test before first use.",
  "summary": "A silky, lightly scented massage oil that glides smoothly and leaves skin soft.",
  "ingredients": "Prunus Amygdalus Dulcis (Sweet Almond) Oil, Helianthus Annuus (Sunflower) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Lavandula Angustifolia (Lavender) Oil, Tocopherol (Vitamin E). Contains nut oil.",
  "returnPolicy": "Unopened and unused items can be returned within 30 days of delivery for a full refund. Opened items cannot be returned for hygiene reasons unless damaged or defective. Please contact support within 7 days with photos if the item arrives damaged.",
  "badge": "Best Seller",
  "price": "699",
  "originalPrice": "899",
  "discount": 24,
  "isFeatured": false,
  "isNew": false
}
```

### Product response — supplied structure

The original captured response is not valid JSON in the provided text: the `discount` line is joined with a timestamp and `updatedAt` is truncated. Do not copy the malformed fragment into Postman as a response contract. This is a structural example based on the unambiguous fields in the supplied capture; refresh the actual API response before treating it as authoritative.

```json
{
  "data": {
    "id": "b79abdb5-f0a6-449a-a09d-a8122caea143",
    "name": "Lavender and Sweet Almond Massage Oil, 100 ml",
    "slug": "lavender-sweet-almond-massage-oil-100ml",
    "brand": "Aurelle Botanicals",
    "categoryId": "bc39439b-5364-47cd-8f7f-fe17c5469df0",
    "subcategoryId": "2a8f1bb4-36cb-4718-b730-6d27f288ca52",
    "description": "This massage oil blends nourishing sweet almond oil with calming lavender essential oil.",
    "summary": "A silky, lightly scented massage oil that glides smoothly and leaves skin soft.",
    "benefits": null,
    "howToUse": null,
    "ingredients": "Prunus Amygdalus Dulcis (Sweet Almond) Oil, Helianthus Annuus (Sunflower) Seed Oil, Simmondsia Chinensis (Jojoba) Seed Oil, Lavandula Angustifolia (Lavender) Oil, Tocopherol (Vitamin E). Contains nut oil.",
    "returnPolicy": "Unopened and unused items can be returned within 30 days of delivery for a full refund.",
    "image": null,
    "gallery": null,
    "imageAlt": null,
    "badge": "Best Seller",
    "price": "699",
    "originalPrice": "899",
    "discount": 24,
    "isNew": false,
    "isFeatured": false,
    "isActive": true,
    "vendorId": "0a9236ad-7b4f-40f4-9a33-7b398f8820d4",
    "category": {
      "id": "bc39439b-5364-47cd-8f7f-fe17c5469df0",
      "name": "Product"
    },
    "subcategory": {
      "id": "2a8f1bb4-36cb-4718-b730-6d27f288ca52",
      "name": "Hair Care"
    },
    "mediaImages": [],
    "mediaVideo": null
  },
  "error": null
}
```

---


---

### Shared product field mapping

| Source field | Mapping notation | Notes |
|---|---|---|
| Name | `{request.name -> response.data.name}` | Confirmed by Product 1 sample |
| Slug | `{request.slug -> response.data.slug}` | Confirmed by Product 1 sample |
| Brand | `{request.brand -> response.data.brand}` | Confirmed by Product 1 sample |
| Category | `{request.categoryId -> response.data.categoryId -> response.data.category.id/name}` | Confirmed in sample; category name is `Product` |
| Subcategory | `{request.subcategoryId -> response.data.subcategoryId -> response.data.subcategory.id/name}` | Confirmed in sample; subcategory name is `Hair Care` |
| Description | `{request.description -> response.data.description}` | Confirmed |
| Summary | `{request.summary -> response.data.summary}` | Confirmed |
| Ingredients | `{request.ingredients -> response.data.ingredients}` | Confirmed |
| Return policy | `{request.returnPolicy -> response.data.returnPolicy}` | Confirmed |
| Price | `{request.price -> response.data.price}` | Confirmed, but sample values conflict with draft USD prices |
| Original price | `{request.originalPrice -> response.data.originalPrice}` | Confirmed, but sample values conflict with draft USD prices |
| Discount | `{request.discount -> response.data.discount}` | Request has `24`; verify clean response and server calculation rules |
| Badge | `{request.badge -> response.data.badge}` | Confirmed |
| Is featured | `{request.isFeatured -> response.data.isFeatured}` | Confirmed |
| Is new | `{request.isNew -> response.data.isNew}` | Confirmed |
| Benefits | `{NOT SUPPLIED IN PRODUCT 1 REQUEST}` | Response is null; not present in source product fields |
| How to use | `{NOT SUPPLIED AS A SEPARATE REQUEST FIELD}` | Product usage text currently sits inside description |
| Image/gallery/alt | `{NOT SUPPLIED IN PRODUCT 1 REQUEST}` | Response is null; verify separate media endpoints |
| Source URL | `{NOT APPLICABLE / NOT PROVIDED}` | The supplied product draft does not specify an external source URL |

---

## 3.3 Product endpoint request/response summary

| Operation | Method | URL | Purpose |
|---|---|---|---|
| List products | `GET` | `http://localhost:3333/api/v1/products?page=1&pageSize=10` | Retrieve a paginated product list |
| Create product | `POST` | `http://localhost:3333/api/v1/vendors/0a9236ad-7b4f-40f4-9a33-7b398f8820d4/products` | Create a product for the specified vendor |
| Create deal | `POST` | `http://localhost:3333/api/v1/vendors/0a9236ad-7b4f-40f4-9a33-7b398f8820d4/branches/e52b0d86-0a37-497e-8efe-11b1714ee930/deals` | Create a deal for the specified vendor branch |

Only the listed methods/paths were supplied in the user-provided request capture. Confirm the full route inventory from the actual backend before adding update/delete/detail operations.

## 3.4 Category ID resolution workflow

Do not hard-code category IDs from the examples into all 10 deals or 5 products.

1. Retrieve valid categories/subcategories using the actual existing category API.
2. Find the exact category record by intended category name.
3. Find the intended subcategory record and verify its parent/category relationship.
4. Use the corresponding IDs in `categoryId` and `subcategoryId`.
5. Verify the created response returns the expected `category.name` and `subcategory.name`.
6. If the response names do not match the source content, stop and resolve the mismatch before proceeding.

Relationship notation:

- `{request.categoryId -> Deal.categoryId -> Category.id}`
- `{request.subcategoryId -> Deal.subcategoryId -> Subcategory.id}`

These database relationship labels are illustrative until confirmed against the actual Prisma schema. The supplied response proves the API returns `category` and `subcategory` objects, but the exact database relation definitions must still be checked in Prisma.


## 3.5 Final pre-insertion checklist

- [ ] TL has approved the content draft.
- [ ] Correct category and subcategory IDs are resolved for every record.
- [ ] Deal 1 category mismatch is fixed or explicitly approved.
- [ ] Product 1 category/subcategory assignment is confirmed.
- [ ] Prices and original prices are reconciled with the USD content draft.
- [ ] Deal packages and multi-session durations are represented correctly.
- [ ] Every therapist ID belongs to the intended vendor/branch and is valid for that deal.
- [ ] Source URLs are preserved in an approved field or documentation-only metadata.
- [ ] Unsupported fields are reviewed with the TL.
- [ ] API request validation has been checked against the real Zod schema.
- [ ] A fresh valid Product response has been captured because the supplied text is malformed/truncated.
- [ ] The creation flow has been tested in a non-production environment only, after approval.
- [ ] No production/database insertion occurs before approval.

**Current status: NOT READY FOR INSERTION.** The mapping is useful for review, but the price and category mismatches must be resolved first.

**Database action performed while creating this document:** None.
