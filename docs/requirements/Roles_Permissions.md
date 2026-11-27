3\. Roles \& Permissions (RBAC)
	
---

&#x09;:- This section defines which users can access the KYC Verification module and what actions they are allowed to perform. Each user can perform only the activities assigned to their role.

&#x09;:- The defaults below are the seeded role grants. A Super Admin can change grants at runtime in Role Management.

&#x09;:- Access is checked in three layers: the menu shows **KYC Assignments** only with `kyc-assignments:view`; every API route re-checks its permission on the server; and a separate scope rule limits which drivers a user can see.
	

&#x09;:- Staff roles: Super Admin, Admin, KYC Verification, Data Operator, Vendor, Sales, Support, Marketing, Company.

&#x09;:- Portal roles (ownership-based, not console RBAC): Driver, Customer.
	

&#x09;
|Role|View|Create|Edit driver record|Delete|Assign Reviewer|KYC Item Review (Pass/Issue)|Final Approval|Data Scope \& <br />Conditions |
|-|-|-|-|-|-|-|-|-|
|Super Admin|Yes|Yes|Yes|Yes|Yes|Yes, only on drivers assigned to them|Yes|Can access all drivers.|
|Admin|Yes|Yes|Yes|No|Yes|Yes, only on drivers assigned to them|Yes|Can access all drivers.|
|KYC Verification|Yes|No|No|No|No|Yes, on assigned drivers|No|Assigned drivers only. Cannot edit driver data, assign reviewers or approve.|
|Data Operator|Yes|Yes|Yes|No|No|No|No|Drivers they created. No KYC access.|
|Vendor|Yes|Yes|Yes|No|No|No|No|Drivers they created. No KYC access.|
|Sales|Yes|Yes|Yes|No|No|No|No|Drivers they created. No KYC access.|
|Support|Yes|No|No|No|No|No|No|Limited driver lookup only. No KYC access.|
|Marketing, Company|No|No|No|No|No|No|No|No driver or KYC access.|
|Driver (portal)|Yes|Yes (submit own info and documents)|Yes (own record)|Own documents only|No|No|No|Own record only. Access is by ownership, not console permissions.|
|Customer (portal)|No|No|No|No|No|No|No|No driver or KYC access.|



Notes:

1. **Edit vs Item Review.** Edit changes driver data and needs `drivers:edit`. Item Review marks a KYC item Pass or Issue and needs `kyc-assignments:edit`. They are independent: a KYC Verification user can review but not edit, and a Data Operator can edit but not review.

2. **Item Review scope.** Super Admin and Admin can see all drivers, but they can mark KYC items Pass or Issue only on drivers for whom they are the assigned validator. KYC Verification users review only their assigned drivers. The API enforces this for every role.

4. **Final Approval** is a separate administrative action available to Super Admin and Admin. It requires `drivers:edit` and `drivers:assign`. It succeeds only when every reviewable item has passed and the KYC approval readiness checks are satisfied. Reject is not supported and remains a future enhancement.

5. **Assign Reviewer** needs `drivers:assign`. It is performed by Super Admin and Admin.

7. **Driver portal access** is by ownership (the driver's own record), not console permissions. A driver can delete only their own uploaded documents.


