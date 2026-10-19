# MSD API Endpoint Inventory --- SEO & Security Review

> **Purpose:** One clear source of truth for the MSD API surface
> currently registered in `openapi/registry.ts`.

## 1. Executive Summary

  -----------------------------------------------------------------------
  Item                                Value
  ----------------------------------- -----------------------------------
  API base path   ---                      `/api/v1`

  OpenAPI version                     3.1.0

  Unique API operations               **248**

  `registerPath` registrations        **249**

  Duplicate registration found        **1**

  Authentication model                Bearer JWT where protected

  Main authorization model            RBAC + resource ownership/scoping

  SEO API family                      `/catalog/*`

  Mobile API families                 Auth, catalogue, cart, wishlist,
                                      orders, payments, notifications
  -----------------------------------------------------------------------

### ⚠️ One registry issue to review

The registry contains `GET /reports/top-vendors` twice: once as a normal
`registerPath` and once inside the reports registration loop. Therefore:

-   **248 unique method + path combinations** are documented.
-   **249 route registrations** exist in the registry.
-   This document keeps the API only **once** in the main inventory and
    records the duplicate below.

This is intentionally called out so the TL can distinguish a real API
from a duplicate OpenAPI registration.

## 2. How to Read This Document

  Term          Simple meaning
  ------------ -------------------------------------------
  `GET`        Give me data
  `POST`       Create/send something
  `PATCH`      Change part of something
  `PUT`        Replace/update a complete set
  `DELETE`     Remove something
  `{id}`       Replace with the real ID
  Public       No login token required
  Bearer JWT   Caller must send a valid JWT access token

### Request column

-   **Path params** → values such as `vendorId`, `branchId`, `id`.
-   **Query params** → filters, search, pagination or report filters.
-   **JSON body** → data sent in the request body.
-   **Multipart file** → image/video upload.

## 3. API Architecture at a Glance

``` text
📱 Mobile App / 💻 Admin Panel / 🌐 Website
                    │
                    ▼
             ┌───────────────┐
             │    MSD API    │
             │   /api/v1     │
             └───────┬───────┘
                     │
        ┌────────────┼─────────────┐
        ▼            ▼             ▼
     🔐 Auth      👮 RBAC       🏪 Business APIs
                                      │
                  ┌───────────────────┼─────────────────┐
                  ▼                   ▼                 ▼
              Catalogue          Cart/Orders       Payments
                  │                   │                 │
                  └───────────────────┼─────────────────┘
                                      ▼
                                  🗄️ Database
```

## 4. Complete API Inventory

### 1. Authentication & Sessions

  ------------------------------------------------------------------------------------------
              \# Method      Endpoint                  Access      Request     Purpose
  -------------- ----------- ------------------------- ----------- ----------- -------------
               1 `POST`      `/auth/otp/request`       Public      JSON body   Request an
                                                                               OTP for
                                                                               phone/email
                                                                               login

               2 `POST`      `/auth/otp/verify`        Public      JSON body   Verify an OTP
                                                                               and receive a
                                                                               JWT pair

               3 `GET`       `/auth/google`            Public      ---         Redirect to
                                                                               Google OAuth
                                                                               consent
                                                                               screen

               4 `GET`       `/auth/google/callback`   Public      ---         Google OAuth
                                                                               callback ---
                                                                               issues a JWT
                                                                               pair

               5 `POST`      `/auth/refresh`           Public      JSON body   Rotate the
                                                                               refresh token
                                                                               and issue a
                                                                               new access
                                                                               token

               6 `POST`      `/auth/logout`            Bearer JWT  JSON body   Revoke the
                                                                               current
                                                                               refresh
                                                                               session

               7 `POST`      `/auth/logout-all`        Bearer JWT  ---         Revoke every
                                                                               refresh
                                                                               session for
                                                                               the caller
  ------------------------------------------------------------------------------------------

### 2. RBAC, Users & Administration

  -----------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                                 Access      Request     Purpose
  -------------- ----------- ---------------------------------------- ----------- ----------- ---------------------
               1 `GET`       `/rbac/bootstrap`                        Bearer JWT  ---         Roles, permissions,
                                                                                              menu, and dashboard
                                                                                              widgets for the
                                                                                              caller

               2 `GET`       `/rbac/roles`                            Bearer JWT  ---         List roles

               3 `POST`      `/rbac/roles`                            Bearer JWT  JSON body   Create a role

               4 `PATCH`     `/rbac/roles/{id}`                       Bearer JWT  path        Update a role
                                                                                  params,     
                                                                                  JSON body   

               5 `DELETE`    `/rbac/roles/{id}`                       Bearer JWT  path params Delete a role (only
                                                                                              if unassigned and
                                                                                              non-system)

               6 `POST`      `/rbac/roles/{id}/clone`                 Bearer JWT  path        Clone a role with its
                                                                                  params,     permissions and
                                                                                  JSON body   widgets

               7 `PATCH`     `/rbac/roles/{id}/status`                Bearer JWT  path        Activate/deactivate a
                                                                                  params,     role
                                                                                  JSON body   

               8 `GET`       `/rbac/permissions/catalog`              Bearer JWT  ---         Full menu x action
                                                                                              permission matrix

               9 `GET`       `/rbac/roles/{id}/permissions`           Bearer JWT  path params Read data

              10 `PUT`       `/rbac/roles/{id}/permissions`           Bearer JWT  path        Replace the
                                                                                  params,     permission set for a
                                                                                  JSON body   role

              11 `PUT`       `/rbac/roles/{id}/widgets`               Bearer JWT  path        Replace the dashboard
                                                                                  params,     widget set for a role
                                                                                  JSON body   

              12 `GET`       `/rbac/dashboard-widgets`                Bearer JWT  ---         List the dashboard
                                                                                              widget catalog

              13 `POST`      `/rbac/dashboard-widgets`                Bearer JWT  JSON body   Create a dashboard
                                                                                              widget catalog entry

              14 `GET`       `/rbac/users`                            Bearer JWT  ---         List users
                                                                                              (paginated)

              15 `POST`      `/rbac/users`                            Bearer JWT  JSON body   Create a user

              16 `GET`       `/rbac/users/me`                         Bearer JWT  ---         Read data

              17 `PATCH`     `/rbac/users/me`                         Bearer JWT  JSON body   Update existing data

              18 `PATCH`     `/rbac/users/{id}`                       Bearer JWT  path        Update a user
                                                                                  params,     
                                                                                  JSON body   

              19 `DELETE`    `/rbac/users/{id}`                       Bearer JWT  path params Soft-delete a user

              20 `PATCH`     `/rbac/users/{id}/status`                Bearer JWT  path        Change a user status
                                                                                  params,     
                                                                                  JSON body   

              21 `POST`      `/rbac/users/{id}/roles/{roleId}`        Bearer JWT  path params Assign a role to a
                                                                                              user

              22 `DELETE`    `/rbac/users/{id}/roles/{roleId}`        Bearer JWT  path params Unassign a role from
                                                                                              a user

              23 `POST`      `/rbac/users/{id}/sessions/revoke-all`   Bearer JWT  path params Revoke every refresh
                                                                                              session for a user

              24 `POST`      `/rbac/users/{id}/otp/reset`             Bearer JWT  path params Invalidate pending
                                                                                              OTP challenges for a
                                                                                              user

              25 `GET`       `/rbac/users/{id}/login-history`         Bearer JWT  path params Paginated login
                                                                                              history for a user

              26 `GET`       `/rbac/users/{id}/sessions`              Bearer JWT  path params Active/expired device
                                                                                              sessions for a user

              27 `GET`       `/rbac/audit-logs`                       Bearer JWT  query       Audit log, optionally
                                                                                  params      filtered by
                                                                                              targetUserId

              28 `POST`      `/rbac/impersonate`                      Bearer JWT  JSON body   Issue a short-lived
                                                                                              "Login As" preview
                                                                                              token for another
                                                                                              user
  -----------------------------------------------------------------------------------------------------------------

