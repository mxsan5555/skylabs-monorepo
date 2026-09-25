-- Add vendor module capability flags.
--
-- This migration was originally applied to the database but was missing
-- from the repository migration history.
--
-- offersService intentionally starts with DEFAULT true because the following
-- migration (20260827130000_direct_category_access) recomputes/backfills the
-- actual capability state from existing vendor data.

ALTER TABLE "Vendor"
ADD COLUMN "offersProduct" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Vendor"
ADD COLUMN "offersService" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Vendor"
ADD COLUMN "offersTherapy" BOOLEAN NOT NULL DEFAULT false;