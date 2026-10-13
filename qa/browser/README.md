# Builder directory browser QA

This suite changes test infrastructure only. Application search, authentication,
SQL/RLS and PR #7's document feature are untouched.

## Evidence and limitations

**Fixture Chromium tests** run the actual `DevelopersView`, `useDevelopersData`,
notification provider, controls and compiled application CSS on desktop/Pixel 7.
The loopback harness supplies synthetic HTTP query responses and generated UUIDs.
It never authenticates or connects to Supabase. It does not run the real Next.js
route, middleware or AuthGuard, and cannot prove SQL matching or deployed RLS.

Every search assertion captures a **new request**, checks the exact query/sort,
waits for its complete response and asserts success, configured matches and
nonmatches in the server payload before checking the UI. A request from an older
query (including an earlier identical Retry) cannot satisfy that wait. A missing
RPC fails even when client filtering already shows the expected result.
The paused-debounce regression demonstrates that distinction. Its 200ms timeout
is a failure deadline with a stopped clock, not a network timing sleep.

The fixture adapter uses a test-only request ID and microtask completion marker
queued after the awaiting hook resumes. Stale-response assertions wait for this
marker, not animation frames or sleeps. No instrumentation enters the application.
Coverage includes stale success/error/loading, Fit/Active/New changes, clearing,
Retry races, an initially empty dataset, filters, exclusions and responsive UI.

**Live tests** use the actual route/RPC on an explicitly verified non-production
frontend and Supabase pair. Missing target/session/manifest is `BLOCKED`/skipped,
never a pass. A stale/malformed session or invalid fixture expectation fails.
Live tests also assert completed RPC payloads, not just client-filtered results.
Recommendations are stubbed, so live recommendation ranking is unverified.

## Local fixture execution

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

