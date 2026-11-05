-- Branch-level narrowing of VendorCategoryAccess grants (see BranchCategoryAccess/
-- BranchSubcategoryAccess's own schema doc comments for the full rationale): a vendor's grant of
-- a top-level Category implicitly covers every subcategory for the VENDOR as a whole, but an
-- individual branch may only actually offer some of what the vendor is granted, and — unlike the
-- vendor-level grant — subcategory access at the branch level is explicit, not implied. Two new
-- tables only, no backfill: no existing data models "which categories a branch offers" today, so
-- there is nothing to migrate — every branch starts with zero rows here until mapped.
--
-- The BranchSubcategoryAccess unique index below is named "..._uq" rather than this repo's usual
-- "..._key" suffix solely because "BranchSubcategoryAccess_branchCategoryAccessId_subcategoryId_key"
-- exceeds Postgres's 63-byte identifier limit and would otherwise be silently (and illegibly)
-- truncated by Postgres itself; every other identifier below fits and keeps the usual suffix.

-- ─── BranchCategoryAccess ──────────────────────────────────────────────────────────────────────

CREATE TABLE "BranchCategoryAccess" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchCategoryAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BranchCategoryAccess_branchId_idx" ON "BranchCategoryAccess"("branchId");
CREATE INDEX "BranchCategoryAccess_categoryId_idx" ON "BranchCategoryAccess"("categoryId");
CREATE UNIQUE INDEX "BranchCategoryAccess_branchId_categoryId_key" ON "BranchCategoryAccess"("branchId", "categoryId");

ALTER TABLE "BranchCategoryAccess" ADD CONSTRAINT "BranchCategoryAccess_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchCategoryAccess" ADD CONSTRAINT "BranchCategoryAccess_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── BranchSubcategoryAccess ───────────────────────────────────────────────────────────────────

CREATE TABLE "BranchSubcategoryAccess" (
    "id" TEXT NOT NULL,
    "branchCategoryAccessId" TEXT NOT NULL,
    "subcategoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchSubcategoryAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BranchSubcategoryAccess_branchCategoryAccessId_idx" ON "BranchSubcategoryAccess"("branchCategoryAccessId");
CREATE INDEX "BranchSubcategoryAccess_subcategoryId_idx" ON "BranchSubcategoryAccess"("subcategoryId");
CREATE UNIQUE INDEX "BranchSubcategoryAccess_branchCategoryAccessId_subcategoryId_uq" ON "BranchSubcategoryAccess"("branchCategoryAccessId", "subcategoryId");

ALTER TABLE "BranchSubcategoryAccess" ADD CONSTRAINT "BranchSubcategoryAccess_branchCategoryAccessId_fkey" FOREIGN KEY ("branchCategoryAccessId") REFERENCES "BranchCategoryAccess"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchSubcategoryAccess" ADD CONSTRAINT "BranchSubcategoryAccess_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
