# 03b — Form Fields: Category 2 (Document Type)

---

## Category 2: Document Type

*Note: All document fields, upload, and delete rules are aligned with the live portal (`/account/drivers`).*

This category captures government identity proofs, driving credentials, training certifications, and police verification documents, along with full file upload and delete management.

| Field / Action Label | Input / Action Type | Mandatory (Yes/No) | Default Value | Validation Rules | Inline Error Message |
|---|---|:---:|---|---|---|
| **Document Type (Personal)** | Select Dropdown | No | `'Select Document Type'` | Active options from Personal Documents master | Duplicate selection: *"Duplicate document type. Existing files are preserved; delete an unwanted row to resolve it."* |
| **Document File Upload (Personal)** | File Upload | No | `'No file chosen'` | PDF, PNG, or JPEG file format (Max 10 MB) | — |
| **Delete / Remove Document (Personal)** | Action Button (`delete` icon) | No | Active when row exists | Deletes selected document row and removes uploaded file attachment | — |
| **Driving License No.** | Text Field | **Yes** | Empty | 15 characters: 2 letters + 13 digits (`/^[A-Z]{2}\d{13}$/`) | Empty: `"Driving License No. is required"`<br>Invalid: *"Enter 15 characters: two letters followed by 13 digits, e.g. UP3220210123456."* |
| **DL Issue Date** | Date Picker (`type="date"`) | No | Empty | Past valid calendar date | — |
| **DL Expiry Date** | Date Picker (`type="date"`) | No | Empty | Future date required for trip readiness | Invalid: `"Licence has expired"` |
| **License Details** | Select Dropdown | No | Empty | Standard license categories (e.g. `LMV`, `HMV`, `MCWG`) | — |
| **Training Status** | Select Dropdown | No | `'No'` | Standard choices: `'Yes'` / `'No'` | — |
| **Training Certificate** | File Upload | No | Empty | Training certification file (PDF / Image) | — |
| **Delete / Remove Training Certificate** | Action Button (`close` icon) | No | Active when file selected | Clears selected certificate file without affecting training status | — |
| **Police Verified Status** | Select Dropdown | No | `'No'` | Standard choices: `'Yes'` / `'No'` | — |
| **Police Verified No** | Text Field | No | Empty | Police Clearance Certificate (PCC) number | — |
| **Police Document Upload** | File Upload | No | `'No file chosen'` | PCC certificate file (PDF / Image) | — |
| **Delete / Remove Police Document** | Action Button (`delete` icon) | No | Active when row exists | Deletes police verification document row and detaches uploaded PCC file | — |

---

### Document Upload & Delete Actions

1. **Remove / Clear File (`close` button):**
   - When an operator chooses a file, a clear button appears to reset the upload back to `'No file chosen'` without deleting the document row.

2. **Delete Document Row (`delete` button):**
   - Each document row includes a dedicated **"Delete" (`delete` icon)** button to remove unwanted or mistaken document records.
   - **Duplicate Error Resolution:** If an operator selects a duplicate document type, the system displays:
     > *"Duplicate document type. Existing files are preserved; delete an unwanted row to resolve it."*  
     Operators click the **Delete** button on the duplicate row to clear the error.

---
*Category 2: Document Type · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
