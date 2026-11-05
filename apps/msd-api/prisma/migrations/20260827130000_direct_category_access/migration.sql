-- Remove Service/Product Master -> Direct Category Access.
--
-- Replaces the old model (a vendor picks a global, shared Service/Product master row to create
-- a Deal against, with no per-vendor restriction) with: a vendor is granted direct access to
-- top-level Category rows per business module (Service/Product/Therapy), auto-inheriting all
-- (current and future) active subcategories, and creates Deals/Products/Therapists directly
-- against their granted categories. See VendorCategoryAccess/Category.type's own schema doc
-- comments for the full rationale.
--
-- Ordering is deliberate and load-bearing:
--   1) Add every new column/table NULLABLE (or with a safe default) — never break existing rows.
--   2) Data-fix: backfill Category.type (splitting any category ambiguously shared by Service
--      AND Product into two per-type rows), backfill Product.vendorId (cloning a Product shared
--      by multiple vendors' Deals), then backfill VendorCategoryAccess from the (now correct)
--      Deal/Product category linkage so existing vendors don't lose access to categories they
--      already have live data in.
--   3) Only once 1-2 are complete: drop Deal.serviceId and the Service table, and tighten the
--      backfilled columns/constraints.

-- ── 1a. New enum + Category columns (nullable/defaulted — no existing row is broken) ─────────

CREATE TYPE "CategoryType" AS ENUM ('SERVICE', 'PRODUCT', 'THERAPY');

ALTER TABLE "Category"
  ADD COLUMN "type" "CategoryType",
  ADD COLUMN "isPopular" BOOLEAN NOT NULL DEFAULT false;

-- ── 1b. VendorCategoryAccess (new table — no rows yet, safe to add FKs immediately) ───────────

CREATE TABLE "VendorCategoryAccess" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorCategoryAccess_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VendorCategoryAccess_vendorId_idx" ON "VendorCategoryAccess"("vendorId");
CREATE INDEX "VendorCategoryAccess_categoryId_idx" ON "VendorCategoryAccess"("categoryId");
CREATE UNIQUE INDEX "VendorCategoryAccess_vendorId_categoryId_key" ON "VendorCategoryAccess"("vendorId", "categoryId");

ALTER TABLE "VendorCategoryAccess" ADD CONSTRAINT "VendorCategoryAccess_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VendorCategoryAccess" ADD CONSTRAINT "VendorCategoryAccess_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── 1c. Vendor business-module flags (default false — no existing vendor silently gains access) ─
--     NOT a fresh ADD COLUMN: a concurrent session's migration (20260825045955_add_vendor_module_
--     capability — applied to this DB, not present in this branch's migrations/ folder at all)
--     already added all three columns directly. "offersProduct"/"offersTherapy" already default
--     to false there, matching this schema's own @default(false) — nothing to do for those two.
--     "offersService" was left defaulting to true, which contradicts this file's own intent above
--     ("no existing vendor silently gains access") and schema.prisma's @default(false); correct
--     just that one default here. Existing rows' actual values are separately corrected for real
--     by the data-driven backfill in 2e below, independent of whatever default was in place.
ALTER TABLE "Vendor" ALTER COLUMN "offersService" SET DEFAULT false;

-- ── 1d. Therapist.specializationCategoryId (nullable — existing free-text `specialization`
--     is left completely untouched) ────────────────────────────────────────────────────────────

ALTER TABLE "Therapist" ADD COLUMN "specializationCategoryId" TEXT;
CREATE INDEX "Therapist_specializationCategoryId_idx" ON "Therapist"("specializationCategoryId");
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_specializationCategoryId_fkey" FOREIGN KEY ("specializationCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 1e. Product.vendorId — added NULLABLE for now; backfilled below, tightened to NOT NULL
--     (with its FK/index) only once every row has a value. ───────────────────────────────────

ALTER TABLE "Product" ADD COLUMN "vendorId" TEXT;

-- ═══ 2. DATA FIX ═══════════════════════════════════════════════════════════════════════════

