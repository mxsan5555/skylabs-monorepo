###### 2\. Overview \& Scope 



Description 

● Business Purpose: Why is KYC Verification required?

&#x09;:- To review each driver's submitted KYC details and documents item by item, and record every decision.

&#x09;:- To let verifiers raise issues that the driver must correct, and let an Admin give final approval once every item has passed.

&#x09;:- To track cases as Unassigned, Assigned, Issues Raised or Completed.

&#x09;:- To keep driver records accurate and every verification decision documented.



● User Journey Entry Point: where does the KYC Verification journey start? who initiates it? and how does verification proceed?



&#x09;:- Flow-> Driver Registration-> KYC Info/Doc Submission-> Admin assigns a validator-> validator reviews each item and marks it Pass or Issue->

&#x09;	  Issue: driver is notified, corrects the item and it is reviewed again-> All items Pass: driver becomes eligible for final approval->

&#x09;	  Admin performs the separate final approval action-> Driver status becomes Active.

&#x09;:- Initiated by: the driver submits KYC; an Admin starts the review by assigning a validator.

&#x09;:- Entry Point-> staff login using their credentials-> open KYC Assignments (/account/kyc-assignments)-> a validator sees only the drivers assigned to them, an Admin sees all drivers-> review submitted info/docs-> mark each item Pass or Issue.



● In Scope: everything that the KYC Verification module is responsible for handling.



|Feature|Description|
|-|-|
|KYC Application Review|View assigned drivers in a queue, with search and state filter|
|Driver Information|Review name, contact, address, education, health, licence and other submitted info|
|Document Review|Preview uploaded documents (personal, health, education, police) and earlier versions|
|Document Validation|Automatic check is limited to the driving licence expiry/readiness check. Completeness and legibility of documents are manual reviewer checks. Other document expiry dates are not validated automatically.|
|Item Review|Verifier marks each item Pass or Issue (a reason is required for Issue). The verifier does not approve the driver.|
|Request Correction|An Issue notifies the driver, who corrects the item so it can be reviewed again|
|Final Approval|When all items Pass, the driver becomes eligible for final approval. The driver becomes Active only after an Admin performs the separate final approval action.|
|Status Management|Item status (Pending / Pass / Issue), queue state (Unassigned / Assigned / Issues Raised / Completed) and driver KYC status|
|Verification History|Keep every earlier item decision with reviewer, date and time|
|Search and Filtering|Find drivers by name or details, and filter by queue state|
|Audit Trail|Record who performed verification actions and when. **Known implementation gap:** the current item review API (`PATCH /drivers/:id/pill-review`) does not create an AuditLog entry; it records only the Verification History. Final approval does create an AuditLog entry.|



● Out of Scope: following activities are not included in its primary responsibilities:



&#x09;	\* User registration and account creation

&#x09;	\* Login, password \& OTP authentication.

&#x09;	\* Payment and transaction management

&#x09;	\* Sales, marketing and customer activities.

&#x09;	\* Customer support and complaint

&#x09;	\* Verifier assignment (handled in the Drivers module)

&#x09;	\* Reject Application (future enhancement, not implemented)



● Related Information (proposed):

&#x09;:- Routes: staff review queue /account/kyc-assignments; driver KYC status /driver/kyc.

&#x09;:- Permission keys: kyc-assignments:view, kyc-assignments:edit. Final approval also needs drivers:edit and drivers:assign.

&#x09;:- Related modules: Drivers, Documents, DL Verification.

