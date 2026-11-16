-- Additive: existing Driver data and onboarding/KYC records remain unchanged.
ALTER TABLE "Driver" ADD COLUMN "resumeProfile" JSONB;