-- ── 2a. Backfill Category.type. For each top-level category, check whether it (or any of its
--     children) is referenced by Service rows, Product rows, product-Deals, or the old
--     VendorSpecialization/TherapistSpecialization therapy-grant tables:
--       - referenced by exactly one of Service/Product -> that type
--       - referenced by BOTH Service and Product -> clone the top-level row + its children as a
--         new PRODUCT-typed subtree, repoint every Product/product-Deal FK that pointed at the
--         original onto the clone, and leave Service/service-Deals on the original (now
--         unambiguously SERVICE).
--       - referenced by neither Service nor Product, but referenced by
--         VendorSpecialization/TherapistSpecialization -> THERAPY (e.g. "Therapy" ->
--         "neck massage" today: no Service/Product ever pointed at it, only a
--         VendorSpecialization grant on its subcategory).
--       - referenced by nothing at all -> default SERVICE (inactive/unused seed cruft either
--         way).
--     Precedence SERVICE/PRODUCT > THERAPY is a deliberate, simple choice: today's real data has
--     no 3-way overlap (nothing is simultaneously Service/Product-referenced AND
--     Specialization-referenced), so THERAPY only ever wins when a category has *no* Service/
--     Product signal at all. If a genuine 3-way overlap ever shows up in real data, that's a new
--     migration's problem to solve deliberately — no speculative split machinery is added here.
DO $$
DECLARE
  cat RECORD;
  child RECORD;
  has_service BOOLEAN;
  has_product BOOLEAN;
  has_therapy BOOLEAN;
  new_top_id TEXT;
  new_child_id TEXT;
BEGIN
  FOR cat IN SELECT id, name, slug, description, "sortOrder", "isActive", "isPopular" FROM "Category" WHERE "parentId" IS NULL LOOP

    SELECT EXISTS (
      SELECT 1 FROM "Service" s
      WHERE s."categoryId" = cat.id
         OR s."subcategoryId" IN (SELECT id FROM "Category" WHERE "parentId" = cat.id)
    ) INTO has_service;

    SELECT (
      EXISTS (
        SELECT 1 FROM "Product" p
        WHERE p."categoryId" = cat.id
           OR p."subcategoryId" IN (SELECT id FROM "Category" WHERE "parentId" = cat.id)
      )
      OR EXISTS (
        SELECT 1 FROM "Deal" d
        WHERE d."productId" IS NOT NULL
          AND (d."categoryId" = cat.id OR d."subcategoryId" IN (SELECT id FROM "Category" WHERE "parentId" = cat.id))
      )
    ) INTO has_product;

    SELECT (
      EXISTS (
        SELECT 1 FROM "VendorSpecialization" vs
        WHERE vs."categoryId" = cat.id
           OR vs."categoryId" IN (SELECT id FROM "Category" WHERE "parentId" = cat.id)
      )
      OR EXISTS (
        SELECT 1 FROM "TherapistSpecialization" ts
        WHERE ts."categoryId" = cat.id
           OR ts."categoryId" IN (SELECT id FROM "Category" WHERE "parentId" = cat.id)
      )
    ) INTO has_therapy;

    IF has_service AND has_product THEN
      new_top_id := gen_random_uuid()::text;
      INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
      VALUES (new_top_id, cat.name, cat.slug || '-product-' || substr(new_top_id, 1, 8), cat.description, NULL, cat."sortOrder", cat."isActive", cat."isPopular", 'PRODUCT', now(), now());

      FOR child IN SELECT id, name, slug, description, "sortOrder", "isActive" FROM "Category" WHERE "parentId" = cat.id LOOP
        new_child_id := gen_random_uuid()::text;
        INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
        VALUES (new_child_id, child.name, child.slug || '-product-' || substr(new_child_id, 1, 8), child.description, new_top_id, child."sortOrder", child."isActive", false, 'PRODUCT', now(), now());

        UPDATE "Product" SET "subcategoryId" = new_child_id WHERE "subcategoryId" = child.id;
        UPDATE "Deal" SET "subcategoryId" = new_child_id WHERE "productId" IS NOT NULL AND "subcategoryId" = child.id;
      END LOOP;

      UPDATE "Product" SET "categoryId" = new_top_id WHERE "categoryId" = cat.id;
      UPDATE "Deal" SET "categoryId" = new_top_id WHERE "productId" IS NOT NULL AND "categoryId" = cat.id;

      UPDATE "Category" SET type = 'SERVICE' WHERE id = cat.id;

    ELSIF has_product THEN
      UPDATE "Category" SET type = 'PRODUCT' WHERE id = cat.id;
    ELSIF has_service THEN
      UPDATE "Category" SET type = 'SERVICE' WHERE id = cat.id;
    ELSIF has_therapy THEN
      UPDATE "Category" SET type = 'THERAPY' WHERE id = cat.id;
    ELSE
      -- Referenced by nothing at all.
      UPDATE "Category" SET type = 'SERVICE' WHERE id = cat.id;
    END IF;

  END LOOP;
