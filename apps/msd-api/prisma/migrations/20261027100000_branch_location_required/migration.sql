-- S22 / DL-02: every branch has a state and a city from the India location list.
-- Run `npm run msd-api:prisma:report-branch-locations` first and fix any row it lists; this
-- migration stops with a clear message instead of a bare NOT NULL error when one is missing.
DO $$
DECLARE missing integer;
BEGIN
  SELECT count(*) INTO missing FROM "Branch" WHERE "state" IS NULL OR btrim("state") = '' OR "city" IS NULL OR btrim("city") = '';
  IF missing > 0 THEN
    RAISE EXCEPTION '% branch row(s) have no state or city; fix them (see report-branch-locations) and rerun', missing;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "city" SET NOT NULL,
ALTER COLUMN "state" SET NOT NULL;
