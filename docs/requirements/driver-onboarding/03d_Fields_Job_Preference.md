# 03d — Form Fields: Category 4 (Job Preference)

---

## Category 4: Job Preference

*Note: Mandatory requirements represent the verified onboarding compliance criteria for driver registration.*

This category captures the driver's work engagement choices, shift availability, vehicle category preferences, driving experience, compensation expectations, and preferred operational work locations through a standardized classification table.

---

### Job Preference Classification & Specification Table

The table below outlines the core job preference categories, their specific options line-by-line, and their mandatory status:

| Preference Category | Specific Option | Mandatory (Yes/No) | Input Type | Default Value | Selection Rules & Description |
|---|---|:---:|---|---|---|
| **Driver Type** | **Bike Rider** | **Yes** *(Min 1)* | Multi-select Dropdown | Empty | Two-wheeler courier, delivery, and bike taxi (`"At least one Driver Type is required"`) |
| | **Car Driver** | | | | Passenger car, cab, and private car chauffeur |
| | **Construction Vehicle Driver** | | | | Heavy construction machinery & earthmover equipment (JCB, Crane, Dumper) |
| | **Ambulance Driver** | | | | Emergency medical response & patient transport vehicle |
| **Job Type** | **Full Time** | No | Checkbox Group (`fieldset`) | Empty | 8–10 hours daily continuous duty |
| | **Part Time** | | | | 4–5 hours half-day morning or evening duty |
| | **Contract Basis** | | | | Fixed-term project or seasonal contract assignment |
| **Preferred Shift** | **Day Shift** | No | Select Dropdown / Checkbox | Empty | Daytime hours (08:00 AM – 08:00 PM) |
| | **Night Shift** | | | | Night hours (08:00 PM – 08:00 AM) |
| | **Hourly Basis** | | | | On-call flexible hours |
| | **Rotational / Any Shift** | | | | Open to day or night shifts |
| **Job Choice** | **Local Trips** | No | Checkbox Group (`fieldset`) | Empty | Intra-city local rides |
| | **Outstation Trips** | | | | Inter-state highway transit |
| | **Personal Driver** | | | | Dedicated private driver for individual or family |
| | **Corporate Duty** | | | | Corporate staff commute |
| **Work Location** | **Same State** | No | Select Dropdown | Empty | Uses residential address state |
| | **Other States** | | Multi-select State List | Empty | Select 1 or more destination states (`"Select at least one other work state"`) |
| **Vehicle Choice** | **Two Wheeler / Bike** | No | Checkbox Group | Empty | Motorcycles & scooters |
| | **Hatchback** | | | | Compact cars (Swift, WagonR, i10) |
| | **Sedan** | | | | Mid-size sedans (Dzire, Etios, Aura) |
| | **SUV / MUV** | | | | 6–8 seaters (Ertiga, Innova, Scorpio) |
| | **Commercial / Heavy Vehicle** | | | | Vans, buses, trucks, ambulances, and construction equipment |
| | **Auto Rickshaw** | | | | Three-wheeler commercial |
| **Driving Experience** | **1 Year** | No | Select Dropdown | Empty | 1 year driving experience |
| | **2 Year** | | | | 2 years driving experience |
| | **3 Year** | | | | 3 years driving experience |
| | **4 Year** | | | | 4 years driving experience |
| | **5+ Years** | | | | 5+ years driving experience |
| **Expected Salary** | **₹10,000 – ₹15,000** | No | Select Dropdown | Empty | Monthly payout range |
| | **₹15,000 – ₹20,000** | | | | Monthly payout range |
| | **₹20,000 – ₹25,000** | | | | Monthly payout range |
| | **₹25,000+** | | | | Monthly payout range |

---

### Mandatory Validation & Conditional Behavior

1. **Driver Type Requirement:** At least one active Driver Type option must be selected before saving or registering the driver (`"At least one Driver Type is required"`).
2. **Conditional Work Location Dependency:**
   - If **"Same State"** is selected, the operational state references the registered residential `State`.
   - If **"Other States"** is selected, requires selecting at least one destination work state (`"Select at least one other work state"`).
3. **Optional Preferences:** Job Types, Shifts, Job Choices, Vehicle Choices, Experience, and Expected Salary are optional fields for operational routing.

---
*Category 4: Job Preference · Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
