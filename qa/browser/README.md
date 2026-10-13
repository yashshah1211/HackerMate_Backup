# Builder directory browser QA

This suite is independent of PR #7. It changes test infrastructure only; no
application, search, authentication, SQL or production configuration is modified.

## Two different kinds of evidence

**Fixture browser tests** run the actual `DevelopersView`, `useDevelopersData`,
notification provider, design-system controls and compiled application CSS in
Chromium on desktop and Pixel 7 viewports. A loopback-only esbuild harness supplies
synthetic HTTP query responses and generated synthetic UUIDs. It does not create
an authentication session or run the Next.js route/AuthGuard. It never connects
to Supabase. These tests verify browser interactions, rendering, debounce,
out-of-order responses, filters, responsive layout, client block/self exclusions,
errors/Retry and the expected RPC projection against mocks. They **do not prove**
the real RPC SQL, RLS, auth/middleware, production fonts or deployed behavior.
The previous SQL tests remain the database-level verification.

**Live tests** navigate to the real `/developers` route using a legitimately
authorized test-account storage state. Missing target, session or scoped fixture
configuration is marked `BLOCKED` and skipped; a skip is never a pass. Expired
sessions, wrong fixture expectations or a broken deployed RPC fail the tests.
No production user-count assumptions or arbitrary sleeps are used.

## Local fixture execution

```sh
npm ci
npx playwright install chromium
npm run test:browser
```

When Chromium is already installed, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/absolute/path/to/chromium` for that command.
For example Cloud validation used `/usr/bin/chromium`. Node 20+ is required.
The fixture server binds **only** `127.0.0.1:4173`, refuses non-read RPCs, and is
managed by Playwright. A pre-existing server on this port is an error, not reused.
Synthetic fixture tests save failure traces/screenshots under ignored
`test-results/`; view reports with `npx playwright show-report`. Generated fixture
bundles are under ignored `qa/browser/.cache/`.

## Authenticated local/staging execution

Use an already configured development app or an explicitly configured staging
deployment and a dedicated, legitimately authorized QA account. The application
supports Google/GitHub OAuth; this suite does not replace or bypass that flow.
Create a storage state through a normal interactive login on **local/staging**:

```sh
mkdir -p .auth
npx playwright codegen --save-storage=.auth/developers.storage-state.json https://YOUR-STAGING-ORIGIN/login
chmod 600 .auth/developers.storage-state.json
```

Complete the normal login/onboarding and close the browser. Session state includes
credentials; do not print, upload, commit or share it. Use `.auth/` for the private
fixture manifest too. All `.auth/`, reports, traces, screenshots and generated
bundles are gitignored. Do not add credentials to Playwright config or fixtures.

Set these non-secret paths/origins in your shell/environment configuration:

| Variable | Requirement |
| --- | --- |
| `QA_LIVE_BASE_URL` | Explicit app origin, e.g. local `http://127.0.0.1:3000/` or your HTTPS staging origin |
| `QA_ENVIRONMENT` | `staging` for remote staging; `production` for production |
| `QA_SUPABASE_URL` | The matching Supabase HTTPS origin, used for the read-only allowlist |
| `QA_STORAGE_STATE` | Path to the legitimate account's fresh Playwright storage state |
| `QA_FIXTURE_MANIFEST` | Path to a private JSON manifest of known, synthetic QA profiles already present in that target |

Manifest structure (replace placeholders with your test fixtures; no real user
names, IDs or secrets belong in this repository):

```json
{
  "pythonNames": ["YOUR SYNTHETIC PYTHON FIXTURE"],
  "scriptNames": ["YOUR SYNTHETIC TYPESCRIPT FIXTURE"],
  "special": {
    "C++": ["YOUR SYNTHETIC C++ FIXTURE"],
    "C#": ["YOUR SYNTHETIC C# FIXTURE"],
    "Node.js": ["YOUR SYNTHETIC NODE FIXTURE"]
  },
  "nameQuery": "YOUR SYNTHETIC NAME QUERY",
  "nameNames": ["YOUR EXPECTED SYNTHETIC NAME"],
  "collegeQuery": "YOUR SYNTHETIC COLLEGE QUERY",
  "collegeNames": ["YOUR EXPECTED SYNTHETIC NAME"],
  "unmatchedQuery": "YOUR GUARANTEED UNMATCHED QA TERM",
  "excludedNames": ["YOUR KNOWN BLOCKED OR RLS-HIDDEN PYTHON FIXTURE"]
}
```

