ALTER TABLE "RefreshSession" ADD COLUMN "portalContext" TEXT;
ALTER TABLE "Customer" ALTER COLUMN "mobileNumber" DROP NOT NULL;
