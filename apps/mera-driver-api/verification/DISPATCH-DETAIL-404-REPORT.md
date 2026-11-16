# Dispatch detail route 404 fix

## Exact root cause and operational fix

Reproduced on the running UI at `http://localhost:4400/account/dispatch` by clicking View for booking `c9cfe85b-79be-48ee-9aaa-7e14f7ba12f5` (`MD-94BC4D0A`). The record exists. The running API on port 3334 returned HTTP 404 with `No route for GET /workflow/dispatch/c9cfe85b-79be-48ee-9aaa-7e14f7ba12f5`.

The frontend URL was correct. `Workflow.base` uses `environment.apiUrl + '/workflow'`, and development `apiUrl` is `http://localhost:3334`. Both View and assignment-dialog refresh issue `GET /workflow/dispatch/:id`.

The intended detail route already exists in `src/routes/workflow.routes.ts`, and `src/app.ts` mounts that router at `/workflow`. It uses existing authentication, `trips.bookings:view`, `bookingOwnerScope` and `getBookingById` before returning the actual booking, assigned driver, saved offers/preference provenance and ordered history. The canonical `/trips/bookings` router has no equivalent GET detail endpoint with these relations.

The running Nx API process was using the old `dist/apps/mera-driver-api/main.js`, dated **2026-10-07 18:53:05**, which contains candidate/assignment routes but lacks `GET /dispatch/:id`. Source and the app-owned verification build contain the route. This was an outdated runtime, not an incorrect URL or missing source registration.

Rebuilt the API into `apps/mera-driver-api/verification/production-build`, stopped only the identified Mera Driver API supervisor/executor/listener, and started the rebuilt API on **port 3334** using `verification/dispatch-local-api.cjs`. The existing frontend on port 4400 remains running. No application endpoint, permission, ownership rule or data was changed to hide the error.

## Routes verified

| Action | Method and route |
| --- | --- |
| View and Assign/Reassign summary/history | `GET /workflow/dispatch/:id` |
| Paginated driver candidate search | `GET /workflow/dispatch/:id/candidates` |
| Assign/Reassign submission | `POST /workflow/dispatch/:id/assign` |

## Files changed for this follow-up

- `apps/mera-driver-api/src/routes/dispatch.routes.test.ts`: distinguish unknown records from unmatched URLs; require authentication/module view; enforce owner scope before reading private relations.
- `apps/mera-driver/src/app/pages/workflow/dispatch.spec.ts`: assert the exact environment-based GET detail/candidate URLs and existing POST reassignment URL/method.
- `apps/mera-driver-api/verification/dispatch-local-api.cjs`: start the current app-owned build on the port used by the existing local frontend.
- `apps/mera-driver-api/verification/dispatch-detail-route.cjs`: reproduce the original browser/API failure and verify the running local services without creating fixtures or mutating real bookings.
- This report and [verification results](artifacts/dispatch-detail-route.json). Generated production bundles remain inside the permitted apps and are ignored.

## Verification results

- The exact previously failing GET now returns **200** for the reported booking, including four saved driver requests and two history events.
- Running browser View succeeds for that exact booking.
- Running browser Assign and Reassign load the actual booking summary/history and paginated candidates; both dialogs were cancelled without submitting a mutation.
- Unknown booking GET returns **404 `NOT_FOUND: Booking not found`**.
- POST to the existing assignment URL with a nonexistent booking returns the same record-not-found response, demonstrating that the route/method is registered without changing any record.
- Unmatched nested URL returns **404 `No route for GET ...`**, distinct from record not found.
- Anonymous detail request returns **401**. An existing Customer portal session returns **403**. Owner-restricted detail regression returns **404** before reading relations.
- API route and booking-service regression tests: **20 passed**.
- Frontend dispatch regression tests: **12 passed**.
- Both application TypeScript checks passed; the Angular regression build additionally checked the changed spec.
- Both production builds passed. Frontend Google Fonts inlining initially failed due to sandbox network denial; the approved rerun succeeded.
- No database reset, new booking workflow, fabricated response, real provider/SMS/payment call, or existing-record mutation was used.

The local issue is fixed and the rebuilt API remains running on port 3334. Deployment elsewhere still needs the current API build; this follow-up did not deploy to a remote environment.
