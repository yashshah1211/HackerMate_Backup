# Team-detail request reliability verification

Verified base: remote `main` at `fb3fd3df89836cc782f3123ef296cbc5600a1768`, including merged #37 and #38. Branch: `fix/team-join-request-reliability`. Local verification: October 19, 2026.

Integration follow-up: [combined verification against PR #40 / main `62644c2`](integration-pr40.md). The original results below describe the pre-integration verification. Three additional synthetic invitation-error cases bring the focused suite to 33 tests; real-session verification remains **BLOCKED**.

## Confirmed issues and correction

These are source/runtime fixture findings, not claims of observed production incidents or database corruption.

- A successful empty request read never cleared `requestSent`. Refreshing the team also did not refresh request/membership status. Removed requests could therefore remain labeled Request sent. Successful reads now replace both true and false values; reads also refresh on focus, visible-tab return, local team-change events and explicit Retry.
- Request and membership query errors were ignored. A failed initial request read could display an enabled Request to join; a failed membership preflight could still call the RPC. Status is now explicitly checking, ready or error. Errors log the actual cause and block submission; Retry performs reads only. Last verified pending state is retained during failures without claiming it is current.
- Team/account state was not reset on auth changes and async results were not fenced. Synthetic account/route switches retained the prior pending/owner state; old responses could overwrite newer state. A local keyed account/team boundary now resets private state, and identity epochs, read generations and mounted guards reject stale work. Delayed initial authentication cannot resurrect a logged-out account. Genuine missing sessions remain public visitors; other verification failures offer Retry.
- Simultaneous handler calls could issue multiple request RPCs. A synchronous lock now covers authentication, status preflight and submission. Identity is reverified before the RPC; existing server duplicate protection remains unchanged. Failed or duplicate RPCs only reconcile status with reads; a rejected transport promise becomes unknown status, never an automatic retry.
- Instant joining retains explicit confirmation and the exact `p_team_id`/`p_token` RPC arguments. Stale confirmations are ignored after account/team lifetime changes. Success refreshes membership and request status. Invitation permissions, owner approval and membership RPCs were not modified.

Existing SQL source confirms the request RPC locks the team and rejects an existing pending request. Acceptance and instant joining can delete pending rows. An absent row therefore establishes no accepted/rejected history, and the UI makes no such claim. Deployed policy/RPC behavior was not queried or modified.

## Evidence and results

- Five selected lifecycle reproductions fail against the pinned, unchanged baseline: removed pending row, focus refresh, account/logout clearing, simultaneous calls and failed membership preflight. The same tests pass with the correction.
- **493 applicable React/runtime regressions passed**, including **30 focused lifecycle tests** and 463 existing tests covering success-only request analytics, pending applications, owner review, OAuth return handling, discovery, activity and team creation. Zero final failures/skips.
- **16 desktop/mobile browser checks passed** at 1440×1000 and 390×844, including keyboard Retry, 44px mobile Retry, unknown/loading states, removed pending rows, acceptance/membership, delayed old responses, logout, navigation cleanup, remount and reload. Zero external application requests. Two explicitly initiated synthetic request RPCs (one per viewport); no live writes.
- `tsc --noEmit` passed. Scoped ESLint passed with **zero errors/warnings** (`--max-warnings=0`). `git diff --check` passed. Production `next build` passed (exit 0), including `/teams/[id]` and all static pages. The existing middleware-to-proxy deprecation warning and expected landing-page reads failing against the synthetic host do not affect the build result.

| View | Before: failed read enables requesting | After: error and read-only Retry |
| --- | --- | --- |
| Desktop | [Before](before-desktop.png) | [After](after-desktop.png) |
| Mobile | [Before](before-mobile.png) | [After](after-mobile.png) |

Screenshots use the actual page/view/components and CSS with synthetic Supabase, notification and Next navigation adapters. System fonts replace Next-managed fonts. All four images were visually reviewed. [Machine-readable browser checks](browser-results.json).

An exploratory run of `test-auth-browsing-compatibility.cjs` stopped at its required `AUTH_REVIEW_ROOT`/`SUSPENSION_REVIEW_ROOT` configuration assertion. That separate cross-branch review tool was excluded from the applicable suite; no application assertion failed in it. The ordinary auth return UI/path suites passed. An initial sandbox build was stopped after it stalled; the final build uses normal local execution permissions and synthetic configuration.

## Reproduction

```powershell
npx tsc --noEmit
npx eslint 'src/app/teams/[id]/page.tsx' src/components/TeamOverviewView.tsx scripts/test-team-request-lifecycle.cjs scripts/test-team-request-browser.cjs scripts/test-first-team-request-analytics.cjs --max-warnings=0
node --test --test-timeout=45000 scripts/test-team-request-lifecycle.cjs scripts/test-first-team-request-analytics.cjs scripts/test-my-teams-applications.cjs scripts/test-dashboard-join-requests.cjs scripts/test-auth-return-ui.cjs scripts/test-auth-return-paths.cjs scripts/test-team-discovery.cjs scripts/test-team-creation.cjs scripts/test-team-activity.cjs
node scripts/test-team-request-browser.cjs
# Expected failures on the pinned baseline (no source checkout modification):
node --test-name-pattern="pending request removed|focus, visibility|account switch and logout|synchronous duplicate|preflight read failure" -e 'process.argv.push("--baseline");require("./scripts/test-team-request-lifecycle.cjs")'
```

Use unchanged locked dependencies. The baseline probe writes only an ignored scratch copy from `git show`. The browser runner creates a fresh headless Edge profile and loopback server, blocks external application traffic, and closes both in `finally`. No environment file or live session is loaded by either test harness. Production compilation uses the unchanged Next build command in a child process with only necessary OS variables, synthetic Supabase/site settings and telemetry disabled; no inherited service credentials.

## Authorization, privacy and remaining risks

- Pending and membership reads select only `id`, filtered by team and current user; requests also require pending status. Existing RLS/RPC authorization remains authoritative. No service-role client, profile-content analytics, storage persistence or new privileges.
- The existing `team_join_request_sent` event and `{ source: "team_detail" }` payload remain unchanged, emitted only after an error-free request RPC in the current page/account lifetime. Failed, duplicate, preflight-blocked and stale results emit no success event; reads and instant joining emit none.
- No database, migration, grant, RLS, RPC, configuration, dependency or environment-file changes. No hackathon discovery, Cloud files, Hustle Carnival or communications workflow changes. No merge or manual deployment.
- These fixtures cannot prove deployed RLS/grants, real cookies/OAuth, Next middleware or production latency. Manually verify with separately authorized non-production applicant/owner accounts: real request → owner acceptance/rejection → focus/return/refresh; session expiry, logout/account switch; token-based invitation confirmation, invalid/expired token and existing invitation accept/decline; actual fonts/shell and owner/member controls. No live test records were created here.
- No polling/realtime guarantee: external changes are reflected on the documented refresh triggers. A request already dispatched to the server cannot be undone by navigating away or switching accounts; stale UI/toast/analytics are suppressed, and the server remains responsible for authorization/atomicity.
- Duplicate legacy pending rows produce an explicit unknown-status error through `maybeSingle`, rather than pretending no request exists. Resolving such data is outside this frontend change.

## Exact changed files

| File | Why |
| --- | --- |
| `src/app/teams/[id]/page.tsx` | Account/team lifetime boundary, guarded request reads/submission, explicit status, refresh triggers, preserved instant-join flow |
| `src/components/TeamOverviewView.tsx` | Checking/error/Retry presentation; remove one pre-existing unused icon import for clean scoped lint |
| `scripts/test-team-request-lifecycle.cjs` | Baseline reproductions and focused lifecycle/security tests (30 original; 33 after integration) |
| `scripts/test-team-request-browser.cjs` | Isolated desktop/mobile browser checks and screenshots |
| `scripts/test-first-team-request-analytics.cjs` | Extend existing fixture with auth subscription/window lifecycle; retain analytics assertions |
| `docs/plans/2026-10-19-team-request-reliability.md` | Approved scope, audit and decision record |
| `docs/qa/team-request-reliability/README.md` | Results, manifest, security and limitations |
| `docs/qa/team-request-reliability/browser-results.json` | Browser verification results |
| `docs/qa/team-request-reliability/before-desktop.png` | Pinned-baseline desktop failure evidence |
| `docs/qa/team-request-reliability/after-desktop.png` | Corrected desktop error state |
| `docs/qa/team-request-reliability/before-mobile.png` | Pinned-baseline mobile failure evidence |
| `docs/qa/team-request-reliability/after-mobile.png` | Corrected mobile error state |
| `docs/qa/team-request-reliability/integration-pr40.md` | Combined release-readiness results and exact blocked/manual QA checklist |
