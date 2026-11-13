-- Manual rollback of 20261018100000_state_sliders_banners.
-- Product slides and product-destination banners cannot exist in the old schema: remove the
-- slides and point those banners back at the home page before the columns and enum value go.
ALTER TABLE "HomeHeroSlide" DROP CONSTRAINT "home_hero_slide_one_item";
DELETE FROM "HomeHeroSlide" WHERE "dealId" IS NULL;
UPDATE "Promotion" SET "destinationType" = 'ROUTE', "destinationRoute" = '/' WHERE "destinationType" = 'PRODUCT';

-- AlterEnum
BEGIN;
CREATE TYPE "PromotionDestination_new" AS ENUM ('ROUTE', 'CATEGORY', 'DEAL');
ALTER TABLE "Promotion" ALTER COLUMN "destinationType" DROP DEFAULT;
ALTER TABLE "Promotion" ALTER COLUMN "destinationType" TYPE "PromotionDestination_new" USING ("destinationType"::text::"PromotionDestination_new");
ALTER TYPE "PromotionDestination" RENAME TO "PromotionDestination_old";
ALTER TYPE "PromotionDestination_new" RENAME TO "PromotionDestination";
DROP TYPE "PromotionDestination_old";
ALTER TABLE "Promotion" ALTER COLUMN "destinationType" SET DEFAULT 'ROUTE';
COMMIT;

-- DropForeignKey
ALTER TABLE "Promotion" DROP CONSTRAINT "Promotion_productId_fkey";

-- DropForeignKey
ALTER TABLE "PromotionPlacement" DROP CONSTRAINT "PromotionPlacement_promotionId_fkey";

-- DropForeignKey
ALTER TABLE "HomeHeroSlide" DROP CONSTRAINT "HomeHeroSlide_productId_fkey";

-- DropIndex
DROP INDEX "Promotion_productId_idx";

-- DropIndex
DROP INDEX "Promotion_state_idx";

-- DropIndex
DROP INDEX "HomeHeroSlide_productId_idx";

-- AlterTable
ALTER TABLE "Promotion" DROP COLUMN "backgroundRole",
DROP COLUMN "buttonRole",
DROP COLUMN "productId",
DROP COLUMN "state";

-- AlterTable
ALTER TABLE "HomeHeroSlide" DROP COLUMN "productId",
ALTER COLUMN "dealId" SET NOT NULL;

-- DropTable
DROP TABLE "PromotionPlacement";

-- DropEnum
DROP TYPE "BannerSlot";

-- DropEnum
DROP TYPE "BannerColorRole";

