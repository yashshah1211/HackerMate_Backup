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

## Final local results

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
