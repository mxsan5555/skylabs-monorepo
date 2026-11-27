###### 6\. Notifications





|Trigger Event|Channel (Toast / Banner /Email / In-App)|Recipient Role(s)|Title / Subject|Message Copy|Persistence / Dismiss <br />Behavior |
|-|-|-|-|-|-|
|Validator Account Created|Email / SMS|KYC Validator|KYC Access Invitation|Your KYC Verification account has been created.pls sign-in to access your workspace.||
|KYC Application (Driver)Assigned|In-App / Toast|KYC Validator|New Driver's KYC Application Assigned|A new KYC application has been assigned to you for document verification. Please sign in to review the submitted details and documents.|In-app notification remains until viewed or dismissed. Toast disappears automatically|
|Document Review Marked as Issue|In-App / SMS / Email|Driver|KYC Document Correction Required|An issue has been identified in your submitted KYC document. Please sign in to view the issue description and upload the corrected document.|Persist until viewed. Delivery retry should follow the configured retry policy.|
|Corrected Document Resubmitted|In-App / Toast|KYC Validator|Document Resubmitted|A corrected KYC document has been submitted by the driver. Please review the updated document.|In-app notification remains until viewed or dismissed. Toast disappears automatically.|
|All Required Documents Reviewed|In-App / Email|Admin / Super Admin|KYC Review Completed|All required documents for this KYC application have been reviewed. The application is ready for the final KYC decision.|Persist until viewed or dismissed.|
|Final KYC Approved|In-App / SMS / Email|Driver|KYC Verification Approved|Congratulations! Your KYC verification has been approved. Your driver account status is now Active.|Persist in driver notification history.|
|Final KYC Rejected|In-App / SMS / Email|Driver|KYC Verification Update|Your KYC application was not approved. Please sign in to view the decision details and next steps.||
|Review Overdue|Email / In-App|Admin / Super Admin / KYC Validator |KYC Review Pending|A KYC case is awaiting document review beyond the configured target time. Please check the pending application.|Remain until the overdue case is reviewed or resolved.|
|Document Update Reminder – Every 6 Months|SMS / Email / In-App|Driver|KYC Documents Update Required|Your periodic KYC document review is due. Please sign in to your Mera Driver account and check your Aadhaar, (DL), and Police Verification documents. Upload updated or renewed documents wherever required.|Keep reminder visible until the driver views it and completes the required updates.|
|OTP Generated – Login Verification|SMS|Driver / KYC Validator / Admin / Super Admin|Mera Driver Login OTP|Your Mera Driver verification OTP is . It is valid for . Do not share this OTP with anyone.|OTP is valid only for the configured duration. It expires automatically after that duration.|
|OTP Generated – Login Verification|Email|Driver / KYC Validator / Admin / Super Admin|Mera Driver – Login Verification OTP|Hello , Your OTP for Mera Driver account verification is . This OTP is valid for . For your security, do not share this OTP with anyone. Regards, Mera Driver Team.|OTP is valid only for the configured duration. It expires automatically after that duration.|









