###### 5\. Status \& State Impact

Executive Summary

&#x09;\* **Two independent statuses.** Driver Status (`Driver.accountStatus`: stored values Active, Inactive, Suspended) and Driver KYC Status (`Driver.status`: Non-Verified, Verified) are separate. Neither maps one-to-one to the other (5.3 and the Driver Status analysis in the Supporting Analysis section).

&#x09;\* **New drivers start as Active, not Inactive.** The FRD requires Inactive on enrollment (G7). Trips are still blocked before KYC, because dispatch requires KYC status Verified.

&#x09;\* **Final KYC approval does not activate the account.** It sets KYC to Verified only; it does not change `accountStatus` (G8). An authorized user can set Active manually at any time with no KYC check (O2).

&#x09;\* **Expiry and automatic suspension are gaps.** Licence expiry only blocks dispatch and changes no status (G9). Police verification (PCC) expiry is not implemented (G10). The 24-hour expired-document suspension has no job (G11).

&#x09;\* **Suspension and deletion.** Manual suspension is implemented and behaves the same as Inactive today (G2). Complaint-based suspension is not implemented (G12). Account deletion and archive are unavailable (G1).

&#x09;\* **Observations are not gaps.** O1 to O6 are implementation notes: Go Online is not eligibility-gated, a reason is optional for status changes, status changes send no notification, extra KYC status values exist, and final approval has two API routes. Detailed tables, gap IDs (G1 to G12), observation IDs, notes and evidence follow unchanged.

5.1: KYC Application Queue Status

The queue status is derived when the list is read; it is not stored on the driver. Priority when more than one condition is true: Completed, then Issues Raised, then Assigned, then Unassigned.


|Status Name|Badge Style|Trigger / Form Submission Impact|Allowed Next Statuses|Downstream / System Impact|
|-|-|-|-|-|
|Unassigned|Grey|No validator is assigned, the driver is not Verified and no item has an Issue|Assigned|Appears under the Unassigned filter|
|Assigned|blue|Admin/Super Admin assigns a verifier (needs `drivers:assign`). A reassignment needs a reason. The assignment is audited.|Unassigned, Issues Raised, Completed|Verifier recorded; driver appears in the verifier's assigned list|
|Issues Raised|red|Any item has a stored Issue (reason required) and the driver is not Verified|Assigned|Driver is notified to correct the item. The status stays Issues Raised until the verifier re-reviews the affected item and updates its status. A driver correcting the item does not clear the stored Issue.|
|Completed|green|Driver KYC status is Verified, set only by the separate final approval, which can be performed by Admin or Super Admin|Assigned (or Unassigned if no verifier), if reviewed data changes|Appears in Completed queue. When all items Pass the driver is only eligible for final approval; it stays Assigned until final approval is performed.|

Filters, search and per-status counts are available on the queue. The "KYC Status" column (5.3) is shown with a colour badge.





5.2: KYC Document Verification Status

Applies to every reviewable item: each form field and each uploaded document. Registration fee items are not reviewed. Pass and Issue are stored; Pending is derived when the screen is shown.


|Status Name|Badge Style|Trigger / Form Submission Impact|Allowed Next Statuses|Downstream / System Impact|
|-|-|-|-|-|
|Pending|grey|The item has not been reviewed yet, or its value changed after review (shown as "Review required after changes")|Pass, Issue|Item remains awaiting verification|
|Pass|blue|Verifier reviews the item and confirms that it is correct|Issue, Review required after changes|Item counts toward final approval readiness. If the driver later changes the value, the item shows "Review required after changes".|
|Issue|red|Verifier finds incorrect, missing, mismatched or unreadable information and raises an issue with a reason (mandatory, up to 2000 characters)|Pass (after the verifier re-reviews)|Driver KYC status becomes Non-Verified, the reason is saved as the verification note and the driver receives a "KYC changes requested" portal message. If the driver changes the value, the item shows "Review required after changes", but the stored Issue stays until the verifier re-reviews it.|


5.3: Driver KYC Status

The driver's KYC stage, stored in `Driver.status` and shown as the "KYC Status" column.


