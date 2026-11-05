# Stabilization validation matrix

Baseline `652d1ef`; local Windows / PowerShell / Node 24.17.0 / npm 11.13.0. Hosted CI uses Node 22; equivalence is not assumed.

| Validation | Baseline | After batch | Limits |
| --- | --- | --- | --- |
| Exact dependency install | PASS: 673 packages, lifecycle scripts disabled | unchanged | Lockfile not modified |
| TypeScript | PASS, exit 0 | PASS, exit 0 | Static only |
| Full ESLint | FAIL: 196 errors, 92 warnings / 66 error files | FAIL: 195 errors, 91 warnings; no added diagnostics | Existing lint failures are not proven functional bugs; changed files clean |
| Aggregator offline selection | PASS: 1,990 / 0 fail / 0 skipped | Unchanged modules; relevant final CI suites also run | Actual TS/React modules with fixtures, external network guard |
| Production build | Initial attempt blocked: Windows EPERM during prerender mkdir | PASS: final build exit 0, 3 synthetic reads, 0 mutations | Existing `qa/rack-qualification.cjs build`: webpack, synthetic loopback Supabase, offline fonts |
| Directory browser desktop/mobile + safety | Restricted attempt stalled at fixture setup, interrupted | PASS: 57 / 0 fail | Existing fixture UI, not live Next/OAuth/RLS; required local process access |
| New boundary regression | FAIL: 22; PASS: 20; skipped: 0 / 42 | PASS: 54 / 0 fail / 0 skipped | Mounted real React guard and real route handlers; mocked auth/profile/storage/moderation |
| Admin security regression | FAIL: 50; PASS: 25 / 75; outdated renderer mock | PASS: all 75 in broader/CI selections | Real route/requireAdmin, synthetic report/PDF; localhost access required |
| Broader regression selection | First run: 901 pass / 50 fail / 951 | PASS: 965 / 0 fail / 0 skipped | 19 suites; added founder/claim coverage; counts overlap other runs |
| Exact updated PR offline selection | Prior selection covered by initial inventory and aggregator run | PASS: 926 / 0 fail / 0 skipped | Exact YAML-selected list executed locally, not hosted CI |
| Targeted guard Chromium | No regression existed | PASS: 1 scenario / 2 viewports (1440/390) / 0 failures | Actual guard + system components/CSS; synthetic auth; external browser requests blocked; no page errors/overflow |
| Existing core query smoke | Existing failure-path unit coverage in repo | PASS: 8 summary checks, 10 reads, 0 mutations | Synthetic HTTP transport, not deployed DB; no `/teams` index or `/hackathons/sih` coverage in existing script |
| Native PostgreSQL authorization | Not run before source fixes; SQL unchanged | PASS: 3 runners / 353 SQL assertions | PG18, fresh local clusters/synthetic IDs/finally cleanup; not deployed Supabase or PG17.6 |

## Functional areas

| Area | Inventory / evidence | Current health / next verification |
| --- | --- | --- |
| Routing/config/deployment | App Router, Next 16.4.3, React 19.2.4; all 56 pages, 51 handlers and nine workflows in SURFACE_INVENTORY.md | Enumerated, not every route behavior manually certified; build warnings separate from defects |
| Auth/onboarding/suspension | Middleware, callback, AuthGuard, requireVerifiedProfile, browsing verifier; return-path/onboarding suites | STAB-001/002/003 resolved locally; OAuth/live session transport unverified |
| DB/RLS/RPC | Supabase migration history and explicit profile projections; native fixture runners available | No permission migration in this batch; deployed grants not inspected |
| Discovery/aggregation | Providers, transport, lifecycle, source evidence, safe writers; offline selection | Ongoing=0 issue #104 remains an investigation lead, not new defect evidence |
| Teams/invites/workspace | Owner/member controls; creation/request/owner review/applications/document fixture suites | Broader fixture suites pass; no live persistence claims |
| Evaluator/scoring/quota | generationAdmission, evaluationContract, budget guard, bounded Gemini client | Existing offline/CI selections pass; no live AI request or quota mutation |
| Partners/organizers/admin | requireAdmin/requirePartnerAccess and dedicated fixture suites | Offline authorization coverage; no live admin operations |
| Email/cron/idempotency | emailDispatch, dailyReportClaim, delivery/autodispatch and reliability suites | Mock-provider tests pass, including ambiguous outcomes and duplicate claims; no live cron/provider invoked |
| Certificates/files/integrations | Exact ID lookup/certificate suite; upload/R2/media signature inspection | STAB-004/005 resolved locally; STAB-006 open; real R2/Discord/provider integrations unverified |
| Responsive/loading/errors/navigation | Directory fixture Chromium desktop/Pixel 7; targeted real guard Chromium 1440/390 | Both browser selections pass; other pages not universally verified |
| CI/tests | PR validation; aggregator/rack/discovery qualification; scheduled external workflows inventoried | No workflows dispatched, no merge/deploy/push |