Use Node compatible with this repository's Next.js version (>=20.9).
If Chromium is already installed, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium`; Cloud used
`/usr/bin/chromium`. The fixture server binds only `127.0.0.1:4173`; Playwright
starts/stops it and refuses to reuse another service on that port.
Fixtures may collect failure traces/screenshots containing synthetic data only.
Generated bundles, sessions and reports are ignored by Git.

## Authorized local/staging execution

The primary workflow must independently verify that BOTH the frontend's actual
Supabase configuration and `QA_SUPABASE_URL` refer to the approved non-production
project. A browser cannot prove this mapping or identify every custom production
alias. `QA_TARGETS_VERIFIED=1` is an explicit operator attestation, not automatic
environment discovery. Never label a production/custom deployment as staging.

Use an existing, legitimately authorized, preferably non-admin QA account with
completed onboarding and existing synthetic fixtures. Do not create accounts or
fixtures through this suite. Obtain state through normal local/staging OAuth:

```sh
mkdir -p .auth
npx playwright codegen --save-storage=.auth/developers.storage-state.json https://YOUR-STAGING-ORIGIN/login
chmod 600 .auth/developers.storage-state.json
```

Complete normal login and close the browser. This is a separate authorized setup
step; the test run never logs in, refreshes, saves storage state or changes profiles.
State contains credentials: never print, upload, commit or share it. Keep the
fixture manifest in `.auth/` too, or keep both files outside the checkout.

| Variable | Requirement |
| --- | --- |
| `QA_LIVE_BASE_URL` | Approved local app origin or HTTPS staging origin |
| `QA_ENVIRONMENT` | `staging` for remote staging |
| `QA_TARGETS_VERIFIED` | `1` after independent verification of the frontend/Supabase pair |
| `QA_SUPABASE_URL` | Matching approved non-production Supabase origin |
| `QA_STORAGE_STATE` | Private path to fresh normal-login Playwright state |
| `QA_FIXTURE_MANIFEST` | Private path to existing scoped synthetic fixture expectations |

The manifest requires positive **and negative** server matches for each query:

```json
{
  "pythonNames": ["YOUR PYTHON FIXTURE"],
  "scriptNames": ["YOUR TYPESCRIPT FIXTURE"],
  "special": {
    "C++": ["YOUR CPP FIXTURE"],
    "C#": ["YOUR CSHARP FIXTURE"],
    "Node.js": ["YOUR NODE FIXTURE"]
  },
  "nameQuery": "YOUR NAME QUERY",
  "nameNames": ["YOUR NAME FIXTURE"],
  "collegeQuery": "YOUR COLLEGE QUERY",
  "collegeNames": ["YOUR COLLEGE FIXTURE"],
  "unmatchedQuery": "YOUR GUARANTEED UNMATCHED TERM",
  "nonmatches": {
    "python": ["YOUR NON-PYTHON FIXTURE"],
    "script": ["YOUR NON-SCRIPT FIXTURE"],
    "C++": ["YOUR NON-CPP FIXTURE"],
    "C#": ["YOUR NON-CSHARP FIXTURE"],
    "Node.js": ["YOUR NON-NODE FIXTURE"],
    "YOUR NAME QUERY": ["YOUR OTHER NAME FIXTURE"],
    "YOUR COLLEGE QUERY": ["YOUR OTHER COLLEGE FIXTURE"]
  },
  "excludedNames": ["YOUR KNOWN BLOCKED OR RLS-HIDDEN PYTHON FIXTURE"]
}
```

Assertions are scoped to configured fixtures, not total user counts. Arrange
visible matches within the existing server cap/rendered page. Negative fixtures
must actually not match that term; do not infer this just from a profile name.
Blocked/hidden expectations must reflect applicable RLS/client visibility rules.
Missing exclusion fixtures block that specific test. No real identities belong
in committed files or this documentation.

```sh
npm run test:browser:live
```

Before configuration and every authenticated navigation, the suite validates
Supabase session `expires_at` and JWT `exp` locally, requiring >=30 minutes
remaining. Normal localStorage and chunked SSR-cookie formats are supported.
It does not verify identity by trusting decoded claims: the real app/Supabase still
validate authentication. Invalid state fails with a sanitized error. Renew only
through normal authorized setup outside the suite; automatic renewal is blocked.

## Browser network policy; production DISABLED

Automated production execution is disabled, even with the former opt-in flag.
Production mode, `hackermate.in` and its subdomains, and `hackermate.vercel.app`
are rejected. There is **no complete end-to-end read-only guarantee**: browser
interception cannot control Next.js middleware's server-side auth refresh, server
telemetry, backend triggers or other server-originating requests. Session lifetime
checks reduce expiry-triggered refresh but cannot eliminate every server effect.
Production sign-off must remain in a separately approved primary workflow.

Before navigation, the context guard blocks service workers, WebSockets and all
unapproved destinations/methods. It forwards only reviewed app/static reads,
`auth/v1/user` GET/HEAD, GET/HEAD on profiles/teams/blocked_users/friend_requests,
and POST to the independently inspected `search_builder_profiles` read RPC.
It denies arbitrary tables/views, image-optimizer server proxying, heartbeat
PATCHes, mutations, auth-token POSTs and telemetry. This HTTP allowlist controls
browser egress only; GET or an RPC name is not proof of absence of server effects.

Both recommendation RPCs are returned `[]` locally without contacting Supabase.
Their `assert_viewer` helper can call `refresh_builder`, which contains writes;
function volatility/naming is not treated as a purity guarantee.

Every allowed request is fetched with `maxRedirects: 0`, then fulfilled from that
single response. **All HTTP redirects are rejected**, including 307/308; no
redirect Location is forwarded to Chromium. Actual Chromium regressions assert
that redirect destinations/mutation endpoints receive no request. The signed-out
test inspects the real middleware's expected login redirect and confirms it was
blocked; it does not follow the redirect or validate the login UI. Recommended
canonical origins should serve directly without redirecting.

Blocked shell reads/presence/telemetry can produce expected console errors.
No Invite/Connect/Accept/Decline controls are clicked. No business-write requests
are intentionally sent, and no live database was accessed in Cloud validation.

## Sensitive artifacts

Live traces, screenshots and video stay off; live tests refuse capture overrides
before navigation. Automatic Playwright DOM failure snapshots are disabled with
`PLAYWRIGHT_NO_COPY_PROMPT`; teardown also clears profile DOM. Fetch failures are
sanitized rather than rethrowing logs that can contain authentication headers.
Server match/projection assertions use boolean checks rather than dumping rows.

Failure reports can still identify synthetic fixtures/locators or include other
sensitive diagnostic text. Keep all live reports private; review/redact before
sharing. `.auth/`, `*.storage-state.json`, `test-results/`, `playwright-report/` and
`qa/browser/.cache/` are ignored. Never force-add them or enable live capture.

## Remaining sign-off and validation

1. Review the corrected helpers, redirect guard and production prohibition.
2. Primary workflow verifies staging targets and supplies normal-login state plus
   existing positive/negative/block/visibility fixtures.
3. Run desktop/mobile live tests, record passes/failures/BLOCKED separately, and
   verify real authentication, SQL/RLS and projection. Resolve blocked checks.
4. Verify migration deployment and query performance separately. This suite does
   not establish production correctness or permit automated production execution.

Cloud correction validation: 44 mocked directory Chromium tests, 9 real Chromium
loopback policy tests, 4 pure policy/session checks, and 109 existing Node
regressions passed. All 22 live tests remain BLOCKED/skipped; 0 authenticated
passes. Typecheck, scoped ESLint and diff checks passed. A clean `npm ci
--ignore-scripts` installation was validated separately in `/tmp`; no dependency
versions or package configuration were changed by this correction.
