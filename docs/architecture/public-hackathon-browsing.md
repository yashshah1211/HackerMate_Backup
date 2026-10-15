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