## Reproduction and validation commands

Run from this worktree with no production environment files. Existing network guard restricts application traffic to loopback; VM harnesses supply synthetic providers. The build runner clears inherited provider settings and mocks fonts/database.

```text
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck -- --incremental false --pretty false
node node_modules/eslint/bin/eslint.js . --format json --output-file scratch/stabilization/verified-eslint.json
node scripts/qualify-aggregator.cjs
node qa/rack-qualification.cjs build
npm run test:browser
node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-stabilization-boundaries.cjs
node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-stabilization-browser.cjs
node scripts/run-stabilization-smoke.cjs
node --import ./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-admin-delete-user-local.cjs scripts/test-registration-privacy.cjs scripts/test-partner-access-sql.cjs
git diff --check
```

The exact final PR offline selection is the explicit list in `.github/workflows/pr-validation.yml`; it was extracted and executed without dropping any test. Broader selection adds admin moderation/UI, return UI, onboarding, team request/owner/applications/documents, email/dedup and organizer broadcast suites; raw commands/results are in `scratch/stabilization/verified-broader.log` and local tool history.

## Limits and environmental findings

- Build warnings: deprecated middleware filename, Sentry instrumentation/configuration/source-map-token notices and webpack cache warnings. They are recorded as warnings, not proven product defects. External telemetry is blocked by the isolated build's network guard.
- Sandbox failures: initial prerender mkdir EPERM, initial browser setup stall and a restricted localhost HTTP EACCES. Retrying the same relevant checks with required local process/filesystem access resolves those environmental failures; assertions were not weakened.
- Core smoke is projection/query transport evidence only. No migration was authored, applied or permission-adjusted. Full authenticated core-page click-through against deployed RLS remains unverified.
- No production account/data mutations, emails, scheduled workflows, provider AI calls, R2 writes, Docker/new projects, commits, pushes, merges or deployments.
- Follow-up presign investigation: current callers/history verified. Vercel is now connected; project/repository/production base commit confirmed. Runtime-event queries and dashboard HTTP Request Logs/CDN Requests returned no presign matches in the displayed retained hour; a populated HTTP control succeeded. Seven-day query rejected by one-hour Hobby retention. External usage outside that window remains unknown. Successful contract preserved; no application changes or new test runs in this documentation-only follow-up. Details: `PRESIGN_USAGE.md`.

Final static comparison: baseline 540 lint inputs, final 543; 196/92 errors/warnings became 195/91. No new diagnostics by file/rule/message/severity. All nine changed/new JS/TS files have zero errors and zero warnings. `git diff --check` passes.

## Second batch verification

| Gate | Before | Verified after |
| --- | --- | --- |
| PPT/email active-account boundaries | 17 pass / 31 fail / 48 | Included in 66 passing focused checks and 992 passing PR checks |
| Notification replay/integrity | 2 pass / 15 fail / 17 | All 17 pass; accepted/rejected/unknown/concurrent attempts authorize at most one provider request |
| HTTP runtime | No dedicated regression | Suspended GET/DELETE 403; active GET/DELETE 200; repeated DELETE 404; database/auth providers synthetic |
| Native PostgreSQL reservation | No regression | 12 assertions pass in one test: actual PK concurrency, permanent outcomes and conditional release |
| Existing related regressions | Earlier baseline suites pass except newly reproduced defects | 264 pass / 0 fail; includes unchanged moderation assertions, email reliability, dedup, result authority and scheduled claim tests |
| Exact PR offline selection | 926 passing first-batch selection | 992 pass / 0 fail / 0 skipped, adds the three new boundary files |
| Full aggregator offline selection | 1,990 passing | 1,990 pass / 0 fail / 0 skipped, rerun after code changes |
| PPT Chromium | Existing fixture suite | 2 viewport journeys pass (390/1440), no external application requests or live mutations |
| Core query smoke | Existing synthetic adapter | 8 summaries pass; 10 reads, zero mutations |
| TypeScript | First batch pass | Pass, exit 0 |
| Full ESLint | 195 errors / 91 warnings after first batch | 195 errors / 91 warnings, zero added diagnostics; five existing any-typing errors remain in touched legacy handlers |
| Production build | First batch pass | Pass, exit 0, 3 synthetic reads / 0 writes; offline fonts/loopback guard |

Commands/evidence: `scripts/test-stabilization-ppt-access.cjs`, `scripts/test-stabilization-email-access.cjs`, `scripts/test-stabilization-notification-replay.cjs`, `scripts/test-stabilization-notification-postgres.cjs`; ignored raw logs under `scratch/stabilization/batch2-*`. Native runner reads only the existing app_settings CREATE TABLE statement (not its seeds), uses a fresh localhost PG18 cluster and synthetic IDs, and closes/deletes it in finally. No production DB or email provider is used.

