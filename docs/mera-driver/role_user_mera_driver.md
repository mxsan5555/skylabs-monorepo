# Mera Driver — Roles, Users aur Default Permission Matrix

**Apps:** `apps/mera-driver` and `apps/mera-driver-api`  
**Date:** 6 October 2026  
**Purpose:** Existing roles ko useful default access dena, aur zarurat par authorized admin ko permissions badalne dena.

> Yeh recommended specification hai. Screenshot, supplied implementation reports aur available Driver Details/Resume sources ke basis par banayi gayi hai. Full RBAC backend, seed aur database yahan available nahi hain; neeche ke defaults abhi application mein apply nahi hue hain. Implementation ke time actual permission keys, role IDs aur module routes inspect karke existing system reuse karein.

## 1. Sabse pehle simple example

Maan lijiye Ramesh ne website se Become a Driver form bhara:

| Step | Kaun karega? | Kya kar sakega? |
| --- | --- | --- |
| Application aayi | System | Driver record banega; portal login apne aap nahi banega. |
| Profile complete | Data Operator | Apne assigned driver ka address, DOB, DL aur documents bharega. |
| Review assign | Admin | Driver ko KYC Verification user se link karega. |
| Documents review | KYC Verification | Sirf assigned driver ke documents dekhega; Pass/Issue aur reason save karega. |
| Verify DL | Assigned KYC reviewer, ya explicitly authorized Admin | Saved DL/DOB se existing IDSPay action chalayega. Latest agreed flow mein consent/OTP/linked login prerequisite nahi hai. |
| Issue resolve | Driver, agar login bana hai; otherwise assigned Data Operator | Allowed corrections/resubmission karega. Changed fields ki affected checks dobara pending hongi. |
| Final human KYC | Admin | Required onboarding, current licence aur current checks pass hone par explicit final approval karega. |
| Driver User banana | Admin | Current successful DL verification ke existing rule ke baad same Driver se optional login link karega. |
| Booking aur dispatch | Customer + authorized dispatch staff | Customer booking karega; eligible driver accept karega, ya staff reason ke saath assign karega. |
| Payment/commission | Authorized Admin | Actual received payment/settlement ko audited Accounts workflow mein record karega. |

**Important:** DL success, human KYC approval, registration-fee payment, Master Driver Status, login status aur trip readiness alag cheezein hain. Ek permission ya status change se sab automatically approved nahi honge.

## 2. Final roles — 9 Internal, 2 External

User ki latest list is specification ki authoritative role list hai. Contributor aur Sales / Marketing is default matrix ka part nahi hain; existing database records ko automatically delete/deactivate nahi karna hai.

| Category | Role | Existing key to verify/reuse | Default scope/responsibility |
| --- | --- | --- | --- |
| Internal | Super Admin | `superadmin` | Platform control; applicable access; protected history/business validations remain |
| Internal | Admin | `admin` | Platform daily operations, KYC assignment/final approval, dispatch, Accounts |
| Internal | Vendor | `vendor` | Proposed: explicitly linked vendor drivers, documents aur vendor bookings only |
| Internal | Marketing | `marketing` | Own/assigned campaigns, leads aur content |
| Internal | Sales | `sales` | Assigned customers/bookings; limited eligible-driver operational view |
| Internal | Company | `company` | Proposed: verified company profile, company bookings/fleet; limited driver view |
| Internal | Data Operator | `data_operator` | Assigned driver/customer onboarding aur document entry |
| Internal | Support | `support` | Assigned support cases aur related operational summaries |
| Internal | KYC Verification | `kyc_verification` | Assigned checklist/documents aur explicit Verify DL |
| External | Customer | `customer` | Own profile, bookings, payments/invoices aur support |
| External | Driver | `driver` | Own profile/KYC/documents, assigned requests/trips aur own earnings |

Actual seed mein agar `super_admin` ya koi aur alias hai, persisted ID/key reuse karein; duplicate role/automatic rename na karein.

