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
