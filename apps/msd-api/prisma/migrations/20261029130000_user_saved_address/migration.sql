-- D37 (item 2.2): the customer's saved delivery address. Nullable, no backfill: it fills in from
-- the next checkout or when the customer saves it.
ALTER TABLE "User" ADD COLUMN "address" TEXT;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "state" TEXT;
ALTER TABLE "User" ADD COLUMN "pincode" TEXT;