|Status Name|Meaning|Trigger / Transition|Downstream / System Impact|
|-|-|-|-|
|Non-Verified|Default for a new driver. KYC is not approved, or an approval was withdrawn.|Set when a verifier raises an Issue; when a reviewed value of a Verified driver changes; when a non-fee document is uploaded, replaced or deleted.|Queue shows Unassigned, Assigned or Issues Raised (5.1). The driver is excluded from dispatch ("Final KYC approval is required").|
|Verified|Final KYC approval has been given.|Admin or Super Admin performs final approval. It succeeds only when all onboarding steps are complete, the licence number is present and not expired, and every reviewable item has Passed. Next status: Non-Verified (see above).|Queue shows Completed. Driver KYC is marked as Verified after final approval. This does not automatically activate the driver.|

Implementation notes:

&#x09;\* **Final approval API entry points.** Final approval can be submitted through two routes: `POST /drivers/:id/kyc-approval` (needs `drivers:edit` and `drivers:assign`), and `PATCH /drivers/:id` with `status: 'Verified'` (needs `drivers:edit` and the administrative queue, which requires `drivers:assign`). Both run the same approval readiness check, and a failed check returns 422 `KYC_REVIEW_REQUIRED`.

&#x09;\* **Additional schema values.** The schema and driver form also accept Partially Verified (P), Partially Verified (K), Blacklisted, Closed and Not Useful. They are additional schema values, not main workflow statuses. Nothing in the KYC review or final approval flow sets them, and their workflow behavior needs confirmation.





Supporting Analysis (outside the three status tables)

This section keeps the Driver Status (account status) analysis, the implementation gaps and the observations. It is supporting information and not one of the three status tables.


Driver Status (account status): FRD vs implementation

The driver's account status. The agreed business status names are **Active, Inactive, Suspend and Delete**. These are FRD business names, not all stored values:

|Driver Status|FRD Trigger|FRD Impact|Implemented behavior|Implementation status|
|-|-|-|-|-|
|Inactive|**Enroll**: driver registration is completed.|KYC remains pending. The driver record is registered, but trip requests remain blocked in the mobile app until KYC approval.|A new driver is created as **Active**, not Inactive (database default). Trip requests are blocked until KYC approval by a different rule: the driver must have KYC status Verified to be offered or accept a trip.|Gap G7 (wrong default). The outcome (no trips before KYC) is met through the KYC rule.|
|Active|**KYC Complete**: Admin performs final KYC approval.|KYC is marked Done. The driver can toggle Go Online and accept bookings.|Final approval sets Driver KYC Status to Verified (5.3). It does not change `accountStatus`. The Go Online toggle exists. Accepting a booking needs `accountStatus` Active, Verified KYC, complete onboarding, a valid licence and online status.|Gap G8 (approval does not set Active). Go Online and booking acceptance exist (see O1).|
|Inactive|**DL Expire**: the Driving Licence passes its expiry date.|Previous KYC becomes invalid. Rides remain blocked until the renewed DL is verified.|No automatic change. When the expiry date has passed, the driver is excluded from dispatch ("A valid reviewed driving licence is required"). `accountStatus` stays unchanged and the KYC status stays Verified.|Gap G9 (no status change). Rides are blocked by the eligibility check only.|
|Inactive|**Police Verification Expire**: PCC expires.|The driver remains inactive for safety compliance until a fresh PCC is submitted.|Nothing checks PCC or police document expiry.|Gap G10 (not implemented)|
|Suspend|**KYC Expire since 1 Day**: expired documents are not updated within 24 hours.|The system suspends the driver and freezes app login.|There is no job that detects expired documents or counts 24 hours. Suspension is manual only. A driver set to Suspend manually cannot log in (see implementation notes).|Gap G11 (automatic trigger not implemented). The login-freeze effect exists for manual suspension.|
|Suspend|**Misbehave**: passenger complaint or safety misconduct.|Immediate suspension.|No complaint or misconduct flow exists. An authorized user (`drivers:status_change`: Super Admin and Admin by default) can suspend a driver from the Drivers list, with a mandatory reason in the screen. It takes effect immediately.|Gap G12 (no complaint flow). Manual suspension is implemented.|
|Delete|**Delete Account**: account deletion process. (FRD business status/action; not a stored `accountStatus` value.)|Pending trips and dues must be cleared, after which the account is permanently closed and archived.|`Driver.accountStatus` has no Delete value. `DELETE /drivers/:id` (`drivers:delete`) exists, but it always returns 422 `DRIVER_ARCHIVE_UNAVAILABLE`, because the deletion/archive workflow is unavailable in the current implementation. The Drivers list shows "Delete unavailable: there is no archive workflow." No pending-trip or dues check exists. Nothing is deleted, closed or archived.|Gap G1 (not implemented)|

