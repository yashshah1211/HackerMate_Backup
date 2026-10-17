# Phase B: public hackathon browsing

Local implementation on `audit/browse-before-signup`, based on `32980ea483fc3043086d970242fcbc8023d88669`. No database or live configuration changes.

## Contracts and behavior

- `/hackathons` and ordinary `/hackathons/[id]` use a scoped browsing boundary instead of the shared AuthGuard. Middleware, AuthGuard and Cloud-owned suspension enforcement remain unchanged.
- Public reads name event columns explicitly and require both `status = approved` and `archived = false`, including direct-ID requests. External/null types, feedback status and organizer identity do not override visibility. Existing organizer/admin routes retain their separate authorization and are untouched.
- Guests mount only public event reads. They do not query registrations, saved events, owned teams, invitations, builder discovery or resources. Active onboarded accounts retain the existing participant detail component and its authorized workflows. Incomplete accounts can read event information; participation CTAs direct them through onboarding.
- Session absence is distinguished from failed session verification. Existing sessions require `getUser()` and a matching own profile with explicit `is_banned = false`. Missing/failed profiles and auth failures stop page access; suspended accounts see an account notice. Auth changes and window focus reverify access, invalidate pending verification and unmount the previous account subtree. This is a client UI boundary, not server-side suspension enforcement.
- Guest bookmark/Saved actions show a sign-in CTA. Generated login/onboarding links validate local hackathon destinations, retain query state and never encode an instruction to mutate after login. Users deliberately choose the action after returning. Incomplete accounts cannot bookmark or open participant actions until onboarding is complete.
- Descriptions use the existing structured renderer; public dates/prizes/tags and event website navigation remain available. Website links allow HTTP(S) only. Public details have loading, unavailable, not-public and Retry states. Listing failures are not presented as an empty successful result. Personalized-read failures have their own notice.
- Bookmark submissions are guarded against duplicate requests, recheck the account and ignore post-unmount results. Public detail/list effects also ignore obsolete responses.

## Privacy and compatibility limits

Owner-supplied production evidence says `hackathons_read_anon` uses `USING (true)` and anonymous column privileges are broader than this projection. This implementation does **not** fix database privacy: a direct Supabase client can still exercise those existing privileges. Pending/rejected/archived rows are excluded by these page contracts, not made private by this change. A separately approved RLS/column-permission task must inventory all consumers before tightening database access.

All 260 non-archived production events reportedly have explicit approved status. That evidence was supplied by the owner, not queried during this work. Rows with missing status/archive values now fail closed on these pages. Owners/admins must use the separately authorized organizer/admin paths for non-public records. Partner pages, SIH, builder/team browsing and shared shell behavior are outside this phase.

The scoped boundary must be independently checked alongside Cloud's comprehensive suspension enforcement before merge. It does not revoke sessions, enforce database bans, or protect unrelated shared-shell requests. No claims of comprehensive account or database privacy enforcement are made.

Public detail intentionally omits participant counts, team/builder lists and resources for guests. Those existing features remain in the authenticated component. Incomplete profiles now receive public detail plus an onboarding CTA rather than mounting participant effects.

## Offline verification

- `node --test scripts/test-public-hackathon-browsing.cjs scripts/test-hackathon-discovery.cjs scripts/test-hackathon-discovery-page.cjs scripts/test-event-compatibility.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-presentation.cjs scripts/test-onboarding-submission.cjs scripts/test-invite-handoff.cjs scripts/test-partner-authorization.cjs`
- `node --test scripts/test-public-hackathon-browser.cjs`
- `node node_modules/typescript/bin/tsc --noEmit --incremental false`
- ESLint scoped to changed JS/TS files, compared with HEAD for pre-existing diagnostics; `git diff --check`.

The React tests execute actual page effects against isolated fixtures. Coverage includes guest/active/incomplete/suspended/unverifiable sessions; approved/archive filters and ID reads; forbidden guest queries/mutations; safe destinations; request failures/Retry; auth transitions, delayed verification and cleanup. Existing registration, discovery, consent, OAuth callback and onboarding regressions run offline.

The browser test bundles actual directory/detail components and system styles using existing esbuild/Tailwind dependencies. Chrome desktop (1440px) and mobile (390px) requests are intercepted; no application server, remote Supabase, authentication, production reads or mutations are used. It checks the mobile filter sheet, bookmarks/sign-in links, event information, overflow and browser errors. It does not claim live authenticated or production QA.

No commits, staging, pushes, PR creation, migrations or deployments are authorized in this phase.

## Initial Phase B results (published head `0e71088032109d4c24ff1e910b6344fc775221d1`)

