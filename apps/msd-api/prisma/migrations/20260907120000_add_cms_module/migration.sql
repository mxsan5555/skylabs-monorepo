-- Add the CMS module (Blog Posts, About Us, Contact Us).
--
-- Drift note (same class of issue already documented in 20260827130000_direct_category_access's
-- own comments for a different lost migration): a migration named "20260824092433_add_cms_module"
-- was already applied to this shared local dev DB and is recorded in `_prisma_migrations` with a
-- real `finished_at`, but its migration folder was never committed to any branch and no longer
-- exists on disk. It created BlogPost/BlogPostImage/AboutPage/AboutPageImage/CareerListing/
-- ContactPage + a `CmsStatus` enum with a different shape (single-image-only relations, an
-- ARCHIVED status, a `CareerListing` feature never scoped for this task). All six tables were
-- confirmed empty (zero rows) before writing this migration, so this drops and replaces that
-- orphaned schema instead of trying to reconcile it in place.

-- ── 1. Create the new BlogPostStatus enum first (BlogPost's status column below is retyped to
--      it before the old CmsStatus enum is dropped, so creation order matters) ─────────────────

CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- ── 2. Drop the orphaned out-of-band schema (all tables confirmed empty) ──────────────────────

ALTER TABLE "AboutPageImage" DROP CONSTRAINT "AboutPageImage_aboutPageId_fkey";

DROP TABLE "AboutPageImage";
DROP TABLE "AboutPage";
DROP TABLE "CareerListing";
DROP TABLE "ContactPage";

-- BlogPost/BlogPostImage are reshaped below rather than dropped+recreated, since their new shape
-- shares most columns with the old one.

DROP INDEX "BlogPost_categorySlug_idx";
DROP INDEX "BlogPost_status_idx";
DROP INDEX "BlogPostImage_blogPostId_key";

ALTER TABLE "BlogPost"
  DROP COLUMN "content",
  DROP COLUMN "createdByUserId",
  ADD COLUMN     "body" JSONB NOT NULL,
  ALTER COLUMN "excerpt" SET NOT NULL,
  ALTER COLUMN "categorySlug" SET NOT NULL,
  ALTER COLUMN "author" SET NOT NULL,
  ALTER COLUMN "readMinutes" SET NOT NULL,
  ALTER COLUMN "readMinutes" SET DEFAULT 1,
  DROP COLUMN "tags",
  ADD COLUMN     "tags" JSONB NOT NULL DEFAULT '[]',
  DROP COLUMN "status",
  ADD COLUMN     "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT';
-- metaTitle/metaDescription already exist on the old table with a matching nullable TEXT shape
-- and are kept as-is.

ALTER TABLE "BlogPostImage"
  DROP COLUMN "altText",
  ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP TYPE "CmsStatus";

-- ── 3. Create the new CMS tables ───────────────────────────────────────────────────────────────

CREATE TABLE "AboutUsContent" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "heroTitle" TEXT NOT NULL DEFAULT '',
    "heroSubtitle" TEXT NOT NULL DEFAULT '',
    "missionStatement" TEXT NOT NULL DEFAULT '',
    "body" JSONB NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AboutUsContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AboutUsImage" (
    "id" TEXT NOT NULL,
    "aboutUsId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AboutUsImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContactUsContent" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "mapEmbedUrl" TEXT NOT NULL DEFAULT '',
    "socialLinks" JSONB NOT NULL DEFAULT '[]',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactUsContent_pkey" PRIMARY KEY ("id")
);

-- ── 3. Indexes + foreign keys ───────────────────────────────────────────────────────────────────

CREATE INDEX "AboutUsImage_aboutUsId_idx" ON "AboutUsImage"("aboutUsId");
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
CREATE INDEX "BlogPostImage_blogPostId_idx" ON "BlogPostImage"("blogPostId");

ALTER TABLE "AboutUsImage" ADD CONSTRAINT "AboutUsImage_aboutUsId_fkey" FOREIGN KEY ("aboutUsId") REFERENCES "AboutUsContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
