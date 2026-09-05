-- Category/Subcategory/Type taxonomy reset — see prisma/category-taxonomy.ts for the full
-- tree (8 top-level x Subcategory x Type, 152 rows total) and the plan doc for the full
-- before/after remap rationale. Ordering, same discipline as 20260827130000_direct_category_access:
--   1) Insert the entire new taxonomy (find via slug subquery for parentId — every row is new,
--      no find-or-create needed inside a migration that only ever runs once).
--   2) Remap every live Deal/Product/VendorCategoryAccess row from its old category reference
--      onto its new equivalent (VendorCategoryAccess explicitly INSERTed first, so cascade-
--      deleting the old category rows in step 4 never silently revokes a real vendor grant).
--   3) Delete the now-superseded OLD VendorCategoryAccess rows explicitly (not left to cascade).
--   4) Delete the 33 old Category rows. Deal.categoryId/Product.categoryId are RESTRICT (not
--      CASCADE) — this statement hard-errors if anything still references an old id, a real
--      safety net proving step 2 was complete before this runs.
-- No Therapist.specializationCategoryId rows were set on any live row at reset time (re-verified
-- fresh — see query-current-state.ts output), so no Therapist remap statement is needed.

-- ── 0. Free every old category row's slug FIRST — several of the 33 old rows already hold
--    a slug the new taxonomy wants to reuse verbatim (e.g. old top-level "massage",
--    "home-services", "therapy", "product", "hair-nails", "skin-beauty", "health-wellness",
--    plus a few old subcategories like "cleaning"/"appliance-repair"/"nails"/"makeup"/
--    "wellness"/"beauty" that collide with a NEW row elsewhere in the tree) — Category.slug
--    is globally unique, so the new taxonomy cannot be inserted while any old row still holds
--    a slug it wants. Renamed, not nulled (slug is NOT NULL) — uniquified per row by its own
--    id so this can never itself collide. These rows are deleted outright in step 5 anyway.

UPDATE "Category" SET slug = slug || '-legacy-reset-' || substr(id, 1, 8) WHERE id IN ('2160fafb-598a-4a44-bb23-04c2f38f342e', 'b274fe59-4a9e-422f-8f98-954023fa9302', 'b429c345-c827-4a45-a1e3-13f78475be18', 'edb89e94-fd28-4038-8098-8940ed09da4b', '5f02a165-4a64-40c8-ad4d-4036830873ef', '5bb0af16-c114-4801-998c-cc18390ccfad', '1208d892-360b-47d7-aa3c-3dd8ad102344', '3890d845-cb2d-4515-9ef6-7bb1e6dd9183', '73908396-e28f-4fe1-bb80-99248892499c', '3e54c2b5-1f12-4a76-8df8-a8db60527260', 'ae724665-f326-40eb-a20a-3553e50466eb', '680b262f-4132-4f92-a7ec-0bc6a04e1cfe', '4687a0a5-34c6-46d1-aae8-f132db808013', 'af8f619e-c752-4bed-a1dd-fb7686a430f3', '89805979-aea8-4d1a-a9fc-7f6cf1ffd5f2', '64c3a051-60ed-4197-87dc-729f2b141c53', 'fd6b03aa-3789-4d0f-9720-4f28334d2b62', 'e951a3b9-66e8-4c05-927a-a140cb2ed43c', 'c2a91003-3349-4fd0-8151-244df92b6269', '1eefe537-a28a-4387-85c2-0b7ccf47fe78', 'b815600e-4660-4160-8e96-87de5ceacf2a', '0d895e3b-584f-4bdb-a19f-c4eb41058dde', 'e7d26c3b-9e76-4a85-ad19-779c89615d11', 'b801ec35-65eb-4270-a0e4-1d516e8c814b', 'd26f289b-2818-4e31-94bc-f6bbe9ebdbda', '03e27608-a81d-4afe-af19-0b53d59a276b', '4d0bf921-acef-463d-b4ed-26ff03b22bd1', 'a5f54b66-f282-4431-93f9-4f242684dc6c', '244a4a11-e1a9-4bea-86e1-eb8cedc5cc38', '74bb2d24-2e82-4163-9a5e-146eae3204da', 'ad11b8c5-fea0-485f-b755-7c064e8afd6f', '4ac21c62-c852-4324-83b4-dfbae916fb70', 'b385579f-2080-4bc8-9939-f04c6bc1803b');

