# Mission 17 — Idea Evaluator and Weekly Challenge retirement

Base: `0ef764ca0b078c10ec18e7b3f017aa2ec0c70282`. Branch: `chore/retire-idea-weekly-challenge`.
Founder approved the removal plan and a branch-specific Git publication exception on October 31, 2026. Draft review only; no merge, deployment, database access or production setting changes.

## Product change

- Remove Idea UI/history/attachment APIs, its engine, team-create prefill and the linked scorecard inside PPT reviews.
- Remove Weekly Challenge pages, submissions/evaluation/leaderboard/admin APIs, management UI, components, extractors and streak helpers.
- Remove their navigation, mobile account actions, layout/login mappings and profile practice counts; the development profile fixture matches the reduced stats contract.
- Preserve campus `/leaderboard`, with accurate labeling and an accessible rail/mobile account entry.
- `/tools/ppt-evaluator` redirects to `/my-teams`. Reviews remain inside existing team pages; this is not a standalone evaluator.
- No homepage feature advertisements were found for these products in current main; no homepage redesign or PR #89 code is included.

The PPT engine, extractor, analysis metadata, Gemini gateway, history/generation routes and all rubrics/models/prompts are unchanged. `PPTEvaluatorTab` loses only the linked Idea import/panel. Team creation loses only evaluator prefill and its banner; event, track, invitation, profile nudge and workspace handoff remain.

`evaluationContract.ts` no longer imports the deleted Challenge contract. Only unused Idea/Challenge error variants and helpers are removed; PPT parsing bounds, deadline/abort handling, safe logging, identity/banned-profile checks and score/evidence validation remain. Admission retains identical PPT HMAC key derivation, actor and target cooldowns, exact-token checks, 15 attempts per target per rolling 24 hours and conservative partial consumption. Retired Idea/Challenge quota branches and exclusive types are removed. Shared `EVALUATOR_GENERATION_ENABLED`, provenance and expired-rate-limit cleanup remain needed by PPT/other routes; no environment flag or cron schedule changes.

## URL behavior

Removed filesystem handlers cover `/evaluator`, `/tools/pitch-evaluator`, `/challenges/**`, `/api/evaluator/**`, `/api/challenges/**` and `/api/admin/challenges/**`.
The production app-paths manifest must contain no retired handler. Real loopback requests exercise GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS at 16 former route patterns. Public/page/API paths return 404. Preserved `/api/admin` middleware can return 401 for guests before filesystem lookup; that is an authorization barrier, not a surviving Challenge handler. No broad middleware exception is added.

## Coverage decisions

- Delete exclusively Idea/Challenge suites and the live Idea benchmark script. No benchmark or real provider execution is performed.
- Keep all 32 PPT synthetic content/mode/track cases, numeric caps, total/grade derivation, evidence rejection, save reconciliation, concurrent admission, stale-processing CAS, authorization and request-wide deadline cases from the mixed reliability suite.
- Retain shared provider cancellation/body-timeout/image transport cases. Explicit non-retryable HTTP cases now call the shared gateway directly. Idea-only anonymous/daily/global allowance tests are obsolete; new direct PPT guard tests cover its actual 15-attempt rolling window, pseudonymous keys, token spraying, actor/target cooldowns, malformed RPC results and failed token reads.
- Mixed browser suite retains every PPT scenario at 390/1440: failure/no score, retained draft/retry token, honest visual/text mode, history provenance on selection/refresh/reload, interrupted processing, disabled pending form, stale account response rejection and visitor controls. Remove only retired screens/scenarios.
- Keep certificate/admin-report maintenance tests, admin authorization for surviving routes, immutable M1 SQL/checksum/privilege-definition coverage and rate-limit retention of historical keys. Remove obsolete Idea attachment/history and Challenge route tests.
- Auth return-path cases use existing event/team destinations with the same query/hash and encoding assertions. No auth sanitizer or authorization rule changes.
- Existing Rack portal and guest/incomplete/member journey tests remain. Add source/manifest/HTTP negative-route coverage and real production-browser 404/preserved-route checks.