- 325 tests passed, 0 failed/skipped, including the two offline Chrome viewport tests and 58 authenticated event compatibility tests.
- Full TypeScript check passed with incremental output disabled.
- Scoped lint: no new violations. The existing authenticated detail file retains exactly the same normalized diagnostics as HEAD (5 errors, 5 warnings); all other changed code/test files are lint-clean.
- Diff whitespace and targeted credential-pattern checks passed. Forbidden shared auth/middleware and migration paths are unchanged. Nothing is staged.

Changed paths:

1. `src/app/hackathons/page.tsx`
2. `src/app/hackathons/[id]/page.tsx`
3. `src/lib/hackathons/discovery.ts`
4. `src/lib/hackathons/publicBrowsing.ts`
5. `src/components/hackathons/BrowsingBoundary.tsx`
6. `src/components/hackathons/PublicHackathonDetail.tsx`
7. `scripts/test-public-hackathon-browsing.cjs`
8. `scripts/test-public-hackathon-browser.cjs`
9. `scripts/test-hackathon-discovery-page.cjs`
10. `scripts/test-event-compatibility.cjs`
11. `docs/architecture/public-hackathon-browsing.md`

Ready for independent review of this local diff. Git publication requires separate authorization. Database privacy and comprehensive suspension enforcement remain separate security concerns, as described above.


## Independently reviewed follow-up: landing consistency and complete pagination

Locally implemented against head `0e71088032109d4c24ff1e910b6344fc775221d1`. Owner authorization covers these two fixes and offline validation only; no staging, commit, push, PR update, merge or rollout is authorized.

### Landing visibility

`getLandingData` now applies `status = approved` AND `archived = false` to both the exact hackathon count and upcoming listing. External/null-type and feedback-status exceptions are removed. The existing selected columns, eight-event limit, start-date/name ordering, India-calendar date handling, Unstop date exception, builder/team queries and failure fallbacks are preserved. This filtering is explicit even when the existing server client uses elevated database privileges.

Offline tests render the actual landing hero and verify its event links, then exercise the public-detail loader against eligible fixtures. Approved native/external/null-type events remain eligible. Pending, rejected, archived, missing-status, feedback-only-approved and unspecified-archive fixtures are excluded. Query errors retain the original logged fallback behavior.

### Complete directory pagination

`loadPublicEvents` requests at most 250 rows per page, ordered by immutable event ID ascending. Each request repeats the exact public projection and approval/archive filters. Subsequent requests use `id > last_received_id`. A short page does not end the traversal: only an empty page confirms completion. No additional count query or database change is needed.

The loader validates the shape, maximum size and strict ID progress of every page. Missing IDs, duplicate/backward IDs, query failures and invalid pages reject the entire load. It allows at most 200 requests, including the final empty page; reaching that safety ceiling is a logged, explicit failure, never truncated success. The ceiling limits requests rather than promising a particular record capacity, so a lower server response cap reduces the number of records that can be traversed within it.

The directory passes an AbortSignal through the installed Supabase query builder. A newer refresh/Retry aborts the obsolete request; unmount aborts pending traversal. The helper also checks cancellation after awaited responses and before subsequent requests, covering transports that settle after cancellation. Existing generation/unmount guards remain in place. New page results are published only after a complete traversal, and later-page failures reach the existing unavailable/Retry UI without exposing a partial list. Previously completed data can remain visible alongside a refresh error. Search, filters, Saved/Past selection and ranking continue to operate on the completed result set.

**Consistency limit:** multiple paginated requests are not a transactional snapshot. Concurrent inserts before the cursor, edits to already-read rows, or changing visibility can produce a mixed-time view. Refreshing performs a new traversal; this implementation does not claim snapshot consistency or database privacy enforcement.

### Performance and cost

For N eligible records and a full 250-row response cap, a successful traversal uses `ceil(N / 250) + 1` sequential requests, including the empty completion request. Empty data uses one request. The owner-reported 260-event catalog would use three requests instead of the prior single request, if unchanged. Lower response caps increase request count. Memory remains proportional to the complete eligible metadata set, with intermediate results held until completion. ID cursor ordering uses the existing primary key; no new index, migration, dependency, service or recurring subscription is introduced. Existing API/egress usage still applies.

### Actual follow-up validation

- **349 tests passed; 0 failed, cancelled or skipped.** The original 325-test PR #21 suites remain covered, with 21 new data-contract tests and three new React pagination lifecycle tests.
- The new data suite covers more than 1,000 events, lower caps, exact multiples, empty/short non-final pages, later-page failures, duplicates/non-advancing/malformed cursors, the request ceiling, cancellation and explicit retry, search/filter/ranking across boundaries, and landing/detail visibility agreement.
- Actual React page effects verify that later-page failures do not render partial records; Retry resets the cursor and preserves filters; newer loads abort obsolete pages; and unmount cancels traversal even when a delayed transport ignores abort.
- Offline Chrome desktop/mobile tests use actual pages, components and styles with intercepted requests. No live browser sign-in, Supabase access, user-data writes or deployments occurred.
- Full TypeScript check passed with incremental output disabled.
- Scoped lint comparison against the approved head: zero errors and zero warnings in all seven changed code/test files, both before and after (the new test file is also clean). The previously documented authenticated-detail baseline is outside this follow-up and untouched.
- Diff whitespace, credential-pattern and forbidden-scope checks passed. No authentication validators, shared auth pages, middleware, AuthGuard, policies, migrations, email paths or dependency manifests are changed.

