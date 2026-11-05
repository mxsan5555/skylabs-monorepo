-- Add the CMS module (Blog Posts, About Us, Contact Us).

CREATE TYPE "BlogPostStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "BlogPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "categorySlug" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "readMinutes" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "body" JSONB NOT NULL,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "status" "BlogPostStatus" NOT NULL DEFAULT 'DRAFT',

    CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlogPostImage" (
    "id" TEXT NOT NULL,
    "blogPostId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogPostImage_pkey" PRIMARY KEY ("id")
);

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

CREATE UNIQUE INDEX "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
CREATE INDEX "BlogPostImage_blogPostId_idx" ON "BlogPostImage"("blogPostId");
CREATE INDEX "AboutUsImage_aboutUsId_idx" ON "AboutUsImage"("aboutUsId");

ALTER TABLE "BlogPostImage" ADD CONSTRAINT "BlogPostImage_blogPostId_fkey" FOREIGN KEY ("blogPostId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AboutUsImage" ADD CONSTRAINT "AboutUsImage_aboutUsId_fkey" FOREIGN KEY ("aboutUsId") REFERENCES "AboutUsContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;