Initial targeted development run: 250/271 passed, 21 failures from stale removed-module/history tests. Those were identified as obsolete coverage, not hidden by skips. After updating mixed suites and adding preserved guard coverage: 279/279 passed. An intermediate browser-fixture extraction syntax error was corrected before its successful runtime qualification. Initial TypeScript correctly identified the removed Idea-only scripts and obsolete development-profile statistic; both were removed as approved.

Final staged review caught unintended text-decoding changes in four test/support files, including an en-dash in a preserved PPT assertion. Each file was reconstructed from exact base UTF-8 bytes with only its intended single retirement edit. No assertion corruption remains. The complete 29-file selection was rerun afterwards: 1,704/1,704 passed; focused lint on these restored files and new tests passed. Earlier results are not substituted for this final rerun.

First Linux CI at `d1b11f42eb7582d14c0597d38994d8e1e0e9540e`: TypeScript passed; offline selection had 781 passed, zero assertion failures and one cancelled test. The existing PPT stalled-DNS test mocked a permanently pending promise with no active handle; native `AbortSignal.timeout` is unref'ed, allowing Node 22 to exit before its deadline. A standalone local probe confirmed that event-loop mechanism, while the same isolated test happened to pass on local Node 24. The test now supplies a bounded 1-second referenced fixture handle with `try/finally` cleanup. Its original 10ms deadline, required timeout rejection, zero transport-call assertion and application download code are unchanged. This is a test-fixture lifetime correction, not a weakened timeout or application fix. Current-head CI results and final commit are recorded in the Draft PR.

## Fresh validation

| Command | Result |
| --- | --- |
| `node --import=./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-feature-retirement.cjs scripts/test-evaluator-generation-admission.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-maintenance.cjs scripts/test-evaluator-result-authority.cjs` | 279/279 PASS |
| `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` | PASS |
| `node qa/rack-qualification.cjs ppt-browser` | 2/2 viewport journeys PASS; 0 external requests, 0 database mutations |
| `node qa/rack-qualification.cjs retirement` | Webpack checkpoint: 89/89 static pages; 112/112 HTTP checks (98×404, 14×401 protected admin namespace); 2/2 browser viewport groups; alias 307→`/my-teams`; 6 synthetic reads, 0 mutations. Final harness uses default Turbopack, blocked locally by the external dependency junction; current-head Linux CI must qualify it. |
| Comprehensive offline selection (29 files, command below) | 1,704/1,704 PASS, zero failures/skips |
| Scoped ESLint (30 changed/new code/test files) and exact-base comparison | Candidate: 11 errors / 27 warnings; same paths on exact base: 24 errors / 27 warnings. All new files clean. Not a lint PASS. |
| `node qa/rack-qualification.cjs browser`; `node qa/rack-qualification.cjs funnel-browser`; `node qa/test-rack-network-guard.cjs` | 19/19, 32/32 and 8/8 PASS |
| `node --import=./qa/fixtures/rack-network-guard.mjs -e "require('./scripts/ppt-vision-harness.cjs').harness({}, {console}).load('scripts/test-expo-scoring.ts')"` | All 5 existing Expo scoring cases PASS |

Installed Next 16.4.3, React 19.2.4, Playwright 1.64.0, TypeScript 5.9.3, esbuild 0.28.2 and JSDOM 26.1.0 were checked against the unchanged lockfile. Reused lockfile-identical existing dependencies through an ignored worktree junction; no local installation or lifecycle scripts. CI uses existing locked `npm ci --ignore-scripts`; no dependencies changed. Synthetic services and offline fonts only; application egress blocked by the existing network guard. Screenshots/logs are under ignored `scratch/feature-retirement/`, retained by existing Linux CI.


The new browser test initially assumed Next's default 404 heading/status. Inspection established HackerMate's global `Page not found`/`Error 404`, segment-specific `Partner event not found`, and existing streamed 200/noindex response for an async partner miss. The missing event CTA assertion is scoped to `main`, preserving the unrelated global header link. These fixture/selector mistakes were corrected without application changes; final Webpack/runtime qualification passed. Configured Rack, missing-event and error suites separately passed. The final harness explicitly changes only its bundler selection to default `next build`. Local Turbopack failed before compilation with `Could not find the Next.js package (next/package.json)`: it excludes the reused dependency junction outside this checkout root. No application config workaround, security bypass or installation attempted. Current-head Linux CI must close the final default-build gate.

