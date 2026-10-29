# Mera Driver — Demo Data & Manual Testing Guide

Covers the Customer → Driver → Admin booking lifecycle end-to-end, across every supported
service (Local, One Way, Round Trip, Outstation, Hourly, Monthly), against real backend data.
Nothing described here is hardcoded in the frontend — every number, option and driver comes
from the real database through the real APIs.

## 1. Setup

Run against your **local** `mera-driver-api` database only. The script has two independent
safety gates, neither overridable into production:

- Refuses to run at all if `NODE_ENV=production` — no flag can bypass this.
- Refuses to run against a non-`localhost`/`127.0.0.1` `DATABASE_URL` unless you explicitly
  set `ALLOW_DEMO_SEED=true` (for a genuinely safe non-production host, e.g. a Docker service
  name) — this never overrides the `NODE_ENV` gate above.

```bash
npm run mera-driver-api:prisma:seed-demo
```

Safe to rerun any time — every record is looked up by a fixed demo identifier (email/phone/
`clientRequestId`/movement `reference`) and updated in place rather than duplicated. It never
truncates anything, never touches a real record, and is never invoked by `prisma db seed`,
build, migrate, or app startup.

To remove *only* the demo records it created (drivers, customers, bookings, their documents/
movements, and the 7 demo fare rules — master lists like languages/driver-types/job-types/
vehicle-types/zones/trip-types are left in place as Super-Admin-managed reference data):

```bash
npm run mera-driver-api:prisma:seed-demo -- --cleanup
```

**Non-secret config needed**: nothing beyond what the app already needs to run
(`DATABASE_URL` pointed at your local `mera_driver` DB). Optional: set `OTP_DEV_LOG=true` in
`apps/mera-driver-api/.env.local` to see login OTPs in the API's console instead of sending
real SMS/email (see §4) — **leave it `false`/unset normally**; a stray `true` here also gets
picked up by `nx test` (Nx auto-loads `.env.local`) and will break the real OTP-delivery test
suite, so only flip it on for an active manual-testing session and back off afterward.

## 2. What gets created

**Master data** (additive only — reuses the real `MasterListItem`/`VehicleType`/`ServiceZone`/
`TripType` tables, never a parallel system):
- Driver skill (`driver-types`): "Car Driver"
- Job types (`job-types`): "Full Time", "Part Time"
- Vehicle types: Sedan, SUV, Hatchback
- Zones: "Delhi NCR", "Mumbai"
- Trip types: Local, One Way, Round Trip, Outstation, Hourly, Monthly

**7 fare rules**, all 15% commission (1500 bps), all requiring the "Car Driver" skill:

| Zone | Service | Vehicle | Base | Per km | Per min | Min fare | Allowance | Extra requirement |
|---|---|---|---|---|---|---|---|---|
| Delhi NCR | Local | Sedan | ₹80 | ₹14 | ₹1.5 | ₹100 | — | — |
| Delhi NCR | One Way | Sedan | ₹200 | ₹30 | ₹5 | ₹200 | — | — |
| Delhi NCR | Round Trip | SUV | ₹300 | ₹25 | ₹4 | ₹400 | — | — |
| Delhi NCR | Outstation | SUV | ₹500 | ₹18 | ₹2 | ₹800 | ₹300 | — |
| Delhi NCR | Hourly | Sedan | ₹0 | ₹0 | ₹5 | ₹150 | — | Driver must be Part Time |
| Delhi NCR | Monthly | Sedan | ₹0 | ₹0 | ₹0 | ₹15,000 | — | Driver must be Full Time |
| Mumbai | Local | Sedan | ₹80 | ₹14 | ₹1.5 | ₹100 | — | — |

**Hourly and Monthly use the existing pricing formula as-is — no new business rule was
invented for either**:
- *Hourly* bills purely through `perMinRate` (₹5/min = ₹300/hr); `durationMinutes` is the
  requested duration. This is a real per-minute rate, not a fabricated "hourly engine."
- *Monthly* zeroes every per-distance/per-minute term, so `minFare` (₹15,000) alone becomes
  the flat price regardless of the one-time pickup trip's distance/duration — a genuinely
  supported configuration of the existing `max(minFare, (base + perKm·km + perMin·min +
  allowance) × surge)` formula, not a short trip silently billed as the whole month.

**12 driver profiles** (9 eligible, 3 deliberately excluded):

