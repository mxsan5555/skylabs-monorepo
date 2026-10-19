-- State-based home slider (deals and products) and CTA banners with colour roles and slots
-- (docs/msd/PLANNING.md §6, §7; decisions D23 to D25). Requires 20261017100000_member_document_reminders.

-- CreateEnum
CREATE TYPE "BannerSlot" AS ENUM ('HOME_AFTER_DEALS', 'HOME_AFTER_PRODUCTS', 'CATEGORY_TOP', 'EXPLORE_TOP', 'DEAL_BOTTOM', 'PRODUCT_BOTTOM');

-- CreateEnum
CREATE TYPE "BannerColorRole" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY', 'SURFACE', 'SURFACE_HIGH', 'INVERSE');

-- AlterEnum
ALTER TYPE "PromotionDestination" ADD VALUE 'PRODUCT';

-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "backgroundRole" "BannerColorRole" NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN     "buttonRole" "BannerColorRole" NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable
ALTER TABLE "HomeHeroSlide" ADD COLUMN     "productId" TEXT,
ALTER COLUMN "dealId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PromotionPlacement" (
    "promotionId" TEXT NOT NULL,
    "slot" "BannerSlot" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionPlacement_pkey" PRIMARY KEY ("promotionId","slot")
);

-- CreateIndex
CREATE INDEX "PromotionPlacement_slot_idx" ON "PromotionPlacement"("slot");

-- CreateIndex
CREATE INDEX "Promotion_productId_idx" ON "Promotion"("productId");

-- CreateIndex
CREATE INDEX "Promotion_state_idx" ON "Promotion"("state");

-- CreateIndex
CREATE INDEX "HomeHeroSlide_productId_idx" ON "HomeHeroSlide"("productId");

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionPlacement" ADD CONSTRAINT "PromotionPlacement_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeHeroSlide" ADD CONSTRAINT "HomeHeroSlide_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A slide is exactly one deal or one product.
ALTER TABLE "HomeHeroSlide" ADD CONSTRAINT "home_hero_slide_one_item"
  CHECK (("dealId" IS NOT NULL) <> ("productId" IS NOT NULL));

-- Existing banners keep showing where they did: the home offers band, Global, primary colours.
INSERT INTO "PromotionPlacement" ("promotionId", "slot")
SELECT "id", 'HOME_AFTER_DEALS' FROM "Promotion";
