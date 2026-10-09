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
- **KYC Verification:** only current assigned workspace/documents/checklist. 