-- CreateTable
CREATE TABLE "PopularTreatmentGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopularTreatmentGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularTreatment" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopularTreatment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PopularTreatmentGroup_slug_key" ON "PopularTreatmentGroup"("slug");

-- CreateIndex
CREATE INDEX "PopularTreatmentGroup_sortOrder_idx" ON "PopularTreatmentGroup"("sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PopularTreatment_slug_key" ON "PopularTreatment"("slug");

-- CreateIndex
CREATE INDEX "PopularTreatment_groupId_idx" ON "PopularTreatment"("groupId");

-- CreateIndex
CREATE INDEX "PopularTreatment_categoryId_idx" ON "PopularTreatment"("categoryId");

-- CreateIndex
CREATE INDEX "PopularTreatment_sortOrder_idx" ON "PopularTreatment"("sortOrder");

-- AddForeignKey
ALTER TABLE "PopularTreatment" ADD CONSTRAINT "PopularTreatment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PopularTreatmentGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTreatment" ADD CONSTRAINT "PopularTreatment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTreatment" ADD CONSTRAINT "PopularTreatment_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