END $$;

-- ── 2b. Backfill Product.vendorId from the distinct vendors of Deals referencing it
--     (Deal.productId = product.id):
--       - exactly one vendor -> assign it
--       - multiple vendors -> keep the original row for the earliest-Deal vendor, clone the
--         Product per additional vendor, and repoint each vendor's own Deals onto its clone
--       - zero Deals reference it -> assign the oldest active Vendor (any Vendor if none active)
--         — this is seed/dev data, not production; a reasonable default is fine.
DO $$
DECLARE
  prod RECORD;
  vend RECORD;
  first_vendor_id TEXT;
  fallback_vendor_id TEXT;
  new_prod_id TEXT;
  vendor_count INT;
BEGIN
  FOR prod IN SELECT * FROM "Product" LOOP
    SELECT COUNT(DISTINCT "vendorId") INTO vendor_count FROM "Deal" WHERE "productId" = prod.id;

    IF vendor_count = 0 THEN
      SELECT id INTO fallback_vendor_id FROM "Vendor" WHERE status = 'ACTIVE' ORDER BY "createdAt" ASC LIMIT 1;
      IF fallback_vendor_id IS NULL THEN
        SELECT id INTO fallback_vendor_id FROM "Vendor" ORDER BY "createdAt" ASC LIMIT 1;
      END IF;
      IF fallback_vendor_id IS NOT NULL THEN
        UPDATE "Product" SET "vendorId" = fallback_vendor_id WHERE id = prod.id;
      END IF;

    ELSIF vendor_count = 1 THEN
      SELECT DISTINCT "vendorId" INTO first_vendor_id FROM "Deal" WHERE "productId" = prod.id;
      UPDATE "Product" SET "vendorId" = first_vendor_id WHERE id = prod.id;

    ELSE
      SELECT "vendorId" INTO first_vendor_id FROM "Deal" WHERE "productId" = prod.id ORDER BY "createdAt" ASC LIMIT 1;
      UPDATE "Product" SET "vendorId" = first_vendor_id WHERE id = prod.id;

      FOR vend IN SELECT DISTINCT "vendorId" FROM "Deal" WHERE "productId" = prod.id AND "vendorId" IS DISTINCT FROM first_vendor_id LOOP
        new_prod_id := gen_random_uuid()::text;
        INSERT INTO "Product" (
          id, "vendorId", name, slug, brand, "categoryId", "subcategoryId",
          description, summary, benefits, "howToUse", ingredients, "returnPolicy",
          image, gallery, "imageAlt", badge, price, "originalPrice", discount,
          "isNew", "isFeatured", "isActive", "createdAt", "updatedAt"
        )
        VALUES (
          new_prod_id, vend."vendorId", prod.name, prod.slug || '-' || substr(new_prod_id, 1, 8), prod.brand,
          prod."categoryId", prod."subcategoryId", prod.description, prod.summary, prod.benefits,
          prod."howToUse", prod.ingredients, prod."returnPolicy", prod.image, prod.gallery, prod."imageAlt",
          prod.badge, prod.price, prod."originalPrice", prod.discount, prod."isNew", prod."isFeatured",
          prod."isActive", now(), now()
        );

        -- Repoint this vendor's own Deals from the original Product row onto its clone. Media
        -- (ProductImage/ProductVideo) intentionally stays on the kept (first-vendor) row only —
        -- cosmetic, non-destructive default for a one-time dev/seed data-fix; a vendor can
        -- re-upload its own via the normal media endpoints.
        UPDATE "Deal" SET "productId" = new_prod_id WHERE "productId" = prod.id AND "vendorId" = vend."vendorId";
      END LOOP;
    END IF;
  END LOOP;
