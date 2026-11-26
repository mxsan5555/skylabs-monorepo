###### 5\. Status \& State Impact



&#x20; 5.1: KYC Application Queue Status:- Tracks the overall KYC application throughout the verification workflow.





|Status Name|Badge Style|Trigger / Form Submission Impact|Allowed Next Statuses|Downstream / System Impact|
|-|-|-|-|-|
|Unassigned|Grey|Driver submits KYC application; no validator assigned|Assigned|Appears in Unassigned queue|
|Assigned|Blue|Admin/Super Admin assigns driver's details to validator|Issues Raised, Completed|Validator details recorded; appears in assigned list|
|Issues Raised|red|Validator finds an incorrect document and raises an issue with a reason|Assigned|Driver is asked to correct and resubmit the document|
|Completed|Green|Required document verification is completed||Appears in Completed queue; final KYC approval is still done by Admin/Super Admin|





5.2: KYC Document Verification Status


|Status Name|Badge Style|Trigger / Form Submission Impact|Allowed Next Statuses|Downstream / System Impact|
|-|-|-|-|-|
|Pending|grey|Document has been submitted but has not yet been reviewed by the validator|Pass, Issue|Document remains awaiting verification|
|Pass|blue|Validator reviews the document and confirms that it is correct||Document is marked as successfully verified|
|Issue|red|Validator finds incorrect, missing, mismatched or unreadable information and raises an issue with a reason|Pending|Driver is asked to correct and resubmit the document|