### 3. Vendor Public Registration

  ------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                     Access      Request     Purpose
  -------------- ----------- ---------------------------- ----------- ----------- ----------------------
               1 `POST`      `/vendors/public/register`   Public      JSON body   Public "Become a
                                                                                  Vendor" registration
                                                                                  --- unauthenticated,
                                                                                  always creates
                                                                                  PENDING_VERIFICATION

  ------------------------------------------------------------------------------------------------------

### 4. Vendor Self-Service

  ----------------------------------------------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                                                                    Access      Request     Purpose
  -------------- ----------- --------------------------------------------------------------------------- ----------- ----------- ---------------------
               1 `POST`      `/vendors/me/submit`                                                        Bearer JWT  ---         Submit the completed
                                                                                                                                 profile for admin
                                                                                                                                 verification

               2 `GET`       `/vendors/me/branches`                                                      Bearer JWT  ---         Read data

               3 `GET`       `/vendors/me/customers`                                                     Bearer JWT  query       Distinct customers
                                                                                                                     params      who have
                                                                                                                                 ordered/booked from
                                                                                                                                 the caller\\

               4 `POST`      `/vendors/me/branches`                                                      Bearer JWT  JSON body   Create a branch for
                                                                                                                                 the caller\\

               5 `GET`       `/vendors/me/branches/{branchId}/deals`                                     Bearer JWT  path params Read data

               6 `POST`      `/vendors/me/branches/{branchId}/deals`                                     Bearer JWT  path        Create or submit data
                                                                                                                     params,     
                                                                                                                     JSON body   

               7 `GET`       `/vendors/me/branches/{branchId}/therapists`                                Bearer JWT  path params Read data

               8 `POST`      `/vendors/me/branches/{branchId}/therapists`                                Bearer JWT  path        Create or submit data
                                                                                                                     params,     
                                                                                                                     JSON body   

               9 `PATCH`     `/vendors/me/therapists/{therapistId}`                                      Bearer JWT  path        Update existing data
                                                                                                                     params,     
                                                                                                                     JSON body   

              10 `PATCH`     `/vendors/me/therapists/{therapistId}/status`                               Bearer JWT  path        Update existing data
                                                                                                                     params,     
                                                                                                                     JSON body   

              11 `GET`       `/vendors/me/therapists/{therapistId}/packages`                             Bearer JWT  path params Read data

              12 `POST`      `/vendors/me/therapists/{therapistId}/packages`                             Bearer JWT  path        Create or submit data
                                                                                                                     params,     
                                                                                                                     JSON body   

              13 `PATCH`     `/vendors/me/therapists/{therapistId}/packages/{packageId}`                 Bearer JWT  path        Update existing data
                                                                                                                     params,     
                                                                                                                     JSON body   

              14 `DELETE`    `/vendors/me/therapists/{therapistId}/packages/{packageId}`                 Bearer JWT  path params Delete data

              15 `GET`       `/vendors/me/category-access`                                               Bearer JWT  ---         Read data

              16 `PUT`       `/vendors/me/category-access`                                               Bearer JWT  JSON body   Replace/update a data
                                                                                                                                 set

              17 `GET`       `/vendors/me/branches/{branchId}/category-access`                           Bearer JWT  path params Read data

              18 `POST`      `/vendors/me/branches/{branchId}/deals/{dealId}/images`                     Bearer JWT  multipart   Upload a deal image
                                                                                                                     file        (JPG/PNG/WEBP;
                                                                                                                                 30KB--80KB)

              19 `DELETE`    `/vendors/me/branches/{branchId}/deals/{dealId}/images/{imageId}`           Bearer JWT  path params Delete a deal image

              20 `PATCH`     `/vendors/me/branches/{branchId}/deals/{dealId}/images/reorder`             Bearer JWT  path        Reorder deal images
                                                                                                                     params,     
                                                                                                                     JSON body   

              21 `PATCH`     `/vendors/me/branches/{branchId}/deals/{dealId}/images/{imageId}/primary`   Bearer JWT  path params Set the primary deal
                                                                                                                                 image

              22 `POST`      `/vendors/me/branches/{branchId}/deals/{dealId}/video`                      Bearer JWT  multipart   Upload/replace the
                                                                                                                     file        deal video
                                                                                                                                 (MP4/WEBM/MOV; ≤1MB)

              23 `DELETE`    `/vendors/me/branches/{branchId}/deals/{dealId}/video`                      Bearer JWT  path params Delete the deal video

              24 `POST`      `/vendors/me/therapists/{therapistId}/images`                               Bearer JWT  multipart   Upload a therapist
                                                                                                                     file        image (JPG/PNG/WEBP;
                                                                                                                                 30KB--80KB)

              25 `DELETE`    `/vendors/me/therapists/{therapistId}/images/{imageId}`                     Bearer JWT  path params Delete a therapist
                                                                                                                                 image

              26 `PATCH`     `/vendors/me/therapists/{therapistId}/images/reorder`                       Bearer JWT  path        Reorder therapist
                                                                                                                     params,     images
                                                                                                                     JSON body   

              27 `PATCH`     `/vendors/me/therapists/{therapistId}/images/{imageId}/primary`             Bearer JWT  path params Set the primary
                                                                                                                                 therapist image

              28 `POST`      `/vendors/me/therapists/{therapistId}/video`                                Bearer JWT  multipart   Upload/replace the
                                                                                                                     file        therapist video
                                                                                                                                 (MP4/WEBM/MOV; ≤1MB)

              29 `DELETE`    `/vendors/me/therapists/{therapistId}/video`                                Bearer JWT  path params Delete the therapist
                                                                                                                                 video

              30 `POST`      `/vendors/me/products/{productId}/images`                                   Bearer JWT  multipart   Upload a product
                                                                                                                     file        image (JPG/PNG/WEBP;
                                                                                                                                 30KB--80KB)

              31 `DELETE`    `/vendors/me/products/{productId}/images/{imageId}`                         Bearer JWT  path params Delete a product
                                                                                                                                 image

              32 `PATCH`     `/vendors/me/products/{productId}/images/reorder`                           Bearer JWT  path        Reorder product
                                                                                                                     params,     images
                                                                                                                     JSON body   

              33 `PATCH`     `/vendors/me/products/{productId}/images/{imageId}/primary`                 Bearer JWT  path params Set the primary
                                                                                                                                 product image

              34 `POST`      `/vendors/me/products/{productId}/video`                                    Bearer JWT  multipart   Upload/replace the
                                                                                                                     file        product video
                                                                                                                                 (MP4/WEBM/MOV; ≤1MB)

              35 `DELETE`    `/vendors/me/products/{productId}/video`                                    Bearer JWT  path params Delete the product
                                                                                                                                 video

              36 `GET`       `/vendors/me/products`                                                      Bearer JWT  ---         List the caller's own
                                                                                                                                 products

              37 `POST`      `/vendors/me/products`                                                      Bearer JWT  JSON body   Create a product for
                                                                                                                                 the caller's own
                                                                                                                                 vendor

              38 `PATCH`     `/vendors/me/products/{productId}`                                          Bearer JWT  path        Update one of the
                                                                                                                     params,     caller's products
                                                                                                                     JSON body   

              39 `PATCH`     `/vendors/me/products/{productId}/status`                                   Bearer JWT  path        Activate/deactivate a
                                                                                                                     params,     caller's product
                                                                                                                     JSON body   

              40 `DELETE`    `/vendors/me/products/{productId}`                                          Bearer JWT  path params Delete a caller's
                                                                                                                                 product
  ----------------------------------------------------------------------------------------------------------------------------------------------------

