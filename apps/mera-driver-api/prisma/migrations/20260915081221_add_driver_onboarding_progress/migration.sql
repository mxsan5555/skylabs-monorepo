-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "completedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "completionPercentage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "onboardingStatus" TEXT NOT NULL DEFAULT 'in_progress';

-- Backfill: every row that existed before this migration was created via the old
-- single-shot form (or import/seed), so it is already fully populated -- mark it
-- COMPLETED rather than leaving every pre-existing driver looking like an abandoned
-- draft in the new onboarding-progress UI.
UPDATE "Driver" SET
  "onboardingStatus" = 'completed',
  "currentStep" = 4,
  "completedSteps" = ARRAY[1, 2, 3, 4]::INTEGER[],
  "completionPercentage" = 100;
