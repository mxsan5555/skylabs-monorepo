-- Fix Vendor.offersService/offersProduct/offersTherapy left incorrect by
-- 20260827130000_direct_category_access.
--
-- Root cause: a concurrent session's migration (20260825045955_add_vendor_module_capability —
-- applied to this DB, never present in this branch's migrations/ folder) had already added these
-- three columns with "offersService" defaulting to true for every existing row. The prior
-- migration's own backfill step only ever SET a flag to true when a vendor had matching Deal/
-- mapping-table data — it never had an ELSE branch to correct a vendor OFF back to false — so
-- every vendor with zero real service capability (no Deal, no VendorCategoryAccess row at all)
-- was left stuck at the stale "offersService: true" inherited from that concurrent migration's
-- default, contradicting both this schema's own @default(false) and its doc comment ("no existing
-- vendor silently gains access").
--
-- Fix: recompute all three flags from scratch, authoritatively, from VendorCategoryAccess joined
-- to Category.type — which is the actual, current source of truth for "what module(s) does this
-- vendor operate in" now that Deal.serviceId/Service no longer exist (both were dropped by
-- 20260827130000). A vendor offers a module iff it holds a VendorCategoryAccess grant on at least
-- one category of that type; this is exactly what 20260827130000's own 2c/2d backfill steps
-- derived VendorCategoryAccess from in the first place (Deal/Product/old-mapping-table data), so
-- this recomputation is consistent with, not a departure from, that migration's intent.
UPDATE "Vendor" v SET
  "offersService" = EXISTS (
    SELECT 1 FROM "VendorCategoryAccess" vca
    JOIN "Category" c ON c.id = vca."categoryId"
    WHERE vca."vendorId" = v.id AND c."type" = 'SERVICE'
  ),
  "offersProduct" = EXISTS (
    SELECT 1 FROM "VendorCategoryAccess" vca
    JOIN "Category" c ON c.id = vca."categoryId"
    WHERE vca."vendorId" = v.id AND c."type" = 'PRODUCT'
  ),
  "offersTherapy" = EXISTS (
    SELECT 1 FROM "VendorCategoryAccess" vca
    JOIN "Category" c ON c.id = vca."categoryId"
    WHERE vca."vendorId" = v.id AND c."type" = 'THERAPY'
  );