### 5. Vendor & Branch Administration

  --------------------------------------------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                                                           Access      Request     Purpose
  -------------- ----------- ------------------------------------------------------------------ ----------- ----------- ----------------------------
               1 `GET`       `/vendors/categories`                                              Bearer JWT  ---         List
                                                                                                                        categories/subcategories
                                                                                                                        (reference data for the Deal
                                                                                                                        form)

               2 `GET`       `/vendors/branches`                                                Bearer JWT  ---         Cross-vendor branch list for
                                                                                                                        the sidebar Branches page
                                                                                                                        (admin, gated on
                                                                                                                        vendors:view)

               3 `GET`       `/vendors/deals`                                                   Bearer JWT  ---         Cross-vendor deal list for
                                                                                                                        the sidebar Deals page
                                                                                                                        (admin, gated on
                                                                                                                        vendors:view)

               4 `GET`       `/vendors/users/search`                                            Bearer JWT  query       Read data
                                                                                                            params      

               5 `GET`       `/vendors/users/lookup`                                            Bearer JWT  query       Owner-identity preview for
                                                                                                            params      "Add Vendor" (admin, gated
                                                                                                                        on vendors:create) --- UX
                                                                                                                        only

               6 `GET`       `/vendors`                                                         Bearer JWT  ---         List vendors (admin)

               7 `POST`      `/vendors`                                                         Bearer JWT  JSON body   Create a vendor (admin)

               8 `GET`       `/vendors/{id}`                                                    Bearer JWT  path params Get any vendor by id (admin)

               9 `PATCH`     `/vendors/{id}`                                                    Bearer JWT  path        Update any vendor (admin)
                                                                                                            params,     
                                                                                                            JSON body   

              10 `PATCH`     `/vendors/{id}/approve`                                            Bearer JWT  path params Approve a vendor --- jumps
                                                                                                                        straight to ACTIVE

              11 `PATCH`     `/vendors/{id}/reject`                                             Bearer JWT  path        Reject a vendor with a
                                                                                                            params,     mandatory reason
                                                                                                            JSON body   

              12 `PATCH`     `/vendors/{id}/status`                                             Bearer JWT  path        Activate / deactivate /
                                                                                                            params,     suspend an already-approved
                                                                                                            JSON body   vendor

              13 `PATCH`     `/vendors/{id}/kyc-review`                                         Bearer JWT  path        Update existing data
                                                                                                            params,     
                                                                                                            JSON body   

              14 `DELETE`    `/vendors/{id}`                                                    Bearer JWT  path params Hard-delete a vendor
                                                                                                                        (blocked if it has real
                                                                                                                        order history)

              15 `GET`       `/vendors/{vendorId}/branches`                                     Bearer JWT  path params Read data

              16 `GET`       `/vendors/{vendorId}/therapists`                                   Bearer JWT  path params Read data

              17 `GET`       `/vendors/{vendorId}/customers`                                    Bearer JWT  path        Read data
                                                                                                            params,     
                                                                                                            query       
                                                                                                            params      

              18 `POST`      `/vendors/{vendorId}/branches`                                     Bearer JWT  path        Create a branch for a vendor
                                                                                                            params,     (admin)
                                                                                                            JSON body   

              19 `PATCH`     `/vendors/{vendorId}/branches/{branchId}`                          Bearer JWT  path        Update a branch (admin)
                                                                                                            params,     
                                                                                                            JSON body   

              20 `PATCH`     `/vendors/{vendorId}/branches/{branchId}/status`                   Bearer JWT  path        Activate/deactivate a branch
                                                                                                            params,     (admin)
                                                                                                            JSON body   

              21 `GET`       `/vendors/{vendorId}/branches/{branchId}/deals`                    Bearer JWT  path params Read data

              22 `POST`      `/vendors/{vendorId}/branches/{branchId}/deals`                    Bearer JWT  path        Create a deal on a branch
                                                                                                            params,     (admin --- starts
                                                                                                            JSON body   APPROVED/ACTIVE)

              23 `PATCH`     `/vendors/{vendorId}/branches/{branchId}/deals/{dealId}`           Bearer JWT  path        Update a deal (admin)
                                                                                                            params,     
                                                                                                            JSON body   

              24 `PATCH`     `/vendors/{vendorId}/branches/{branchId}/deals/{dealId}/status`    Bearer JWT  path        Activate/deactivate/expire a
                                                                                                            params,     deal (admin)
                                                                                                            JSON body   

              25 `PATCH`     `/vendors/{vendorId}/branches/{branchId}/deals/{dealId}/approve`   Bearer JWT  path params Approve a deal --- jumps
                                                                                                                        straight to ACTIVE

              26 `PATCH`     `/vendors/{vendorId}/branches/{branchId}/deals/{dealId}/reject`    Bearer JWT  path        Reject a deal with a
                                                                                                            params,     mandatory reason
                                                                                                            JSON body   

              27 `DELETE`    `/vendors/{vendorId}/branches/{branchId}/deals/{dealId}`           Bearer JWT  path params Hard-delete a deal (blocked
                                                                                                                        if it has real order/cart
                                                                                                                        history)

              28 `GET`       `/vendors/{vendorId}/category-access`                              Bearer JWT  path params Read data

              29 `PUT`       `/vendors/{vendorId}/category-access`                              Bearer JWT  path        Replace/update a data set
                                                                                                            params,     
                                                                                                            JSON body   

              30 `GET`       `/vendors/{vendorId}/branches/{branchId}/category-access`          Bearer JWT  path params Read data

              31 `PUT`       `/vendors/{vendorId}/branches/{branchId}/category-access`          Bearer JWT  path        Replace/update a data set
                                                                                                            params,     
                                                                                                            JSON body   

              32 `GET`       `/vendors/{vendorId}/products`                                     Bearer JWT  path params List products for a vendor
                                                                                                                        (admin)

              33 `POST`      `/vendors/{vendorId}/products`                                     Bearer JWT  path        Create a product for a
                                                                                                            params,     vendor (admin)
                                                                                                            JSON body   

              34 `PATCH`     `/vendors/{vendorId}/products/{productId}`                         Bearer JWT  path        Update a vendor product
                                                                                                            params,     (admin)
                                                                                                            JSON body   

              35 `PATCH`     `/vendors/{vendorId}/products/{productId}/status`                  Bearer JWT  path        Activate/deactivate a vendor
                                                                                                            params,     product (admin)
                                                                                                            JSON body   

              36 `DELETE`    `/vendors/{vendorId}/products/{productId}`                         Bearer JWT  path params Delete a vendor product
                                                                                                                        (admin)
  --------------------------------------------------------------------------------------------------------------------------------------------------

