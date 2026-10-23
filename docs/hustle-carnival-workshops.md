# Hustle Carnival public workshops (PR B)

Route: `/partners/hustle-carnival/workshops`.

Navigation follow-up: the dashboard partnership banner and carnival portal now link to this page. The organizer-confirmed schedule below supersedes the original 2:20 PM start. See `hustle-partnership-navigation.md` for the navigation review and current verification; the original workshop release notes below describe its initial scope.

An isolated, server-rendered public page for **Git & GitHub** and **Introduction to AI Tools**. Both sessions run **24 October 2026, 2:00 PM–4:00 PM IST (UTC+05:30)**, simultaneously. Anyone can attend without authentication or registration. Club Ellusion, G.L. Bajaj Group of Institutions, Mathura organizes the workshops; HackerMate is the partner.

The page reuses the canonical HackerMate logo and existing public app shell, with its own charcoal/gold CSS module. It has no API, authentication, registration, database or certificate-generation dependency. Existing shell sign-in navigation is inherited; workshop attendance does not use it. No shared component, participation guard, registration code, dashboard, broadcast infrastructure, dependency manifest, lockfile or Supabase configuration is changed.

## Supplying official links

Workshop URLs are configured in `src/lib/partners/hustleCarnivalWorkshops.ts`. On 23 October, the following workshop-specific YouTube links were shared and matched to their visible YouTube titles in the supplied screenshots:

- **Git & GitHub:** `https://www.youtube.com/live/YnTbBoXHJ5A`
- **Introduction to AI Tools / AI Tools & Prompt Engineering:** `https://www.youtube.com/live/ogiIp36iXxo`

The user specifically requested that these URLs replace the disabled placeholders, providing editorial approval for these exact links. The sender's independent organizational authority was not technically verified. Each configured livestream has `organizerApproved: true` as the source-reviewed editorial gate. **Both `certificateForm` values remain `null`.**

For future links, replace an entry with `{ url: <exact organizer-supplied URL>, organizerApproved: true }` only after confirming the correct stream or form. Record approval in the change review. Do not use visitor input, query parameters or registration data as link configuration.

Approval and URL validation are both required. HTTPS YouTube watch, live, short video and supported channel URLs are accepted for livestreams; `forms.gle` and Google Forms respondent `viewform` URLs are accepted for certificates. Other hosts, HTTP, credentials, nonstandard ports, malformed destinations and Google Forms edit URLs fail closed. Host validation cannot establish channel/form ownership; organizer approval is a separate editorial requirement. Unsupported legitimate URL formats should receive a focused validator/test update, not a bypass.

Missing, unapproved or invalid links render disabled buttons and clear explanatory text. Valid approved links open in a new tab with `noopener noreferrer`. No date-based auto-enabling is applied. Source configuration updates require a new reviewed build/deployment; this PR does not change hosting settings.

Certificates and responses remain entirely with Club Ellusion's Google Forms. No speakers, certificate requirements, recordings or workshop URLs are invented. Any instructions will come from the organizer.

## Verification

Use the repository's declared development dependencies and a local Chromium installation. `axe-core` is already supplied transitively by the existing lint dependencies. No dependency has been added.

```sh
npm run typecheck
npm run lint -- src/app/partners/hustle-carnival/workshops/page.tsx src/components/partners/HustleCarnivalWorkshops.tsx src/lib/partners/hustleCarnivalWorkshops.ts scripts/test-hustle-carnival-workshops.cjs scripts/test-hustle-carnival-workshops-browser.cjs
node scripts/test-hustle-carnival-workshops.cjs
node scripts/test-hustle-carnival.cjs
```

Start an independent Next development server with synthetic configuration only (no `.env` file or live credentials):

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4299 NEXT_PUBLIC_SUPABASE_ANON_KEY=workshops-offline-fixture NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 4287
```

Then run:

```sh
node scripts/test-hustle-carnival-workshops-browser.cjs
```

`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` overrides `/usr/bin/chromium`. `HUSTLE_WORKSHOPS_QA_OUTPUT` overrides the default `work/workshops-qa` artifact directory. The browser script owns port 4288 for source-rendered configured/invalid-link fixtures. Ports 4287–4288 must be free before starting. It blocks external browser requests and browser writes, and never navigates to real YouTube or Google Forms destinations. Port 4299 is an intentionally unused synthetic Supabase destination required by the existing app shell. The workshop route itself makes no database requests.

Verified on 18 October 2026:

- TypeScript and scoped ESLint: passed.
- Workshop automated tests: 7 passed, covering configuration, per-link approval, accepted/rejected URL formats, independent action states, metadata and disabled participation.
- Existing public portal regression tests: 19 passed, including the original disabled participation guard.
- Browser: 150 checks passed on the real Next route plus explicit source-rendered link fixtures at 1440/768/390/320px. Zero page errors and zero axe WCAG A/AA violations in the workshop main landmark at all four widths.
- Anonymous direct access returns 200; no login redirect, registration form, embedded stream or certificate-response collection. Pending controls are disabled. Configured links have safe external-link attributes and visible keyboard focus. Skip navigation, native FAQ keyboard controls, 44px control heights, no horizontal overflow and a JavaScript-disabled visit passed.
- Desktop and mobile screenshots visually reviewed. Existing tracked files remain unchanged.

The real Next route was tested in development with the full inherited app shell and hydration; enabled/invalid link states use offline server-rendered component fixtures. External service availability, actual organizer ownership, screen-reader manual review and production deployment are not established by these checks. Existing Next middleware/Sentry deprecation notices are outside this PR's scope.

## Follow-up integration

The two livestream links are now configured for review; certificate Google Forms are still pending. Confirm organizer ownership if independently required before production release, and apply later form URLs in a separate reviewed update. Portal and dashboard navigation are included in the separate partnership-navigation change. No merge or production deployment is included in this assignment.
