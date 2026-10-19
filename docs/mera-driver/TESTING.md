# mera-driver testing

## 1. Run the tests

```bash
npx nx run mera-driver:test          # @angular/build:unit-test
npx nx run mera-driver-api:test      # Vitest + Supertest, Prisma mocked
npx nx run-many -t lint test build --projects=mera-driver,mera-driver-api,shared-ui
```

Run `npx nx run mera-driver:test` whenever `packages/shared-ui` changes.

## 2. Testing rules

- Components that use `<md-*>` tags need `schemas: [CUSTOM_ELEMENTS_SCHEMA]`.
- Route tests: 401 without a token, 403 without the permission, 200 with it, 404 for another
  user's record on portal and assigned routes.

## 3. Baseline and known failures

12 failing specs at 2026-10-17: app routes RBAC wiring, users "Login As", drivers page
(`rbac.permissionsCatalog is not a function`). Task X-01. They must not grow.

## 4. Acceptance (from the role specification)

| Scenario | Expected |
|---|---|
| Fresh Data Operator defaults | Assigned onboarding V/C/E; accounts, approval and login creation off |
| Data Operator calls the final KYC approval directly | Denied; onboarding edit never approves |
| Verifier A opens verifier B's assigned driver by URL or API | Denied, including PDF, document and review endpoints |
| Driver reassigned from A to B | A loses access; B gets it |
| Verifier saves Pass / Issue | Saved and audited; final KYC unchanged until approved |
| Verify DL without consent or portal login | Allowed for the assigned reviewer or Admin; existing guards kept |
| DL holder name mismatch | Visible review issue; no automatic approval |
| Driver reads another driver's own endpoint | Denied; identity resolved on the server |
| Customer changes a booking or customer id | Other customer's data denied |
| Company changes `companyId` | Other company's records denied |
| Vendor opens an unrelated driver or platform accounts | Denied |
| Support views a permitted booking | Related summary only; no private documents or totals |
| Sales receives the dispatch action | Assigned bookings only; readiness and conflict rules apply |
| Driver fee form set to Paid | Draft only; ledger paid needs the confirmation guard |
| Admin hard-deletes ledger, KYC or audit history | Denied |
| Custom role grants, then reload or reseed | Custom grants kept |
| Permission revoked while a token is active | API and refreshed menu reflect the removal |
| Edit granted without View | Permissions stay independent; GET still denied |
| Limited user opens a staff PDF or export | Denied |
| Staff user management list | Driver and customer accounts excluded |
| Super Admin clone or removing the last Super Admin | Clone has no bypass; last owner protected |