Combined offline command:

```text
node --test scripts/test-public-hackathon-data.cjs scripts/test-public-hackathon-browsing.cjs scripts/test-hackathon-discovery.cjs scripts/test-hackathon-discovery-page.cjs scripts/test-event-compatibility.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-presentation.cjs scripts/test-onboarding-submission.cjs scripts/test-invite-handoff.cjs scripts/test-partner-authorization.cjs scripts/test-public-hackathon-browser.cjs
```

### Exact local follow-up paths (8)

- `src/lib/getLandingData.ts`
- `src/lib/hackathons/publicBrowsing.ts`
- `src/app/hackathons/page.tsx`
- `scripts/test-public-hackathon-data.cjs` (new)
- `scripts/test-public-hackathon-browsing.cjs`
- `scripts/test-hackathon-discovery-page.cjs`
- `scripts/test-public-hackathon-browser.cjs`
- `docs/architecture/public-hackathon-browsing.md`

### Remaining security dependencies

Cloud Codex retains ownership of the separately scoped shared OAuth/login/onboarding return-path hardening and comprehensive suspension enforcement. Neither is implemented or edited by this follow-up. The previously reproduced shared return-destination defect remains pending that security work; the hackathon-specific validator is unchanged. Cloud's named pending branch was unavailable at the last read-only review, so cross-branch integration is not verified. Obtain its reviewable head/diff and reconcile verified-session, missing-profile, suspended-account and profile-permission semantics before merge. Existing broad anonymous RLS/column grants remain unchanged and require separately approved database privacy work.

Recommendation: the local follow-up is ready for independent review. Only after review and separate Git authorization should a focused follow-up commit be published to PR #21. Do not merge or deploy as part of publication.

## Local authentication-lifecycle follow-up (2026-10-16)

