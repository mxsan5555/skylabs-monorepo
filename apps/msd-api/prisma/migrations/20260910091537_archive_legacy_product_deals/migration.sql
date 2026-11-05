-- Data migration only (no schema change) — must run BEFORE the following migration drops
-- Deal.productId, while the column still exists to filter on.
--
-- Product purchasing is being decoupled from Deal: Product becomes a directly-purchasable
-- CartItem/OrderItem line (via a new productId FK), and Deal becomes a pure service offering
-- with no Product concept at all. Existing "product deal" rows (Deal.productId IS NOT NULL)
-- need to be neutralized before the column disappears:
--
--   1. Any CartItem referencing a product-deal is a transient, not-yet-checked-out line — safe
--      to delete outright. The customer simply re-adds the Product directly (via the new
--      productId cart shape) after this migration ships.
--   2. Any live/active product-deal is archived (status -> INACTIVE) so it stops appearing on
--      the storefront once the next migration removes VISIBLE_DEAL_WHERE's product-visibility
--      clause — otherwise it would resurface as a broken "service" deal with no packages and no
--      duration. The Deal ROW itself is deliberately NOT deleted: historical OrderItem.dealId
--      values must keep pointing at a valid row for order-history traceability (OrderItem's
--      display fields are immutable snapshots and never re-read Deal, so this is safe).

DELETE FROM "CartItem"
WHERE "dealId" IN (SELECT "id" FROM "Deal" WHERE "productId" IS NOT NULL);

UPDATE "Deal" SET "status" = 'INACTIVE' WHERE "productId" IS NOT NULL;
