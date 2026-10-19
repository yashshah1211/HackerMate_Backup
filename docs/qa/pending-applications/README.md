# Pending applications verification

Base: `9c857b27e6b1d335ee381831743696103acc16ee`, including merged #35/#36. Branch: `feat/pending-team-applications`. Verified locally October 19, 2026.

Before: `/my-teams` lists only current memberships, so applicants must revisit individual team pages. After: a separate Pending applications section shows each requested team's name, request date, Pending badge and canonical team link. Pending rows never create memberships or workspace/management controls. Withdrawal was considered and explicitly excluded in the approved read-only scope.

## Results

- **27 focused lifecycle/security/React tests passed**, including current-user query filters/projections, wrong-user and non-pending rows, duplicates, unavailable team details, malformed dates, membership/application separation, independent errors/Retry, partial responses, stale reads/authentication, logout/account switching, unmount/remount, join events, focus/visibility refresh and Strict Mode.
- **424 existing regressions passed** for onboarding, OAuth return paths, dashboard join-request review, first-action analytics, team creation and discovery. No shared discovery implementation files changed.
- **16 desktop/mobile browser checks passed**, with zero external requests and zero mutations. Real page/hook/components and application CSS; 1440px desktop and 390px touch viewport; keyboard team navigation and 44px application links.
- Combined suite: **451 passed**, 0 failed/skipped. Scoped ESLint passed with 0 errors/warnings. `npx tsc --noEmit` passed. The production `next build` passed (exit 0), compiling successfully and generating all 96 static pages, including `/my-teams`, with synthetic non-production configuration.

The browser suite verifies default/empty/error states, preserved memberships during application failure, independent Retry, stale response after account switching, logout privacy, cleanup on navigation and reloading on return. A small test-only adapter substitutes Supabase, AuthGuard and navigation. Google fonts use system-font substitutes. These screenshots are synthetic component fixtures, not screenshots of production or proof of a real OAuth/RLS session.

| View | Before | After |
| --- | --- | --- |
| Desktop | [Before desktop](before-desktop.png) | [After desktop](after-desktop.png) |
| Mobile | [Before mobile](before-mobile.png) | [After mobile](after-mobile.png) |

All four screenshots are reviewed. Machine-readable checks: [browser-results.json](browser-results.json).

## Reproduction

Use the repository's unchanged locked dependencies:

```powershell
npx tsc --noEmit
npx eslint src/app/my-teams/page.tsx src/app/my-teams/MyTeamsView.tsx src/app/my-teams/useMyTeamsData.ts scripts/test-my-teams-applications.cjs scripts/test-my-teams-applications-browser.cjs
node --test --test-timeout=45000 --test-reporter=spec scripts/test-my-teams-applications.cjs scripts/test-dashboard-join-requests.cjs scripts/test-first-team-request-analytics.cjs scripts/test-onboarding-submission.cjs scripts/test-auth-return-ui.cjs scripts/test-auth-return-paths.cjs scripts/test-team-discovery.cjs scripts/test-team-creation.cjs
node scripts/test-my-teams-applications-browser.cjs
```

The browser runner uses a fresh headless Edge context, a random loopback port and an external-request block. It closes browser/server in `finally`. The baseline page comes from the pinned Git commit. No application environment file or live session is loaded by either fixture suite.

The production build runs the unchanged `next build` command in a child process with only necessary OS variables and synthetic Supabase/site configuration. No inherited service credentials or environment files are used. Expected public landing prerender reads to `fixture.invalid` fail and log errors; the build may still succeed through existing fallback behavior. The existing middleware-to-proxy deprecation warning is unrelated. This verifies production compilation/prerendering, not production data or deployed authorization.

## Authorization and privacy

Both queries require `auth.getUser()` and filter `user_id` to that verified identity. Applications also require `status = pending`. Explicit projections fetch no profile/email/message data. Frontend guards and result validation supplement existing RLS; they do not replace it. Team-owner RLS can read incoming requests, but this UI's outgoing query remains scoped to the current owner as an applicant. No new privileges, service client, storage persistence, analytics, RPC or write path is introduced.

Auth changes clear both cached resources immediately. Abort signals and identity/resource generations suppress delayed responses and auth lookups. Application failures retain memberships, hide unknown counts and label cached rows as last loaded. Pending duplicates are grouped by team, and verified memberships suppress lingering pending rows without claiming an acceptance history.

## Known limitations and manual checks

- Deleted requests do not establish accepted/rejected/withdrawn outcomes; the UI shows pending rows only.
- External changes appear on refresh, focus/tab return or the existing local team-change event. There is no polling/realtime delivery guarantee.
- A server row cap is detected and labeled partial; pagination is not added. This matters only if an individual user's pending rows exceed the configured Data API cap.
- Missing/inaccessible team details use an unavailable label; the canonical link can lead to an unavailable/not-found page. No team name is invented.
- Verify deployed SELECT policy behavior with existing authorized non-production applicant/owner accounts, including cross-user isolation. Fixtures cannot independently prove deployed RLS or grant drift.
- Verify the real Next/AuthGuard login/logout/account-switch flow and a real owner acceptance followed by return/refresh in an approved non-production environment. Test data creation/acceptance was not performed against production.
- Check production styling with the actual Next-managed fonts and shell, and existing authenticated membership/PPT links in a deployed review environment only after deployment is separately authorized.

No production database writes, migrations, RLS changes, paid APIs, dependencies, email, background jobs or unrelated authentication changes. Cloud's branch and discovery files, TeamsTabs, #36 analytics and Hustle Carnival remain untouched. No merge or deployment is authorized.

## Exact changed files

| File | Purpose |
| --- | --- |
| `src/app/my-teams/page.tsx` | Existing AuthGuard entry point; wires local data and view |
| `src/app/my-teams/useMyTeamsData.ts` | Scoped reads, independent resources and identity/lifecycle guards |
| `src/app/my-teams/MyTeamsView.tsx` | Separate memberships/applications and all display states |
| `scripts/test-my-teams-applications.cjs` | 27 focused runtime/lifecycle tests |
| `scripts/test-my-teams-applications-browser.cjs` | Loopback browser verification and screenshots |
| `docs/plans/2026-10-19-pending-applications.md` | Approved scope, audit and decisions |
| `docs/qa/pending-applications/README.md` | Results, manifest, privacy, limitations and manual checks |
| `docs/qa/pending-applications/browser-results.json` | Machine-readable browser results |
| `docs/qa/pending-applications/before-desktop.png` | Baseline desktop evidence |
| `docs/qa/pending-applications/after-desktop.png` | Final desktop evidence |
| `docs/qa/pending-applications/before-mobile.png` | Baseline mobile evidence |
| `docs/qa/pending-applications/after-mobile.png` | Final mobile evidence |
