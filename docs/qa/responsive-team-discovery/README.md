# Mission 01: responsive team discovery

Validated October 23, 2026. Branch: `feat/responsive-team-discovery`.
Base: `51af1f0d2ed8faa0fed7fb28e699f230496a98be`, independently reverified against GitHub `main` immediately before fetching and creating the isolated worktree.

## Problem and existing implementation

The existing discovery experience already filters genuinely joinable teams, ranks normalized skill overlap, checks optional owner activity, supports team navigation and explicit requests, and links empty results to team creation and developer discovery. Its comparator ranked skill overlap before owner activity. Only recently active owners received a card label; failed and absent activity were indistinguishable on individual cards. Alternatives appeared only after results were empty.

This mission makes recorded recent owner activity the first signal among joinable teams, communicates uncertainty, and helps students find alternatives when visible supply has no confirmed recent owner activity. Historical aggregate production findings are context only and are not hardcoded.

## Approved design and decisions

| Decision | Implementation and reason |
| --- | --- |
| Activity before overlap | Preserve joinability first. Among open peers, confirmed recent activity precedes skill overlap; then preserve creation-date descending and ID ascending tie-breaking. Full, closed and concluded-event peers keep skill/date/ID ordering. |
| Failed activity read | Any failed activity batch disables activity ranking for the entire list, preserving skill/date/ID order. A global notice explains the failure. Successful batches may still supply honest positive labels; cards from failed batches say activity is unavailable. This avoids partial-data ranking bias. |
| Missing or old activity | Say “No confirmed recent owner activity.” This includes missing, inaccessible, malformed, future and older activity values, and never implies inactivity or unwillingness. |
| Loading | Render teams before the optional activity query finishes and say “Checking owner activity…”. Do not show weak-supply guidance until successful checks complete. |
| Weak supply | Reuse `EmptyState`, `Button`, `ButtonLink` and the existing `/developers` and `/teams/create` routes. “Browse other teams” clears the current filters/search and selects All teams. Guidance is based on the filtered results, never a hardcoded inventory count. |
| Account switching | Invalidate pending discovery reads and clear viewer-specific skills/activity on identity changes, following the existing My Teams scheduling pattern. This changes derived discovery data only; authentication, onboarding and access-control rules are unchanged. |
| Errors | Log actual query errors, retain the existing team-load error and Retry pattern, and avoid showing an empty-results verdict alongside a failed team read. |

Assumptions retained: existing client-side discovery scale and fetch strategy, the existing inclusive preceding 30 × 24 hour window, the browser clock, and current session/RLS visibility. No new API, dependency, table, endpoint, permission, paid service, or recruitment definition is introduced. Activity remains a proxy and never promises a response.

## Before/after screenshots

The baseline is the exact base commit above, using identical synthetic fixture data, CSS, fonts and viewport settings. It is not an older pre-activity redesign baseline. The example includes two recently active open owners, a higher-overlap team without confirmed recent activity, an owner with a missing record, and full/closed/concluded-event teams.

| Width | Before | After |
| --- | --- | --- |
| 320px | [Before](before-320.png) | [After](after-320.png) |
| 390px | [Before](before-390.png) | [After](after-390.png) |
| 768px | [Before](before-768.png) | [After](after-768.png) |
| 1440px | [Before](before-1440.png) | [After](after-1440.png) |

Additional states: [activity unavailable](activity-unavailable-390.png), [empty results](empty-390.png), [weak supply](weak-supply-390.png). Machine-readable coverage: [browser-results.json](browser-results.json).

Before: Campus Tools, Weekend Makers, Open Source Builders, Python Studio. After: Open Source Builders, Python Studio, Campus Tools, Weekend Makers. When the optional read fails, the original skill-based order returns. No team is hidden because of owner activity.

## Validation results