Implementation notes (not FRD requirements):

&#x09;\* **Naming difference for Suspend.** The business status name is **Suspend**. The backend stores and returns the value **`Suspended`** (`SetDriverStatusSchema`: Active, Inactive, Suspended). This is an implementation naming difference, not a separate status.

&#x09;\* **How status is changed.** `PATCH /drivers/:id/status` (needs `drivers:status_change`). The audit action is `driver.status_change`. See O4 and O5 for the reason and notification details.

&#x09;\* **Inactive and Suspended behave the same today.** Both are refused at login (403 `DRIVER_DEACTIVATED`), are refused on the next portal request (so an existing session is cut off), and are excluded from dispatch ("Account is not active"). The only differences are the list colour (Suspended = warning, Inactive = error) and the mandatory reason in the Suspend screen action (see G2).

&#x09;\* **Manual activation.** See O2.

&#x09;\* A separate "Driver Status Master" label (`driverStatusMasterId`) exists. It is an administrative label, not one of these statuses.










Implementation Gaps (confirmed against the FRD or the agreed documentation)


|#|Gap|Evidence|
|-|-|-|
|G1|**Delete is not implemented.** Delete is an FRD business action, but `accountStatus` has no Delete value and the route always refuses. There is also no check that pending trips and dues are cleared, and no archive.|`driver.service.ts:235-238`; `drivers.html:75`|
|G2|**Suspend has no behavior distinct from Inactive.**|`resolveOwnDriver.ts:41`, `driver.service.ts:349`|
|G6|Carry-over: no AuditLog on item review (B1), no notification on final approval (B2), no colour badges on queue state (S2).|Earlier reviews|
|G7|**New drivers default to Active.** The FRD requires Inactive on enrollment.|`schema.prisma`; migration `20260916061445`|
|G8|**Final KYC approval does not set `accountStatus` to Active.**|`driver.service.ts:336-340`; `drivers.routes.ts:71-76`|
|G9|**Licence expiry has no automatic effect on Driver Status.** The driver is only excluded from dispatch. Neither licence expiry nor licence renewal automatically changes Driver.accountStatus. The KYC status also remains unchanged.|`licence-policy.service.ts`; `trip-workflow.service.ts:24`|
|G10|**Police verification (PCC) expiry is not implemented.**|No code reads it|
|G11|**24-hour expired-document suspension is not implemented.** No scheduler exists beyond the trip-offer sweep.|`main.ts:10`|
|G12|**Misconduct and complaint suspension is not implemented.** Suspension is manual only.|No complaint model|

Gap numbers G3, G4 and G5 are not used; those findings are recorded as observations O4, O5 and O6.





Implementation Observations and Technical Notes (not gaps)


|#|Observation|Evidence|
|-|-|-|
|O1|**Go Online is not eligibility-gated.** `PATCH /driver/availability` sets `online` without an eligibility check. Eligibility is enforced when a trip is offered and when it is accepted (422 `DRIVER_INELIGIBLE`). The FRD does not say the toggle must be blocked, so this is a possible UX improvement only.|`workflow.routes.ts:63`; `trip-workflow.service.ts:171, 207`|
|O2|An authorized user can set Active at any time with no KYC or licence check.|`setDriverAccountStatus`|
|O3|The schema accepts extra Driver KYC Status values (Partially Verified (P), (K), Blacklisted, Closed, Not Useful). Their workflow behavior needs confirmation.|`business.schema.ts:95-105`|
|O4|A reason is optional in the API for every Driver Status change. Only the Suspend action in the screen requires one. The reason is recorded in the audit entry when given. The supplied FRD does not require a reason for every change.|`business.schema.ts:236-241`; `drivers.ts:1317`|
|O5|A status change revokes no sessions and sends no driver notification. Portal access is cut off by the per-request check only. The supplied FRD does not require either.|`setDriverAccountStatus`; `drivers.routes.ts:165-180`|
|O6|Final KYC approval has two API entry points (`POST /drivers/:id/kyc-approval` and `PATCH /drivers/:id` with `status: 'Verified'`) that share one readiness check. This is an implementation detail.|`drivers.routes.ts:71, 140-146`|