Isolated branch `fix/public-browsing-auth-lifecycle`, worktree
`public-browsing-auth-lifecycle`, based on current PR #21 head
`22f5bdf6cd3f2c18753834991e04da0fd43b82fb`. Fetched main is
`eed24a1384dd30dff05d13bf971f81e9ccac4f24` (merged Craft N Code PR #22).
Main was inspected, not merged into this local patch. The published PR branch,
partner portal and Cloud review checkout are not modified. Only local changes
and offline tests are authorized; no staging, commits, pushes or PR updates.

### Reproduced root cause

The verifier correctly rejected suspended, missing-profile, null-ban and failed
verification states on an initial request. However, the boundary treated every
auth notification as a fresh stateless verification. After SDK credential
removal and `SIGNED_OUT`, the same verifier could correctly see no session/user
and return guest. That result erased the boundary's earlier blocked state.
Generation guards prevented stale completions, but did not preserve this history.

Installed `@supabase/supabase-js` and `@supabase/auth-js` are 2.108.2. Inspection
of the installed SDK confirms `_callRefreshToken` may call `_removeSession` on
a non-retryable refresh error after access-token expiry; `_removeSession`
emits `SIGNED_OUT`. Such an event is not proof of deliberate logout. Official
references: [auth-state notifications](https://supabase.com/docs/reference/javascript/auth-onauthstatechange)
and [local-scope sign-out](https://supabase.com/docs/reference/javascript/auth-signout).
The official changelog request was unavailable locally; docs search and installed
SDK source were used instead. No remote authentication or database calls ran.

### Implemented transitions

`BrowsingBoundary` retains an in-memory, per-mounted-boundary requirement for
explicit guest recovery. It records observed session-bearing auth events,
`SIGNED_OUT`, and current non-guest verification results. This is UX lifecycle
history, never an authoritative suspension record or a persisted ban flag.

| Current observation / action | Result |
| --- | --- |
| Fresh credential-free verification, no observed account/error/loss | Guest; no profile or participant queries |
| Verified identity + matching own profile + explicit `is_banned=false` | Member, retaining actual onboarding state |
| Suspended or unverifiable profile/session | Blocked with Retry and explicit sign-out/public-browsing action |
| Any unattributed `SIGNED_OUT`, including during initial verification | Invalidate old work; credential-free rechecks remain blocked |
| Focus / Retry with credentials missing after account/error/loss | Remain blocked; absence does not erase history |
| `SIGNED_IN`, `TOKEN_REFRESHED`, focus or Retry verifies a current active account | Member; old account subtree is discarded |
| Explicit “Sign out and browse public events” | One `signOut({scope:'local'})`, then verify; only confirmed guest clears the recovery requirement |
| Sign-out error, retained credentials or failed post-sign-out verification | Remain blocked; error logged; never report guest success |
| New auth/focus generation while recovery is pending | Obsolete recovery cannot publish guest over the newer account/check |
| Unmount | Unsubscribe, clear timers/focus listener and reject all stale completions |

The boundary exposes no credentials and uses the existing verifier unchanged.
No second active-account abstraction, auth-return validator, storage key,
BroadcastChannel or shared-shell hook is introduced. Supabase calls remain
deferred outside auth callbacks. The auth subscription remains stable through
Retry. Duplicate recovery clicks share one in-flight sign-out operation.

The existing keyed guest/member subtree and immediate loading state on auth
events discard personalized state before a new verified identity is rendered.
Actual directory tests cover late A bookmark results and pending bookmark
authorization across an A-to-B switch; neither can update or write under B.
Already-started verification/status reads may finish after invalidation, but
their results cannot publish access or mount a participant subtree. No SDK
credential mutation is rolled back by this component.

### Cross-tab and shared-shell limits

Supabase does not attach user-intent provenance to `SIGNED_OUT`. A mounted
boundary therefore conservatively treats a sign-out broadcast from another tab,
or from the shared shell, like automatic loss. The user can explicitly confirm
public browsing locally. No intent is inferred merely from event name or a
credential-free session. Existing shell sign-out remains untouched: it currently
signs out and hard-navigates to `/`.

The recovery requirement is not persisted across a full reload, a new tab or a
new boundary mount. A new component with no credentials/history cannot tell a
formerly blocked account from a genuine anonymous visitor. This patch does not
claim cross-navigation/reload suspension enforcement or a global auth framework.
Likewise, SDK-level sign-out races may remove a concurrently arriving session;
the boundary prevents stale authorization/guest publication, but does not rewrite
SDK storage or restore credentials. That case requires a fresh explicit recovery.

If product requirements need intentional shell/cross-tab logout to bypass the
extra local confirmation, the smallest future coordination point is a trusted
shared-session **explicit sign-out operation/result** notification, distinct from
raw SDK `SIGNED_OUT`, with identity/generation information and completion/error
status. Any per-tab or cross-navigation provenance should be owned by that shared
lifecycle, not persisted as an authoritative client-side ban flag. No such
interface or Cloud/shared-shell edit is made here.

The separately reviewed `useShellSession` protected work, cached identity /
`DailyStreakTracker`, deployed `record_daily_visit()` SECURITY DEFINER ban gap,
and notification subscription/callback issues remain unresolved by this patch.
Database authorization and broad anonymous permissions are unchanged. This is
not comprehensive account-suspension enforcement.

### Local validation and integration handoff

- Before the boundary fix, the expanded 60-case browsing suite passed 49 and
  failed 11, including automatic guest downgrade and missing explicit recovery.
  After the fix, all 60 passed. Three additional race regressions were then added.
- Final combined command above: **367 tests passed, 0 failed/cancelled/skipped**
  (349 existing tests plus 18 new lifecycle regressions). The browsing suite now
  has 63 tests, using actual React effects, directory/detail components and
  injected offline clients. Updated fixtures model distinct profile identities,
  delayed users/bookmarks, real sign-out method outcomes and raw auth events.
- Coverage includes fresh anonymous, active/incomplete, suspended, missing/null
  profiles, verification/expiry errors, refresh-triggered initial session loss,
  pending verification, raw/cross-tab-equivalent sign-out, explicit local recovery,
  failure/unconfirmed sign-out, duplicate clicks, A-to-B changes, refreshed tokens,
  focus/Retry, bookmark authorization and unmount cleanup.
- Both existing network-isolated Chrome viewport checks passed: desktop 1440px
  and mobile 390px. Guest listings/filters/details and bookmark sign-in handoffs
  remain intact. No live Supabase calls, browser authentication or user writes.
- Full TypeScript typecheck passed with incremental output disabled. Scoped
  lint and final diff/credential/scope checks are recorded in the local handoff.
- Exact changed files: `src/components/hackathons/BrowsingBoundary.tsx`,
  `scripts/test-public-hackathon-browsing.cjs`, and this architecture document.
  `publicBrowsing.ts`, pagination, shared auth/shell, partner routes, database
  permissions, dependencies and email code remain unchanged.

The local patch is ready for independent review and a controlled integration
with Cloud's OAuth hardening. This is not merge/release approval or proof of the
unpublished Cloud combination. Obtain Cloud's final head and verify return-path,
verified-session/missing-profile/suspended semantics together. Preserve the
separate shared-shell/database remediation tasks and the limitations above.