-- ── 1. Insert the new 8-category taxonomy ─────────────────────────────────────────────────

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Massage', 'massage', NULL, NULL, 0, true, false, 'SERVICE', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Massage', 'body-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'massage'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Swedish Massage', 'swedish-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Deep Tissue Massage', 'deep-tissue-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Aromatherapy Massage', 'aromatherapy-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Balinese Massage', 'balinese-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Thai Massage', 'thai-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Sports Massage', 'sports-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 5, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hot Stone Massage', 'hot-stone-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 6, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Couple Massage', 'couple-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'body-massage'), 7, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Head & Neck Massage', 'head-neck-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'massage'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Head Massage', 'head-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'head-neck-massage'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Head & Shoulder Massage', 'head-shoulder-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'head-neck-massage'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Neck & Shoulder Massage', 'neck-shoulder-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'head-neck-massage'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Foot Massage', 'foot-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'massage'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Foot Massage', 'foot-massage-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'foot-massage'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Reflexology', 'reflexology', NULL, (SELECT id FROM "Category" WHERE slug = 'foot-massage'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Prenatal Massage', 'prenatal-massage', NULL, (SELECT id FROM "Category" WHERE slug = 'massage'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Prenatal Massage', 'prenatal-massage-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'prenatal-massage'), 0, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Spa & Retreats', 'spa-retreats', NULL, NULL, 0, true, false, 'SERVICE', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Spa Treatments', 'spa-treatments', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-retreats'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Full Body Spa', 'full-body-spa', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-treatments'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Spa Therapy', 'spa-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-treatments'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Couple Spa', 'couple-spa', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-treatments'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Luxury Spa', 'luxury-spa', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-treatments'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Steam & Sauna', 'steam-sauna', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-retreats'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Steam Bath', 'steam-bath', NULL, (SELECT id FROM "Category" WHERE slug = 'steam-sauna'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Sauna', 'sauna', NULL, (SELECT id FROM "Category" WHERE slug = 'steam-sauna'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Steam & Sauna', 'steam-sauna-combo', NULL, (SELECT id FROM "Category" WHERE slug = 'steam-sauna'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Retreats', 'retreats', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-retreats'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Wellness Retreat', 'wellness-retreat', NULL, (SELECT id FROM "Category" WHERE slug = 'retreats'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Couple Retreat', 'couple-retreat', NULL, (SELECT id FROM "Category" WHERE slug = 'retreats'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Weekend Retreat', 'weekend-retreat', NULL, (SELECT id FROM "Category" WHERE slug = 'retreats'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Luxury Retreat', 'luxury-retreat', NULL, (SELECT id FROM "Category" WHERE slug = 'retreats'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Treatments', 'body-treatments', NULL, (SELECT id FROM "Category" WHERE slug = 'spa-retreats'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Scrub', 'body-scrub', NULL, (SELECT id FROM "Category" WHERE slug = 'body-treatments'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Polish', 'body-polish', NULL, (SELECT id FROM "Category" WHERE slug = 'body-treatments'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Wrap', 'body-wrap', NULL, (SELECT id FROM "Category" WHERE slug = 'body-treatments'), 2, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Skin & Beauty', 'skin-beauty', NULL, NULL, 0, true, false, 'SERVICE', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Facial', 'facial', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-beauty'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Classic Facial', 'classic-facial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hydrafacial', 'hydrafacial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Anti-Aging Facial', 'anti-aging-facial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Acne Facial', 'acne-facial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Brightening Facial', 'brightening-facial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Gold Facial', 'gold-facial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 5, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Oxy Facial', 'oxy-facial', NULL, (SELECT id FROM "Category" WHERE slug = 'facial'), 6, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Skin Treatment', 'skin-treatment', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-beauty'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Acne Treatment', 'acne-treatment', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-treatment'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Pigmentation Treatment', 'pigmentation-treatment', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-treatment'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Skin Rejuvenation', 'skin-rejuvenation', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-treatment'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Skin Brightening', 'skin-brightening', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-treatment'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Removal', 'hair-removal', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-beauty'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Waxing', 'waxing', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-removal'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Full Body Waxing', 'full-body-waxing', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-removal'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Threading', 'threading', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-removal'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Laser Hair Removal', 'laser-hair-removal', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-removal'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Beauty Services', 'beauty-services', NULL, (SELECT id FROM "Category" WHERE slug = 'skin-beauty'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Makeup', 'makeup', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty-services'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Bridal Makeup', 'bridal-makeup', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty-services'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Party Makeup', 'party-makeup', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty-services'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Eyebrow', 'eyebrow', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty-services'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Eyelash', 'eyelash', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty-services'), 4, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair & Nails', 'hair-nails', NULL, NULL, 0, true, false, 'SERVICE', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Haircut & Styling', 'haircut-styling', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-nails'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Haircut', 'haircut', NULL, (SELECT id FROM "Category" WHERE slug = 'haircut-styling'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Styling', 'hair-styling', NULL, (SELECT id FROM "Category" WHERE slug = 'haircut-styling'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Blow Dry', 'blow-dry', NULL, (SELECT id FROM "Category" WHERE slug = 'haircut-styling'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Wash', 'hair-wash', NULL, (SELECT id FROM "Category" WHERE slug = 'haircut-styling'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Treatment', 'hair-treatment', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-nails'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Spa', 'hair-spa', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-treatment'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Keratin Treatment', 'keratin-treatment', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-treatment'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Smoothening', 'hair-smoothening', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-treatment'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Straightening', 'hair-straightening', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-treatment'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Coloring', 'hair-coloring', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-treatment'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Scalp Treatment', 'scalp-treatment', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-treatment'), 5, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nails', 'nails', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-nails'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Manicure', 'manicure', NULL, (SELECT id FROM "Category" WHERE slug = 'nails'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Pedicure', 'pedicure', NULL, (SELECT id FROM "Category" WHERE slug = 'nails'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Gel Nails', 'gel-nails', NULL, (SELECT id FROM "Category" WHERE slug = 'nails'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nail Extension', 'nail-extension', NULL, (SELECT id FROM "Category" WHERE slug = 'nails'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nail Art', 'nail-art', NULL, (SELECT id FROM "Category" WHERE slug = 'nails'), 4, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Health & Wellness', 'health-wellness', NULL, NULL, 0, true, false, 'SERVICE', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Fitness', 'fitness', NULL, (SELECT id FROM "Category" WHERE slug = 'health-wellness'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Personal Training', 'personal-training', NULL, (SELECT id FROM "Category" WHERE slug = 'fitness'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Yoga', 'yoga', NULL, (SELECT id FROM "Category" WHERE slug = 'fitness'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Pilates', 'pilates', NULL, (SELECT id FROM "Category" WHERE slug = 'fitness'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Meditation', 'meditation', NULL, (SELECT id FROM "Category" WHERE slug = 'fitness'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nutrition', 'nutrition', NULL, (SELECT id FROM "Category" WHERE slug = 'health-wellness'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Diet Consultation', 'diet-consultation', NULL, (SELECT id FROM "Category" WHERE slug = 'nutrition'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nutrition Consultation', 'nutrition-consultation', NULL, (SELECT id FROM "Category" WHERE slug = 'nutrition'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Weight Management', 'weight-management', NULL, (SELECT id FROM "Category" WHERE slug = 'nutrition'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Wellness', 'wellness', NULL, (SELECT id FROM "Category" WHERE slug = 'health-wellness'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Stress Management', 'stress-management', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Sleep Wellness', 'sleep-wellness', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Lifestyle Coaching', 'lifestyle-coaching', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Alternative Wellness', 'alternative-wellness', NULL, (SELECT id FROM "Category" WHERE slug = 'health-wellness'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Ayurveda', 'ayurveda', NULL, (SELECT id FROM "Category" WHERE slug = 'alternative-wellness'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Naturopathy', 'naturopathy', NULL, (SELECT id FROM "Category" WHERE slug = 'alternative-wellness'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Acupressure', 'acupressure', NULL, (SELECT id FROM "Category" WHERE slug = 'alternative-wellness'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Acupuncture', 'acupuncture', NULL, (SELECT id FROM "Category" WHERE slug = 'alternative-wellness'), 3, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Therapy', 'therapy', NULL, NULL, 0, true, false, 'THERAPY', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Mental Wellness', 'mental-wellness', NULL, (SELECT id FROM "Category" WHERE slug = 'therapy'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Counseling', 'counseling', NULL, (SELECT id FROM "Category" WHERE slug = 'mental-wellness'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Psychotherapy', 'psychotherapy', NULL, (SELECT id FROM "Category" WHERE slug = 'mental-wellness'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Stress Therapy', 'stress-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'mental-wellness'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Anxiety Support', 'anxiety-support', NULL, (SELECT id FROM "Category" WHERE slug = 'mental-wellness'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Relationship Counseling', 'relationship-counseling', NULL, (SELECT id FROM "Category" WHERE slug = 'mental-wellness'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Physical Therapy', 'physical-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'therapy'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Physiotherapy', 'physiotherapy', NULL, (SELECT id FROM "Category" WHERE slug = 'physical-therapy'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Sports Physiotherapy', 'sports-physiotherapy', NULL, (SELECT id FROM "Category" WHERE slug = 'physical-therapy'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Rehabilitation Therapy', 'rehabilitation-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'physical-therapy'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Specialized Therapy', 'specialized-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'therapy'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Occupational Therapy', 'occupational-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'specialized-therapy'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Speech Therapy', 'speech-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'specialized-therapy'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Behavioral Therapy', 'behavioral-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'specialized-therapy'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Couple & Family', 'couple-family', NULL, (SELECT id FROM "Category" WHERE slug = 'therapy'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Couple Therapy', 'couple-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'couple-family'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Family Counseling', 'family-counseling', NULL, (SELECT id FROM "Category" WHERE slug = 'couple-family'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Relationship Therapy', 'relationship-therapy', NULL, (SELECT id FROM "Category" WHERE slug = 'couple-family'), 2, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Product', 'product', NULL, NULL, 0, true, false, 'PRODUCT', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Skincare', 'skincare', NULL, (SELECT id FROM "Category" WHERE slug = 'product'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Face Wash', 'face-wash', NULL, (SELECT id FROM "Category" WHERE slug = 'skincare'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Moisturizer', 'moisturizer', NULL, (SELECT id FROM "Category" WHERE slug = 'skincare'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Serum', 'serum', NULL, (SELECT id FROM "Category" WHERE slug = 'skincare'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Sunscreen', 'sunscreen', NULL, (SELECT id FROM "Category" WHERE slug = 'skincare'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Face Mask', 'face-mask', NULL, (SELECT id FROM "Category" WHERE slug = 'skincare'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Cleanser', 'cleanser', NULL, (SELECT id FROM "Category" WHERE slug = 'skincare'), 5, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Care', 'hair-care', NULL, (SELECT id FROM "Category" WHERE slug = 'product'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Shampoo', 'shampoo', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-care'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Conditioner', 'conditioner', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-care'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Oil', 'hair-oil', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-care'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Serum', 'hair-serum', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-care'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Hair Mask', 'hair-mask', NULL, (SELECT id FROM "Category" WHERE slug = 'hair-care'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Wellness', 'wellness-products', NULL, (SELECT id FROM "Category" WHERE slug = 'product'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Essential Oils', 'essential-oils', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness-products'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Massage Oils', 'massage-oils', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness-products'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Wellness Kits', 'wellness-kits', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness-products'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Self Care Kits', 'self-care-kits', NULL, (SELECT id FROM "Category" WHERE slug = 'wellness-products'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Beauty', 'beauty', NULL, (SELECT id FROM "Category" WHERE slug = 'product'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Makeup', 'makeup-product', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Beauty Tools', 'beauty-tools', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Nail Care', 'nail-care', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Personal Care', 'personal-care', NULL, (SELECT id FROM "Category" WHERE slug = 'beauty'), 3, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Massage & Spa Products', 'massage-spa-products', NULL, (SELECT id FROM "Category" WHERE slug = 'product'), 4, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Massage Oil', 'massage-oil', NULL, (SELECT id FROM "Category" WHERE slug = 'massage-spa-products'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Scrub', 'body-scrub-product', NULL, (SELECT id FROM "Category" WHERE slug = 'massage-spa-products'), 1, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Body Lotion', 'body-lotion', NULL, (SELECT id FROM "Category" WHERE slug = 'massage-spa-products'), 2, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Spa Kit', 'spa-kit', NULL, (SELECT id FROM "Category" WHERE slug = 'massage-spa-products'), 3, true, false, NULL, now(), now());

INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Home Services', 'home-services', NULL, NULL, 0, true, false, 'SERVICE', now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Cleaning', 'cleaning', NULL, (SELECT id FROM "Category" WHERE slug = 'home-services'), 0, true, false, NULL, now(), now());
INSERT INTO "Category" (id, name, slug, description, "parentId", "sortOrder", "isActive", "isPopular", type, "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Appliance Repair', 'appliance-repair', NULL, (SELECT id FROM "Category" WHERE slug = 'home-services'), 1, true, false, NULL, now(), now());

-- ── 2. Remap live Deal rows (categoryId/subcategoryId) — see the plan's remap table for the
--    full title-based rationale behind each judgment call. ──────────────────────────────────

-- Swedish Massage at Urban Wellness Spa — Civil Lines
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'swedish-massage') WHERE id = 'b577340c-31c8-44a1-b932-25912d15b966';
-- Home Deep Cleaning by Elite Home Services — Rustampur
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'cleaning') WHERE id = '47a21fa1-ab42-40c5-9f02-ff9f02e3aad5';
-- Deep Tissue Massage at Urban Wellness Spa — Medical College Road
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'deep-tissue-massage') WHERE id = '1dd4e6e3-ec18-4118-93b9-99a3154c7324';
-- sar massage — generic title, no specific Type signal
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = '80d10d77-7bfc-4a2a-80fe-acd426bca7d4';
-- Haircut at Glow Beauty Studio — Golghar
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-nails'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'haircut') WHERE id = '582e1fb2-9c54-49d6-82d4-b32295b2caf9';
-- AC Repair by Elite Home Services — Mohaddipur
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'appliance-repair') WHERE id = '5f6489ad-9051-472d-a540-a87bf7241b1f';
-- Hair Spa at Glow Beauty Studio — Taramandal
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-nails'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-spa') WHERE id = 'e7acd49d-e3ab-409b-9e7d-ed1f65c2789f';
-- Facial at Glow Beauty Studio — Golghar
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'skin-beauty'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'classic-facial') WHERE id = '8bf11b79-bb6e-400e-85f2-cd62664541e3';
-- massage — generic title, no specific Type signal
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = 'df7970d8-8e4e-4d85-8336-3e75a6802ebe';
-- fgbf — gibberish title; product deal for "Massage Oil", mapped by product name
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'massage-oil') WHERE id = 'ff14e0e1-1fce-4df6-9bad-83ed5ca5f9e7';
-- lips massage — generic title, no specific Type signal
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = 'e2bc5270-1460-4875-abb1-7215c299583f';
-- cleaning
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'cleaning') WHERE id = '3ae48473-543b-4483-a433-fdb14e20ecdd';
-- E2E Package Test Massage 1787229784 — test data, generic massage bucket
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = 'a88bcc67-6a6b-47a6-b2b5-c0d36872436e';
-- face massage — judgment call: closest fit is Head Massage
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'head-massage') WHERE id = '11dac990-dce5-4055-88f6-faa75285e3bf';
-- Repro Deal 1787316426864 — test data, fallback to its old subcategory signal (Appliance Repair)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'appliance-repair') WHERE id = '57984de9-66fd-4aab-8956-a7f2b715448c';
-- SingleClick Deal 1787373993074 — test data, fallback to its old subcategory signal (Appliance Repair)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'appliance-repair') WHERE id = '48fa72c3-b435-449f-9abf-4d939d6c5e67';
-- RapidClick Deal 1787374007221 — test data, fallback to its old subcategory signal (Appliance Repair)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'appliance-repair') WHERE id = 'd4bf8156-5b18-4f34-8b1f-18a610462499';
-- SingleClick Deal 1787374895976 — test data, fallback to its old subcategory signal (Appliance Repair)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'appliance-repair') WHERE id = 'd2611c87-7cc3-4efc-8f37-73f6097ec742';
-- finger tissue — test data, fallback to its old subcategory signal (Massage)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = '87b167fc-7811-425d-9195-5320ac8a4a0a';
-- desk — test data, fallback to its old subcategory signal (Cleaning)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'home-services'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'cleaning') WHERE id = '90244765-ec42-401d-a31c-5fead941b3de';
-- face tissue — test data, fallback to its old subcategory signal (Massage)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = '2888a687-0dec-460c-be14-87a75ee0c2d4';
-- finger tissue — test data, fallback to its old subcategory signal (Massage)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = 'b8cdbafd-6c69-4e37-a77c-db7760456e94';
-- finger tissue — test data, fallback to its old subcategory signal (Massage)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'massage'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-massage') WHERE id = '14920b86-7e38-4a5e-8c6c-9f60229f55ce';
-- Body Scrub — Urban Wellness Spa (product deal)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-scrub-product') WHERE id = '03b27e2e-e857-4090-ae12-2a5abe981bed';
-- Massage Oil — Urban Wellness Spa (product deal)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'massage-oil') WHERE id = '7592196e-f98b-48e0-ad6e-26c356d76a80';
-- Hair Shampoo — Glow Beauty Studio (product deal)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'shampoo') WHERE id = '71206fcc-2d57-4d9b-b4f3-4d12d1c09a09';
-- Hair Serum — Glow Beauty Studio (product deal)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-serum') WHERE id = 'edb16840-66a2-447c-82d7-db1914278f27';
-- Face Wash — Glow Beauty Studio (product deal)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'face-wash') WHERE id = '8d955963-4998-4580-9685-ea13f08ad82a';
-- Moisturizer — Glow Beauty Studio (product deal)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'moisturizer') WHERE id = '16a59e5e-1338-4411-b33e-c80e14eb85c8';
-- Oil body — gibberish title; product deal for "Body Scrub", mapped by product name (also fixes a pre-existing data inconsistency where this deal’s categoryId/subcategoryId pointed at two unrelated top-level trees)
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-scrub-product') WHERE id = '9bbb97ec-b510-48d6-8759-ff9e070b855b';
-- dsvdfv — gibberish title; product deal for "Hair Serum", mapped by product name
UPDATE "Deal" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-serum') WHERE id = '66ad5a5d-0451-4f06-a8a3-c86efa691d71';

-- ── 3. Remap live Product rows (categoryId/subcategoryId) ────────────────────────────────

-- Body Scrub (Urban Wellness Spa)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-scrub-product') WHERE id = '58813396-9fc3-488f-a8a8-18bfea631418';
-- Body Scrub (Heuristic Communication Pvt. Ltd)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'body-scrub-product') WHERE id = 'a214841d-4e57-447e-93a4-86334bf3987c';
-- Massage Oil (Urban Wellness Spa)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'massage-oil') WHERE id = '15ae4bee-816d-49d8-9476-00a957bc1dba';
-- Hair Shampoo (Glow Beauty Studio)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'shampoo') WHERE id = 'fc8a2763-c180-4556-ba06-c3cd047284be';
-- Hair Serum (Glow Beauty Studio)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-serum') WHERE id = '5853ddce-4a31-40a6-aa97-18db692c038f';
-- Hair Serum (Urban Wellness Spa)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'hair-serum') WHERE id = '248e4653-ed5d-4742-85f1-5742e83d0f11';
-- Hair Conditioner (Heuristic Communication Pvt. Ltd)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'conditioner') WHERE id = 'e7b5926f-d7b8-44b3-8782-a81a0b13db14';
-- Moisturizer (Glow Beauty Studio)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'moisturizer') WHERE id = 'ee3e8517-d40e-4da5-b6d1-fbfde2044afd';
-- Face Wash (Glow Beauty Studio)
UPDATE "Product" SET "categoryId" = (SELECT id FROM "Category" WHERE slug = 'product'), "subcategoryId" = (SELECT id FROM "Category" WHERE slug = 'face-wash') WHERE id = 'c639588b-690d-4fb3-949a-59062d819e22';

-- ── 4. VendorCategoryAccess remap — INSERT the new grants FIRST (so no vendor ever has a
--    window with lost access), THEN explicitly DELETE the old rows (not left to the category
--    delete's CASCADE, so a lost grant would be a loud, reviewed step here, not a silent
--    side-effect of section 5 below). ON CONFLICT DO NOTHING dedupes the two old-PRODUCT-grant
--    collapses (Heuristic, Urban) which would otherwise violate the (vendorId,categoryId)
--    unique constraint. ────────────────────────────────────────────────────────────────────

-- Elite Home Services — was Spas & Retreats (old SERVICE bucket whose real content, Cleaning/Appliance Repair, is Home Services)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), '42099d7f-0b12-4ac3-8019-b2a97506f3d4', id, now() FROM "Category" WHERE slug = 'home-services'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Glow Beauty Studio — split from old "Massage"[SERVICE] grant (its Haircut/Hair Spa deals are Hair & Nails)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), 'e5339419-87ef-4836-9810-877f096b7255', id, now() FROM "Category" WHERE slug = 'hair-nails'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Glow Beauty Studio — split from old "Massage"[SERVICE] grant (its Facial deal is Skin & Beauty)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), 'e5339419-87ef-4836-9810-877f096b7255', id, now() FROM "Category" WHERE slug = 'skin-beauty'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Glow Beauty Studio — was Health & Wellnes[SERVICE] (category-level convention: this old bucket’s real content across vendors is Massage; Glow itself has no live deal exercising this specific grant)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), 'e5339419-87ef-4836-9810-877f096b7255', id, now() FROM "Category" WHERE slug = 'massage'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Glow Beauty Studio — was Spas & Retreats[SERVICE] (its Repro/SingleClick/RapidClick/desk test deals live under Cleaning/Appliance Repair)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), 'e5339419-87ef-4836-9810-877f096b7255', id, now() FROM "Category" WHERE slug = 'home-services'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Glow Beauty Studio — was "Massage"[PRODUCT] (its Hair Shampoo/Hair Serum/Face Wash/Moisturizer product deals)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), 'e5339419-87ef-4836-9810-877f096b7255', id, now() FROM "Category" WHERE slug = 'product'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Heuristic Communication Pvt. Ltd — was Health & Wellnes[SERVICE] ("massage"/"finger tissue"/"face tissue" deals)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), '87ca0377-3dbc-4999-a925-a49e392dba04', id, now() FROM "Category" WHERE slug = 'massage'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Heuristic Communication Pvt. Ltd — was Health & Wellnes[PRODUCT] + "Massage"[PRODUCT] (deduped: both old PRODUCT-typed grants collapse onto the one new Product top-level; its "Oil body" product deal)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), '87ca0377-3dbc-4999-a925-a49e392dba04', id, now() FROM "Category" WHERE slug = 'product'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- xyz — was Health & Wellnes[SERVICE] ("lips massage" deal)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), 'b8409d09-98aa-4dad-a2a3-23891a68de61', id, now() FROM "Category" WHERE slug = 'massage'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Urban Wellness Spa — was Health & Wellnes[SERVICE] (Swedish/Deep Tissue Massage deals)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), '1ac20a81-3b05-416a-9d6d-4e9cd0413117', id, now() FROM "Category" WHERE slug = 'massage'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Urban Wellness Spa — was Health & Wellnes[PRODUCT] + "Massage"[PRODUCT] (deduped: both old PRODUCT-typed grants collapse onto the one new Product top-level; its Body Scrub/Massage Oil product deals)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), '1ac20a81-3b05-416a-9d6d-4e9cd0413117', id, now() FROM "Category" WHERE slug = 'product'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;
-- Urban Wellness Spa — was Therapy[THERAPY] (1:1 carry-over, only one Therapy top-level exists in the new taxonomy too)
INSERT INTO "VendorCategoryAccess" (id, "vendorId", "categoryId", "createdAt")
SELECT gen_random_uuid(), '1ac20a81-3b05-416a-9d6d-4e9cd0413117', id, now() FROM "Category" WHERE slug = 'therapy'
ON CONFLICT ("vendorId", "categoryId") DO NOTHING;

