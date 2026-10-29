-- Fast O(1) indexed lookup key for RefreshSession, alongside the existing bcrypt `hashedToken`.
-- Nullable and additive: existing sessions keep rotating via the old bcrypt scan until they next
-- rotate, at which point they get backfilled with a lookupHash (see token.service.ts).

-- AlterTable
ALTER TABLE "RefreshSession" ADD COLUMN "lookupHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_lookupHash_key" ON "RefreshSession"("lookupHash");
