INSERT INTO "MasterListItem" (id, "createdAt", "updatedAt", category, name, status)
VALUES ('980548e0-24ed-4b2e-9f44-270ed19a321c', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'driver-types', 'Other', 'Active')
ON CONFLICT (category, name) DO NOTHING;