### 6. Categories & Popular Tags

  --------------------------------------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                                                Access      Request     Purpose
  -------------- ----------- ------------------------------------------------------- ----------- ----------- ---------------------------------
               1 `GET`       `/categories`                                           Bearer JWT  ---         List categories/subcategories
                                                                                                             (?scope=top\|sub, ?parentId=)

               2 `POST`      `/categories`                                           Bearer JWT  JSON body   Create a category or subcategory
                                                                                                             (parentId set = subcategory)

               3 `GET`       `/categories/{id}`                                      Bearer JWT  path params Get a category by id

               4 `PATCH`     `/categories/{id}`                                      Bearer JWT  path        Update a category
                                                                                                 params,     
                                                                                                 JSON body   

               5 `PATCH`     `/categories/{id}/status`                               Bearer JWT  path        Activate/deactivate a category
                                                                                                 params,     
                                                                                                 JSON body   

               6 `DELETE`    `/categories/{id}`                                      Bearer JWT  path params Delete a category (must have no
                                                                                                             subcategories or referencing
                                                                                                             deals)

               7 `GET`       `/popular-tags`                                         Bearer JWT  ---         List popular tags

               8 `POST`      `/popular-tags`                                         Bearer JWT  JSON body   Create a popular tag

               9 `GET`       `/popular-tags/{id}`                                    Bearer JWT  path params Get a popular tag by id

              10 `PATCH`     `/popular-tags/{id}`                                    Bearer JWT  path        Update a popular tag
                                                                                                 params,     
                                                                                                 JSON body   

              11 `PATCH`     `/popular-tags/{id}/status`                             Bearer JWT  path        Activate/deactivate a popular tag
                                                                                                 params,     (mappings are preserved either
                                                                                                 JSON body   way)

              12 `DELETE`    `/popular-tags/{id}`                                    Bearer JWT  path params Delete a popular tag (must have
                                                                                                             no mappings)

              13 `GET`       `/popular-tags/{id}/mappings`                           Bearer JWT  path params List a popular tag\\

              14 `POST`      `/popular-tags/{id}/mappings`                           Bearer JWT  path        Map a popular tag onto a
                                                                                                 params,     Category/Deal/Product/Therapist
                                                                                                 JSON body   

              15 `DELETE`    `/popular-tags/{id}/mappings/{targetType}/{targetId}`   Bearer JWT  path params Unmap a popular tag from a
                                                                                                             Category/Deal/Product/Therapist

              16 `POST`      `/categories/{id}/images`                               Bearer JWT  path        Upload an image for a
                                                                                                 params,     category/subcategory/type
                                                                                                 JSON body   (JPG/PNG/WEBP, 30KB--80KB)

              17 `DELETE`    `/categories/{id}/images/{imageId}`                     Bearer JWT  path params Delete a category image

              18 `PATCH`     `/categories/{id}/images/reorder`                       Bearer JWT  path        Update existing data
                                                                                                 params,     
                                                                                                 JSON body   

              19 `PATCH`     `/categories/{id}/images/{imageId}/primary`             Bearer JWT  path params Update existing data
  --------------------------------------------------------------------------------------------------------------------------------------------

### 7. Products & Inventory

  ---------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                   Access      Request     Purpose
  -------------- ----------- -------------------------- ----------- ----------- ---------------------------
               1 `GET`       `/products`                Bearer JWT  ---         Cross-vendor, read-only
                                                                                product oversight
                                                                                (?search=, ?vendorId=,
                                                                                ?categoryId=,
                                                                                ?subcategoryId=,
                                                                                ?status=active\|inactive)

               2 `GET`       `/products/{id}`           Bearer JWT  path params Get a product by id
                                                                                (read-only oversight)

               3 `GET`       `/catalog/products`        Public      query       Public product listing ---
                                                                    params      Product is a fully
                                                                                independent catalog entity
                                                                                (no Deal wrapper);

               4 `GET`       `/catalog/products/{id}`   Public      path params A single public product ---
                                                                                404s if not currently
                                                                                visible (inactive product
                                                                                or inactive vendor)

               5 `GET`       `/inventory`               Bearer JWT  ---         Read inventory data
  ---------------------------------------------------------------------------------------------------------

