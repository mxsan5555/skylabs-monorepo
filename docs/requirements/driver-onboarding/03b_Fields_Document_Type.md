# 03b — Form Fields: Category 2 (Document Type)

---

## Category 2: Document Type

*Note: All document categories, specific credentials, mandatory rules, and file upload formats are standardized for driver onboarding.*

This category manages the driver's identity, qualifications, medical fitness, and background verification proofs through a centralized document classification system.

---

### Document Classification & Verification Specifications

The table below outlines the 4 main document types, their specific document options line-by-line, and the individual mandatory status for each:

| Document Type | Specific Document | Mandatory (Yes/No) | Default Value | Supported File Format | Validation Rules & Inline Error Message |
|---|---|:---:|---|---|---|
| **Personal** | **Driving License (DL)** | **Yes** | Empty | PDF, PNG, JPEG (Max 10 MB) | 15 characters, valid future expiry date (`"Driving License is required"`) |
| | **Aadhaar Card** | **Yes** | Empty | PDF, PNG, JPEG (Max 10 MB) | 12-digit Government UIDAI proof (`"Aadhaar Card is required"`) |
| | **PAN Card** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | 10-character Tax identity card |
| | **Voter ID Card** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | 10-character EPIC card |
| | **Passport** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Valid Indian passport document |
| **Education** | **Primary School Certificate** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Basic school completion proof |
| | **Secondary School (10th)** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | 10th / Matriculation marksheet |
| | **Higher Secondary (12th)** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | 12th / Intermediate marksheet |
| | **Diploma Certificate** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Technical / Polytechnic diploma certificate |
| | **Bachelor Degree** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Graduation degree certificate |
| | **Master Degree** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Post-graduation degree certificate |
| | **Doctorate (PhD)** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Doctoral degree certificate |
| **Health** | **Medical Fitness Certificate** | **Yes** | Empty | PDF, PNG, JPEG (Max 10 MB) | Registered medical practitioner fitness proof (`"Medical Fitness is required"`) |
| | **Eye Vision Report** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Optometrist eyesight test report |
| | **Vaccination Certificate** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Immunization / COVID vaccination certificate |
| | **Health Insurance Policy Card** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Active health insurance coverage document |
| | **Blood Group Report** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Pathological lab blood test report |
| **Police Verification** | **Police Clearance Certificate (PCC)** | **Yes** | Empty | PDF, PNG, JPEG (Max 10 MB) | Police commissioner / SP clearance certificate (`"PCC is required"`) |
| | **Character Verification Form** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Attested character certificate / form |
| | **Police Station Verification Report** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Local police station inquiry report |
| | **Police NOC** | No | Empty | PDF, PNG, JPEG (Max 10 MB) | Police No Objection Certificate |

---

### Driving License Specific Fields

In addition to document uploads, the following core Driving License fields are captured under Personal documentation:

| Field Label | Input Type | Mandatory (Yes/No) | Default Value | Validation Rules | Inline Error Message |
|---|---|:---:|---|---|---|
| **Driving License No.** | Text Field | **Yes** | Empty | 15 characters: 2 letters + 13 digits (`/^[A-Z]{2}\d{13}$/`) | Empty: `"Driving License No. is required"`<br>Invalid: *"Enter 15 characters, e.g. UP3220210123456"* |
| **DL Issue Date** | Date Picker (`type="date"`) | No | Empty | Past valid calendar date | — |
| **DL Expiry Date** | Date Picker (`type="date"`) | **Yes** | Empty | Future date required for trip readiness | Empty: `"DL Expiry Date is required"`<br>Invalid: `"Licence has expired — enter future date"` |
| **License Details** | Select Dropdown | No | `'LMV'` | Standard categories: `LMV`, `Commercial`, `HMV` | — |

---

### Document Upload & Row Actions

* **Add Document Row:** Operator selects the **Document Type**, picks the **Specific Document**, and uploads the file.
* **Inline File Clear (`close` button):** Clears the chosen file without deleting the document row.
* **Delete Document Row (`delete` button):** Removes unwanted or duplicate document records.

---
*Category 2: Document Type · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