Remaining lint findings trace to existing admin/team-create code. Exact base separately reports `checkAdminAccess`, `setAvailableTracks` and `setMaxMembers` effect diagnostics. Shifted code-frame line numbers are not new errors. The base admin dependency warning names `fetchAdminChallenges` and `leads.length`; after deleting the former, `leads.length` remains. No hook behavior, dependencies or lint rules were changed to hide these. Existing Sentry/middleware/Edge warnings remain. The known PR #89 homepage hydration issue is excluded, not claimed fixed.

Scoped lint used installed ESLint `lintText` on each exact changed/new path, then `git show HEAD:<path>` for an in-memory comparison with the exact base. Full diagnostics/logs remain under ignored `scratch/`; no lint configuration changes. Review confirmed no diff in migrations, package manifests/lockfile, AI gateway, PPT engine/extractor/metadata, PPT routes, middleware, Expo or partner runtime source.

```powershell
node --import=./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-feature-retirement.cjs scripts/test-evaluator-generation-admission.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-result-authority.cjs scripts/test-evaluator-maintenance.cjs scripts/test-ppt-vision.cjs scripts/test-ppt-document-identity.cjs scripts/test-rate-limit-retention.cjs scripts/test-auth-return-paths.cjs scripts/test-auth-return-ui.cjs scripts/test-onboarding-submission.cjs scripts/test-public-hackathon-browsing.cjs scripts/test-public-hackathon-shell.cjs scripts/test-event-compatibility.cjs scripts/test-rack-it-up-2026.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-admin.cjs scripts/test-partner-authorization.cjs scripts/test-partner-organizer-api.cjs scripts/test-partner-metrics.cjs scripts/test-team-creation.cjs scripts/test-squad-matching.cjs scripts/test-certificate-id-integrity.cjs scripts/test-certificate-verification-page.cjs scripts/test-admin-authorization.cjs scripts/test-admin-moderation.cjs scripts/test-admin-moderation-ui.cjs
```

## Database retirement is separate and NOT performed

Preserve all applied migrations, including M1 with normalized SHA-256 `35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3`.
Residual objects identified from source migrations (not a live schema claim):

- `public.user_pitch_evaluations`, its user/team foreign keys, indexes and historical select/delete policies.
- `public.weekly_challenges` and `public.challenge_submissions`, their team/user/event relations, indexes, policies and previously applied constraints/columns.
- Storage bucket `challenge_submissions_bucket`, briefing/upload objects, public URLs and storage policies. Removing application code does not revoke existing public object URLs.
- Existing `rate_limits` keys for retired pipelines may remain until normal shared retention; no counter resets or data deletion. `check_rate_limit`, PPT tables/view and shared cleanup must survive.
- M1 covers all three result tables. Do not rewrite, partially reapply or remove it. Residual historical-schema permission tests remain intentionally applicable.

A future separately approved retirement migration must first inventory live objects, functions/views/triggers/grants/storage policy dependencies and every remaining consumer; determine archive/legal/user retention, export needs, recovery and compatibility with old deployments. Restrict legacy writers and cached/old deployment access before changing grants or dropping anything. No arbitrary DROP/CASCADE or storage purge. Any remaining direct Supabase access governed by existing grants/RLS, historic public storage URLs, old deployed app routes and old cached clients are not disabled by an undeployed source PR. No claim of production retirement until separately released.

## Review and rollback

Complete changed-file inventory is recorded below before publication. Current-head CI is reported in the Draft PR; local evidence is not relabeled as Linux CI or production acceptance. PR #89 hydration fixes remain excluded; pre-existing homepage hydration behavior is not a Mission 17 pass claim. Existing authentication, team/PPT history errors and production data were not changed or tested live. Any independently discovered pre-existing issue is not silently fixed here.

Rollback is a reviewed application-only commit revert; retained history/schema/storage makes no data restoration necessary. Restoring these retired operations would require a separate founder decision, not an automatic failure recovery.

## Complete reviewed file inventory (64 files)