END $$;

-- ── 2c. Backfill VendorCategoryAccess so existing vendors don't lose access to categories they
--     already have live data in: one row per {vendor, top-level category} derived from every
--     service-Deal's own category, and every (now vendor-owned) Product's own category.
DO $$
DECLARE
  r RECORD;
  top_id TEXT;
BEGIN
  FOR r IN SELECT "vendorId", "categoryId" FROM "Deal" WHERE "serviceId" IS NOT NULL LOOP
    SELECT COALESCE(
      (SELECT id FROM "Category" WHERE id = r."categoryId" AND "parentId" IS NULL),
      (SELECT "parentId" FROM "Category" WHERE id = r."categoryId")
    ) INTO top_id;
    IF top_id IS NOT NULL THEN
      INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
      VALUES (gen_random_uuid()::text, r."vendorId", top_id, now())
      ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
    END IF;
  END LOOP;

  FOR r IN SELECT "vendorId", "categoryId" FROM "Product" WHERE "vendorId" IS NOT NULL LOOP
    SELECT COALESCE(
      (SELECT id FROM "Category" WHERE id = r."categoryId" AND "parentId" IS NULL),
      (SELECT "parentId" FROM "Category" WHERE id = r."categoryId")
    ) INTO top_id;
    IF top_id IS NOT NULL THEN
      INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
      VALUES (gen_random_uuid()::text, r."vendorId", top_id, now())
      ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ── 2d. Fold the old VendorService/VendorProduct/VendorSpecialization mapping tables' grants
--     into VendorCategoryAccess before those tables are dropped in section 3. 2c above already
--     derives grants from Deal/Product data, which happens to cover the VendorService/
--     VendorProduct rows in today's real data (same vendor+category as their corresponding
--     Deal) — but VendorSpecialization's grant on "neck massage" (a Therapy subcategory) has NO
--     corresponding Deal/Product at all, so it would be silently lost if we only relied on 2c.
--     Read directly from the three mapping tables here instead, independent of whatever Deal/
--     Product data happens to exist, so no historical grant is ever lost. (TherapistSpecialization
--     has 0 rows live today and maps therapistId, not vendorId, to a category anyway — nothing to
--     fold into a per-vendor access table; it is still dropped in section 3.)
DO $$
DECLARE
  r RECORD;
  top_id TEXT;
BEGIN
  -- VendorService -> Service.categoryId (top-level) or, defensively, Service.subcategoryId
  -- (walk up one level via parentId) — same top-level resolution pattern as 2c.
  FOR r IN
    SELECT vs."vendorId" AS "vendorId", s."categoryId" AS "categoryId"
    FROM "VendorService" vs
    JOIN "Service" s ON s.id = vs."serviceId"
  LOOP
    SELECT COALESCE(
      (SELECT id FROM "Category" WHERE id = r."categoryId" AND "parentId" IS NULL),
      (SELECT "parentId" FROM "Category" WHERE id = r."categoryId")
    ) INTO top_id;
    IF top_id IS NOT NULL THEN
      INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
      VALUES (gen_random_uuid()::text, r."vendorId", top_id, now())
      ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
    END IF;
  END LOOP;

  -- VendorProduct -> Product.categoryId (top-level).
  FOR r IN
    SELECT vp."vendorId" AS "vendorId", p."categoryId" AS "categoryId"
    FROM "VendorProduct" vp
    JOIN "Product" p ON p.id = vp."productId"
  LOOP
    SELECT COALESCE(
      (SELECT id FROM "Category" WHERE id = r."categoryId" AND "parentId" IS NULL),
      (SELECT "parentId" FROM "Category" WHERE id = r."categoryId")
    ) INTO top_id;
    IF top_id IS NOT NULL THEN
      INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
      VALUES (gen_random_uuid()::text, r."vendorId", top_id, now())
      ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
    END IF;
  END LOOP;

  -- VendorSpecialization -> its own categoryId directly (may already be top-level, or a
  -- subcategory — e.g. "neck massage" under "Therapy" — walk up one level via parentId).
  FOR r IN SELECT "vendorId", "categoryId" FROM "VendorSpecialization" LOOP
    SELECT COALESCE(
      (SELECT id FROM "Category" WHERE id = r."categoryId" AND "parentId" IS NULL),
      (SELECT "parentId" FROM "Category" WHERE id = r."categoryId")
    ) INTO top_id;
    IF top_id IS NOT NULL THEN
      INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
      VALUES (gen_random_uuid()::text, r."vendorId", top_id, now())
      ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ── 2e. Backfill Vendor.offersService/offersProduct/offersTherapy so existing vendors' flags