Fixture creation is outside this suite and must happen separately in an approved
test environment. Live assertions are scoped to those expected fixtures; they
do not assert an exact production result count. Missing blocked/hidden fixtures
block that particular test. An ordinary hidden profile is not necessarily RLS-
hidden in every app context: configure expectations using actual applicable
policy/visibility rules, not assumptions.

```sh
npm run test:browser:live
```

## Production opt-in and zero business writes

Production requires **both** `QA_ENVIRONMENT=production` and
`QA_ALLOW_PRODUCTION=1`. Known `hackermate.in` production origins cannot be
misclassified as staging. Supply a fresh, legitimately authorized session from
the primary workflow and already-existing synthetic test fixtures; do not create
profiles or capture new production logins as part of this read-only run.

Before navigation, live tests install a deny-by-default request policy. It allows
app assets/directory/login reads, Supabase table GET/HEAD reads, auth-user GET, and
only the three known read-only search/matching RPCs. It blocks all business
mutations, profile heartbeats, telemetry, auth refresh POSTs and WebSockets. The
real app normally PATCHes `last_seen_at` on mount; that is intercepted and never
sent. These blocked requests can cause shell console errors and online-presence
differences; tests do not claim that presence/live subscriptions were validated.
An expired session must be renewed through the legitimate primary workflow,
not by weakening the guard. No Invite/Connect/Accept/Decline controls are clicked.

Live traces, screenshots and video are **always off**, including failure capture,
because traces can record JWTs/cookies and screenshots may contain real profile
data. Reports contain test names and assertion failures; keep all artifacts
private and review/redact them before sharing. RPC privacy assertions inspect
only returned key names, never log response values or request headers. Fixture
failure artifacts contain only synthetic data and no authentication sessions.
Live teardown clears the profile DOM before Playwright's automatic failure-context
snapshot. Assertions and failure reports can still contain fixture locator text;
keep all live reports private and redact them before sharing.

## Remaining sign-off

1. Primary workflow supplies a configured local/staging app, fresh legitimate
   session and scoped synthetic fixtures, then runs both desktop/mobile live tests.
2. Confirm signed-out redirect, actual RPC casing/partial/punctuation behavior,
   RLS/blocked exclusions where fixtures support them, and the private-field check.
3. Review actual query plans/latency and migration status separately; fixture
   browser tests cannot establish production SQL correctness or performance.
4. For production sign-off, explicitly opt in and rerun read-only live checks with
   approved existing fixtures. Record passes/failures/BLOCKED separately. Never
   count skipped live tests as authenticated sign-off.

Useful checks: `npm run typecheck`, `npx eslint qa/browser eslint.config.mjs`, and
the existing Node search/race/availability/empty-state/handoff regression suites.

## Cloud validation record

Base: `b514b7566ecac035b265164789ec7c1db66a50d5` (merged PR #6).

| Category | Outcome |
| --- | --- |
| Actual Chromium browser, deterministic mocked HTTP fixtures | 28 passed: 14 desktop, 14 mobile |
| Read-only policy / production opt-in / private-file safety checks | 3 passed; these are not browser sign-off |
| Existing Node regression suites | 109 passed |
| Type checking, scoped ESLint and `git diff --check` | Passed |
| Authenticated live application checks | 0 passed; all 22 BLOCKED/skipped because no live target/session/manifest was configured |
| Application authentication / deployed RPC / real RLS | Unverified; require the live suite and primary sign-off |

Initial test-server working-directory and searchbox-locator errors were corrected;
the repeated fixture run had no remaining failures. The tests use the control's
actual `searchbox` role, not a brittle CSS selector. No production account/session,
database operation or intentional deployment was used in this validation.
