-- Drops Category.isPopular. The storefront's "Popular Category"/"Popular Therapy" carousels now
-- run entirely off the existing PopularTag/PopularTagCategory system (see that model's own
-- schema doc comment, and catalog.service.ts#withCategoryPopularTags) — isPopular was a parallel,
-- now-dead flag. The frontend-side switch to PopularTag is a separate, already-in-flight change;
-- this migration only drops the now-unused column. Hand-written (not `prisma migrate dev`-
-- generated) per this repo's convention of writing two small, unrelated migrations separately
-- rather than folding a drop into an unrelated additive change.

ALTER TABLE "Category" DROP COLUMN "isPopular";
