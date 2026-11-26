# 03 — UI & Content Specifications

---

## 4. UI & Content Specifications

### Text & Microcopy

| Element Type | Exact Copy / Label | Placement / Display Condition |
|---|---|---|
| **Headline (H1)** | `Driver Registry` (Table View)<br>`Add Driver` (Form View) | Page title header at top-left |
| **Sub-headline** | `Manage drivers, verification and registration fees.` (Table)<br>`Add a new driver lead to the registry` (Form) | Displayed directly beneath the H1 title |
| **Empty State Copy** | `No drivers found.` / `No drivers match the selected filters.` | Centered inside the table when search/filter returns zero records |

---

### Form Layout Specifications

* **Form Name:** Add Driver Form
* **Form Structure:** Divided across 4 Functional Categories:
  1. **Category 1: Personal Details (22 Fields)** — Detailed in `03a_Fields_Personal_Details.md`
  2. **Category 2: Document Type (11 Fields + Upload/Delete)** — Detailed in `03b_Fields_Document_Type.md`
  3. **Category 3: Employment Type (11 Fields)** — Detailed in `03c_Fields_Employment_Type.md`
  4. **Category 4: Job Preference (8 Fields)** — Detailed in `03d_Fields_Job_Preference.md`
* **Form Actions:**
  * **Primary Action:** `"Save & Register Driver"` (completes driver registration).
  * **Secondary Action:** `"Save draft"` (persists partial entered data safely to database).
  * **Cancel Action:** `"Cancel"` (closes the form and returns to registry table).

---

### Table Specifications (Driver Registry)

| Column Header | Data Source Field | Formatting / Display Rules | Searchable / Filterable |
|---|---|---|---|
| **Driver Info** | `firstName`, `lastName`, `phone`, `email` | Profile photo avatar + Full Name in bold + Phone number & Email beneath | Searchable by name and 10-digit phone |
| **Driver Type** | `driverType` | Material chips (Active options from Driver Types master) | Filterable by Driver Type |
| **City / State** | `city`, `state` | Text display: `{city}, {state}` | Filterable by active operational cities |
| **KYC Status** | `kycStatus` | Status badge (`Verified` / `Pending` / `Rejected`) | Filterable by KYC status |
| **Fee Status** | `registrationFeeStatus` | Status badge (`Paid` / `Unpaid`) | Filterable by Registration Fee status |
| **Actions** | Action dialog / menu button | • **Edit driver** (opens form with prefilled driver data)<br>• **Manage Driver User** (links or generates driver mobile app login)<br>• **Assign KYC verifier** (allocates driver to compliance officer)<br>• **Activate / Deactivate** (toggles active operational status)<br>• **Suspend driver** (places driver on disciplinary hold) | Row-level action menu |

---
*Section 4 of Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