The existing email reliability fixture now includes notificationId/recipientId and a canonical stored notification, matching the producer SQL. Its expected dispatch/failure assertions remain unchanged. The source changes preserve active owner/member/admin roles and successful response fields; failures that previously disclosed/deleted/sent without verified authority now deny access. A nonexistent scoped deletion returns 404.

Production gates remain unverified: deployed app_settings service-role grants, a real webhook/notification transaction and delivered email. No deployment was performed. Historical seeded-credential activity/rotation is unverified; STAB-011 is not included in confirmed-defect totals. STAB-006 remains unresolved and its contract preserved.

Hosted verification: [Draft PR #116](https://github.com/yashshah1211/HackerMate_Backup/pull/116) / [Actions run 41997786170](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41997786170), source/CI head `ba4c44f`, Linux + Node 22. All job steps succeeded: TypeScript, **992 pass / 0 fail** offline tests, synthetic core smoke, and **1 pass / 0 fail** real-guard Chromium scenario across desktop/mobile. No production credentials are supplied by this workflow. Vercel deployment lookup for this SHA returned zero records. A documentation-only commit records these references; inspect PR checks for current-head status.

## Final release-readiness review — 2026-11-05

Pinned full-PR review at base652d1ef/head9d4c215, followed by focused fixes for STAB-013/014/015. Two independent agents reviewed the original diff and re-reviewed the source corrections. Full analysis, public API contract table, crash policy, production gate and manual reconciliation procedure: [RELEASE_REVIEW.md](RELEASE_REVIEW.md).

| Gate | Verified result |
| --- | --- |
| New defect reproduction before fixes | 88 pass / 6 fail / 94; failed assertions establish receipt loss, cookie precedence regression and stale diagnostic loss |
| Final exact PR offline selection | 1,002 pass / 0 fail / 0 skipped; all existing PR checks retained |
| Existing complete offline qualification | node scripts/qualify-aggregator.cjs: 1,990 pass / 0 fail / 0 skipped |
| Existing rack qualification | node qa/rack-qualification.cjs tests: 850 pass / 0 fail / 0 skipped |
| Existing moderation/email/UI and producer selection | 180 pass / 0 fail / 0 skipped; actual moderation warning assertions retained |
| Native reservation/crash | 15 actual SQL assertions; real worker exit after commit, fresh helper replay, receipt/nonce persistence and existing concurrency/release guarantees |
| Native production dependency/producer fixture | 26 assertions; read-only preflight detects revoked INSERT/UPDATE/DELETE, actual tracked producer emits correct UUID payload to capturing non-networked stub |
| TypeScript | npm run typecheck -- --incremental false --pretty false: pass |
| ESLint | 195 errors / 91 warnings; zero new file/rule/severity/message diagnostics compared with batch2-final-eslint.json |
| Production webpack build | Pass, 3 synthetic reads / zero mutations; offline fonts and network guard |
| Guard Chromium | 1 scenario passes at both1440px and390px; zero external requests |
| Core query smoke | Eight summary checks pass; 10 synthetic reads / zero mutations |
| Independent source review | Standards and Spec reviewers rechecked fixes; no additional source blocker |

Counts overlap and must not be summed as unique tests. Commands: existing PR workflow selection; node scripts/qualify-aggregator.cjs; node qa/rack-qualification.cjs tests/build; network-guarded node --test for test-admin-moderation.cjs, test-admin-moderation-ui.cjs, test-email-reliability.cjs, test-connection-email-dedup.cjs, test-email-ui.cjs, test-stabilization-deployment-contract.cjs; test-stabilization-notification-postgres.cjs; test-stabilization-browser.cjs; node scripts/run-stabilization-smoke.cjs. Ignored raw evidence: scratch/stabilization/release-*.log and release-eslint.json.

One exploratory broader selection initially failed to load test-auth-browsing-compatibility.cjs because its required pinned PR#21 and preserved suspension checkout paths (AUTH_REVIEW_ROOT/SUSPENSION_REVIEW_ROOT) were absent. This historical cross-checkout probe was not pointed at substitute code or modified to pass. Applicable suites reran180/180; historical probe remains unavailable, not a claimed product defect/pass. An intermediate TypeScript closure-narrowing error during implementation was corrected with typed identity returns; final TypeScript passes without suppression.

The native fixture provisions its own privileges and has no real pg_net extension; pg_net_installed is deliberately false there. It proves the preflight reports the missing dependency and captures the real producer function's payload, not live worker health or deployed grants. The new SQL script only returns booleans in a READ ONLY transaction and has not been executed against production. Crash tests establish duplicate-attempt prevention with possible suppressed delivery, not exactly-once delivery. Final hosted CI for the follow-up head remains authoritative on PR#116; no merge/deploy is authorized.