--     reflect their real live data — 1c added these columns with a hardcoded `false` default,
--     so without this step every vendor would incorrectly start with all three modules off
--     despite having live Deals/Products/mapping-table grants. Must run before section 3 drops
--     Deal.serviceId and the four legacy mapping tables this reads from.
UPDATE "Vendor" v SET "offersService" = true
WHERE EXISTS (SELECT 1 FROM "Deal" d WHERE d."vendorId" = v.id AND d."serviceId" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "VendorService" vs WHERE vs."vendorId" = v.id);

UPDATE "Vendor" v SET "offersProduct" = true
WHERE EXISTS (SELECT 1 FROM "Deal" d WHERE d."vendorId" = v.id AND d."productId" IS NOT NULL)
   OR EXISTS (SELECT 1 FROM "VendorProduct" vp WHERE vp."vendorId" = v.id)
   OR EXISTS (SELECT 1 FROM "Product" p WHERE p."vendorId" = v.id);

UPDATE "Vendor" v SET "offersTherapy" = true
WHERE EXISTS (SELECT 1 FROM "VendorSpecialization" vsp WHERE vsp."vendorId" = v.id)
   OR EXISTS (
     SELECT 1 FROM "TherapistSpecialization" ts
     JOIN "Therapist" t ON t.id = ts."therapistId"
     WHERE t."vendorId" = v.id
   );

-- ═══ 3. Drop the old Service master + Deal.serviceId, tighten backfilled columns ═════════════
-- Only now that every reference has been migrated onto the new model above.

ALTER TABLE "Deal" DROP CONSTRAINT "Deal_serviceId_fkey";
DROP INDEX "Deal_serviceId_idx";
ALTER TABLE "Deal" DROP COLUMN "serviceId";

-- Drop the 4 old vendor-capability mapping tables now that every row's data has been folded
-- into VendorCategoryAccess (2d) and Vendor.offers*/Category.type (2e/2a) above. "VendorService"
-- is dropped before "Service" itself (it holds the FK into Service — Postgres would otherwise
-- refuse to drop the referenced table first); the other three have no FK relationship to
-- "Service" or to each other, so their order relative to one another doesn't matter.
DROP TABLE "VendorService";
DROP TABLE "VendorProduct";
DROP TABLE "VendorSpecialization";
DROP TABLE "TherapistSpecialization";

ALTER TABLE "Service" DROP CONSTRAINT "Service_categoryId_fkey";
ALTER TABLE "Service" DROP CONSTRAINT "Service_subcategoryId_fkey";
DROP TABLE "Service";

-- Category.type is only ever meaningful on a top-level row (parentId IS NULL) — a plain
-- column-level NOT NULL would wrongly force a value onto every subcategory row too (which
-- inherit their parent's type by join, never duplicated — see Category's own schema doc
-- comment). A CHECK constraint expresses the actual invariant instead: every top-level row must
-- have a type; every row backfilled by step 2a already satisfies this.
ALTER TABLE "Category" ADD CONSTRAINT "Category_type_required_for_top_level" CHECK ("parentId" IS NOT NULL OR "type" IS NOT NULL);

ALTER TABLE "Product" ALTER COLUMN "vendorId" SET NOT NULL;
CREATE INDEX "Product_vendorId_idx" ON "Product"("vendorId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