Vendor aur Company internal roles hain, user ki classification ke according. Internal category ka matlab saare platform records ka access nahi. Proposed Vendor/Company relationships supplied backend sources se confirmed nahi; relation/authorized endpoint missing ho to related capability disabled rahe jab tak implement na ho.

## 3. Matrix kaise padhein?

| Code | Meaning |
| --- | --- |
| `V` | View: allowed data dekhna |
| `C` | Create: naya allowed record banana |
| `E` | Edit: allowed fields update karna |
| `D` | Delete: sirf deletable draft/unreferenced configuration; protected history delete nahi |
| `L` | Limited view: operational summary, public approved fields; private KYC/bank details nahi |
| `—` | Default access nahi |

`L` koi fifth permission checkbox nahi hai. Yeh View permission ke saath response fields aur record scope ki requirement hai. `VCE` ka matlab teen independent permissions hain; Edit check karne se View/Create automatically check nahi honge.

**Record scope alag enforce hoga:** All records / Assigned records / Own records / Verified company records. Permission check hone se scope automatically All nahi banega.

Neeche logical modules hain. Existing menu mein jo feature available nahi hai usko enabled empty page ya fake data ke saath expose na karein. Implementation mein actual existing modules/keys se mapping banegi.

## 4. Default internal matrix — daily operations

Sabhi 9 internal roles ka Dashboard V aur Own Profile VE hoga. Dashboard data/widgets role ke allowed scope ke according honge.

| Module | Super Admin | Admin | Vendor | Marketing | Sales | Company | Data Operator | Support | KYC Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | V | V | V | V | V | V | V | V | V |
| Customers: basic profile/follow-up | VCE | VCE | L | L | VCE | L | VCE | L | — |
| Drivers: operational list/summary | VCE | VCE | VCE | — | L | L | VCE | L | — |
| Driver onboarding: private details | VCE | VCE | VCE | — | — | — | VCE | — | — |
| Current onboarding documents/version upload | VCE | VCE | VCE | — | — | — | VCE | — | — |
| Driver Users: create/link/manage login | VCE | VCE | — | — | — | — | — | — | — |
| Customer Users: create/link/manage login | VCE | VCE | — | — | — | — | — | — | — |
| KYC assignment list | VCE | VCE | — | — | — | — | — | — | V |
| Assigned KYC review workspace | VE | VE | — | — | — | — | — | — | VE |
| KYC review document preview/history | V | V | — | — | — | — | — | — | V |
| Bookings: permitted fields | VCE | VCE | VE | — | VCE | VCE | — | L | — |
| Dispatch / assignment history | V | V | L | — | V | L | — | L | — |
| Trips: progress/details | VE | VE | L | — | L | L | — | L | — |
| Vehicles: operational management | VCE | VCE | VCE | — | L | VCE | VCE | — | — |
| Driver Locations: operational view | V | V | — | — | — | — | — | L | — |
| Attendance | VCE | VCE | — | — | — | — | — | — | — |
| Support cases / Feedback | VCE | VCE | VC | — | V | VC | — | VCE | — |
| Own Profile | VE | VE | VE | VE | VE | VE | VE | VE | VE |

Scope:

- **Super Admin / Admin:** authorized platform records. Super Admin ki applicable permissions future modules tak existing bypass behavior se extend hoti hain; normal workflow guards remain.
- **Vendor:** explicitly linked vendor drivers/vehicles aur vendor booking context. Create se naya record vendor se server-side link ho; existing unrelated Driver ID attach karne ka access nahi. Driver login creation, KYC verdict, bank/payout fields ya collection powers nahi. Documents access permitted onboarding categories only.
- **Marketing:** own/assigned campaign leads; minimal contact/follow-up data.
- **Sales:** assigned customers/bookings; allowed selection context mein operational driver summary only.
- **Company:** verified company profile/bookings/vehicles. Driver view approved operational fields only, private KYC/bank/documents nahi.
- **Data Operator:** assigned onboarding records aur configured related vehicles. Review verdict/finance/account powers nahi.
- **Support:** assigned support case se related summaries/needed live trip view; unrelated records/locations nahi.
- **KYC Verification:** only current assigned workspace/documents/checklist. General Drivers menu, full internal PDF, bank details aur Accounts nahi. Reassignment par old verifier access revoke ho.