- `M` `.github/workflows/pr-validation.yml`
- `M` `.github/workflows/rack-portal-qualification.yml`
- `M` `docs/architecture/auth-return-path-hardening.md`
- `M` `docs/plans/2026-10-23-evaluator-reliability-quality.md`
- `M` `docs/qa/evaluator-reliability/README.md`
- `A` `docs/qa/feature-retirement.md`
- `A` `qa/browser/feature-retirement.cjs`
- `M` `qa/rack-qualification.cjs`
- `D` `scripts/benchmark-live-evaluators.ts`
- `M` `scripts/fixtures/evaluator-benchmarks.cjs`
- `M` `scripts/test-admin-authorization.cjs`
- `M` `scripts/test-auth-return-paths.cjs`
- `M` `scripts/test-auth-return-ui.cjs`
- `D` `scripts/test-challenge-correctness.cjs`
- `M` `scripts/test-evaluator-generation-admission.cjs`
- `M` `scripts/test-evaluator-maintenance.cjs`
- `D` `scripts/test-evaluator-regression.ts`
- `M` `scripts/test-evaluator-reliability-browser.cjs`
- `M` `scripts/test-evaluator-reliability.cjs`
- `M` `scripts/test-evaluator-result-authority.cjs`
- `A` `scripts/test-feature-retirement.cjs`
- `M` `scripts/test-ppt-vision.cjs`
- `M` `scripts/verify-db-authz.js`
- `M` `src/app/admin/page.tsx`
- `D` `src/app/api/admin/challenges/[id]/route.ts`
- `D` `src/app/api/admin/challenges/route.ts`
- `D` `src/app/api/challenges/[slug]/evaluate/route.ts`
- `D` `src/app/api/challenges/[slug]/route.ts`
- `D` `src/app/api/challenges/[slug]/submissions/[id]/route.ts`
- `D` `src/app/api/challenges/[slug]/submissions/route.ts`
- `D` `src/app/api/challenges/leaderboard/route.ts`
- `D` `src/app/api/challenges/route.ts`
- `D` `src/app/api/evaluator/evaluate/route.ts`
- `D` `src/app/api/evaluator/history/route.ts`
- `D` `src/app/challenges/[slug]/page.tsx`
- `D` `src/app/challenges/[slug]/submissions/[submissionId]/page.tsx`
- `D` `src/app/challenges/page.tsx`
- `M` `src/app/dev/v2/profile/page.tsx`
- `D` `src/app/evaluator/page.tsx`
- `M` `src/app/leaderboard/page.tsx`
- `M` `src/app/login/page.tsx`
- `M` `src/app/profile/[id]/ProfileView.tsx`
- `M` `src/app/profile/[id]/useProfileData.ts`
- `M` `src/app/teams/create/page.tsx`
- `D` `src/app/tools/pitch-evaluator/page.tsx`
- `M` `src/app/tools/ppt-evaluator/page.tsx`
- `D` `src/components/LinkedIdeaScorecard.tsx`
- `M` `src/components/PPTEvaluatorTab.tsx`
- `D` `src/components/PitchEvaluatorClient.tsx`
- `D` `src/components/challenges/ChallengeLeaderboard.tsx`
- `D` `src/components/challenges/ShareScoreCardModal.tsx`
- `D` `src/components/challenges/TeamsEmojiCelebration.tsx`
- `M` `src/components/shell/AccountMenu.tsx`
- `M` `src/components/shell/navConfig.tsx`
- `D` `src/lib/challenges/challengeEvaluationContract.ts`
- `D` `src/lib/challenges/challengeEvaluatorEngine.ts`
- `D` `src/lib/challenges/challengeExtractor.ts`
- `D` `src/lib/challenges/streakHelper.ts`
- `M` `src/lib/evaluator/evaluationContract.ts`
- `M` `src/lib/evaluator/evaluatorBudgetGuard.ts`
- `M` `src/lib/evaluator/evaluatorTypes.ts`
- `M` `src/lib/evaluator/generationAdmission.ts`
- `D` `src/lib/evaluator/trackEvaluatorEngine.ts`
- `M` `src/lib/layoutConfig.ts`