### 8. Public Catalogue & SEO

  ----------------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                       Access      Request     Purpose
  -------------- ----------- ------------------------------ ----------- ----------- ------------------------------------
               1 `GET`       `/catalog/categories`          Public      ---         Public active category tree
                                                                                    (top-level + children)

               2 `GET`       `/catalog/categories/{slug}`   Public      path params Public active category by slug, with
                                                                                    its active subcategories

               3 `GET`       `/catalog/deals`               Public      query       Public deal listing ---
                                                                        params      active/approved service deals with
                                                                                    an active vendor+branch;

               4 `GET`       `/catalog/deals/facets`        Public      query       Filter-panel facet counts for the
                                                                        params      deal list --- same filters as GET
                                                                                    /catalog/deals minus paging/sort;

               5 `GET`       `/catalog/deals/{id}`          Public      path params A single public deal --- 404s if not
                                                                                    currently visible
                                                                                    (inactive/unapproved/hidden vendor
                                                                                    or branch)

               6 `GET`       `/catalog/locations`           Public      ---         Distinct {state, city} pairs from
                                                                                    active branches --- drives the
                                                                                    public location picker; each entry

               7 `GET`       `/catalog/vendors/{slug}`      Public      path        Public vendor storefront --- 404s if
                                                                        params,     not found or not ACTIVE; nests
                                                                        query       active branches (narrowable by
                                                                        params      ?state=/?city=) + their active
                                                                                    therapists (never Deals --- call GET
                                                                                    /catalog/deals?vendorId=&branchId=
                                                                                    separately)

               8 `GET`       `/catalog/therapists`          Public      query       Public therapist listing --- active
                                                                        params      therapists with an active
                                                                                    vendor+branch, independent of any
                                                                                    Deal

               9 `GET`       `/catalog/therapists/{id}`     Public      path params A single public therapist with its
                                                                                    active packages --- 404s if not
                                                                                    currently visible (inactive/hidden
                                                                                    vendor or branch)

              10 `GET`       `/catalog/blog-posts`          Public      query       Public blog post listing --- always
                                                                        params      PUBLISHED only, never accepts a
                                                                                    status override

              11 `GET`       `/catalog/blog-posts/{slug}`   Public      path params A single public blog post by slug
                                                                                    --- 404s if not found or not
                                                                                    PUBLISHED

              12 `GET`       `/catalog/about-us`            Public      ---         Public About Us content (singleton
                                                                                    --- no draft/published concept)

              13 `GET`       `/catalog/contact-us`          Public      ---         Public Contact Us content (singleton
                                                                                    --- no draft/published concept)

              14 `GET`       `/catalog/faqs`                Public      ---         Public FAQ list --- always isActive
                                                                                    only, ordered by sortOrder

              15 `GET`       `/catalog/blog-categories`     Public      ---         Public blog category list --- always
                                                                                    isActive only, ordered by sortOrder

              16 `GET`       `/catalog/pages/{slug}`        Public      path params A single public website page
                                                                                    (Privacy Policy/Terms of
                                                                                    Service/Accessibility/Cookie Policy)
                                                                                    --- 404s if not found or not
                                                                                    PUBLISHED

              17 `GET`       `/catalog/how-it-works`        Public      ---         Public How It Works content --- {
                                                                                    content, steps } with active steps
                                                                                    only, ordered by sortOrder

              18 `GET`       `/catalog/careers`             Public      ---         Public Careers content --- {
                                                                                    content, jobs } with PUBLISHED jobs
                                                                                    only, ordered by sortOrder

              19 `GET`       `/catalog/social-links`        Public      ---         Public social media link list ---
                                                                                    always isActive only, ordered by
                                                                                    sortOrder
  ----------------------------------------------------------------------------------------------------------------------

### 9. Cart & Wishlist

  -----------------------------------------------------------------------------------------------------
              \# Method      Endpoint                     Access      Request     Purpose
  -------------- ----------- ---------------------------- ----------- ----------- ---------------------
               1 `GET`       `/cart`                      Bearer JWT  ---         Read data

               2 `POST`      `/cart/items`                Bearer JWT  JSON body   Add a cart line --- a
                                                                                  service deal
                                                                                  (dealId +
                                                                                  dealPackageId), a
                                                                                  product (productId),
                                                                                  or a therapist
                                                                                  (therapistId +
                                                                                  therapistPackageId)

               3 `PATCH`     `/cart/items/{id}`           Bearer JWT  path        Update a cart item
                                                                      params,     quantity
                                                                      JSON body   

               4 `DELETE`    `/cart/items/{id}`           Bearer JWT  path params Remove an item from
                                                                                  the cart

               5 `DELETE`    `/cart`                      Bearer JWT  ---         Clear the cart

               6 `GET`       `/wishlist`                  Bearer JWT  ---         Read data

               7 `POST`      `/wishlist`                  Bearer JWT  JSON body   Add a deal to the
                                                                                  wishlist (idempotent
                                                                                  --- re-adding an
                                                                                  already-saved deal is
                                                                                  a no-op)

               8 `GET`       `/wishlist/check/{dealId}`   Bearer JWT  path params Whether the caller
                                                                                  has this deal
                                                                                  wishlisted

               9 `DELETE`    `/wishlist/{dealId}`         Bearer JWT  path params Delete data
  -----------------------------------------------------------------------------------------------------

### 10. Orders

  -------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                           Access      Request     Purpose
  -------------- ----------- ---------------------------------- ----------- ----------- -----------------------
               1 `POST`      `/orders/checkout`                 Bearer JWT  JSON body   Create or submit data

               2 `GET`       `/orders/me`                       Bearer JWT  ---         Read data

               3 `GET`       `/orders/me/{id}`                  Bearer JWT  path params A single order, scoped
                                                                                        to the caller

               4 `PATCH`     `/orders/me/{id}/status`           Bearer JWT  path        Cancel an order (the
                                                                            params,     only self-service
                                                                            JSON body   transition)

               5 `GET`       `/orders`                          Bearer JWT  ---         List orders (admin:
                                                                                        all/filterable by
                                                                                        vendorId; vendor:
                                                                                        force-scoped to own
                                                                                        vendor)

               6 `GET`       `/orders/{id}`                     Bearer JWT  path params Get any order by id
                                                                                        (admin, or a vendor for
                                                                                        its own order only)

               7 `PATCH`     `/orders/{id}/status`              Bearer JWT  path        Change an order status
                                                                            params,     (admin only, gated on
                                                                            JSON body   orders:status_change)

               8 `POST`      `/orders/me/{id}/pay`              Bearer JWT  path params Create (or reuse an
                                                                                        in-flight) Razorpay
                                                                                        order for the caller\\

               9 `POST`      `/orders/me/{id}/pay-cod`          Bearer JWT  path params Confirm a Cash on
                                                                                        Delivery order --- no
                                                                                        gateway; creates a
                                                                                        CREATED-status COD
                                                                                        Payment and moves the
                                                                                        Order to CONFIRMED

              10 `POST`      `/orders/me/{id}/verify-payment`   Bearer JWT  path        Create or submit data
                                                                            params,     
                                                                            JSON body   

              11 `POST`      `/orders/pay-batch`                Bearer JWT  JSON body   Combined checkout
                                                                                        (Deal + Therapist +
                                                                                        Product together) ---
                                                                                        one Razorpay order for
                                                                                        the SUM of several

              12 `POST`      `/orders/pay-batch/cod`            Bearer JWT  JSON body   Confirm Cash on
                                                                                        Delivery for every
                                                                                        Order in a combined
                                                                                        checkout batch,
                                                                                        together in one
                                                                                        transaction

              13 `POST`      `/orders/pay-batch/verify`         Bearer JWT  JSON body   Create or submit data
  -------------------------------------------------------------------------------------------------------------