### Existing routes ki necessary boundary

Supplied report mein `drivers:view` se `GET /drivers/:id/details` par complete private details milte hain. Sales/Support/Company ke L ko directly broad `drivers:view` mein map na karein. Vendor/Data Operator ke restricted fields/scope bhi backend par enforce hon. Existing operational/public projection reuse karein; missing enforcement ke case mein relevant capability disabled rahe.

`drivers:edit` se final-approval endpoint accessible ho sakta hai. Vendor/Data Operator ko onboarding Edit milne se final approval nahi milna chahiye; section 7 ka separation enforce karein.

## 5. Default internal matrix — Accounts, Masters aur Administration

| Module | Super Admin | Admin | Vendor | Marketing | Sales | Company | Data Operator | Support | KYC Verification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Accounts Overview: platform income/bookings/commission | V | V | — | — | — | — | — | — | — |
| Registration fee records | VC | VC | L | — | L | — | L | L | — |
| Booking payment records | VC | VC | L | — | L | L | — | L | — |
| Commission / driver payable | VC | VC | — | — | — | — | — | — | — |
| Driver payout records | VC | VC | — | — | — | — | — | — | — |
| Refund/recovery/adjustment records | VC | VC | — | — | — | — | — | — | — |
| Accounts reports | V | V | — | — | — | — | — | — | — |
| Pricing / fee / commission policies | VE | VE | — | — | V | V | — | — | — |
| Driver Masters / Trip Types / Cancellation Reasons | VCED* | VCED* | V | — | V | V | V | — | V |
| Promotions / campaign content | VCED* | VCED* | — | VCE | — | — | — | — | — |
| FAQs / permitted content | VCED* | VCED* | V | VCE | V | V | V | V | — |
| Role Management | VCE | — | — | — | — | — | — | — | — |
| Staff User Management | VCE | VCE | — | — | — | — | — | — | — |
| Audit Logs | V | V | — | — | — | — | — | — | — |
| Global/system settings | VE | — | — | — | — | — | — | — | — |

`D*`: Unreferenced Master/draft content only. Used Master deactivate karein. Bookings, document versions, KYC decisions, audit logs aur ledger hard-delete nahi honge, even for Super Admin. Role deletion only unused unprotected custom roles par existing safe guard ke according; protected system roles retain hon.

Notes:

- Vendor/Sales/Company/Support ka payment L sirf permitted record ka amount/status; actual platform Accounts menu/totals/bank/commission access nahi.
- Data Operator fee details/receipt draft enter kar sakta hai, actual collection confirm nahi. Vendor document access fee/bank files expose na kare.
- Company ka apni booking Pay action owned payment flow use kare; platform collection confirmation permission nahi.
- Master V selection-options read hai; full Masters administration screen dena zaroori nahi.
- Admin Role Management default off. Super Admin optionally scoped delegation de sakta hai; Admin apni privilege level khud increase nahi karega.
- System settings Super Admin controlled; provider secrets browser payload mein kabhi na aayein.

## 6. External role matrix — Customer aur Driver

Sirf Customer aur Driver external category mein hain. Dono dedicated existing portal shell aur own-data APIs use karein.

| Feature | Customer | Driver |
| --- | --- | --- |
| Dashboard | V: own bookings | V: own KYC/trips/earnings |
| My Profile | VE | VE: allowed corrections |
| New Booking | C: own | — |
| Booking list/detail | V: own | V: assigned trip context |
| Modify/cancel booking | E: existing policy permits | — |
| Driver selection/public information | L: approved candidates | — |
| KYC status/issues | — | V: own |
| Documents correction/resubmission | — | CE: own allowed files/fields |
| Current/previous documents preview | — | V: own |
| Resume preview/download | — | V: own shareable resume |
| Internal full Driver report | — | — |
| Trip offer Accept/Decline | — | E: own active offer |
| Trip progress | V: own booking | VE: assigned trip transitions |
| Online / Offline availability | — | E: own |
| Payments/invoice | V + Pay: own booking | V + Pay: own fee |
| Earnings/payout history | — | V: own |
| Own support cases | VC | VC |
| Administration / Roles / Staff Users / Platform Accounts | — | — |

