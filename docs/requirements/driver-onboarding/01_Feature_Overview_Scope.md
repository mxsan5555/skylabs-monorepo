# 01 — Feature Overview & Scope

---

## 1. Document Control & Metadata

| Attribute | Value |
|---|---|
| **Feature / Page ID** | `FRD-DRV-REG-001` |
| **Topic / Feature Name** | Driver Walk-in Onboarding & Registry Management |
| **Module / Route** | `/account/drivers` |
| **Document Status** | `Under Review` |
| **Target Release / Sprint** | `Driver Core Sprint` |
| **Owner / Stakeholders** | Driver Operations Team, Engineering, QA |
| **Prepared By** | Shruti Brijpuriya |

---

## 2. Overview & Scope

### Description

#### Business Purpose:
To provide a centralized administrative workflow allowing company staff (Data Operators and Admins) to onboard walk-in and website drivers. The system collects, validates, and stores driver information across four standardized categories (Personal Details, Document Types, Employment Details, and Job Preferences), establishes their initial Non-Verified onboarding record, creates their mobile application login access, and assigns them to authorized KYC verifiers for compliance clearance.

#### User Journey Entry Point:
1. **Walk-In & Verification:** A driver physically visits the operational hub/office with their physical documents (Driving License, Aadhaar, PAN, Bank Passbook).
2. **Lead Initiation:** The Data Operator logs into the Staff Portal, navigates to `/account/drivers`, and clicks the **"Add Driver"** button to launch the multi-step onboarding wizard.
3. **Data Entry Across 4 Categories & Saving:**
   - The Data Operator enters details across the 4 standardized functional categories:
     1. **Personal Details**
     2. **Document Type**
     3. **Employment Type**
     4. **Job Preference**
   - At each stage, the operator can click **"Save draft"** to safely persist partial data to the database without data loss.
   - Upon completing the details, the operator clicks **"Save & Register Driver"** to complete enrollment.
4. **Record Creation:** The driver record is successfully created in the Driver Registry with initial status `Non-Verified` and Onboarding status `Completed`.
5. **Login Activation:** The Admin accesses the driver table row action and clicks **"Create Driver User"**, which links the driver's phone number to an active login account with the `driver` role.
6. **KYC Reviewer Allocation:** The Admin clicks **"Assign Verifier"** from the row action menu to allocate the driver's documents to an eligible KYC verification officer.
7. **Driver Portal Access:** The driver receives an SMS OTP on their mobile phone, logs into the Driver Mobile App via `/sign-in`, and can view their profile and verification progress.

#### In Scope:
- Entering walk-in driver details across the 4 functional categories with persistent "Save draft" and "Save & Register Driver" actions.
- Capturing data across the 4 functional categories:
  1. Personal Details
  2. Document Types (DL, PCC, ID proofs)
  3. Employment Type (Bank/UPI payout details, Insurance, Fee status)
  4. Job Preferences (Driver types, shift timings, vehicle choices, work location, expected salary)
- Driver Registry table with server-side pagination, search by name/phone, filters (City, KYC Status, Fee Status), and export.
- Generating driver app login credentials via **"Create Driver User"**.
- Allocating KYC review tasks to staff via **"Assign Verifier"** with mandatory reassignment audit reasoning.
- Managing driver lifecycle states (Active, Inactive, Suspended).

#### Out of Scope:
- Direct, unassisted self-registration by drivers from the public sign-in page (walk-in drivers require staff creation in the registry first).
- Final document KYC review and approval (conducted by KYC Verifiers on `/account/kyc-assignments` and SuperAdmin on `/account/drivers/:id/details`).
- Live ride dispatching, customer trip booking, and GPS tracking (handled via separate passenger and driver mobile workflows).

---
*Sections 1 & 2 of Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
