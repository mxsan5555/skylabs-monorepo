# 03d — Form Fields: Category 4 (Job Preference)

---

## Category 4: Job Preference

*Note: All driver and job preference fields are aligned with the live portal (`/account/drivers`).*

This category captures the driver's work engagement choices, vehicle category preferences, driving experience, and preferred operational work locations:

| Field Label | Input Type | Mandatory (Yes/No) | Default Value | Validation Rules | Inline Error Message |
|---|---|:---:|---|---|---|
| **Driver Type** | Multi-select Dropdown | **Yes** | Empty | Active options from Driver Types master | `"At least one Driver Type is required"` |
| **Job Type** | Checkbox Group (`fieldset`) | No | Empty | Active options from Job Types master | — |
| **Job choice** | Checkbox Group (`fieldset`) | No | Empty | Standard choices (e.g. `Local`, `Outstation`) | — |
| **Work location** | Select Dropdown | No | Empty | Standard choices: `'Same State'` or `'Other States'` | — |
| **Experience** | Select Dropdown | No | Empty | Standard choices: `'1 Year'`, `'2 Year'`, `'3 Year'`, `'4 Year'`, `'5+ Years'` | — |
| **Vehicle choice** | Checkbox Group | No | Empty | Active options from Vehicle Types master | — |

---
*Category 4: Job Preference · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