Cancel/Accept/Pay/Download special workflow actions hain; generic arbitrary record Edit permission nahi. Provider payment verification, cancellation policy aur trip-transition guards remain.

Customer ko DL number, DOB, full address, private documents, raw provider result ya bank details nahi. Driver ko kisi doosre driver ka data nahi. Own endpoints ke liye broad staff `drivers:view`/`drivers:export` dena zaroori nahi.

## 7. Workflow actions ke defaults — CRUD se alag samjhein

Main permission matrix mein **View / Create / Edit / Delete** ke 4 independent columns rakhein. Existing `assign`, `status_change`, `export` aur other workflow permission checks remove na karein. Role ke andar ek labelled **Special Actions** section rakhein; actual existing keys se map karein.

| Special action | Super Admin | Admin | Baaki default access |
| --- | --- | --- | --- |
| KYC reviewer assign/reassign | Yes | Yes | No |
| Assigned checklist Pass/Issue | Yes | Yes: existing explicit admin review authority | KYC Verification: assigned only |
| Explicit Verify DL / deliberate retry | Yes | Yes: existing explicit admin authority | KYC Verification: assigned only |
| Final human KYC approval | Yes | Yes | No, KYC verifier/Data Operator ko bhi nahi |
| Create/link Driver User | Yes | Yes | No |
| Create/link Customer User | Yes | Yes | No |
| Driver business Master status change | Yes | Yes, reason required | No; Data Operator can request correction |
| Login suspend/reactivate | Yes | Yes, allowed managed accounts | No |
| Driver assign/reassign to booking | Yes | Yes | Sales: off by default; grant on need within assigned bookings |
| Staff cancellation of booking | Yes | Yes, policy/reason | Sales/Support: request only by default |
| Record actual cash/settlement | Yes | Yes, existing audited workflow | No |
| Refund / payout / waiver / recovery confirmation | Yes | Yes, existing balance/evidence rules | No |
| Pricing/fee/commission policy change | Yes | Yes, audited | No |
| Staff Driver Resume PDF | Yes | Yes | Others off; own Driver resume is separate |
| Full internal Driver Report / bulk export | Yes | Yes | Others off |
| Accounts export | Yes | Yes | Others off |
| Publish campaign/content | Yes | Yes | Marketing: off by default; optionally grant |
| Change role permissions / assign privileged role | Yes | Off by default | No |

### Important existing-key collision: final KYC approval

`ONBOARDING-SAVE-FIX-REPORT.md` describes `POST /drivers/:id/kyc-approval` as protected by `drivers:edit`. Vendor/Data Operator ko onboarding Edit chahiye, lekin final KYC approval nahi. Sirf UI button hide karna enough nahi.

Implementation requirement: existing explicit final-approval authorization inspect karein. Agar still generic `drivers:edit` alone hai, existing RBAC mein approval-specific authorization add/reuse karein aur endpoint par enforce karein. General onboarding-edit + final-approval capability alag ho. Agar existing role guard already correct hai, usko preserve aur test karein. New RBAC architecture na banayein.

### Important existing-key collision: Resume aur full report

Supplied report mein shareable resume aur full internal report dono staff PDF routes par `drivers:export` use karte hain. Sales ko sirf resume dena ho to generic export grant se full report bhi mil sakta hai. Actual keys/guards inspect karke separate capability/allowlisted endpoint protection implement karein, ya staff resume export off rakhein jab tak separation available nahi ho.

### DL verification aur readiness

- Latest agreed October 5 flow follow karein: explicit Verify DL ko consent/OTP/phone/linked login prerequisite nahi chahiye.
- Reviewer assignment ya explicit admin authority, saved DL/DOB checks aur existing retry/idempotency guards retain karein.
- Provider name mismatch ko reviewer-visible issue rakhein; validity success ko identity match ya final human KYC success na maanein.
- Driver User creation optional hai; existing current successful DL gate preserve karein. Login create se automatic final approval/payment/trip readiness nahi.
- Older uploaded reports ki consent-required/disabled-provider statements historical hain; current live provider acceptance is document se verify nahi hoti.

