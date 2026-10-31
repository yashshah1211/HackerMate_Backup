# Authentication return paths and public-browsing compatibility

Local reconciliation date: 2026-10-16. No publication, production access, account changes,
real OAuth sessions, email sends, migrations, or deployment were performed.

## Review inputs and isolation

- Security worktree: `security/auth-return-path-hardening`, based on main
  `eed24a1384dd30dff05d13bf971f81e9ccac4f24` (merged Craft N Code PR #22).
- PR #21: <https://github.com/yashshah1211/HackerMate_Backup/pull/21>, inspected
  in a separate, unchanged checkout at
  `22f5bdf6cd3f2c18753834991e04da0fd43b82fb`.
- Existing uncommitted `review/comprehensive-ban-enforcement` work was read as
  evidence only. Its 19 source files were snapshotted and hash-checked separately.
- Desktop owns landing-page presentation, pagination, and public-browsing UI.
  The user subsequently assigned the shared landing redirect consumer to Cloud;
  its validator integration is included without presentation changes.

## Confirmed redirect vulnerability

The callback used ``NextResponse.redirect(`${origin}${next}`)`` with a query-supplied
`next`. Concatenation does not pin the URL origin. For example, with origin
`https://offline.example` and `next=@evil.invalid`, the result is
`https://offline.example@evil.invalid/`: the destination host is `evil.invalid`,
and `offline.example` is userinfo. A hostname suffix can also change the host.
The previous login/onboarding check accepted `/\\evil.invalid`; WHATWG URL parsing
normalizes backslashes as authority separators for HTTPS URLs.

Severity: **high**, existing authentication-flow open redirect. Session tokens are
not deliberately put in `next`, and this review does not establish token theft.
Phishing and attacker-controlled post-authentication navigation are established.

## Common contract

`src/lib/auth/returnPath.ts` exports `safeAuthReturnPath(unknown)` and the
`/dashboard` fallback. The helper:

- Accepts only application-root-relative paths, with one leading slash and a
  maximum length of 8,192 characters. Even absolute same-origin URLs fall back.
- Rejects authority/userinfo injection, schemes, backslashes, literal whitespace
  and control characters, malformed percent escapes, and encoded controls.
- Audits nested percent encoding with a bounded eight-pass limit. Rejects encoded
  path separators and ambiguous path delimiters. Query/fragment data is not
  decoded into routing syntax.
- Normalizes dot segments and verifies origin against a fixed internal base.
  Rejects normalized or encoded `/login`, `/onboarding`, `/auth`, `/api`, and
  `/_next` routes (including descendants) to prevent auth loops or endpoint
  navigation. A destination carried *through* onboarding remains supported.
- Rejects root destinations carrying `next`, `redirect`, or `returnTo`, including
  normalized root paths, to avoid redirect chains through the landing consumer.
- Returns canonical `pathname + search + hash`; preserves nested URL values,
  invitation parameters, event filters, builder tabs, and fragments.

Encoded spaces are supported in query data. Ambiguous encoded path separators,
encoded path whitespace, malformed encoding, excessive nesting, and auth-route
return targets intentionally fall back. This helper validates navigation; it does
not authorize a user, validate business actions, or make arbitrary query values
safe for another component to execute.

The callback validates the return path and independently allowlists its origin before
constructing `new URL(next, origin)`. Its Supabase
code exchange is unchanged. When forwarding exchanged session cookies to the
onboarding redirect, the complete cookie attributes are preserved. The login
page validates `next` (or the legacy `redirect` alias) once. SignInPanel validates
both explicit destinations and its current-location default; that default is now
relative. Google and GitHub still require consent and use the existing Supabase
OAuth call. Onboarding validates nested college-prefill parsing and navigation
after its existing explicit, successful form submission. Landing now validates
`next` before either direct navigation or nesting it in onboarding.

## Trusted callback origin: evidence, contract and limits

`new URL(request.url).origin` alone is not a deployment-origin guarantee.
`vercel.json` configures only cron schedules; `next.config.ts` has no production
origin allowlist, and its `allowedDevOrigins` is unrelated. Installed Next.js
16.3.5 source in `server/next-server.js:1275` constructs initial URL metadata from
forwarded protocol and, on its `trustHostHeader` branch, the Host header.
`server/base-server.js:606` populates forwarding headers; the NextRequest adapter
accepts absolute request URLs or initial URL metadata. These are framework data
flows, not evidence that Vercel's public edge accepts malicious header overrides.
The effective Vercel adapter/project forwarding controls and deployment environment
values are not supplied by this repository or runtime. No live hostile-host probe
or production session was used. Public-edge exploitability remains unverified.

`src/lib/auth/callbackOrigin.ts`, used only by the server callback, independently
requires the parsed request origin to equal an explicit trusted origin:

- Repository public origins `https://hackermate.in` and `https://www.hackermate.in`,
  consistent with README, layout and existing application links.
- A valid root HTTPS `NEXT_PUBLIC_SITE_URL`, without userinfo, query or fragment.
- Exact HTTPS hostnames from the deployment's `VERCEL_URL`, `VERCEL_BRANCH_URL`
  and `VERCEL_PROJECT_PRODUCTION_URL`. These environment values are deployment
  configuration, not incoming headers. No `*.vercel.app` or other wildcard is
  trusted. DNS labels, including consecutive hyphens and punycode, are supported;
  malformed entries do not add an origin.
- Loopback only for non-production, non-Vercel local development. NextRequest
  itself normalizes loopback IP URLs to localhost; that existing framework
  behavior is covered by tests, not rewritten here.

Unknown origins return a private/no-store HTTP 400 without redirect, cookies or
Supabase code exchange. Host, Forwarded, X-Forwarded-Host and X-Forwarded-Proto
cannot add an allowed origin. Successful, onboarding and failed-exchange redirects
stay on the exact approved callback origin, retaining PKCE cookie locality and
session-cookie attributes. Tests cover configured production/custom origins,
immutable previews, branch/production aliases, malformed config, hostile URLs and
forwarding headers, missing code, and local development.

This enforces a bounded redirect-origin guarantee even if an adapter supplies an
attacker-chosen request URL: it cannot cause this callback to redirect outside
configured application origins. It does not authenticate forwarding headers or
prove live hosting settings. SignInPanel retains its existing site-URL selection;
preview OAuth still requires its configured callback host to match the PKCE-cookie
host and Supabase's redirect allowlist. Missing preview environment exposure,
unlisted aliases or mismatched OAuth configuration must be reconciled before
release; they are not silently admitted or fixed by allowing arbitrary hosts.
No live Auth/Vercel configuration is read or modified. Other routes' independent
URL construction is outside this narrowly scoped callback correction.

## Return-flow inventory

| Source / consumer | Behavior and disposition |
| --- | --- |
| `src/app/auth/callback/route.ts` | Consumes `next`; now uses the common validator and an origin-pinned URL. |
| `src/app/login/page.tsx` | Consumes `next` / `redirect`; carries the validated destination through onboarding or navigation. `returnTo` here is only a display label. |
| `src/components/auth/SignInPanel.tsx` | Produces the OAuth callback destination; validates explicit and modal-default paths for both providers. |
| `src/app/onboarding/page.tsx` | Consumes `next` for college-prefill parsing and final navigation; now validated. |
| `src/app/LandingPageClient.tsx` | Consumes `next`; now uses the same validator before direct navigation or onboarding. Presentation and existing session/onboarding decisions are unchanged. |
| `src/components/AuthGuard.tsx`, `src/middleware.ts` | Produce login/onboarding URLs from the current local path/query. Middleware constructs redirects from cloned URLs. These are not the callback's concatenation sink. |
| `src/components/AuthModal.tsx` | Transports `nextUrl` to the now-validated SignInPanel. |
| `src/components/TeamOverviewView.tsx`, `src/app/teams/[id]/workspace/page.tsx` | Generate local team/workspace login handoffs. |
| `src/app/profile/[id]/ProfileView.tsx`, `src/app/leaderboard/page.tsx`, `src/app/settings/page.tsx` | Generate local profile, leaderboard, or settings login links. |
| `src/app/partners/[slug]/organizer/page.tsx`, `src/components/partners/OrganizerDashboard.tsx` | Generate local organizer login destinations, including filters. |
| `src/components/partners/LegacyPartnerPage.tsx`, `src/app/hackathons/[id]/organizer/page.tsx` | Generate `/?next=...&auth=true`; now reach the shared validated landing consumer. |
| PR #21 `src/lib/hackathons/publicBrowsing.ts` | Generates hackathon-only login/onboarding destinations, preserving filters/tabs. Its narrower helper remains unchanged. |
| `src/app/invites/page.tsx`, `src/app/teams/create/page.tsx`, team join workflows | Invitation acceptance, joining, and team creation remain explicit user actions. `invite` prepopulates team-create UI; the invitation RPC runs only after explicit team creation. |

Fixed-route redirects and the team dashboard-to-workspace alias do not consume
arbitrary return URLs. Repository searches found no independent `returnTo` URL
consumer. No automatic accept/join/save/submit instruction was introduced.

### Landing integration evidence

Cloud replaced only the old prefix expression with
`safeAuthReturnPath(requestedPath)` and added its import. No JSX, public-browsing,
pagination, or session/onboarding policy changed. The 79 added real-component
landing cases exercise 29 unsafe/missing values for complete and incomplete
accounts, eight valid destinations in both states, missing/error profile handoff,
and anonymous/error presentation. They verify the existing hero data, section
order, error banner, retry link, and organizer dialog interactions through stubs.
These are component regression checks, not a screenshot/browser visual audit.
All five shared return-path consumers now use the common helper. Desktop should
preserve this integration when reconciling its presentation work, without adding
a second validator. Direct `/onboarding` return targets fall back to avoid loops;
legitimate final destinations transported *through* onboarding remain intact.

## PR #21 compatibility: severity-ranked findings

### High redirect defect: locally corrected, not released

The callback and prefix-check consumers, including landing, are hardened locally.
The feature branch fast-forwarded without conflicts from the original reviewed
base `32980ea483fc3043086d970242fcbc8023d88669` to main `eed24a1`, preserving
all local auth edits and all 12 additive Craft N Code files. PR #21 is inspected
unchanged at `22f5bdf6`, and a separate uncommitted combined fixture contains
current main + that PR revision + this local patch. No production fix is claimed.

### High: shared shell is outside the page suspension boundary (pre-existing)

`AppShell` calls `useShellSession` before its route branches. That hook restores
cached identity, calls `getUser`, and selects profile columns that omit
`is_banned`. Even a failed profile read is followed by a `last_seen_at` update,
notification/DM/team reads, and Realtime subscription setup. The bootstrap also
does not test the returned identity error. The shell does not subscribe to auth
changes to stop its original heartbeat/subscriptions in place.

Actual hook/boundary offline probes reproduce these protected request attempts
while the page displays either suspension or verification-unavailable. They do
**not** prove that production accepts a query. `DailyStreakTracker`, mounted
outside the page boundary when a viewer ID is present, additionally uses
`getSession` before calling `record_daily_visit`, without an active-profile check.
Actual AppShell probes confirm a cached viewer can mount the tracker and issue
the mocked RPC before identity/profile verification finishes. Cache alone with
no SDK session does not issue that RPC. The user additionally confirms that deployed
`record_daily_visit()` is SECURITY DEFINER, authenticated-executable, mutates
streak data, and lacks an actor ban guard. This is a confirmed unguarded privileged
entry point; no real account or deployed mutation was tested. See the separate
[shell audit and remediation plan](shared-shell-suspension-remediation-plan.md).

Resolution belongs in a separately approved shared-session/suspension change,
plus reconciled database enforcement. Do not represent the page boundary as a
global security boundary or suppress legitimate anonymous public reads.

### Medium: automatic session removal silently changes a blocked account into guest

Confirmed by actual PR #21 boundary lifecycle probes: start with a suspended or
unverifiable credentialed user, emit automatic `SIGNED_OUT` after credential
removal, and the page mounts the guest subtree. All auth events call the same
stateless verifier; there is no retained failed-session state or explicit
sign-out/guest intent. The installed Supabase auth client can call
`_removeSession` on a non-retryable refresh failure after access-token expiry;
that method emits `SIGNED_OUT`. Thus the event does not prove user intent.

The current verifier correctly refuses a stale credential *while it remains
present*. It cannot detect a credential already erased before its first read.
The boundary's promise that it has not switched the user to guest is not durable
across these events. Only public content was mounted in the reproduction; this
is not a demonstrated private-data leak. Intentional sign-out and a new genuine
anonymous visit must remain legitimate.

Desktop should propose retained verification-failure/account-block state and an
explicit recovery/sign-out-to-public transition, with refresh-failure tests.
Do not put a persistent browser ban in place of server/database enforcement.

### High database-enforcement limitation: client rechecks cannot revoke an issued JWT

`requireActiveUser` verifies the incoming identity and current profile, requires
`is_banned === false`, and fails closed for missing/null/error states, without
founder/admin exemptions. Its guest mode rejects explicit invalid credentials
instead of downgrading them. PR #21 agrees on these profile states and separately
requires completed onboarding for participation. Incomplete/unknown onboarding
is still an active account for the generic server helper; resource rules remain
necessary. PR #21 also verifies that the returned profile ID matches the actor.

Public hackathon middleware intentionally performs no authentication. Protected
middleware checks identity and some roles, not current ban state; the probe
confirms a valid-identity suspended fixture passes `/dashboard` middleware.
Protected APIs need the server boundary; direct Supabase/RPC/Storage access needs
independent database/storage enforcement. This fix changes neither.

PR #21's bookmark handler rechecks active identity, onboarding, and actor match
before insertion/deletion and prevents duplicate concurrent attempts. It skips
the write if unmounted during verification. An already-issued write survives
unmount/sign-out as a network operation; offline tests confirm it was issued and
that its late response does not show success for the old subtree. Whether it
commits depends on authorization at execution and transaction ordering. An
active-user check followed by a later ban is a general check/use race, not proof
that any specific deployed policy is exploitable.

The existing authenticated event-detail implementation contains additional direct
Supabase actions; PR #21's boundary does not make those continuously authorized.
No live RLS, RPC, Storage grants, signed-URL lifetime, or Realtime authorization was
tested here. The separate production-catalog reconciliation remains necessary.
Do not infer safety from sign-out, JWT claims, or client redirects, or claim
immediate revocation for already-connected channels or previously issued URLs.

### Positive findings and remaining uncertainty

- Genuine guests make no self/private reads inside PR #21's public page subtree.
  Public projections require approved, explicitly non-archived events and omit
  organizer IDs/email/feedback. This is an application projection, not a database
  grant restriction.
- Suspended, missing-profile, null-ban, stale-session, failed-identity, and failed
  profile checks block the page before its public queries while credentials remain
  visible. Null onboarding does not grant participation.
- Auth events clear the old subtree. Generation checks discard late verification;
  focus and token refresh reverify. Cleanup unsubscribes and cancels pending timers.
- Incomplete accounts use public detail and explicit onboarding actions. Directory
  personalization still reads that verified actor's saved events and skills;
  this is not an anonymous read or participation write.
- No continuous ban polling exists. A ban without focus/auth events may leave
  the current UI mounted. Consequential operations must be enforced independently.
- Shared sign-out ignores the SDK's returned error and hard-navigates; it is not
  evidence of remote session revocation. Existing in-flight SQL and Realtime
  transactions are not recalled by a React unmount.
- Cross-tab refresh ordering, browser-storage loss before the first verification,
  and live channel behavior need separate integration investigation. No production
  exploit or immediate database/session revocation guarantee is asserted.

## Validation and recommendation

Offline suites exercise the actual helper/callback, React Google/GitHub controls,
login, onboarding submission, invitation handoff, PR #21 boundary and bookmark
handler, shared shell, middleware, and preserved server helper. Network-capable
SDK constructors are replaced with fixtures; no live API/cron endpoints are used.

```sh
node scripts/test-auth-return-paths.cjs
node scripts/test-auth-return-ui.cjs
node scripts/test-onboarding-submission.cjs
node scripts/test-invite-handoff.cjs
node scripts/test-organizer-workspace.cjs
node scripts/test-event-compatibility.cjs
AUTH_REVIEW_ROOT=/path/to/pr21-22f5bdf6 SUSPENSION_REVIEW_ROOT=/path/to/preserved-ban-worktree AUTH_REVIEW_MODE=regressions node scripts/test-auth-browsing-compatibility.cjs
AUTH_REVIEW_ROOT=/path/to/pr21-22f5bdf6 SUSPENSION_REVIEW_ROOT=/path/to/preserved-ban-worktree AUTH_REVIEW_MODE=observations node scripts/test-auth-browsing-compatibility.cjs
```

The compatibility script is a pinned cross-worktree review probe. Its 17 behavioral
regressions and 11 known-gap observations are now run and reported separately.
The fixture supports the reviewed revision's keyset pagination, abort signals and
AbortController; no PR #21 source is changed. Tests explicitly
named `KNOWN DEFECT` / `LIMITATION` assert observations of **unfixed** code; passing
does not certify suspension enforcement. Update those expectations when the owners
fix the reviewed implementation. Run PR #21's public-browsing/discovery suites in
its own checkout, unchanged. Full typecheck and scoped ESLint are also required;
the onboarding file's existing unused-catch warning should be compared with base.

The original 565-check result belongs to the earlier review of main `32980ea`
and PR #21 `0e710880`; it is not evidence for the reconciled revisions. Final
reconciliation results and exact commands follow. Known-gap demonstrations must never be counted as proven protections.

### Reconciliation validation: 2026-10-16

| Configuration / check | Final result |
| --- | --- |
| Current main `eed24a1` + auth patch: Node regressions | 610 passed, 0 failed/cancelled/skipped |
| Current main + PR #21 `22f5bdf6` + auth patch: Node regressions | 727 passed, 0 failed/cancelled/skipped |
| Unchanged pinned PR #21: public data, browsing, discovery and directory suites | 121 passed, 0 failed/cancelled/skipped |
| Cross-worktree behavioral regressions | 17 passed, 0 failed/cancelled/skipped |
| Separate known-defect/limitation observations | 11 reproduced, 0 unexpected outcomes; NOT 11 repaired protections |
| Combined desktop/mobile public-browsing browser tests | 2 passed, 0 failed |
| Combined Craft N Code browser assertions (1440/390/320 px, all seven states) | 238 passed; zero external requests |
| Full typecheck on current main + auth, and on the combined fixture | Both passed |
| Scoped ESLint across all changed code/tests | 0 errors; 1 pre-existing onboarding unused-catch warning; base comparison matches |
| Whitespace, exact manifest, preservation, source-identity and empty-index assertions | Passed |

These are executions across different worktrees, with overlapping tests; they
must not be advertised as a count of unique tests. The 11 observations explicitly
reproduce unfixed shell/session/database limits and remain release concerns.

Main commands: `node scripts/test-auth-return-paths.cjs` (202),
`node scripts/test-auth-return-ui.cjs` (113),
`node scripts/test-onboarding-submission.cjs` (37),
`node scripts/test-invite-handoff.cjs` (14),
`node scripts/test-organizer-workspace.cjs` (65),
`node scripts/test-event-compatibility.cjs` (54),
`node scripts/test-event-series.cjs` (53),
`node scripts/test-partner-authorization.cjs` (50), and
`node scripts/test-partner-discovery-navigation.cjs` (22).

Combined commands use those applicable suites plus
`test-public-hackathon-data.cjs` (21), `test-public-hackathon-browsing.cjs` (45),
`test-hackathon-discovery.cjs` (47), `test-hackathon-discovery-page.cjs` (8), and
`test-partner-presentation.cjs` (57); event compatibility has 58 cases on PR #21,
and the organizer workspace suite is covered in the main run. The unchanged
PR #21 checkout runs the four public data/browsing/discovery suites (121).
The two explicit `AUTH_REVIEW_MODE` commands above separate cross-worktree
regressions from known-gap observations.

Both worktrees ran `NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next
typegen` followed by `npm run typecheck -- --incremental false`. ESLint ran on
all 12 changed code/test files; `git show HEAD:src/app/onboarding/page.tsx` piped
to ESLint confirmed its existing warning. `git diff --check` and explicit checks
for trailing whitespace/newlines in untracked files passed.

Browser commands run the actual unchanged browser scripts in the combined fixture
using a scratch preload selecting installed `/usr/bin/chromium` for each installed
Playwright instance. The already-declared `esbuild@0.28.2` was installed only under
local scratch tooling because it was absent; no package manifest, lockfile or
preserved dependency tree changed. Browser local socket permission was needed;
all fixture requests were intercepted, and no live OAuth/Supabase/cron call occurred.
Craft browser evidence is local ignored scratch output, not a deployed site.

Resolved validation failures: the first new-origin run had two incorrect loopback
expectations (197/199); NextRequest's existing localhost normalization is now
accounted for. The first refreshed compatibility run passed 18/28 because its old
fixture lacked AbortController and the new pagination interfaces, causing cascading
React failures; the fixture was corrected without touching PR #21. The combined
partner-navigation run initially passed 20/22 because it supplied an unconfigured
fake callback origin. Its isolated test harness now explicitly configures that
trusted fixture site; the application origin guard was not weakened. Final runs
above contain no unresolved regression failures. Initial browser launcher/tooling
errors were resolved locally; they are not counted as successful tests.

### Exact full local patch manifest (14 files)

- `src/lib/auth/returnPath.ts`
- `src/lib/auth/callbackOrigin.ts` (new in reconciliation)
- `src/app/auth/callback/route.ts`
- `src/app/login/page.tsx`
- `src/components/auth/SignInPanel.tsx`
- `src/app/onboarding/page.tsx`
- `src/app/LandingPageClient.tsx`
- `scripts/test-auth-return-paths.cjs`
- `scripts/test-auth-return-ui.cjs`
- `scripts/test-onboarding-submission.cjs`
- `scripts/test-auth-browsing-compatibility.cjs`
- `scripts/test-partner-discovery-navigation.cjs` (existing fixture adapted)
- `docs/architecture/auth-return-path-hardening.md`
- `docs/architecture/shared-shell-suspension-remediation-plan.md`

This reconciliation changes five of the original twelve files (callback, return
suite, compatibility probe, both docs), adds the callback-origin helper, and adapts
one existing partner-navigation fixture. The other seven reviewed files are
byte-for-byte unchanged. All 19 suspension source files, its original HEAD/diff,
both independent PR #21 checkouts, and all 12 merged Craft N Code files are
preserved. Four indexes remain empty. No own commit, push, PR or deployment exists.
The earlier text export remains an unchanged historical review package.

The isolated auth-return correction is ready for a **draft PR after separate Git
publication authorization**. That is not approval to merge PR #21 or deploy the
combined product: the independently observed suspension gaps and live origin/OAuth
configuration checks remain unresolved.

**Recommendation: hold the claim of safe integrated merge.** The landing sink is
now included in this local fix. Integrate the shared return-path change, separately
resolve the automatic failed-session guest transition, and review both owners'
suites against the combined tree. Approve a separate shared-shell remediation
and reconcile authoritative RPC/RLS enforcement in the suspension work;
do not present PR #21 as comprehensive suspension enforcement. Keep reconciled
RLS/RPC/Storage/Realtime work separate. No security-sensitive production cutover is
authorized by this implementation, and no new cost or dependency is introduced.
