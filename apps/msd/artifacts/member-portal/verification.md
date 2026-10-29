# Member Portal frontend corrections

Visual verification is INCOMPLETE. These changes must not be represented as a confirmed match to the approved reference.

## Actual browser result

- Running frontend: http://localhost:4207
- Local API health endpoint responds HTTP 200 at localhost:3333.
- Opening `/account/vendor-payments` redirects to `/sign-in`.
- The browser has no authenticated member session. Login requires an OTP or Google authentication; no supplied session/login was available.
- No mock API data, forged session, reference sample values, or sample OTP was used.
- Actual screenshots: `desktop-access.png` (1440 x 1000) and `mobile-access.png` (390 x 844). Both show the authentication blocker, not a verified portal layout.
- Browser reported no page errors during that access check.
- Reference `/workspace/msd-member-orders-payments-clear.html` was not available in this Windows workspace. A repository filename search also found no copy. Reference and implementation could not be compared at the same viewport.

## Required captures still outstanding

Payments; Order History; Verify & Complete; OTP-pending verification; selected Order Details; business-scoped Customer Details; authenticated mobile layout. All require an available legitimate member session. OTP-pending capture additionally requires an existing pending voucher; no customer OTP was sent solely to obtain a screenshot.

## Causes and changes

- Shared UI custom-element registration, theme.css and layout.css are already imported by main.tsx; application styles are loaded by index.html. Missing registration was not identified as the cause.
- Removed duplicate inner Orders heading and summary cards from the member Order History tab, preserving its existing DataTable and filters.
- Added Refresh Status for the active member tab. Queue action listeners now attach after switching into the Verify tab.
- Replaced earnings shortcut tiles with Shared UI outlined cards containing explicit labels, prominent amounts and short descriptions, in a responsive four/two/one-column grid. Added a compact total-share/status strip and collapsed payout history.
- Verification now uses the existing API-provided order, branch, gross amount, member share and settlement status in two desktop summary columns, followed by a distinct action area. OTP input/actions use a content-sized flex row. Saved stage remains server-derived and refresh does not request OTP.
- Order Details removes nested checkout padding and full-width customer buttons. Purchased Items is a compact semantic table with entitlement-specific verification links. Activity and technical information follow the items. Shipping/evidence information remains in the technical disclosure.
- Member View Customer opens the routed business-scoped customer page with Back to Order context. Default member Back to Orders returns to member Order History.
- Customer Details uses compact read-only identity/contact and business summary cards, then Orders with My Business, retaining existing scoped API calls.
- DataTable has fixed per-table icon actions; queue/statement retain their visible per-row action wording and working Open icon. Purchased Items has direct per-entitlement Continue Verification/View Record links.

## Reused Shared UI

Existing member shell/sidebar and green theme, sky-card, sky-data-table, sky-badge, Tabs, PrimaryTab, FilledButton, OutlinedButton, TextButton, OutlinedTextField, Icon, Divider and existing customer-order DataTable. App-specific layout rules live in one scoped member-portal.css; shared stylesheets are not duplicated.

## Validation

- Targeted regression suite: 6 files, 80 tests passed (targeted-tests.log).
- Order Details rechecked after preserving technical shipping information: 21 tests passed (order-detail-tests.log).
- ESLint passed for the six modified page components and four modified test files (lint.log).
- Full app TypeScript check remains unsuccessful due to errors outside these changed components, including API order query typing, missing exported types and CMS dialog refs (typecheck.log). No errors are reported in the changed portal/order page components.
- Backend logic, financial calculations, ownership/security rules and route authorization were not changed. No files outside apps/msd were intentionally edited by this task.

## Changed source files (relative to apps/msd/src/app/pages/account)

- vendor-portal/member-portal.css
- vendor-portal/earnings-payouts.tsx
- vendor-portal/member-orders-page.tsx
- vendor-portal/voucher-verification-page.tsx
- vendor-portal/vendor-customer-detail-page.tsx
- orders/orders.tsx
- orders/order-detail-page.tsx
- vendor-portal/member-orders-page.test.tsx
- vendor-portal/voucher-verification-page.test.tsx
- vendor-portal/vendor-customer-detail-page.test.tsx
- orders/orders.test.tsx

Artifacts and the reproducible browser access script are under apps/msd/artifacts/member-portal. The script optionally accepts an existing legitimate Playwright storage-state path via MSD_MEMBER_STORAGE_STATE; no session is embedded in source.
