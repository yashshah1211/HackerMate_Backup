# Mission 05-R2 — Closed generation and historical provenance

Source/test-only implementation authorized by the founder. Starting commit: `df9ac950f67444832e3a221ebb66b1b11576b884` (R1/#67), parent `f8e268dc643deca18bf62bb3a40728bc2d2aa32e` (#63). New isolated worktree: `C:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/mission05-generation-admission`; branch `fix/mission05-generation-admission`. No #65/#66/#68 code is integrated.

The complete handoff, successor prompts, parent AGENTS.md and available frontend Kiro steering were read. The optional founder takeover review was not found. Current source commits were confirmed through GitHub PR metadata and local Git. No production database access was used.

## Generation contract

`generationAdmission.ts` is server-only. Every invocation checks `process.env.EVALUATOR_GENERATION_ENABLED === "true"`; unset, empty, false, whitespace, case variations and other values are closed. No client field, query parameter, header or persisted metadata can enable it.

All three evaluator POST handlers check immediately after generating their server request ID, before reading the request/params, constructing the database client, verifying identity, reserving quotas, extracting documents, recovering stale processing or writing results:

- `src/app/api/evaluator/evaluate/route.ts`
- `src/app/api/teams/[id]/ppt-evaluate/route.ts`
- `src/app/api/challenges/[slug]/evaluate/route.ts`

Closed requests return HTTP 503 with `Cache-Control: no-store` and the same body contract: `success:false`, `result:null`, `code:"generation_closed"`, `retryable:false`, a clear unavailable message and a server-generated UUID. This deliberate unavailable response also applies to invalid/anonymous requests while closed. Existing authorization executes normally when enabled.

The three active engine functions, their dormant exported heuristic helpers, and Gemini text/document entry points independently assert admission before work. A full API caller scan finds only the three scoped generation routes. Image moderation's separate vision path is outside this evaluator switch and was not changed into a global AI kill switch.

No deployment setting or `.env` file was changed. The default-closed production behavior must be part of a separately approved release.

## Provenance policy

All active persisted Idea/PPT/Challenge scorecards are labeled **Historical provenance unverified**, including linked Ideas, history selections and every leaderboard row. Scores, deductions, quotations, risks, recommendations and reported slide feedback remain readable. Stored `schemaVersion`, mode/PDF flags, request IDs, timestamps, used-AI flags and revisions never establish provenance. The leaderboard was omitted in the initial implementation and corrected after source review; see the correction evidence below.

Only a validated successful response from the current generation request can carry an accurate processing-mode disclosure in the active UI. Idea uses explicit component state; PPT uses the returned object's identity in component state. No trust flag is persisted. History selection (including the same record), refresh, reload, new evaluation and identity changes clear that context. Challenge's result page loads a persisted record, so it always uses the historical label. Historical share text qualifies provenance rather than claiming confirmed AI/PDF processing.

Future generated metadata includes fixed bounded diagnostic `revision` values: pipeline prompt revision, rubric revision, `source:"mission05-r2"`, and the exact R1 `sourceBase` SHA. These identify this uncommitted source revision, not a future commit hash, signature or authenticity certificate. Persisted copies remain unverified after reload.

The provenance helper is client-safe; the generation helper uses `server-only`. The synthetic VM harness explicitly adapts that build boundary and enables generation only for original enabled-path tests. Dedicated R2 tests remove or vary the flag. The actual Next build verifies server/client module compatibility without replacing the production boundary.

## Preserved authorization and persistence

No history route or permission migration was modified. Authenticated historical reads and owner-scoped deletion remain available while generation is closed. Authorized Idea-to-team attachment remains available, with current banned-profile, evaluation ownership and team owner/member checks. Extra body fields cannot alter scores.

Enabled generation retains anonymous/authenticated Idea policy, banned-user denial, PPT owner/member/admin authorization, Challenge membership/window rules, actor/target quotas, idempotency, bounded provider retries, native-PDF versus text-only validation, stale-processing CAS and confirmed/uncertain persistence handling. R1 organizer rules, quote checks, version scopes and upload limits are inherited unchanged apart from the early route gate.

No historical updates/backfill, database column, migration, permission, provider model, dependency or Vercel configuration changes were made. R3 was not begun.

## Exact implementation inventory

Twenty-five release files belong to R2: twenty-one modifications and four additions. All are unstaged/uncommitted. The narrow leaderboard correction changes three existing R2 files (the two regression scripts and this handoff) and adds one modified source file to the release inventory (`ChallengeLeaderboard.tsx`). The other twenty-one existing R2 files are preserved.

| File | Change |
|---|---|
| `src/lib/evaluator/generationAdmission.ts` (new) | Server-only gate, consistent closed HTTP response, diagnostic revision factory |
| `src/lib/evaluator/evaluationProvenance.ts` (new) | Historical display policy and revision type |
| `src/lib/evaluator/evaluationContract.ts` | Shared scoreless generation-closed failure code |
| `src/lib/evaluator/evaluatorTypes.ts` | Optional diagnostic revision metadata type |
| `src/lib/evaluator/trackEvaluatorEngine.ts` | Active/dormant entry guards and generated Idea revisions |
| `src/lib/ppt/evaluatorEngine.ts` | Active/dormant entry guards and PPT revisions |
| `src/lib/challenges/challengeEvaluatorEngine.ts` | Active/dormant entry guards and Challenge revisions |
| `src/lib/ai/geminiClient.ts` | Text/document gate enforcement; separate image moderation preserved |
| `src/app/api/evaluator/evaluate/route.ts` | Gate before request processing |
| `src/app/api/teams/[id]/ppt-evaluate/route.ts` | Gate before request/DB work and stale-row mutation |
| `src/app/api/challenges/[slug]/evaluate/route.ts` | Gate before request/DB work; R1 behavior preserved |
| `src/lib/ppt/analysisMetadata.ts` | Historical default; fresh mode only with explicit current-response context |
| `src/components/PitchAnalysisBadge.tsx` | Defaults to historical display; accepts current-response context separately |
| `src/components/PitchEvaluatorClient.tsx` | Ephemeral response context, qualified history/copy/share and reported legacy claims |
| `src/components/PPTEvaluatorTab.tsx` | Ephemeral response-object context, validated modes and readable reported historical slides |
| `src/components/LinkedIdeaScorecard.tsx` | Explicit historical provenance label |
| `src/components/challenges/ChallengeLeaderboard.tsx` | Unconditional shared historical label in each row, readable on mobile/desktop; neutral default subtitle |
| `src/app/challenges/[slug]/page.tsx` | Historical label on saved result summaries |
| `src/app/challenges/[slug]/submissions/[submissionId]/page.tsx` | Historical detail and qualified share text; existing share-control conditions preserved |
| `scripts/ppt-vision-harness.cjs` | Explicit synthetic enabled state and server-only module adapter |
| `scripts/test-evaluator-generation-admission.cjs` (new) | 69 permanent tests: original 65 plus four solo/team leaderboard render regressions, with and without forged metadata |
| `scripts/test-evaluator-result-authority.cjs` | Five closed-generation history/attachment/delete regressions |
| `scripts/test-ppt-vision.cjs` | Preserve current-mode assertions; add historical assertions and retain score/feedback checks |
| `scripts/test-evaluator-reliability-browser.cjs` | Forged history and same-record selection/refresh/reload checks; real `/challenges` leaderboard, filters and disclosure at 390/1440px |
| `docs/qa/mission05-generation-admission.md` (new) | This handoff |

## Previously recorded verification before the leaderboard correction

The following commands/results are retained as earlier implementation evidence, not fresh verification of the leaderboard correction. Fresh reruns are recorded separately below. No packages/browsers were installed. Existing dependencies are exposed through an ignored R2-only junction to `gl-bajaj-college-normalization/node_modules`. Parsed package manifests/lockfiles match R1; initial raw byte mismatch was only LF/CRLF. Verified installed versions: Next 16.3.8, TypeScript 5.9.3, ESLint 9.39.4, Playwright 1.64.0, esbuild 0.28.2 and jsdom 26.1.0. No real environment file exists in R2.

1. Final combined regression command:

   `node --test --test-reporter=tap --test-concurrency=1 scripts/test-evaluator-generation-admission.cjs scripts/test-challenge-correctness.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-result-authority.cjs scripts/test-ppt-vision.cjs scripts/test-rate-limit-retention.cjs`

   **Final result: 591/591 passed, zero failures/cancellations/skips**; log: `scratch/r2-offline-accepted.tap`. It covers all 65 new R2 tests, all 52 R1 tests, original enabled Idea/PPT/Challenge/security/quotas/concurrency/reconciliation assertions and retention. Earlier run: 590/591 passed; its single new linked-render test lacked a UI adapter. Corrected targeted rerun: **65/65 passed**, followed by the clean final combined run. Other earlier fixture errors and intended historical-label expectation updates are not product defects and were not hidden by deleting tests.

2. `node node_modules/typescript/bin/tsc --noEmit --pretty false`: final post-build **passed**, zero diagnostics. Log: `scratch/r2-typecheck-final.txt`.

3. Scoped lint over all changed `.ts/.tsx/.cjs` files: complete scope returns **one existing error and three existing warnings**. The error is `LinkedIdeaScorecard.tsx:124` (`no-explicit-any`); warnings are that component's existing callback dependencies and two existing internal-navigation assignments in PitchEvaluatorClient. Parent-source lint through stdin reproduces exactly those findings; message/rule/severity comparison reports **zero introduced findings**. This is not a clean full lint pass. Evidence: `scratch/r2-lint-final.json`, `r2-lint-baseline.json`; command helper `scratch/r2-lint-baseline.cjs`. No unrelated lint cleanup or suppression was added.

   Exact final scoped lint invocation (PowerShell; 23 source/test files, exit 1 from the baseline findings):

   ```powershell
   $r2LintFiles = @((git diff --name-only) + (git ls-files --others --exclude-standard)) | Where-Object { $_ -match '\.(ts|tsx|cjs)$' }
   node node_modules/eslint/bin/eslint.js --format json @r2LintFiles | Out-File -LiteralPath scratch/r2-lint-final.json -Encoding utf8
   ```

4. `HM_EVALUATOR_BROWSER_EVIDENCE=scratch/r2-browser node scripts/test-evaluator-reliability-browser.cjs` (PowerShell uses `$env:HM_EVALUATOR_BROWSER_EVIDENCE='scratch/r2-browser'`): **final run passed** using actual components/CSS at 390 and 1440px with synthetic Auth/API adapters and all external browser requests blocked. Existing eight R1 error cases and all prior evaluator flows pass. Seven R2 provenance check groups cover both viewport widths. Evidence: `scratch/r2-browser/results.json`, `r2-browser-final.log` and screenshots. Checks include stale account/uncertain responses, drafts, no false score on failures, preserved feedback and qualified sharing.

5. `node scratch/prepare-r2-build.cjs` followed by `node scratch/r2-build.cjs`: safe production-build fixture adapted from the existing public-metadata test. **Build passed; 3/3 actual Next HTTP closed-route checks passed with zero database requests; 44/44 HTML checks passed with 39 anonymous read-only loopback requests.** It refuses real env files, strips secret/provider/generation variables and uses synthetic local Supabase plus offline fonts. No paid or remote database requests. Evidence: `scratch/r2-build/build.log`, `generation-gate-http.json`, `evidence.json` and `scratch/r2-build-runner.log`. Middleware/Sentry/Edge-runtime build warnings remain.

Raw scratch logs and generated build output are ignored artifacts, not release files. Tests use fake data/in-memory tables or read-only local stubs, not accounts or production records. R2 tests clean their synthetic table state; no database fixtures were created.

## Leaderboard correction and fresh verification

Source review found a completion blocker in the active `/challenges` leaderboard: persisted category scores, totals and grades lacked the required provenance disclosure. The initial completion statement was too broad. The approved narrow correction adds the shared `HISTORICAL_PROVENANCE_LABEL` unconditionally to every leaderboard row beneath its challenge title. It is normal wrapping text inside the row, without breakpoint hiding or truncation. The default subtitle is neutral rather than claiming AI origin. Scores, grades, category values, ranking, filters, loading/empty states, API requests and database behavior are unchanged.

Exactly four release files changed in this correction: `src/components/challenges/ChallengeLeaderboard.tsx`, `scripts/test-evaluator-generation-admission.cjs`, `scripts/test-evaluator-reliability-browser.cjs`, and this document. The first is the only addition to the original 24-file release inventory. All earlier test assertions remain; four offline tests and additional browser checks were added.

Fresh source searches, including dynamic-import/loader patterns, find `/challenges` as the only current leaderboard consumer. The browser harness now renders that real page and its real leaderboard/CSS, with synthetic API responses. No alternative leaderboard consumer was found.

`src/components/challenges/ShareScoreCardModal.tsx:39` still contains the pre-existing "Verified by Multi-Model AI Jury" claim, and line 107 says "Scored by AI review." Searches for the filename/export and dynamic-loader patterns find no callers, imports, barrel exports or wildcard loaders reaching it in the current source tree. It remains unchanged and dormant. This is a remaining warning: reuse would revive the misleading claim and requires separate review.

The dependency versions listed above and absence of real `.env`/`.env.local` were checked again before execution. Fresh commands below ran sequentially after the correction, with no installs, production/shared-staging access or provider calls:

1. `node --test --test-reporter=tap scripts/test-evaluator-generation-admission.cjs > scratch/r2-leaderboard-targeted.tap`: **69/69 passed, zero failures/skips**. Four new cases render solo/team rows with and without forged metadata, assert the disclosure, retain scores/categories/grade/ranking, reject verification claims, preserve fixture bytes and make zero network calls.

2. `node --test --test-reporter=tap --test-concurrency=1 scripts/test-evaluator-generation-admission.cjs scripts/test-challenge-correctness.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-result-authority.cjs scripts/test-ppt-vision.cjs scripts/test-rate-limit-retention.cjs > scratch/r2-leaderboard-offline.tap`: **595/595 passed, zero failures/cancellations/skips**, including all 52 R1 tests and all original R2 assertions.

3. PowerShell: `$env:HM_EVALUATOR_BROWSER_EVIDENCE='scratch/r2-leaderboard-browser'`, then `node scripts/test-evaluator-reliability-browser.cjs > scratch/r2-leaderboard-browser-rerun.log 2>&1`: **passed**, including all previous browser assertions. New checks exercise All → Solo → Teams → All at both 390px and 1440px (eight populated filter states), then the empty state at each width. Every row retains the disclosure with forged metadata; participant names, ranking, totals, grades and desktop categories remain correct; mobile category hiding is preserved. No horizontal overflow or clipped disclosure, no score mutations and zero generation/provider operations. New contexts permit only the two expected GET APIs. Browser evidence records zero external requests. Both screenshots were visually inspected: `scratch/r2-leaderboard-browser/leaderboard-provenance-390.png` and `leaderboard-provenance-1440.png`; detailed results are in `results.json`.

   The first browser attempt failed before assertions because Edge could not start its sandbox temporary profile/named pipes; log: `scratch/r2-leaderboard-browser.log`. The same reviewed, externally blocked loopback harness passed after approved execution outside that sandbox. No source workaround, dependency installation or assertion deletion was used.

4. `node node_modules/typescript/bin/tsc --noEmit --pretty false > scratch/r2-leaderboard-typecheck.txt`: **passed**, zero diagnostics.

5. Fresh scoped lint (PowerShell):

   ```powershell
   $r2LintFiles = @((git -c core.safecrlf=false diff --name-only) + (git ls-files --others --exclude-standard)) | Where-Object { $_ -match '\.(ts|tsx|cjs)$' }
   node node_modules/eslint/bin/eslint.js --format json @r2LintFiles | Out-File -LiteralPath scratch/r2-leaderboard-lint.json -Encoding utf8
   ```

   **24 source/test files; ESLint exit 1: one pre-existing error and three pre-existing warnings; zero introduced findings.** The baseline findings and locations remain those recorded above. No suppression or unrelated cleanup was added.

The offline build and actual Next HTTP 3/3 checks above are **previously recorded evidence**, not fresh correction results. They were not rerun: this correction changes only an existing client component, tests and documentation, with no routing, configuration or server change; local instructions require a build for those latter changes. Runtime verification of the correction is the fresh synthetic `/challenges` browser run, not a build claim. Live Auth/RLS/database/provider behavior remains unverified and outside this correction.

The complete `scratch/r2-review.patch` is regenerated after this document is finalized and includes all 25 files, including complete contents of the four additions. Its SHA-256 is supplied in the final founder handoff. Every release change remains unstaged/uncommitted; HEAD is unchanged. The remaining R3 and release limits below still apply.

## Environment notes and release limits

Git Bash in this host interpreted a Windows worktree path under a WSL mount, initially placing the new R2 checkout under an unintended nested directory. Native Git repaired the new worktree registration and moved that same checkout to the intended R2 path before source edits. No second R2 worktree or existing source checkout was reused. Native Windows commands were chosen explicitly for the remaining work. This is an execution-environment issue; do not blindly reuse Windows-path commands across Git Bash/WSL.

R2 is ready for founder source review. It is not publication, merge, production configuration or activation approval. The default-off gate is a code boundary, not a replacement for M1: old deployed URLs and direct client database grants remain separate release risks. Historical provenance stays unverified even for newly saved results until a separately approved durable provenance design exists.

R3 still requires approved disposable local PG17/CLI/PostgREST execution proof of exact M1, ledger atomicity/rollback/locks, effective role/column/view denial and positive service persistence/CAS/concurrency. Provider entitlement/mode/latency/quality and controlled authenticated production/runtime checks remain unverified. Future paid synthetic smoke, retention deletion, migration and deployment each require separate approval. Never restore client result-writing grants as rollback.

No staging, commit, push, PR, migration, deployment, production/shared-staging access or paid provider call was performed. HEAD remains `df9ac950f67444832e3a221ebb66b1b11576b884`; the working-tree patch is the deliverable.
