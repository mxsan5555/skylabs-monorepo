-- Add an indexed lookup key without invalidating existing refresh sessions.
ALTER TABLE "RefreshSession" ADD COLUMN "lookupHash" TEXT;

CREATE UNIQUE INDEX "RefreshSession_lookupHash_key" ON "RefreshSession"("lookupHash");
