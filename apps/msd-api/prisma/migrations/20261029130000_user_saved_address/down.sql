-- Rolls back 20261029130000_user_saved_address. Drops the saved addresses (orders keep their own copy).
ALTER TABLE "User" DROP COLUMN IF EXISTS "pincode";
ALTER TABLE "User" DROP COLUMN IF EXISTS "state";
ALTER TABLE "User" DROP COLUMN IF EXISTS "city";
ALTER TABLE "User" DROP COLUMN IF EXISTS "address";
