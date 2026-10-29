-- Manual rollback of 20261028100000_home_tag_sections.
-- DropForeignKey
ALTER TABLE "HomeTagSectionItem" DROP CONSTRAINT "HomeTagSectionItem_homeTagSectionId_fkey";

-- DropForeignKey
ALTER TABLE "HomeTagSectionItem" DROP CONSTRAINT "HomeTagSectionItem_dealId_fkey";

-- DropTable
DROP TABLE "HomeTagSectionItem";

-- DropTable
DROP TABLE "HomeTagSection";

-- DropEnum
DROP TYPE "HomeTagSectionTag";
