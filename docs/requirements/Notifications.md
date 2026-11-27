###### 6\. Notifications





|Trigger Event|Channel (Toast / Banner /Email / In-App)|Recipient Role(s)|Title / Subject|Message Copy|Persistence / Dismiss <br />Behavior |
|-|-|-|-|-|-|
|Validator Account Created (invitation and activation process: Pending Confirmation)|Email / SMS|KYC Validator|KYC Access Invitation|Hello {{validator_name}}, your KYC Verification account has been created. Please sign in to access your workspace.|Pending Confirmation|
|KYC Application (Driver) Assigned|In-App / Toast|KYC Validator|New Driver's KYC Application Assigned|A new KYC application for {{driver_name}} has been assigned to you for document verification. Please sign in to review the submitted details and documents.|In-app notification remains until viewed or dismissed. Toast disappears automatically|
|Document Review Marked as Issue|In-App / SMS / Email|Driver|KYC Document Correction Required|Hello {{driver_name}}, an issue has been identified in your submitted KYC document ({{document_name}}): {{issue_description}} Please sign in to view the details and upload the corrected document.|Persist until viewed. Delivery retry should follow the configured retry policy (retry policy: Pending Confirmation).|
|Corrected Document Resubmitted|In-App / Toast|KYC Validator|Document Resubmitted|{{driver_name}} has submitted a corrected KYC document ({{document_name}}). Please review the updated document.|In-app notification remains until viewed or dismissed. Toast disappears automatically.|
|All Required Documents Reviewed|In-App / Email|Super Admin (Proposed: final decision authority)|KYC Review Completed|All required documents for the KYC application of {{driver_name}} have been reviewed. The application is ready for the final KYC decision.|Persist until viewed or dismissed.|
|Final KYC Approved|In-App / SMS / Email|Driver|KYC Verification Approved|Congratulations {{driver_name}}! Your KYC verification has been approved.|Persist in driver notification history.|
|Final KYC Rejected (Proposed; Reject is not currently supported)|In-App / SMS / Email|Driver|KYC Verification Update|Hello {{driver_name}}, your KYC application was not approved. Reason: {{rejection_reason}} Please sign in to view the decision details and next steps.|Persist in driver notification history (Proposed).|
|Review Overdue (target time: Pending Confirmation)|Email / In-App|Admin / Super Admin / KYC Validator |KYC Review Pending|The KYC case of {{driver_name}} is awaiting document review beyond the configured target time. Please check the pending application.|Remain until the overdue case is reviewed or resolved.|
|Document Update Reminder – Every 6 Months (interval: Proposed)|SMS / Email / In-App|Driver|KYC Documents Update Required|Hello {{driver_name}}, your periodic KYC document review is due. Please sign in to your Mera Driver account and check your Aadhaar, Driving Licence (DL) and Police Verification documents. Upload updated or renewed documents wherever required.|Keep reminder visible until the driver views it and completes the required updates.|
|OTP Generated – Login Verification|SMS|Driver / KYC Validator / Admin / Super Admin|Mera Driver Login OTP|Your Mera Driver verification OTP is {{otp}}. It is valid for {{expiry_time}}. Do not share this OTP with anyone.|OTP is valid only for the configured duration. It expires automatically after that duration. Duration and resend limits: Pending Confirmation.|
|OTP Generated – Login Verification|Email|Driver / KYC Validator / Admin / Super Admin|Mera Driver – Login Verification OTP|Hello {{user_name}}, Your OTP for Mera Driver account verification is {{otp}}. This OTP is valid for {{expiry_time}}. For your security, do not share this OTP with anyone. Regards, Mera Driver Team.|OTP is valid only for the configured duration. It expires automatically after that duration. Duration and resend limits: Pending Confirmation.|

6.1 Email Templates

All templates are drafts. Subject lines match the Title / Subject column above. Placeholders are listed in 6.3.

**KYC Access Invitation** (Proposed)

* Subject: KYC Access Invitation
* Body:

```
Hello {{validator_name}},

Your KYC Verification account has been created. Please sign in to access your workspace.

Regards,
Mera Driver Team
```

**KYC Correction Required** (Proposed)

* Subject: KYC Document Correction Required
* Body:

```
Hello {{driver_name}},

An issue has been identified in your submitted KYC document ({{document_name}}).

Issue: {{issue_description}}

Please sign in to your Mera Driver account to view the details and upload the corrected document.

Regards,
Mera Driver Team
```

**KYC Approved** (Proposed)

* Subject: KYC Verification Approved
* Body:

```
Hello {{driver_name}},

Congratulations! Your KYC verification has been approved.

Regards,
Mera Driver Team
```

**KYC Rejected** (Proposed; Reject is not currently supported)

* Subject: KYC Verification Update
* Body:

```
Hello {{driver_name}},

Your KYC application was not approved.

Reason: {{rejection_reason}}

Please sign in to your Mera Driver account to view the decision details and next steps.

Regards,
Mera Driver Team
```

**Document Update Reminder** (Proposed; interval Pending Confirmation)

* Subject: KYC Documents Update Required
* Body:

```
Hello {{driver_name}},

Your periodic KYC document review is due. Please sign in to your Mera Driver account and check your Aadhaar, Driving Licence (DL) and Police Verification documents.

Upload updated or renewed documents wherever required.

Regards,
Mera Driver Team
```



6.3 Notification Rules

&#x09;\* **Final decision authority (Proposed):** final KYC approval and rejection belong to the Super Admin. The KYC Validator has no final approval or rejection authority.

&#x09;\* **Validator scope:** a KYC Validator reviews only the driver cases assigned to them and receives notifications only for those cases.

&#x09;\* **Account activation:** the notification copy does not state that the driver account becomes Active after KYC approval. Automatic activation is not assumed (see 6.4).

&#x09;\* **Recipients:** roles listed in the table are the intended recipients. Actual access depends on permissions and record scope.

&#x09;\* **Reject:** the current KYC workflow does not support Reject. The Final KYC Rejected row and the KYC Rejected email are proposed only.

6.4 Pending Notification Decisions

|#|Decision|Current proposal|Status|
|-|-|-|-|
|2|Driver account activation after KYC approval|Not assumed. Approval currently sets the KYC status to Verified and does not activate the account.|Pending Confirmation|
|3|Six-month document update reminder interval|Six months|Proposed|
|6|Notification channels|As listed in the table; Toast and Banner not implemented|Pending Confirmation|
|11| {{rejection_reason}} is shown to the driver|Shown in the draft|Pending Confirmation|



