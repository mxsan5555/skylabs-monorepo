-- Introduce an explicit review action without recreating or changing any role grants.
INSERT INTO "Permission" (id, "createdAt", "updatedAt", "menuKey", action, key, label)
VALUES (gen_random_uuid()::text, now(), now(), 'kyc-assignments', 'edit', 'kyc-assignments:edit', 'KYC Assignments - Edit review')
ON CONFLICT (key) DO NOTHING;