DELETE FROM "VendorCategoryAccess" WHERE id IN ('5d94ad5e-a167-49a9-8b45-01f3251c96fe', 'da602af6-ae0a-4353-81f3-5e12a3c21e8d', '9b5e94cb-ac05-4a13-a46f-1a60dd2f44e1', 'ac1f803b-2342-47fd-aea3-eeb78ceecc8c', 'c1e7e119-b0ce-49a7-97f3-477fab9896c6', '064382e7-c1a8-4be1-900b-d277ac122829', '773f85ff-0226-413d-8150-df7e0b16731c', '942c4456-0489-458c-90d6-e8ee0610b848', '616158e2-1e84-4673-9f12-6ae8ab0a0217', '50bfa4b2-8942-4192-a94e-51e915f8757a', '8b5c281c-3cc5-453e-acbd-0da2db04a951', 'd696b5f2-ebd6-4621-8c18-cae8e549fe2e', '56822bb5-973c-462d-9889-f335a13dadfb');

-- ── 5. Delete the 33 old category rows. Deal.categoryId/Product.categoryId are RESTRICT (not
--    CASCADE) — if step 2/3 missed any row this statement hard-errors instead of silently
--    orphaning/losing data, proving the remap was complete. ────────────────────────────────

DELETE FROM "Category" WHERE id IN ('2160fafb-598a-4a44-bb23-04c2f38f342e', 'b274fe59-4a9e-422f-8f98-954023fa9302', 'b429c345-c827-4a45-a1e3-13f78475be18', 'edb89e94-fd28-4038-8098-8940ed09da4b', '5f02a165-4a64-40c8-ad4d-4036830873ef', '5bb0af16-c114-4801-998c-cc18390ccfad', '1208d892-360b-47d7-aa3c-3dd8ad102344', '3890d845-cb2d-4515-9ef6-7bb1e6dd9183', '73908396-e28f-4fe1-bb80-99248892499c', '3e54c2b5-1f12-4a76-8df8-a8db60527260', 'ae724665-f326-40eb-a20a-3553e50466eb', '680b262f-4132-4f92-a7ec-0bc6a04e1cfe', '4687a0a5-34c6-46d1-aae8-f132db808013', 'af8f619e-c752-4bed-a1dd-fb7686a430f3', '89805979-aea8-4d1a-a9fc-7f6cf1ffd5f2', '64c3a051-60ed-4197-87dc-729f2b141c53', 'fd6b03aa-3789-4d0f-9720-4f28334d2b62', 'e951a3b9-66e8-4c05-927a-a140cb2ed43c', 'c2a91003-3349-4fd0-8151-244df92b6269', '1eefe537-a28a-4387-85c2-0b7ccf47fe78', 'b815600e-4660-4160-8e96-87de5ceacf2a', '0d895e3b-584f-4bdb-a19f-c4eb41058dde', 'e7d26c3b-9e76-4a85-ad19-779c89615d11', 'b801ec35-65eb-4270-a0e4-1d516e8c814b', 'd26f289b-2818-4e31-94bc-f6bbe9ebdbda', '03e27608-a81d-4afe-af19-0b53d59a276b', '4d0bf921-acef-463d-b4ed-26ff03b22bd1', 'a5f54b66-f282-4431-93f9-4f242684dc6c', '244a4a11-e1a9-4bea-86e1-eb8cedc5cc38', '74bb2d24-2e82-4163-9a5e-146eae3204da', 'ad11b8c5-fea0-485f-b755-7c064e8afd6f', '4ac21c62-c852-4324-83b4-dfbae916fb70', 'b385579f-2080-4bc8-9939-f04c6bc1803b');