### 11. Payments & Webhooks

  --------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                       Access      Request     Purpose
  -------------- ----------- ------------------------------ ----------- ----------- ----------------------
               1 `POST`      `/payments/webhook/razorpay`   Public      ---         Razorpay webhook ---
                                                                                    signature-verified,
                                                                                    idempotent, the
                                                                                    authoritative
                                                                                    payment-confirmation
                                                                                    path

  --------------------------------------------------------------------------------------------------------

### 12. Notifications & Dashboard

  -------------------------------------------------------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                     Access      Request     Purpose
  -------------- ----------- ---------------------------- ----------- ----------- -----------------------------------------------------------------------------
               1 `GET`       `/dashboard/stats`           Bearer JWT  ---         Aggregate marketplace counts
                                                                                  (vendors/customers/branches/categories/subCategories/products/deals/orders)
                                                                                  and revenue --- gated on dashboard:view

               2 `GET`       `/notifications`             Bearer JWT  query       Read data
                                                                      params      

               3 `PATCH`     `/notifications/{id}/read`   Bearer JWT  path params Mark one of the caller\\

               4 `PATCH`     `/notifications/read-all`    Bearer JWT  ---         Update existing data
  -------------------------------------------------------------------------------------------------------------------------------------------------------------

### 13. Customers

  ----------------------------------------------------------------------------------------
              \# Method      Endpoint            Access      Request     Purpose
  -------------- ----------- ------------------- ----------- ----------- -----------------
               1 `GET`       `/customers`        Bearer JWT  ---         List customers
                                                                         (any User holding
                                                                         the customer
                                                                         role) ---
                                                                         search/paginate

               2 `GET`       `/customers/{id}`   Bearer JWT  path params A single
                                                                         customer, with
                                                                         order counts
  ----------------------------------------------------------------------------------------

### 14. Website Content & CMS

  -----------------------------------------------------------------------------------------------------------------------------
              \# Method      Endpoint                                      Access      Request     Purpose
  -------------- ----------- --------------------------------------------- ----------- ----------- ----------------------------
               1 `GET`       `/blog-posts`                                 Bearer JWT  ---         List blog posts (?search=,
                                                                                                   ?status=DRAFT\|PUBLISHED,
                                                                                                   ?categorySlug=)

               2 `POST`      `/blog-posts`                                 Bearer JWT  JSON body   Create a blog post

               3 `GET`       `/blog-posts/{id}`                            Bearer JWT  path params Get a blog post by id

               4 `PATCH`     `/blog-posts/{id}`                            Bearer JWT  path        Update a blog post
                                                                                       params,     
                                                                                       JSON body   

               5 `PATCH`     `/blog-posts/{id}/status`                     Bearer JWT  path        Publish/unpublish a blog
                                                                                       params,     post (sets publishedAt once,
                                                                                       JSON body   on the first DRAFT -\>
                                                                                                   PUBLISHED transition only)

               6 `DELETE`    `/blog-posts/{id}`                            Bearer JWT  path params Delete a blog post

               7 `POST`      `/blog-posts/{id}/images`                     Bearer JWT  path        Upload an image for a blog
                                                                                       params,     post (JPG/PNG/WEBP,
                                                                                       JSON body   30KB--80KB)

               8 `DELETE`    `/blog-posts/{id}/images/{imageId}`           Bearer JWT  path params Delete a blog post image

               9 `PATCH`     `/blog-posts/{id}/images/reorder`             Bearer JWT  path        Update existing data
                                                                                       params,     
                                                                                       JSON body   

              10 `PATCH`     `/blog-posts/{id}/images/{imageId}/primary`   Bearer JWT  path params Update existing data

              11 `GET`       `/faqs`                                       Bearer JWT  ---         List FAQs (?search=)

              12 `POST`      `/faqs`                                       Bearer JWT  JSON body   Create an FAQ

              13 `GET`       `/faqs/{id}`                                  Bearer JWT  path params Get an FAQ by id

              14 `PATCH`     `/faqs/{id}`                                  Bearer JWT  path        Update an FAQ
                                                                                       params,     
                                                                                       JSON body   

              15 `PATCH`     `/faqs/{id}/status`                           Bearer JWT  path        Activate/deactivate an FAQ
                                                                                       params,     
                                                                                       JSON body   

              16 `DELETE`    `/faqs/{id}`                                  Bearer JWT  path params Delete an FAQ

              17 `GET`       `/about-us`                                   Bearer JWT  ---         Get the About Us content
                                                                                                   (singleton --- auto-created
                                                                                                   with defaults on first read)

              18 `PATCH`     `/about-us`                                   Bearer JWT  JSON body   Update the About Us content
                                                                                                   (upserts the singleton row)

              19 `POST`      `/about-us/images`                            Bearer JWT  JSON body   Upload an image for the
                                                                                                   About Us page (JPG/PNG/WEBP,
                                                                                                   30KB--80KB)

              20 `DELETE`    `/about-us/images/{imageId}`                  Bearer JWT  path params Delete an About Us image

              21 `PATCH`     `/about-us/images/reorder`                    Bearer JWT  JSON body   Update existing data

              22 `PATCH`     `/about-us/images/{imageId}/primary`          Bearer JWT  path params Update existing data

              23 `GET`       `/contact-us`                                 Bearer JWT  ---         Get the Contact Us content
                                                                                                   (singleton --- auto-created
                                                                                                   with defaults on first read)

              24 `PATCH`     `/contact-us`                                 Bearer JWT  JSON body   Update the Contact Us
                                                                                                   content (upserts the
                                                                                                   singleton row)

              25 `GET`       `/blog-categories`                            Bearer JWT  ---         List blog categories
                                                                                                   (?search=)

              26 `POST`      `/blog-categories`                            Bearer JWT  JSON body   Create a blog category

              27 `GET`       `/blog-categories/{id}`                       Bearer JWT  path params Get a blog category by id

              28 `PATCH`     `/blog-categories/{id}`                       Bearer JWT  path        Update a blog category
                                                                                       params,     (isActive is a plain field
                                                                                       JSON body   here --- no separate /status
                                                                                                   route)

              29 `DELETE`    `/blog-categories/{id}`                       Bearer JWT  path params Delete a blog category (must
                                                                                                   have no referencing blog
                                                                                                   posts)

              30 `GET`       `/website-pages`                              Bearer JWT  ---         List website pages
                                                                                                   (?search=) --- always the 4
                                                                                                   fixed legal pages

              31 `GET`       `/website-pages/{id}`                         Bearer JWT  path params Get a website page by id

              32 `PATCH`     `/website-pages/{id}`                         Bearer JWT  path        Update a website page
                                                                                       params,     (title/content/status/meta
                                                                                       JSON body   --- slug is fixed, not
                                                                                                   editable)

              33 `GET`       `/how-it-works`                               Bearer JWT  ---         Get the How It Works hero
                                                                                                   content (singleton ---
                                                                                                   auto-created with defaults
                                                                                                   on first read)

              34 `PATCH`     `/how-it-works`                               Bearer JWT  JSON body   Update the How It Works hero
                                                                                                   content (upserts the
                                                                                                   singleton row)

              35 `GET`       `/how-it-works/steps`                         Bearer JWT  ---         List How It Works steps

              36 `POST`      `/how-it-works/steps`                         Bearer JWT  JSON body   Create a How It Works step

              37 `PATCH`     `/how-it-works/steps/reorder`                 Bearer JWT  JSON body   Update existing data

              38 `PATCH`     `/how-it-works/steps/{id}`                    Bearer JWT  path        Update a How It Works step
                                                                                       params,     
                                                                                       JSON body   

              39 `DELETE`    `/how-it-works/steps/{id}`                    Bearer JWT  path params Delete a How It Works step

              40 `GET`       `/careers`                                    Bearer JWT  ---         Get the Careers hero content
                                                                                                   (singleton --- auto-created
                                                                                                   with defaults on first read)

              41 `PATCH`     `/careers`                                    Bearer JWT  JSON body   Update the Careers hero
                                                                                                   content (upserts the
                                                                                                   singleton row)

              42 `GET`       `/careers/jobs`                               Bearer JWT  ---         List job listings (?search=,
                                                                                                   ?status=DRAFT\|PUBLISHED)

              43 `POST`      `/careers/jobs`                               Bearer JWT  JSON body   Create a job listing

              44 `GET`       `/careers/jobs/{id}`                          Bearer JWT  path params Get a job listing by id

              45 `PATCH`     `/careers/jobs/{id}`                          Bearer JWT  path        Update a job listing
                                                                                       params,     
                                                                                       JSON body   

              46 `PATCH`     `/careers/jobs/{id}/status`                   Bearer JWT  path        Publish/unpublish a job
                                                                                       params,     listing
                                                                                       JSON body   

              47 `DELETE`    `/careers/jobs/{id}`                          Bearer JWT  path params Delete a job listing

              48 `GET`       `/social-media`                               Bearer JWT  ---         List social media links
                                                                                                   (?search=)

              49 `POST`      `/social-media`                               Bearer JWT  JSON body   Create a social media link

              50 `GET`       `/social-media/{id}`                          Bearer JWT  path params Get a social media link by
                                                                                                   id

              51 `PATCH`     `/social-media/{id}`                          Bearer JWT  path        Update a social media link
                                                                                       params,     (isActive is a plain field
                                                                                       JSON body   here --- no separate /status
                                                                                                   route)

              52 `DELETE`    `/social-media/{id}`                          Bearer JWT  path params Delete a social media link
  -----------------------------------------------------------------------------------------------------------------------------

