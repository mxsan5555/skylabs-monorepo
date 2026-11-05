-- Home Tag Sections: New / Deal / Hot Deal / Expire Soon home-page rails, one per state x tag
-- (docs/msd/PLANNING.md §7.1). A section's deals are manually picked and ordered by the admin.

-- CreateEnum
CREATE TYPE "HomeTagSectionTag" AS ENUM ('NEW', 'DEAL', 'HOT_DEAL', 'EXPIRE_SOON');

-- CreateTable
CREATE TABLE "HomeTagSection" (
    "id" TEXT NOT NULL,
    "state" TEXT,
    "tag" "HomeTagSectionTag" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HomeTagSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeTagSectionItem" (
    "id" TEXT NOT NULL,
    "homeTagSectionId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeTagSectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HomeTagSection_state_idx" ON "HomeTagSection"("state");

-- CreateIndex
CREATE INDEX "HomeTagSection_tag_idx" ON "HomeTagSection"("tag");

-- CreateIndex (matches schema.prisma's @@unique([state, tag]) — kept for Prisma Client's typed
-- upsert/findUnique ergonomics; see the two partial indexes below for the real NULL-safe guard)
CREATE UNIQUE INDEX "HomeTagSection_state_tag_key" ON "HomeTagSection"("state", "tag");

-- Postgres treats every NULL as distinct, so the plain unique index above would silently allow
-- several Global (state IS NULL) rows for the same tag — these two partial indexes are the real
-- constraint; see HomeTagSection's own schema.prisma doc comment.
CREATE UNIQUE INDEX "home_tag_section_global_tag_unique" ON "HomeTagSection"("tag") WHERE "state" IS NULL;
CREATE UNIQUE INDEX "home_tag_section_state_tag_unique" ON "HomeTagSection"("state", "tag") WHERE "state" IS NOT NULL;

-- CreateIndex
CREATE INDEX "HomeTagSectionItem_homeTagSectionId_idx" ON "HomeTagSectionItem"("homeTagSectionId");

-- CreateIndex
CREATE INDEX "HomeTagSectionItem_dealId_idx" ON "HomeTagSectionItem"("dealId");

-- CreateIndex
CREATE INDEX "HomeTagSectionItem_sortOrder_idx" ON "HomeTagSectionItem"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "HomeTagSectionItem_homeTagSectionId_dealId_key" ON "HomeTagSectionItem"("homeTagSectionId", "dealId");

-- AddForeignKey
ALTER TABLE "HomeTagSectionItem" ADD CONSTRAINT "HomeTagSectionItem_homeTagSectionId_fkey" FOREIGN KEY ("homeTagSectionId") REFERENCES "HomeTagSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeTagSectionItem" ADD CONSTRAINT "HomeTagSectionItem_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