## 8. Role Management screen user friendly kaise rahega?

Existing cards, forms, buttons aur table components reuse karein.

| Screen area | Kya dikhana hai? |
| --- | --- |
| Left roles list | Existing roles + short responsibility + active/inactive badge |
| Selected role header | “Data Operator — profile aur documents entry” |
| Scope summary | “Assigned drivers/customers only” |
| Grouped modules | Drivers, Customers, Bookings & Trips, Accounts, Masters, Content, Administration |
| Main matrix | Module / View / Create / Edit / Delete |
| Special Actions | Assignment, verification, final approval, export, settlement jaise existing actions ke simple labels |
| Dashboard Widgets | Sirf widgets jinke underlying APIs role ko permitted hain |
| Change summary | “2 access added, 1 removed; affects 4 users” |
| Save | Existing Save Changes; sensitive permission change ke liye reason |
| Optional restore action | “Restore this role's defaults”, explicit confirmation aur affected access summary |

Data Operator example:

| Module | View | Create | Edit | Delete |
| --- | --- | --- | --- | --- |
| Assigned Driver Onboarding | ✓ | ✓ | ✓ | — |
| Assigned Onboarding Documents | ✓ | ✓ | ✓ | — |
| Assigned Customer Onboarding | ✓ | ✓ | ✓ | — |
| Driver Master options | ✓ | — | — | — |
| Accounts | — | — | — | — |
| Role Management | — | — | — | — |

Neeche help text: **“Aap assigned records ki details bhar sakte hain. KYC final approval, login creation aur payment confirmation ke liye Admin se contact karein.”**

Dashboard/Reports jaise read-only module ki C/E/D cells disabled “Not applicable” ho sakti hain; unsupported API actions invent na karein. Group “Select all” sirf applicable visible permissions check kare, hidden sensitive actions nahi. Parent/child ya View/Edit permissions apne aap propagate na hon.

Super Admin matrix read-only rahe, screenshot ke current behavior ki tarah. Ordinary role ke clone ko Super Admin bypass na mile. Protected last Super Admin ko deactivate/delete/demote na kar sakein.

## 9. User create karte time default access

Example: Suman ko Data Operator banana hai.

1. Staff User Management mein basic user details bharein.
2. Role dropdown se **Data Operator** select karein.
3. Preview dikhaye: assigned onboarding View/Create/Edit; Accounts/approval/login creation off.
4. Existing assignment flow se permitted drivers/customers assign karein. Agar assignment model abhi nahi hai, pehle reuse/additive support implement karein; UI label se fake scope claim na karein.
5. Save ke baad sidebar sirf permitted modules dikhaye.

User ko role ke **current saved permissions** milenge. Role ke starting defaults already matrix mein set rahenge; user create karte time har checkbox dobara select nahi karna padega.

Driver Users sirf Drivers/Driver Users flow se manage hon aur same Driver ID se linked hon. Customer Users sirf Customers/Customer Users flow se manage hon. Dono general staff User Management list mein na dikhein. Existing booking/KYC/payment history same records par rahe.

Har active role ko own Profile aur Logout milna chahiye. Assigned KYC verifier ka dashboard “My assigned reviews” dikhaye; general Driver Details permission na maange.

## 10. Zarurat par permission kaise denge?

### Example A — saare Sales users ko dispatch dena

Super Admin → Role Management → Sales → Special Actions → “Assign driver to assigned booking” enable → reason → Save.

Result: saare Sales users apni assigned bookings mein eligible driver assign kar sakenge. Other bookings, private KYC docs aur Accounts access nahi milega. Backend readiness/overlap rules same rahenge.

### Example B — sirf Rahul ko dispatch dena

Existing system mein per-user overrides supported hon to Rahul par **Allow** override dein. Supported na ho to Sales role clone karke **Sales — Dispatch** banayein, sirf required special action add karein aur Rahul ko woh role assign karein. Puri Sales team ko extra access na dein.