### 15. Reports

  ------------------------------------------------------------------------------------------------
              \# Method      Endpoint                        Access      Request     Purpose
  -------------- ----------- ------------------------------- ----------- ----------- -------------
               1 `GET`       `/reports/top-vendors`          Bearer JWT  query       Reports
                                                                         params      dashboard ---
                                                                                     top vendors
                                                                                     by revenue or
                                                                                     order count

               2 `GET`       `/reports/summary`              Bearer JWT  query       Reports
                                                                         filters     dashboard
                                                                                     summary

               3 `GET`       `/reports/vendor-wise`          Bearer JWT  query       Report
                                                                         filters     grouped by
                                                                                     vendor

               4 `GET`       `/reports/branch-wise`          Bearer JWT  query       Report
                                                                         filters     grouped by
                                                                                     branch

               5 `GET`       `/reports/month-wise`           Bearer JWT  query       Report
                                                                         filters     grouped by
                                                                                     month

               6 `GET`       `/reports/service-vs-product`   Bearer JWT  query       Compare
                                                                         filters     service vs
                                                                                     product
                                                                                     performance

               7 `GET`       `/reports/payment-method`       Bearer JWT  query       Report
                                                                         filters     grouped by
                                                                                     payment
                                                                                     method

               8 `GET`       `/reports/top-products`         Bearer JWT  query       Top products
                                                                         filters     

               9 `GET`       `/reports/top-services`         Bearer JWT  query       Top services
                                                                         filters     
  ------------------------------------------------------------------------------------------------

## 5. API Count by Business Area

  Area                               Unique operations
  -------------------------------- -------------------
  Authentication & Sessions                          7
  RBAC, Users & Administration                      28
  Vendor Public Registration                         1
  Vendor Self-Service                               40
  Vendor & Branch Administration                    36
  Categories & Popular Tags                         19
  Products & Inventory                               5
  Public Catalogue & SEO                            19
  Cart & Wishlist                                    9
  Orders                                            13
  Payments & Webhooks                                1
  Notifications & Dashboard                          4
  Customers                                          2
  Website Content & CMS                             52
  Reports                                            9
  **Total**                                    **248**

## 6. 🌍 SEO Review --- Public APIs

The `/catalog/*` APIs are the main public catalogue surface. These are
the endpoints that can support public website pages, searchable
catalogue content and SEO-friendly URLs.

  Endpoint family                Purpose
  ------------------------------ ------------------------------------
  `/catalog/categories`          Public category listing
  `/catalog/categories/{slug}`   Category detail by slug
  `/catalog/deals`               Public deal listing/search
  `/catalog/deals/facets`        Public deal filters/facets
  `/catalog/deals/{id}`          Deal detail
  `/catalog/products`            Public product listing/search
  `/catalog/products/{id}`       Product detail
  `/catalog/locations`           Public locations
  `/catalog/vendors/{slug}`      Vendor detail by SEO-friendly slug
  `/catalog/therapists`          Public therapist listing
  `/catalog/therapists/{id}`     Therapist detail
  `/catalog/blog-posts`          Public blog listing
  `/catalog/blog-posts/{slug}`   Blog detail by slug
  `/catalog/about-us`            Public About Us content
  `/catalog/contact-us`          Public Contact Us content
  `/catalog/faqs`                Public FAQ content
  `/catalog/blog-categories`     Public blog categories
  `/catalog/pages/{slug}`        Public CMS page by slug
  `/catalog/how-it-works`        Public How It Works content
  `/catalog/careers`             Public careers content
  `/catalog/social-links`        Public social links

### SEO/security checks for public APIs

-   [ ] Only intentionally public fields are returned.
-   [ ] Slug routes cannot expose unpublished/private content.
-   [ ] Pagination has a safe maximum page size.
-   [ ] Search/filter input is validated.
-   [ ] Public APIs have rate limiting/abuse protection.
-   [ ] Error responses do not expose database/internal details.
-   [ ] CORS policy is intentionally configured for public consumers.