| Driver | City | Vehicle | Job type | Languages | Fee | Online |
|---|---|---|---|---|---|---|
| Ramesh Kumar | Delhi NCR | Sedan, SUV | Full Time | Hindi, English | Required · Paid | Yes |
| Suresh Yadav | Delhi NCR | SUV | Full Time | Hindi, Punjabi | Not required | Yes |
| Manoj Singh | Delhi NCR | Hatchback, Sedan | Full Time | Hindi, Bhojpuri | Required · Paid | Yes |
| Rajesh Verma | Delhi NCR | Sedan | Part Time | Hindi, English | Required · Paid | Yes |
| Vikram Rathore | Delhi NCR | SUV | Full Time | Hindi, Marathi | Not required | Yes |
| Arjun Nair | Delhi NCR | Sedan | Part Time | Hindi, Tamil, English | Required · Paid | Yes |
| Deepak Chauhan | Delhi NCR | Sedan, SUV | Full Time, Part Time | Hindi, English | Required · Paid | Yes |
| Sanjay Gupta | Mumbai | Sedan | Full Time | Hindi, Marathi, English | Required · Paid | Yes |
| Irfan Shaikh | Mumbai | Sedan | Part Time | Hindi, Urdu | Not required | Yes |
| Amit Kumar | Delhi NCR | — | — | — | — | — (onboarding incomplete, KYC `Non-Verified`, **no portal login** — excluded from every search) |
| Naveen Reddy | Delhi NCR | Sedan | Full Time | Hindi, Telugu | Required · Paid | **No** (excluded — offline) |
| Kiran Mehta | Delhi NCR | Sedan | Full Time | Hindi, Gujarati | Required · **Unpaid** | Yes (excluded — fee unsettled) |

