-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "completedSubSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "currentSubStep" INTEGER NOT NULL DEFAULT 0;
