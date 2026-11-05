-- Add Phase 1 CMS content types: BlogCategory (+ migrate BlogPost.categorySlug -> categoryId),
-- WebsitePage (legal pages), HowItWorksContent/HowItWorksStep, CareersPageContent/
-- CareersJobListing, SocialMediaLink. Hand-written (not `prisma migrate dev`-generated) so the
-- BlogPost.categorySlug -> categoryId change can backfill data instead of dropping it.

-- ─── BlogCategory + BlogPost.categorySlug -> categoryId ─────────────────────────────────────

CREATE TABLE "BlogCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogCategory_slug_key" ON "BlogCategory"("slug");
CREATE INDEX "BlogCategory_isActive_sortOrder_idx" ON "BlogCategory"("isActive", "sortOrder");

-- Backfill: one BlogCategory row per distinct existing BlogPost.categorySlug value — slug is the
-- old value verbatim, name is a title-cased version of it (e.g. "hair-care" -> "Hair Care").
INSERT INTO "BlogCategory" ("id", "name", "slug", "description", "isActive", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       initcap(replace(t."categorySlug", '-', ' ')),
       t."categorySlug",
       '',
       true,
       0,
       now(),
       now()
FROM (SELECT DISTINCT "categorySlug" FROM "BlogPost") t;

-- categoryId is added nullable first so existing rows can be backfilled before NOT NULL + FK are
-- applied (a plain `ADD COLUMN ... NOT NULL` with no default would fail against existing rows).
ALTER TABLE "BlogPost" ADD COLUMN "categoryId" TEXT;

UPDATE "BlogPost" bp
SET "categoryId" = bc."id"
FROM "BlogCategory" bc
WHERE bc."slug" = bp."categorySlug";

ALTER TABLE "BlogPost" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "BlogPost" DROP COLUMN "categorySlug";

CREATE INDEX "BlogPost_categoryId_idx" ON "BlogPost"("categoryId");
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BlogCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── WebsitePage (Privacy Policy / Terms of Service / Accessibility / Cookie Policy) ─────────

CREATE TABLE "WebsitePage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsitePage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsitePage_slug_key" ON "WebsitePage"("slug");
CREATE INDEX "WebsitePage_status_idx" ON "WebsitePage"("status");

-- The 4 fixed legal pages — placeholder body content, published so the public routes they'll
-- back (GET /catalog/pages/:slug) aren't 404 the moment the frontend switches over.
INSERT INTO "WebsitePage" ("id", "slug", "title", "content", "status", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'privacy', 'Privacy Policy', '[{"type":"paragraph","text":"Content coming soon."}]', 'PUBLISHED', now(), now()),
  (gen_random_uuid()::text, 'terms', 'Terms of Service', '[{"type":"paragraph","text":"Content coming soon."}]', 'PUBLISHED', now(), now()),
  (gen_random_uuid()::text, 'accessibility', 'Accessibility', '[{"type":"paragraph","text":"Content coming soon."}]', 'PUBLISHED', now(), now()),
  (gen_random_uuid()::text, 'cookies', 'Cookie Policy', '[{"type":"paragraph","text":"Content coming soon."}]', 'PUBLISHED', now(), now());

-- ─── HowItWorksContent + HowItWorksStep ───────────────────────────────────────────────────────

CREATE TABLE "HowItWorksContent" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "heroTitle" TEXT NOT NULL DEFAULT '',
    "heroSubtitle" TEXT NOT NULL DEFAULT '',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HowItWorksContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HowItWorksStep" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HowItWorksStep_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HowItWorksStep_isActive_sortOrder_idx" ON "HowItWorksStep"("isActive", "sortOrder");

-- ─── CareersPageContent + CareersJobListing ───────────────────────────────────────────────────

CREATE TABLE "CareersPageContent" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "heroTitle" TEXT NOT NULL DEFAULT '',
    "heroSubtitle" TEXT NOT NULL DEFAULT '',
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareersPageContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CareersJobListing" (
    "id" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "employmentType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "responsibilities" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "applyUrl" TEXT,
    "applyInstructions" TEXT,
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareersJobListing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CareersJobListing_status_sortOrder_idx" ON "CareersJobListing"("status", "sortOrder");

-- ─── SocialMediaLink ───────────────────────────────────────────────────────────────────────────

CREATE TABLE "SocialMediaLink" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialMediaLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SocialMediaLink_isActive_sortOrder_idx" ON "SocialMediaLink"("isActive", "sortOrder");

-- Starter rows so the public footer isn't empty once the frontend switches over — placeholder
-- URLs match apps/msd/src/content.json's nav.footer.social entries.
INSERT INTO "SocialMediaLink" ("id", "platform", "displayName", "url", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'facebook', 'Facebook', 'https://facebook.com', true, 0, now(), now()),
  (gen_random_uuid()::text, 'instagram', 'Instagram', 'https://instagram.com', true, 1, now(), now()),
  (gen_random_uuid()::text, 'youtube', 'YouTube', 'https://youtube.com', true, 2, now(), now()),
  (gen_random_uuid()::text, 'x', 'X', 'https://x.com', true, 3, now(), now());