## 7. 📱 Mobile App API Review

The mobile app should primarily consume the APIs below according to its
user journey.

  Mobile feature                                Main API families
  --------------------------------------------- -------------------------------------------------
  Login                                         `/auth/otp/*`, `/auth/google*`, `/auth/refresh`
  Browse                                        `/catalog/*`
  Cart                                          `/cart/*`
  Wishlist                                      `/wishlist/*`
  Checkout                                      `/orders/checkout`
  My orders                                     `/orders/me*`
  Payments                                      `/orders/me/{id}/pay*`, `/orders/pay-batch*`
  Notifications                                 `/notifications*`
  Vendor self-service, if supported in mobile   `/vendors/me/*`

## 8. 🔐 Security Review

Think of the API as a building with many doors.

  ------------------------------------------------------------------------------
  Security layer          Simple question         What must be checked
  ----------------------- ----------------------- ------------------------------
  Authentication          Who are you?            JWT validation, expiry,
                                                  refresh/session handling

  Authorization           What are you allowed to RBAC/permission checks
                          do?                     

  Ownership               Does this record belong Vendor/customer/order/branch
                          to you?                 ownership

  Validation              Is the request safe and Zod/schema validation
                          correctly shaped?       

  Rate limiting           Are you knocking too    OTP/login/search/public
                          many times?             endpoint limits

  File security           Is this file really     Type, size and content
                          allowed?                validation

  Payment security        Did the payment really  Provider
                          happen?                 verification/signature checks

  Audit                   Who changed something   Audit logging for sensitive
                          important?              actions
  ------------------------------------------------------------------------------

### 🚨 Highest-priority TL checks

1.  **IDOR / BOLA:** Can User A change `id`, `vendorId`, `branchId` or
    `orderId` and access User B's data?
2.  **Vendor isolation:** Can Vendor A see or modify Vendor B's
    customers, branches, deals, products or therapists?
3.  **RBAC bypass:** Can a normal user call an admin endpoint directly
    through Postman?
4.  **Impersonation:** Is `/rbac/impersonate` restricted, short-lived
    and audited?
5.  **OTP abuse:** Are OTP requests and verification attempts
    rate-limited?
6.  **Payment manipulation:** Can a client mark an order paid without
    trusted payment-provider verification?
7.  **File upload:** Can a user upload an unsafe file or bypass
    size/type restrictions?
8.  **Sensitive response data:** Are OTPs, secrets, tokens, passwords or
    unnecessary private fields ever returned?
9.  **Public API abuse:** Can an unauthenticated user request unlimited
    pages or scrape excessive data?
10. **Status/ownership checks:** Are status changes allowed only for the
    correct user/vendor/admin scope?

## 9. 🔎 Important API-Specific Security Questions

  -----------------------------------------------------------------------
  API family                          Main question for validation
  ----------------------------------- -----------------------------------
  `/auth/*`                           Brute-force protection,
                                      refresh-token rotation/revocation
                                      and OAuth callback safety?

  `/rbac/*`                           Can users change their own
                                      privilege/role or another user's
                                      permissions?

  `/vendors/me/*`                     Is the vendor derived from the
                                      authenticated user rather than
                                      blindly trusting IDs?

  `/vendors/{vendorId}/*`             Is the requested
                                      vendor/branch/product actually
                                      within the caller's allowed scope?

  `/cart/*`                           Can one customer read/change
                                      another customer's cart by changing
                                      an item ID?

  `/wishlist/*`                       Can one customer modify another
                                      customer's wishlist?

  `/orders/me/*`                      Is the order always owned by the
                                      authenticated customer?

  `/orders/{id}*`                     Are admin/vendor/customer scopes
                                      separated correctly?

  `/payments/*`                       Is payment state controlled by
                                      trusted server/provider
                                      verification?

  `/catalog/*`                        Are only intended public records
                                      exposed?

  Media endpoints                     Are file type, size, ownership and
                                      access checks enforced?

  `/reports/*`                        Are reports restricted to
                                      authorized roles and allowed data
                                      scope?
  -----------------------------------------------------------------------

## 10. Duplicate Registration to Review

  ------------------------------------------------------------------------
  Method                  Endpoint                 Issue
  ----------------------- ------------------------ -----------------------
  `GET`                   `/reports/top-vendors`   Same method + path is
                                                   registered more than
                                                   once in `registry.ts`.

  ------------------------------------------------------------------------

**Recommendation:** Keep only one OpenAPI registration for this
method/path unless the duplicate is intentional and documented.

## 11. What This Document Proves vs. What It Does Not

  -----------------------------------------------------------------------
  This document / registry proves     This document / registry does NOT
                                      prove by itself
  ----------------------------------- -----------------------------------
  The endpoint is registered in the   Runtime middleware is definitely
  OpenAPI registry.                   attached in the same way.

  The method and path are documented. Database ownership checks are
                                      correct.

  Declared request schemas/parameters Rate limiting is actually enabled
  are documented where registered.    everywhere required.

  Declared Bearer security is visible File content scanning/storage
  in the registry.                    security is complete.

  Public vs protected intent can be   Payment webhook signature
  reviewed from the registry.         verification is correct.
  -----------------------------------------------------------------------

This distinction is important for security sign-off: **API documentation
is not the same thing as runtime security verification.**

## 12. Final Sign-Off Checklist

-   [ ] **Count:** 248 unique API operations reviewed.
-   [ ] **Duplicate:** `GET /reports/top-vendors` duplicate registration
    reviewed.
-   [ ] **Auth:** Public vs Bearer JWT access reviewed.
-   [ ] **RBAC:** Admin permissions reviewed endpoint-by-endpoint.
-   [ ] **Ownership:** Vendor/customer/order/branch scoping tested with
    another user's ID.
-   [ ] **IDOR/BOLA:** Negative Postman tests completed.
-   [ ] **OTP:** Rate limits and brute-force protection tested.
-   [ ] **OAuth:** Google callback and redirect handling reviewed.
-   [ ] **Payments:** Payment verification/webhook signature checked.
-   [ ] **Uploads:** File type/size/content and ownership checked.
-   [ ] **SEO:** Public catalogue endpoints checked for intended public
    data only.
-   [ ] **Pagination:** Maximum page size enforced.
-   [ ] **Errors:** No secrets, stack traces or internal DB details
    leaked.
-   [ ] **Audit:** Sensitive admin actions are logged.

## 13. Source & Scope

**Source of truth:** `openapi/registry.ts` supplied for this review.

**Scope:** This document reorganizes the registered API inventory for
, SEO, security and mobile-app review. It does not change the
application code.

**Counting rule:** Unique API operation = unique `(HTTP method + path)`
pair. The registry currently has 249 registrations and 248 unique
operations because `GET /reports/top-vendors` appears twice.
