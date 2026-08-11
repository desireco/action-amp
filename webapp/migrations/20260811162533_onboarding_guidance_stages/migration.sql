-- CreateEnum
CREATE TYPE "OnboardingStage" AS ENUM ('SAMPLE_TASK', 'CAPTURE', 'TRIAGE', 'COMPLETE');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "isOnboardingSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "onboardingStage" "OnboardingStage" NOT NULL DEFAULT 'COMPLETE';
