# 06 — Do's & Don'ts & QA Acceptance Criteria

---

## 7. Do's & Don'ts

### Do:
* **DO** verify the driver's phone number before saving — the driver needs it to receive their login OTP.
* **DO** have the Admin click **"Create Driver User"** right after registration so the driver gets mobile app access.
* **DO** use the **"Save draft"** button frequently when entering lengthy documents to avoid data loss.
* **DO** enter a clear and valid reason whenever reassigning a driver to a different KYC verifier.

### Don't:
* **DON'T** enter duplicate phone numbers or dummy emails — the system will reject them with conflict errors (`HTTP 409 CONTACT_CONFLICT`).
* **DON'T** expect Data Operators to assign verifiers — they do not have the `drivers:assign` permission.
* **DON'T** approve a driver as `Verified` until all KYC checklist items and Driving License checks have passed.

---

## 8. Acceptance Criteria (QA Sign-Off)

* [ ] **AC-1:** Data Operator can open `/account/drivers` and launch the **"Add Driver"** form.
* [ ] **AC-2:** Validation blocks form submission if mandatory fields (First Name, Gender, Phone, Email, Address, City, State, Pincode, Profile Image, or Driver Type) are missing or invalid.
* [ ] **AC-3:** Data Operator can fill details across the 4 categories and click **"Save draft"** at any stage to safely persist partial progress.
* [ ] **AC-4:** Clicking **"Save & Register Driver"** creates the record with initial status `Non-Verified` and Onboarding status `Completed`.
* [ ] **AC-5:** The **"Assign Verifier"** option is visible to Admin but strictly hidden from Data Operator.
* [ ] **AC-6:** Admin can click **"Create Driver User"**, enabling the driver to log into `/sign-in` using their mobile OTP.
* [ ] **AC-7:** Inactive or suspended drivers cannot log in and receive an error message: *"Your driver account has been deactivated."*

---
*Section 7 & 8 of Driver Onboarding FRD | Prepared by Shruti Brijpuriya*