All 9 eligible drivers have a portal login (auto-created, same as the real "Driver List → one
action creates the login" flow). Amit (KYC-pending) deliberately has **no** login, matching
existing policy that a driver only gets one once staff/the KYC flow creates it. KYC approval
for every eligible/offline/fee-unpaid driver went through the real approval gate
(`driver-pill.service.ts`'s checklist) — every checkable field and uploaded document has a
genuine `DriverKycCheck` "Pass" row. Driving-licence verification used the existing **manual**
review policy (`DRIVER_DL_POLICY` unset — the default), not a live IDSPay call — the uploaded
documents are tiny synthetic placeholder files, each stamped "SYNTHETIC DEMO DOCUMENT — NOT A
REAL IDENTITY DOCUMENT," stored under `apps/mera-driver-api/uploads/drivers/<id>/`.

**2 customers** (both with portal logins): Priya Sharma (`priya.demo@meradriver.test` /
`+917000000011`), Anita Verma (`anita.demo@meradriver.test` / `+917000000012`).

**6 bookings**, each created and walked through the real offer/accept/transition/accounts
lifecycle (no direct status writes), with pickup times relative to "now" so they never go
stale:

| Scenario | Customer → Driver | Status after seed | Fare | Commission | Driver share |
|---|---|---|---|---|---|
| Local (Delhi NCR, Sedan) | Priya → Ramesh | Completed, COD settled | ₹265.00 | ₹39.75 | ₹225.25 |
| Round Trip (Delhi NCR, SUV) | Anita → Suresh (offered) | **Requested** (pending accept) | ₹1,660.00 | ₹249.00 | ₹1,411.00 |
| Outstation (Delhi NCR, SUV) | Priya → Vikram | **Confirmed** (accepted, not started) | ₹4,520.00 | ₹678.00 | ₹3,842.00 |
| Hourly, 2 hrs (Delhi NCR, Sedan) | Anita → Rajesh, Razorpay | **Confirmed**, payment pending | ₹600.00 | ₹90.00 | ₹510.00 |
| Monthly (Delhi NCR, Sedan) | Priya → Manoj | Completed, COD settled | ₹15,000.00 | ₹2,250.00 | ₹12,750.00 |
| Local (Mumbai, Sedan) | Anita → Sanjay | Completed, COD settled | ₹229.50 | ₹34.43 | ₹195.07 |

Every fare/commission/driver-share number above was read back from the actual seed run's
console output (the real `quoteBooking` calculation), not hand-typed — rerun the seed command
yourself to see it printed again. The Round Trip and Hourly bookings are deliberately left
mid-lifecycle so you have something live to accept/decline/reassign; completing them yourself
is part of the walkthrough in §6.

## 3. Where the records show up

- **Admin Masters** (`/account/masters/*`): the new driver-type, job-types, vehicle-types,
  zones and trip-types rows appear alongside any existing ones.
- **Admin Driver Registry** (`/account/drivers`): search any demo driver by name. The 9
  eligible drivers show `Verified`/"Ready for trips"; Amit shows KYC-pending; Naveen and Kiran
  show "Not ready for trips" with the specific blocking reason (offline / fee unsettled).
- **Admin Driver Details / KYC Review** (`/account/kyc-assignments`): eligible/offline/fee-
  unpaid drivers show a fully passed checklist; Amit shows an incomplete one.
- **Admin Accounts → Registration Fees** (`/account/accounts/registration-fees`): two separate
  columns distinguish the cases correctly — "Fee status" (Paid/Unpaid) and "Trip requirement"
  (Required/Optional). Suresh/Vikram/Irfan show **Unpaid + Optional** (not blocking); Kiran
  shows **Unpaid + Required** (blocking, matches his excluded match-search result).
- **Public website search** (`/ride/home` → `/ride/options` → `/ride/drivers`, no login
  required): see the exact filter combinations in §4 below.
- **Driver's own portal** (`/driver/...`): sign in as any eligible driver to see their own
  trips/requests. Amit has no login to test with.
- **Customer portal** (`/customer/...`): sign in as Priya or Anita to see their own bookings
  only.
- **Admin Dispatch** (`/account/dispatch`) and **Accounts** (`overview`, `booking-payments`,
  `commissions`): all 6 demo bookings and every recorded movement are visible there.

## 4. Verified filter combinations (checked directly against the live API)

| Search | Returns | Confirmed by |
|---|---|---|
| Delhi NCR · Local · Sedan | Ramesh, Manoj, Rajesh, Arjun, Deepak | live API + browser screenshot |
| …filtered to language "Tamil" | Arjun only | live API + browser screenshot |
| Delhi NCR · Round Trip · SUV | Ramesh, Suresh, Deepak | live API |
| Delhi NCR · Outstation · SUV | Ramesh, Suresh, Deepak (Vikram shows busy if the search window overlaps his own demo Outstation booking — see §9) | live API |
| Delhi NCR · Hourly · Sedan | Arjun, Deepak, Rajesh (Part Time) | live API |
| Delhi NCR · Monthly · Sedan | Deepak, Manoj, Ramesh (Full Time) | live API |
| Mumbai · Local · Sedan | Sanjay, Irfan | live API |

Amit, Naveen and Kiran never appear in any of the above, in any city/vehicle/language
combination — confirmed via the same live calls.

The **language filter chips** on `/ride/drivers` are populated from the real, Super-Admin-
managed language master (`GET /workflow/public/languages`, a new read-only public endpoint —
no PII), not a hardcoded list — toggling a chip re-queries `POST /workflow/public/candidates`
with a `languages` array that every returned driver's saved `languages` must all match. This
filter, the drivers' `languages`/`experience` fields on the public candidate cards, and the
`/workflow/public/languages` endpoint did not exist before this task — they were added to
close the gap where language was stored but never actually filterable or shown.

## 5. Logging in (no real SMS required)

Login is OTP-based (phone or email) — there is no password and no universal/bypass code. For
local testing without live SMS/SMTP credentials, temporarily set `OTP_DEV_LOG=true` in
`apps/mera-driver-api/.env.local` and restart the API (never enabled in production — the code
checks `NODE_ENV !== 'production'` *and* this explicit flag). With it set, requesting an OTP
logs the real, random, normally-expiring code to the **API server's own console** instead of
attempting delivery — nothing about verification, expiry or rate-limiting changes. Turn it
back to `false` when you're done (see the test-suite warning in §1).

Use a separate browser profile (or private window) per persona so sessions don't collide:
- **Customer**: sign in at `/sign-in` with `priya.demo@meradriver.test` or
  `anita.demo@meradriver.test`.
- **Driver**: sign in at `/sign-in` with `ramesh.demo@meradriver.test`, `suresh.demo@...`,
  `manoj.demo@...`, `rajesh.demo@...`, `vikram.demo@...`, `arjun.demo@...`, `deepak.demo@...`,
  `sanjay.demo@...`, or `irfan.demo@...` (all `@meradriver.test`).
- **Admin/Staff**: use your own existing staff account, seeded separately via
  `SUPERADMIN_PHONE`/`SUPERADMIN_EMAIL` + `npm run mera-driver-api:prisma:seed` (the normal
  project setup). This demo script never creates or prints staff/admin credentials — get a
  local SuperAdmin login by setting your own phone/email in `.env.local` before running that
  seed, not by committing or sharing a credential.

## 6. Walkthrough

1. **Customer books**: sign in as Priya or Anita → "Book a Driver" → choose a service tab
   (Car/Package/Outstation/Monthly/Language — these map to the fare rules' trip-type names) →
   pick pickup/drop and a future time → the real quote is calculated server-side → optionally
   filter by language and pick a preferred driver from the real eligible-candidates list →
   submit. Rapid double-clicking is safe — the client generates one request key per attempt,
   so a retry returns the same booking instead of creating a duplicate.
2. **Driver sees the request**: sign in as the targeted driver → Trip Requests. Try this with
   the pending Round Trip booking (offered to Suresh) — his requests list should show it.
3. **Driver accepts or declines**: accepting assigns the trip; declining returns it to
   dispatch for the next eligible driver.
4. **Admin can reassign**: `/account/dispatch` → open a booking → assign a different eligible
   driver at any point before completion (try it on the still-pending Round Trip booking).
5. **Trip progresses**: driver portal → On the way → Arrived (generates a trip-start OTP for
   the customer) → customer shares the OTP → driver enters it to start → Completed. Try this
   on the Outstation (confirmed) or Hourly (confirmed) bookings left mid-lifecycle.
6. **Payment/accounts**: for a COD trip, staff record the driver's cash collection and
   commission settlement via Accounts → Booking Payments/Commissions (the authorized, audited
   `accounts/movements` action) — never by editing booking status directly. The Hourly
   booking's `paymentMode` is `razorpay` and was deliberately left unpaid/unsettled here — a
   real Razorpay test-mode checkout requires live browser interaction with Razorpay's hosted
   checkout UI, which this script does not and should not simulate; report this as the
   limitation it is rather than fabricating a captured payment.
7. **Cross-account checks**: confirm Priya cannot see Anita's bookings (`/customer/bookings`
   is ownership-scoped to the signed-in customer), and Ramesh cannot see another driver's
   trips, profile or documents.

## 7. Expected dashboard numbers after setup

- Driver Registry: 9 `Verified`/ready drivers, 1 KYC-pending, 2 otherwise-ready-but-blocked
  (1 offline, 1 unpaid required fee).
- Accounts → Overview: 3 completed bookings (Local, Monthly, Local-Mumbai), 1 pending
  (Round Trip), 2 confirmed-not-completed (Outstation, Hourly) — ₹15,494.50 total COD
  collected across the 3 completed trips, ₹2,324.18 total commission, registration fees
  received: ₹500 × however many of Ramesh/Manoj/Rajesh/Arjun/Deepak/Sanjay/Naveen you've run
  the fee-collection step for (the seed script itself only records it for the ones marked
  "Paid" in the table above).
- Registration Fees screen: Ramesh/Manoj/Rajesh/Arjun/Deepak/Sanjay/Naveen "Paid + Required";
  Suresh/Vikram/Irfan "Unpaid + Optional"; Kiran "Unpaid + Required" (the one genuinely
  blocking case).

## 8. Unsupported / not exercised by this demo

- **Live Razorpay capture** — real test-mode keys are configured in `.env.local`, and the
  backend's signature/webhook verification is real, unmocked code — but actually completing a
  checkout requires driving Razorpay's own hosted UI in a browser, which wasn't done here.
  The Hourly booking is left at "payment pending" rather than faking a captured payment.
- **`workLocation` = "Same State" / "Other States" driver matching** — this is real, existing,
  working functionality (verified by reading `candidatePageSql`/`eligibilityReasons`), but
  every demo driver uses the simpler direct-city-match path (`city` set literally to the zone
  name) for predictability. Demonstrating the state-based path would need a zone name that
  resolves to a real state in `cities.json`, which "Delhi NCR"/"Mumbai" (zone labels, not
  literal city-list entries) don't — left as a gap rather than rigging a fragile extra case.
- **`job-choices` master category** — exists and is Super-Admin-configurable, but no demo
  fare rule requires a specific job choice, so no demo rows were added to it.
- **Live IDSPay driving-licence verification** — intentionally left on the default `manual`
  policy; `.env.local` happens to already contain production-looking IDSPay credentials for
  the *backend* module's own real-data posture, but `DRIVER_DL_POLICY` is unset, so none of
  this demo setup ever calls that provider.
