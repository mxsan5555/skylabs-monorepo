-- Restore legacy vendor capability mapping tables temporarily.
--
-- These tables are required by the following migration:
-- 20260827130000_direct_category_access
--
-- That migration reads the historical mapping data from these tables,
-- folds the grants into VendorCategoryAccess, updates Vendor module flags,
-- and then drops these legacy tables.
--
-- These tables are intentionally NOT represented in the current Prisma
-- schema because they are transitional/legacy structures.

-- ─────────────────────────────────────────────────────────────────────────────
-- VendorService
-- ─────────────────────────────────────────────────────────────────────────────
-- Historical mapping:
-- Vendor -> Service
--
-- Used by 20260827130000_direct_category_access to resolve:
--   VendorService.vendorId
--   VendorService.serviceId
--
CREATE TABLE "VendorService" (
    "vendorId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VendorProduct
-- ─────────────────────────────────────────────────────────────────────────────
-- Historical mapping:
-- Vendor -> Product
--
-- Used by 20260827130000_direct_category_access to resolve:
--   VendorProduct.vendorId
--   VendorProduct.productId
--
CREATE TABLE "VendorProduct" (
    "vendorId" TEXT NOT NULL,
    "productId" TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- VendorSpecialization
-- ─────────────────────────────────────────────────────────────────────────────
-- Historical mapping:
-- Vendor -> Therapy Category
--
-- Used by 20260827130000_direct_category_access to resolve:
--   VendorSpecialization.vendorId
--   VendorSpecialization.categoryId
--
CREATE TABLE "VendorSpecialization" (
    "vendorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TherapistSpecialization
-- ─────────────────────────────────────────────────────────────────────────────
-- Historical mapping:
-- Therapist -> Therapy Category
--
-- Used by 20260827130000_direct_category_access to resolve:
--   TherapistSpecialization.therapistId
--   TherapistSpecialization.categoryId
--
CREATE TABLE "TherapistSpecialization" (
    "therapistId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL
);