Per-user UI optional hai: **Use role default / Allow / Deny**. Naya override model bina existing RBAC inspect kiye introduce na karein.

### Example C — finance work ke liye Support user ko temporary responsibility

Support role ko broad Accounts Edit na dein. Existing Support clone par sirf required Accounts view/receipt action aur scope grant karein. Refund/payout/role-management/final-KYC powers separately off rahenge. Agar existing expiry support ho to end date dein; otherwise admin review date note karein, automatic expiry ka claim na karein.

### Effective access ka proposed rule

For ordinary users: active account → active role grants union → explicit user Allow/Deny if supported → module permission → record ownership/assignment → allowed fields → workflow validation.

- User-level Deny ho to ordinary role Allow se usko override na karein.
- Multiple roles ke scopes ko per capability retain karein; ek module ka All scope doosre module par apply na ho.
- External portal ownership boundaries aur internal Vendor/Company relation scopes ordinary permission grants se widen na karein. Privileged staff account/role change ek explicit separate administrative decision ho.
- Role edit existing scope, reviewer assignment, company ownership, ledger immutability ya final-approval prerequisites bypass nahi karega.
- Current existing permission semantics alag hon to migration/compatibility plan banayein; silent behavior change na karein.

## 11. Defaults save hon, seed dobara custom changes overwrite na kare

Recommended behavior:

1. Existing persisted role IDs/keys reuse karein.
2. New role first time create ho to is matrix ke supported permissions prefill hon.
3. Existing roles par matrix apply karne ke liye one-time, versioned, reviewed migration/update use karein; current-vs-proposed diff banayein. Existing custom grants silently reset na karein.
4. Normal seed/start/build missing baseline rows/configuration safely ensure kare; saved user choices/defaults overwrite na kare.
5. Naya module ordinary roles ke liye default off; Super Admin applicable access current behavior se retain kare.
6. Custom saved permissions reload/login/restart ke baad same rahein.
7. Restore Defaults optional explicit operation ho, seed ka side effect nahi. Selected role only; user overrides ka impact clear dikhayein.
8. Role changes audit hon: actor, target role, added/removed actions, scope, reason, timestamp. Permission edits ke baad cache/session bootstrap invalidate ho.

Role off karne se us role ke grants stop hon. Active alternate role hai to sirf uske valid grants remain karein. Account suspended hai to poora authenticated business access stop ho, chahe old token mein permission ho.

## 12. Backend aur frontend mein kaise apply karna hai?

### `apps/mera-driver-api`

- First inspect existing role/permission schema, seed, bootstrap/menu builder, authentication, permission middleware aur ownership checks.
- Upar ke logical modules ko actual existing keys se map karein. Available source confirms `drivers:create`, `drivers:view`, `drivers:edit`, `drivers:export`; baaki exact keys invent na karein.
- Ek existing server-side permission resolver reuse karein. Browser-provided role/owner/company/user IDs par trust na karein.
- List/count/search/export/PDF/document endpoints mein same scope enforce ho; full records fetch karke browser filtering na ho.
- Sensitive field projection apply ho. Generic list/view se DL/DOB/bank/documents Sales/Support ko leak na hon.
- Assignment backend model missing ho to smallest additive existing-compatible change karein; unassigned staff ko default no assigned data mile.
- Final KYC, DL calls, Driver User link, status change, dispatch, settlements aur exports ke distinct existing guards preserve/harden karein.
- Company/Vendor scope verified server-side relation se resolve ho; missing relation/enforcement wali capability disabled rahe.
- Accounts ledger/provider/webhook/idempotency rules retain karein. Admin Edit permission se online payment paid na ho.
- No database reset, broad delete, dummy-data se permission verification ya unrelated app changes.

### `apps/mera-driver`

