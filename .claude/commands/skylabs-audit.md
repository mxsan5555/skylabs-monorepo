# Command: /skylabs-audit

Full audit of the skylabs-monorepo. Produces a prioritised findings report.

## Pipeline

1. **skylabs-ravi** — Code quality audit
   - DRY principle: flag duplicated component logic across msd and mera-driver
   - Semantic HTML: missing landmarks (`<main>`, `<nav>`, `<header>`, `<footer>`), wrong heading order
   - Responsive: identify any overflow or layout breaks at 375px, 768px, 1280px
   - Accessibility basics: missing `alt`, unlabelled inputs, `aria-hidden` missing on decorative icons
   - Consistency: `CUSTOM_ELEMENTS_SCHEMA` present on all Angular components using `<md-*>` or `<sky-*>`

2. **skylabs-dev** — Test coverage audit
   - List components/pages with no test file
   - List API routes with no integration test
   - Flag any test files using mocks where real implementations could be used
   - Run all tests and report failures: `npx nx run-many -t test --projects=shared-ui,msd,mera-driver`

3. **skylabs-vivek** — SEO + analytics audit
   - Check every public route has `<title>` and `<meta name="description">`
   - Check all account/auth routes have `noindex`
   - Verify Open Graph tags on key landing pages
   - Check JSON-LD presence on home and category pages
   - Verify GA4 events are wired up (or flagged as missing)
   - Check consent mode is configured before GA4 goes live

4. **skylabs-reena** — Content audit
   - Flag any banned words or phrases in `content.json`, templates, or blog content
   - Flag any placeholder copy ("TBD", "Coming soon", "Lorem ipsum")
   - Check CTA labels are direct verbs
   - Check meta descriptions are 140–155 chars
   - Verify brand voice consistency (warm for msd, professional for mera-driver)

5. **skylabs-neha** — Design consistency audit
   - Verify 60/30/10 rule applied across msd and mera-driver
   - Flag any hard-coded colours not using `--md-sys-color-*` tokens
   - Check touch targets ≥ 44px on all interactive elements
   - Verify focus rings are visible across all interactive elements
   - Check typography uses M3 typescale roles (not ad-hoc font sizes)

## Output Format

```
## AUDIT REPORT — skylabs-monorepo
Date: [date]
Scope: [msd | mera-driver | both | specific feature]

### CRITICAL (ship-blocker)
- [ ] [Finding] — [file:line or component] — [who to fix: skylabs-xxx]

### HIGH (fix before next release)
- [ ] [Finding] — [file:line or component] — [who to fix: skylabs-xxx]

### MEDIUM (schedule in next sprint)
- [ ] [Finding] — [file:line or component] — [who to fix: skylabs-xxx]

### LOW (nice to have)
- [ ] [Finding] — [file:line or component] — [who to fix: skylabs-xxx]
```

## Usage

```
/skylabs-audit
/skylabs-audit msd
/skylabs-audit mera-driver
/skylabs-audit shared-ui
/skylabs-audit auth flow
```