- **239 Node tests passed, zero failures/skips.** Discovery, timestamp/query/loading/error/account lifecycle, team creation, explicit join-request lifecycle, pending applications, dashboard join requests, invitations, request analytics and onboarding submission. New behavior tests were added first and failed against the baseline before implementation.
- **Real-component Chromium discovery suite passed at 320, 390, 768 and 1440px.** Covers exact before/after ranking, honest coarse labels, hidden/full/closed-event preservation, filters and All teams, keyboard filter opening/Escape/focus restoration, team-detail link navigation, developer/team-creation links, loading, activity denial, weak supply, account switching, error presentation, and horizontal overflow. All eight requested before/after screenshots were generated and visually inspected across representative mobile/tablet/desktop states.
- **Existing team-detail browser regression: 16 checks passed** at desktop/mobile. Confirms status failures block requests, retries only read, account switching ignores stale results, one explicit synthetic request per viewport, membership-to-workspace transitions, and no visitor management controls.
- **Existing pending-applications browser regression: 16 checks passed** at desktop/mobile, with zero fixture mutations or external requests.
- **Existing first-team activation browser regression: 14 checks passed** with the temporary fixture compatibility adapter described below. Preserves dashboard → discovery → actual team-detail → explicit synthetic request, alternate create-team path, and loading/member/onboarding/error states.
- **TypeScript passed:** `tsc --noEmit --incremental false`.
- **Scoped ESLint passed with zero warnings** for the five changed source/test files.
- **Production `next build --webpack` passed**, followed by `next start` and **44 existing production HTML checks** with 39 anonymous synthetic reads, zero unexpected fixture operations, and no production access. Existing middleware deprecation, Sentry instrumentation and Supabase Edge-runtime warnings remain outside this change.
- **`git diff --check` passed.** Neither manifest nor lockfile changed; `npm ci --ignore-scripts --no-audit --no-fund` installed only the existing locked dependencies in this isolated worktree.

The production harness supplies synthetic public credentials and offline font responses and strips inherited provider credentials. No `.env` files were copied or modified. Browser adapters return synthetic in-memory data and restrict browser requests to their loopback origin. Explicit request tests mutate only fixture memory; no production database writes occur.

### Failures, adaptations and limits

1. The first Edge launch inside the Windows sandbox failed while opening its temporary browser profile. The same loopback-only test succeeded outside the sandbox; this was an environment restriction, not an application failure.
2. The original `test-first-team-activation-browser.cjs` adapter lacks `auth.onAuthStateChange`, which the current team-detail page already requires. Its unadapted run failed to display the request button. A temporary ignored runner supplied the missing no-op subscription mock and reran the original assertions successfully. No authentication, team-detail, dashboard or legacy test source was changed. Existing browser regression evidence was redirected to ignored scratch directories so unrelated tracked screenshots remain unchanged. Windows Git baseline paths were normalized only in that runner.
3. `scripts/test-auth-browsing-compatibility.cjs` could not run: it requires `AUTH_REVIEW_ROOT` pointing to a pinned PR #21 checkout and `SUSPENSION_REVIEW_ROOT` pointing to its preserved comparison checkout. These inputs were not supplied. Its attempted run failed at the explicit prerequisite assertion. This historical cross-branch audit is not counted among the 239 passing current-source tests.
4. Browser fixtures exercise real components, hooks and CSS, but use mocked navigation/Supabase and system fonts. They do not establish actual OAuth/onboarding redirects, deployed RLS parity, authenticated production behavior, or production delivery/analytics ingestion. No authenticated staging session was supplied. The production HTML checks exercise real Next production routes for public event metadata; they do not validate authenticated team activity reads.

## Reproduction

From the isolated worktree after installing the unchanged lockfile:

```powershell
node --test scripts/test-team-discovery.cjs scripts/test-team-activity.cjs scripts/test-team-creation.cjs scripts/test-team-request-lifecycle.cjs scripts/test-my-teams-applications.cjs scripts/test-dashboard-join-requests.cjs scripts/test-invite-handoff.cjs scripts/test-first-team-request-analytics.cjs scripts/test-onboarding-submission.cjs
node scripts/test-team-activity-browser.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/app/teams/useTeamsData.ts src/app/teams/TeamsView.tsx scripts/test-team-discovery.cjs scripts/test-team-activity.cjs scripts/test-team-activity-browser.cjs --max-warnings 0
node scripts/test-public-hackathon-metadata-production.cjs
git diff --check
```

On Windows the discovery browser runner uses installed Microsoft Edge; elsewhere it defaults to `/usr/bin/chromium`. Set `QA_CHROMIUM_PATH` for another installed Chromium executable. Browser/server subprocesses may require running outside a restricted sandbox. The original legacy browser runners overwrite their historical evidence directories; use the temporary runner retained at `scratch/run-journey-browsers.cjs` for the three existing journey suites in this worktree. It only redirects evidence, normalizes Windows Git paths, and supplies the legacy activation subscription mock described above.

Local build evidence is retained in ignored `scratch/build-validation/public-metadata/`; original browser-regression manifests are in ignored `scratch/mission01-regressions/`; the final unit TAP log is `scratch-unit-results.log` (ignored). These are validation outputs, not shipping source changes.

## Exact changed/new files

1. `src/app/teams/useTeamsData.ts`
2. `src/app/teams/TeamsView.tsx`
3. `scripts/test-team-discovery.cjs`
4. `scripts/test-team-activity.cjs`
5. `scripts/test-team-activity-browser.cjs`
6. `docs/qa/responsive-team-discovery/README.md`
7. `docs/qa/responsive-team-discovery/browser-results.json`
8. `docs/qa/responsive-team-discovery/before-320.png`
9. `docs/qa/responsive-team-discovery/after-320.png`
10. `docs/qa/responsive-team-discovery/before-390.png`
11. `docs/qa/responsive-team-discovery/after-390.png`
12. `docs/qa/responsive-team-discovery/before-768.png`
13. `docs/qa/responsive-team-discovery/after-768.png`
14. `docs/qa/responsive-team-discovery/before-1440.png`
15. `docs/qa/responsive-team-discovery/after-1440.png`
16. `docs/qa/responsive-team-discovery/activity-unavailable-390.png`
17. `docs/qa/responsive-team-discovery/empty-390.png`
18. `docs/qa/responsive-team-discovery/weak-supply-390.png`

## Remaining tradeoffs and Mission 02

An active owner with less skill overlap now intentionally appears before an owner without confirmed recent activity, while the existing skill explanation stays visible. This is a discovery signal, not a prediction of responsiveness. Delayed activity can reorder the list after initial render; the new pending label makes this observable. A failed batch intentionally sacrifices all activity ranking for deterministic skill-based fallback while retaining truthful labels from successful batches. No-result guidance is suppressed while data is unavailable. Activity remains a load-time snapshot rather than a live subscription.

Recommend Mission 02: measure explicit join-request outcomes and time to owner decision, including pending-age distribution, before adding another matching feature. Define the measurement/privacy scope first and use outcomes to decide whether recruiting reconfirmation or a simpler owner review flow would improve team formation. This mission adds no telemetry or outreach.

No Carnival work, database writes, migration/RLS changes, production configuration edits, paid service, dependency addition, notifications, merge or deployment was performed. Team detail, requests, invitations, memberships, authentication and onboarding implementation files are unchanged.

## Version-control handoff

The workspace rule reserves staging, committing and pushing for the user. After implementation, validation and the explicit 18-file audit were complete, the user authorized an exception: stage only these audited files, commit and push this branch, and open a draft PR. A prepared draft-PR body and explicit-file Git commands are retained in ignored `scratch/mission01-pr-body.md` and `scratch/mission01-handoff.ps1`. The PR must remain draft and unmerged; no deployment is authorized.
