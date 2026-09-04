-- CreateTable
CREATE TABLE "PopularTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopularTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularTagCategory" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopularTagCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularTagDeal" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopularTagDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularTagProduct" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopularTagProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopularTagTherapist" (
    "id" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PopularTagTherapist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PopularTag_slug_key" ON "PopularTag"("slug");

-- CreateIndex
CREATE INDEX "PopularTagCategory_tagId_idx" ON "PopularTagCategory"("tagId");

-- CreateIndex
CREATE INDEX "PopularTagCategory_categoryId_idx" ON "PopularTagCategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "PopularTagCategory_tagId_categoryId_key" ON "PopularTagCategory"("tagId", "categoryId");

-- CreateIndex
CREATE INDEX "PopularTagDeal_tagId_idx" ON "PopularTagDeal"("tagId");

-- CreateIndex
CREATE INDEX "PopularTagDeal_dealId_idx" ON "PopularTagDeal"("dealId");

-- CreateIndex
CREATE UNIQUE INDEX "PopularTagDeal_tagId_dealId_key" ON "PopularTagDeal"("tagId", "dealId");

-- CreateIndex
CREATE INDEX "PopularTagProduct_tagId_idx" ON "PopularTagProduct"("tagId");

-- CreateIndex
CREATE INDEX "PopularTagProduct_productId_idx" ON "PopularTagProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PopularTagProduct_tagId_productId_key" ON "PopularTagProduct"("tagId", "productId");

-- CreateIndex
CREATE INDEX "PopularTagTherapist_tagId_idx" ON "PopularTagTherapist"("tagId");

-- CreateIndex
CREATE INDEX "PopularTagTherapist_therapistId_idx" ON "PopularTagTherapist"("therapistId");

-- CreateIndex
CREATE UNIQUE INDEX "PopularTagTherapist_tagId_therapistId_key" ON "PopularTagTherapist"("tagId", "therapistId");

-- AddForeignKey
ALTER TABLE "PopularTagCategory" ADD CONSTRAINT "PopularTagCategory_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PopularTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagCategory" ADD CONSTRAINT "PopularTagCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagDeal" ADD CONSTRAINT "PopularTagDeal_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PopularTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagDeal" ADD CONSTRAINT "PopularTagDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagProduct" ADD CONSTRAINT "PopularTagProduct_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PopularTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagProduct" ADD CONSTRAINT "PopularTagProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagTherapist" ADD CONSTRAINT "PopularTagTherapist_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "PopularTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopularTagTherapist" ADD CONSTRAINT "PopularTagTherapist_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