- Existing Role Management, forms, dialogs, admin/driver/customer shells aur DataTable reuse karein.
- Permission-driven sidebar/bootstrap use karein; page aur button checks backend effective permissions ke same hon.
- Limited operational view ko private full Driver Details component/API se na connect karein.
- Role responsibilities, scope help text, grouped 4-column matrix, labelled Special Actions aur change preview dikhayein.
- No access ke case mein clear message ho; empty table ko “no records” batakar permission problem hide na karein.
- Dashboard widgets underlying allowed scoped APIs use karein. Hidden sidebar se API authorization assume na karein.
- Existing login redirect to original permitted page preserve ho; denied destination ke liye role ka allowed dashboard khule.

## 13. Implementation acceptance examples

| Scenario | Expected result |
| --- | --- |
| Fresh Data Operator role defaults | Assigned onboarding V/C/E; Accounts/approval/login creation off |
| Data Operator calls final KYC URL directly | Denied; generic onboarding Edit se approve nahi |
| Verifier A opens Verifier B assigned driver by URL/API | Denied, even PDF/document/review endpoints par |
| Driver reassign from A to B | A loses access; B gets current assigned review access |
| Verifier submits Pass/Issue | Saved/audited; final KYC unchanged until authorized approval |
| Verify DL without consent/portal login | Allowed for assigned reviewer/explicit Admin; existing DL/DOB/provider guards retained |
| DL holder-name mismatch | Visible review issue; automatic identity/final approval nahi |
| Driver creates/reads another driver's own endpoint | Denied; linked identity server se resolve ho |
| Customer changes booking/customer ID | Other customer's data/mutation denied |
| Company changes companyId | Other company records denied |
| Vendor opens unrelated driver or platform Accounts | Denied; linked-driver scope only; no platform ledger powers |
| Support views permitted booking | Only related operational summary; no private docs or platform totals |
| Sales receives dispatch special action | Assigned booking only; normal readiness/conflict rules apply |
| Driver fee form selects Paid | Draft entry alone ledger-paid nahi; actual confirmation guard required |
| Admin tries ledger/KYC/audit hard delete | Denied; existing immutable history retained |
| Ordinary role changes + reload/reseed | Saved custom grants retained; defaults overwrite nahi |
| Permission revoked while token active | API + refreshed menu reflect removal; stale claims bypass nahi |
| Edit without View checkbox | Permissions remain independent; unauthorized GET still denied |
| Limited users open staff PDF/export directly | Denied; no full-report access through resume shortcut |
| General staff User Management | Driver/Customer accounts excluded; dedicated lists retain records |
| Super Admin clone or last-account removal | Clone has no automatic bypass; last owner protection holds |

Run focused RBAC/ownership/approval/export regression tests, both app checks/builds aur browser role checks. Existing reports ke historical test counts ko new verification ke result ki tarah report na karein.

## 14. Supplied evidence aur current limits

| Source | Is document mein use |
| --- | --- |
| Latest user role list + `image(8).png` | Final 9 internal/2 external classification; existing Super Admin behavior and modules |
| `DRIVER-LIST-LAYOUT-REPORT.md` | Existing DataTable, 4 cards, permission-checked actions, `drivers:create` |
| `DRIVER-DETAILS-REPORT.md` | Full details route, protected docs, shareable/internal PDF difference, current export key |
| `DRIVER-RESUME-REPORT.md` | Staff vs own resume routes aur permissions |
| `ONBOARDING-SAVE-FIX-REPORT.md` | Generic `drivers:edit` final-approval coupling requiring inspection |
| `REGISTRATION-FEE-FORM-REPORT.md` | Master status/login/KYC separation; draft Paid vs audited actual collection |
| `DISPATCH-ACCOUNTS-SCALE-REPORT.md` | Assigned booking/dispatch, bounded data queries, ledger/COD/commission boundaries |
| `WORKFLOW-IMPLEMENTATION-REPORT.md` | Existing portal ownership, KYC review, Accounts, protected data workflows |
| Visible latest project decisions | October 5 consentless explicit DL flow, optional login creation |

Yeh file role defaults aur user-friendly usage ka proposal/specification hai. Full application code/database inspect kiye bina existing production permissions, missing company/vendor features ya live provider acceptance implemented/verified nahi maane gaye hain.
