# 03a — Form Fields: Category 1 (Personal Details)

---

## Category 1: Personal Details

*Note: Mandatory requirements represent the verified onboarding compliance criteria for driver registration.*

This category captures the driver's core identity, contact information, residential address, physical attributes, and demographics:

| Field Label | Input Type | Mandatory (Yes/No) | Default Value | Validation Rules | Inline Error Message |
|---|---|:---:|---|---|---|
| **First Name** | Text Field | **Yes** | Empty | Letters only, min 2 chars | `"First Name is required"` |
| **Last Name** | Text Field | No | Empty | Letters only | — |
| **Father Name** | Text Field | No | Empty | Letters only | — |
| **Mother Name** | Text Field | No | Empty | Letters only | — |
| **Date of Birth** | Date Picker (`type="date"`) | No | Empty | Valid calendar date (Age ≥ 18) | — |
| **Gender** | Select Dropdown | **Yes** | Empty | Standard choices: `Male`, `Female`, `Other` | `"Gender is required"` |
| **Marital Status** | Select Dropdown | No | Empty | Standard choices: `Unmarried`, `Married`, `Divorced`, `Widowed` | — |
| **Languages Spoken** | Multi-select Checkbox Menu | No | Empty | Active options from Languages master | — |
| **Phone** | Tel Field (`inputmode="numeric"`) | **Yes** | Empty | Regex: `/^\d{10}$/` (Exactly 10 digits, unique) | Empty: `"Phone number is required"`<br>Invalid: `"Enter a valid 10-digit mobile number"` |
| **Email** | Email Field (`type="email"`) | **Yes** | Empty | Regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` (Unique) | Empty: `"Email address is required"`<br>Invalid: `"Enter a valid email address"` |
| **Emergency Number** | Tel Field (`inputmode="numeric"`) | No | Empty | If entered, must be 10 digits (`/^\d{10}$/`) | `"Enter a valid 10-digit emergency number"` |
| **Address** | Text Field | **Yes** | Empty | Permanent or residential street address | `"Address is required"` |
| **City** | Text Field | **Yes** | Empty | City name (min 2 chars) | `"City is required"` |
| **State** | Text Field | **Yes** | Empty | State name | `"State is required"` |
| **Pincode** | Tel Field (`inputmode="numeric"`) | **Yes** | Empty | Exactly 6 numeric digits (`/^\d{6}$/`) | Empty: `"Pincode is required"`<br>Invalid: `"Enter a valid 6-digit pincode"` |
| **Religion** | Select Dropdown | No | Empty | Standard dropdown options | — |
| **Color** | Select Dropdown | No | Empty | Standard dropdown options | — |
| **Height** | Text Field (`inputmode="decimal"`) | No | Empty | Numeric height value | — |
| **Weight** | Text Field (`inputmode="decimal"`) | No | Empty | Numeric weight value | — |
| **Blood Group** | Select Dropdown | No | Empty | Standard medical options (`O+`, `A+`, `B+`, `AB+`, etc.) | — |
| **Eye Vision** | Select Dropdown | No | Empty | Active options from Eye Vision master | — |
| **Profile Image** | File Upload (`png, jpeg, webp`) | **Yes** | Empty | Max size 10MB, valid image format | Empty: `"Profile Image is required"`<br>Invalid: *"Upload a PNG, JPEG or WebP profile photo up to 10 MB"* |

---
*Category 1: Personal Details · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
