# Mission 05 — retention and evaluator reliability QA

Status: **retention, PR A and PR B implemented and validated offline; production release remains blocked on operational evidence and separate explicit approval**. The dated checkpoints below preserve their original evidence; the PR B section records the complete 60-case offline candidate, final inventories and current limitations. This is not a production-ready release.

Main baseline, independently reverified October 24, 2026: `83a9fa3187715dbb0f8a0104e97d492cd73e3a50`. Draft sequence: retention #60 → Idea #61 → PPT/Challenge PR B. Current branch: `fix/presentation-evaluation-outcomes`. The retention draft is a prerequisite for new evaluator namespaces.

## Retention PR #60 inventory — seven files

1. `src/app/api/cron/database-activity-report/route.ts`: cleanup only on constant-time authenticated machine GET, excluding PDF/interactive/POST paths; aggregate result on report JSON/subsequent report failures. Existing streak/report/email logic and status semantics preserved. Existing catch narrowed from any to unknown with equivalent message behavior for scoped lint.
2. `src/lib/evaluator/rateLimitRetention.ts`: new bounded expiry helper, deletion predicate recheck, confirmed counts, sanitized diagnostics and explicit backlog/uncertainty outcomes.
3. `scripts/test-rate-limit-retention.cjs`: 38 offline regressions using actual helper/handler and real Supabase client transport with mocked fetch.
4. `scripts/test-admin-authorization.cjs`: extend existing VM fixture with AbortSignal/timer globals and expiry-query methods; preserve existing assertions.
5. `docs/plans/2026-10-23-evaluator-reliability-quality.md`: approved plan, read-only findings, approved amendment and expanded inventory.
6. `docs/qa/evaluator-reliability/README.md`: this QA record and release/rollback gates.
7. `docs/qa/evaluator-reliability/results.json`: machine-readable results and outstanding gates.

Retention PR only: no UI changes/screenshots, package changes, migrations, environment changes, production writes, paid calls, new schedule, dependencies, accounts or infrastructure. Evaluator screenshots and matrix observations appear in the later A/B checkpoints.

## Behavior and precise retention semantics

Only GET with the configured machine Bearer secret and `format !== pdf` invokes cleanup. Human reports/PDFs, POST, missing secrets, unauthenticated callers and forged cron headers cannot invoke it. PDF requests still require existing human admin authorization even with machine credentials.

At entry fix `cutoff = application time - 60 seconds`. SELECT and DELETE both require `reset_time < cutoff`; equality, recent expiry and every unexpired row survive. DELETE also targets only selected keys. A concurrently renewed row fails the deletion predicate. No counter is reset or rewritten; no TRUNCATE or unfiltered DELETE exists.

Select at most 100 keys per batch, ordered by expiry/key, up to five batches (500 selected rows), plus a one-row final backlog probe. A shared five-second client budget and AbortSignal cover the helper. Timeout/cancellation is not evidence of server rollback: a dispatched DELETE stays bounded by selected keys and expiry. An uncertain response never increases confirmed deletion counts or triggers immediate retry.

Only exact valid affected-row counts are reported. A remaining eligible row gives `partial/backlog_remaining`; failed/malformed/omitted verification gives `unverified`. Earlier confirmed counts survive later failure. Only an empty successful final probe gives `complete`, scoped to its fixed cutoff and instant. Unexpected key formats fail closed before deletion; normal IPv4/IPv6, UUID and bounded namespaces are supported. Legacy compatibility remains a release gate. Logs/results contain aggregates and fixed codes, never raw database errors, IPs, row keys, hashes or tokens.

Existing contact/email limiter calls, limits and denial responses remain unchanged. Streak/report/email behavior continues after incomplete cleanup. **HTTP 200 or email acceptance alone is not retention evidence**: operators must inspect `rateLimitCleanup` and error logs.

Logical lifetime follows each limiter window. Planned evaluator duplicate tokens have a 24-hour window, active slots 75 seconds, daily actor/global counters end at UTC midnight. No evaluator keys are introduced here. Physical eligibility begins 60 seconds after reset_time; removal may occur on the next successful existing 03:30 UTC daily job. Normal daily cadence adds up to roughly 24 hours plus safety margin. **No strict physical deadline or immediate account-erasure guarantee is established.** Skipped, failed, partial or unverified maintenance blocks enabling new keys until reconciled. Erasure/key-rotation obligations must be reconciled with these pseudonymous lifetimes before release. No account-deletion function is changed.

## Verification

```powershell
node --test --test-reporter=spec scripts/test-rate-limit-retention.cjs scripts/test-admin-authorization.cjs scripts/test-email-reliability.cjs scripts/test-admin-moderation.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/lib/evaluator/rateLimitRetention.ts src/app/api/cron/database-activity-report/route.ts scripts/test-rate-limit-retention.cjs scripts/test-admin-authorization.cjs
node scripts/test-public-hackathon-metadata-production.cjs
```

- Combined offline suite: **347 passed, 0 failed** (38 cleanup-specific + 309 existing). Includes renewal races, partial/zero-row/backlog/uncertain results, malformed/error responses, deadline, repeated runs, machine-only auth, report/streak/email compatibility, real Supabase request serialization and contact/email limits.
- TypeScript and scoped lint passed with zero errors/warnings. Final frozen-source production build passed, followed by **44 production HTML checks / 39 anonymous loopback fixture reads**, with no writes or external data. The build used synthetic Supabase configuration and offline fonts.
- Unchanged baseline PPT suite: **49 passed**. Old fallback expectations are not Mission 05 fix evidence.
- Existing local HTTP authorization test executes actual handlers through loopback with mocked identity/database/provider adapters. Transport test uses installed Supabase client with mocked fetch; unexpected network requests fail.
- Early fixture failures were corrected without weakening assertions: TSX generic-arrow ambiguity, cross-realm assertions, missing VM timer globals and a mistaken Supabase safe-key quoting expectation.

No real scheduled execution, production DELETE/latency, PostgreSQL 17/Supabase/PostgREST mutation/concurrency integration or live model accuracy was tested. No demo environment was provisioned. Local builds and mocked races cannot replace these gates. Existing final-build warnings concern deprecated middleware convention and Sentry instrumentation/config conventions; neither was changed here.

## Release dependencies and rollback

1. Verify successful real daily cron invocations, authenticated deployed service-role path/SELECT+DELETE permissions and clock health. Schedule configuration alone is insufficient.
2. Review the 47 legacy expired records and key compatibility without logging keys; obtain separate explicit production deletion approval. No deletion occurred here.
3. Demonstrate maximum observed/expected backlog, including evaluator growth, fits 500 selected rows and five seconds. Mocks do not establish throughput/query-plan cost; no expiry-index migration is authorized.
4. Reconcile failed/skipped/partial cleanup, erasure and key-rotation obligations before enabling namespaces or claiming established retention.
5. Obtain separate production deletion, merge and deployment approval. **Merging may automatically deploy code that deletes production records; such a merge is not authorized.** A/B must document this dependency.

Rollback is application-only: revert the retention commit through a separately approved release. It stops future cleanup but cannot restore deleted ephemeral keys. Never reset active counters or restore expired counters to make retries/tests pass. No schema/config rollback is needed. Disabling cleanup invalidates retention evidence and blocks new namespaces until an approved procedure is restored. No production rollback is authorized by this draft.

## PR A — Trusted Idea Evaluation & Bounded Provider Execution

Checkpoint date: October 24, 2026. Branch `fix/trusted-idea-evaluator`, stacked on retention PR #60 at `40023bf5350b8b19a1e4eeade950a7e81efe50b1`; main baseline remains `83a9fa3187715dbb0f8a0104e97d492cd73e3a50`. This is PR A only. PR B and its remaining 44 contract cases are outstanding; Mission 05 is not complete.

### Exact PR A inventory — 15 files relative to PR #60

1. `src/app/api/evaluator/evaluate/route.ts`
2. `src/lib/evaluator/evaluatorBudgetGuard.ts`
3. `src/lib/evaluator/trackEvaluatorEngine.ts`
4. `src/lib/evaluator/evaluatorTypes.ts`
5. `src/lib/evaluator/evaluationContract.ts`
6. `src/lib/ai/geminiClient.ts`
7. `src/components/PitchEvaluatorClient.tsx`
8. `scripts/test-evaluator-reliability.cjs`
9. `scripts/fixtures/evaluator-benchmarks.cjs`
10. `scripts/test-evaluator-reliability-browser.cjs`
11. `docs/plans/2026-10-23-evaluator-reliability-quality.md`
12. `docs/qa/evaluator-reliability/README.md`
13. `docs/qa/evaluator-reliability/results.json`
14. `docs/qa/evaluator-reliability/idea-failure-390.png`
15. `docs/qa/evaluator-reliability/legacy-mode-1440.png`

### Behavior and reviewed decisions

The Idea route verifies supplied Bearer identity before user history/quota decisions. Body userId never authorizes a write or logged-in exemption. No credentials means guest admission without history; invalid or unavailable supplied credentials never downgrade to guest. Streamed JSON is capped at 64 KiB; field limits and track/types are checked before trim/provider work. Body/query forced heuristic modes are explicitly retired.

New scored success requires completed non-blocked AI output, bounded fields, finite integer scores under track caps, exact source quote anchors and locally derived totals/grade. No defaults, clamping, scale guessing or generic praise repair an invalid response. Empty strengths are valid. The custom rubric format is exactly four distinct named 25-point criteria in JSON; unknown rule/weight fields are rejected rather than silently dropped. Generic and AI criteria do not impose universal RAG/vector/agent/database requirements. A quote anchor is not proof of semantic truth or an independently measured outcome.

Text execution uses pinned gemini-3.6-flash then at most gemini-3.5-flash-lite for eligible transport/5xx/attempt-timeout failure, sharing one two-attempt/request deadline. The Idea output-token ceiling stays 3500. Every Idea network attempt reserves the existing global allowance; no attempt retries to improve its score. All 429 responses stop conservatively because Retry-After alone does not distinguish transient limits from daily/spend exhaustion. Permanent, blocked, malformed, incomplete and cancelled responses stop. Response bodies are bounded. Model versions outside recognized pinned families remain unrecorded, not guessed.

All shared gateway modalities use the private server key in headers, not URLs. Image model cascade/modality and moderation source are unchanged; the existing separate vision raw-response logging is not claimed to be globally sanitized. New evaluator telemetry is limited to random request IDs, fixed codes, models, attempts/status and timing; no source text/URLs, people/team names, user IDs, actor hashes or raw provider/database errors.

Admission uses the verified existing atomic RPC and server-HMAC namespaced identities. Known token reads are exact-key and fail closed. Fixed cooldown/actor allowance precede new per-request storage. For Idea, global admission precedes token creation, so rejected token spraying cannot grow idempotency rows. Provider retries do not reserve actor/token allowance again. Limits remain 2 anonymous / 10 verified-user requests per UTC day and 100 global Idea provider-attempt reservations/day, including conservative failed/uncertain reservations. Active slots last 75 seconds; duplicate tokens 24 hours. Partial reservations are not refunded. A duplicate returns 409/history guidance, not a completed/replayed result. This is not exactly-once execution. Missing/untrusted client-IP evidence shares a conservative anonymous bucket; confirm the production proxy-header boundary before release.

The client sends Bearer credentials and a stable token. Network uncertainty, cooldown and unavailable admission retain it; no automatic resubmission or silent rotation occurs. A confirmed terminal response permits a later explicit new request. Account changes clear old data and abort/ignore stale work, including a late initial Auth error. Inputs cannot change while evaluating; editing later invalidates the old scorecard. No simulated processing stages are shown. Legacy heuristic/AI history remains readable with recorded/unverified causes and unknown mode/rubric labelled honestly; no history is rewritten. A valid Idea score with an unconfirmed save has no saved ID and an explicit warning; persistence failure does not rerun AI.

### PR A verification and limitations

Commands (all offline by default):

```powershell
node --test --test-reporter=spec scripts/test-evaluator-reliability.cjs scripts/test-ppt-vision.cjs scripts/test-rate-limit-retention.cjs scripts/test-admin-authorization.cjs scripts/test-email-reliability.cjs scripts/test-admin-moderation.cjs
node scripts/test-evaluator-reliability-browser.cjs
node scripts/test-public-hackathon-metadata-production.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/app/api/evaluator/evaluate/route.ts src/lib/evaluator/evaluationContract.ts src/lib/evaluator/evaluatorBudgetGuard.ts src/lib/evaluator/evaluatorTypes.ts src/lib/evaluator/trackEvaluatorEngine.ts src/lib/ai/geminiClient.ts src/components/PitchEvaluatorClient.tsx scripts/test-evaluator-reliability.cjs scripts/test-evaluator-reliability-browser.cjs scripts/fixtures/evaluator-benchmarks.cjs
```

Final counts/statuses are recorded in results.json. The suites cover verified/forged/failed identity; streaming/type/track/custom bounds; quotas, UTC rollover, mocked cross-instance/concurrent admission and token spraying; permanent/provider/body-timeout/cancellation/oversized/malformed outputs; every score type/range and grade boundary; grounded evidence; unconfirmed save; and unchanged image/PPT/admin/email/retention behavior. Existing PPT tests still describe pre-B fallback semantics and are compatibility checks, not proof that all evaluators are fixed.

The actual React component and CSS were exercised in Edge at 390 and 1440px through loopback/synthetic Auth/API adapters: failures without score/share, retained drafts/tokens through lost responses and cooldown, explicit later submission, account switching/stale Auth failures, edited-input invalidation, honest legacy/unknown history, retired heuristic query, keyboard-accessible controls and no overflow. The two PNGs were visually inspected; the history sheet is closed before the legacy capture. No live Auth/RLS/Gemini/GA ingestion was tested.

Sixteen Idea cases of the 60-case matrix ran: 12 controlled valid mock responses accepted; four deliberately fabricated citations rejected without a score. Per-case observed results are copied from the actual test artifact, including mock attempts/mode/code/local arithmetic. Mock latency is not provider latency. These fixtures do not establish live accuracy, ranking consistency, prompt-injection resistance, hallucination rate or repeatability. The 44 PPT/Challenge cases remain unrun until B.

Production build uses synthetic Supabase configuration and offline fonts; 44 HTML checks/39 anonymous loopback reads with no writes. Standalone TypeScript must run after the build: one parallel run hit TS6053 while Next replaced generated .next/types files; the serial rerun passed without weakening tsconfig. Scoped lint has zero errors and two pre-existing Next internal-navigation warnings in unchanged team-prefill navigation. Existing build warnings concern middleware and Sentry conventions; neither was refactored.

### PR A release/rollback gates

PR #60's real cron health, deployed cleanup permissions, legacy review, maximum backlog, erasure/key-rotation reconciliation and explicit production deletion approval remain prerequisites for enabling namespaces. HMAC service-key rotation changes actor/token namespaces and duplicate recognition; do not rotate keys to reset limits, and reconcile old-key retention/erasure. The stable global day key is not reset by actor-HMAC rotation. Counters are admission reservations, not provider billing/usage evidence or dollar-spend caps.

Before any release: complete/review B, verify the then-current main and real PostgreSQL 17/Supabase/PostgREST behavior under separately authorized safe conditions, verify server-only key/model entitlement and trusted proxy identity, and obtain merge/deployment approval. No real mutation test, paid model smoke, environment change, demo setup, production deletion or deployment occurred. A successful build/preview or mocked concurrency test cannot replace those gates.

Rollback must preserve verified identity and fail-closed security. Prefer a separately reviewed temporary unavailable endpoint or targeted quality revert; do not blindly restore body-ID impersonation, heuristic substitution or racy counters. Metadata is additive; retain history and do not reset counters or rewrite outcomes. If retention is disabled, block new namespaces until an approved procedure is restored. No rollback action against production is authorized here.

## PR B — Trustworthy PPT/Challenge Outcomes & Processing Recovery

October 24, 2026. Branch `fix/presentation-evaluation-outcomes`, stacked on draft #61 at `0861c28746f462e2f64bcdb0ad0ac703c533e5f7`. This section supersedes earlier checkpoint statements that B or its 44 fixtures were pending. The approved offline implementation and final validation are complete; production release remains blocked. Do not merge any of the three dependent drafts.

### Exact PR B inventory — 24 files relative to PR #61

1. `src/app/api/teams/[id]/ppt-evaluate/route.ts`
2. `src/lib/ppt/evaluatorEngine.ts`
3. `src/lib/ppt/analysisMetadata.ts`
4. `src/lib/ppt/presentationExtractor.ts`
5. `src/components/PPTEvaluatorTab.tsx`
6. `src/app/api/challenges/[slug]/evaluate/route.ts`
7. `src/lib/challenges/challengeExtractor.ts`
8. `src/lib/challenges/challengeEvaluatorEngine.ts`
9. `src/app/challenges/[slug]/page.tsx`
10. `src/app/challenges/[slug]/submissions/[submissionId]/page.tsx`
11. `src/lib/ai/geminiClient.ts`
12. `src/lib/evaluator/evaluationContract.ts`
13. `src/lib/evaluator/evaluatorBudgetGuard.ts`
14. `scripts/test-ppt-vision.cjs`
15. `scripts/test-evaluator-reliability.cjs`
16. `scripts/fixtures/evaluator-benchmarks.cjs`
17. `scripts/test-evaluator-reliability-browser.cjs`
18. `docs/plans/2026-10-23-evaluator-reliability-quality.md`
19. `docs/qa/evaluator-reliability/README.md`
20. `docs/qa/evaluator-reliability/results.json`
21. `docs/qa/evaluator-reliability/team-visual-1440.png`
22. `docs/qa/evaluator-reliability/team-text-390.png`
23. `docs/qa/evaluator-reliability/challenge-failure-390.png`
24. `docs/qa/evaluator-reliability/challenge-text-1440.png`

The three shared source files were already in the approved overall manifest. B reuses/extends them for presentation execution and actor+challenge quota grouping; no new source location was added. No history/list API, downloader, image moderation source, package/lockfile, migration, production configuration, PR #58 or Hustle functionality changed. Existing local fixture tooling is reused; no new test environment or infrastructure was provisioned.

### Result and processing contracts

New PPT/Challenge scores require validated AI results and confirmed completed persistence. Completion confirmation checks intended record/actor/team/version, mode, each category score, total and local grade; a malformed category response cannot stand in for a verified save. Terminal-failure cleanup also verifies the returned ID. Three focused regressions first reproduced these malformed-response gaps, then passed after hardening; a save is re-read before any success claim. Provider failure, invalid schemas, unusable text, admission failure or uncertain writes produce no new scorecard. Existing deterministic generators remain compatibility-only exports with no production callers. Historical heuristic or unrecorded modes remain readable and accurately labelled; category metadata conflicts are unverified, not silently interpreted as web development. Matching versioned rubric/caps/labels/modes are required for comparison.

PPT retains native PDF review: one pinned `gemini-3.5-flash-lite` request, optionally followed only after eligible transport/5xx/attempt-timeout failure by one text request if usable text remains. Both share the same two-attempt and 30-second provider budget. Invalid/blocked/permanent/429 outputs cannot evade validation by switching mode. A native result means the actual PDF was supplied, not independently verified implementation or a proven correct visual assessment. Text-only results explicitly do not validate visuals.

PPT generic/custom caps are 25/25/25/25; specialized caps are 25/35/25/15. Challenge remains its distinct 25/25/30/20 rubric. Totals and each rubric's existing grade thresholds are local. Every deduction validates cap-minus-score arithmetic plus evidence. Text quotes must match source; PDF references must address real physical pages and include observations. Native observations are not semantically independently verified. Empty strengths do not become invented praise. Supported custom JSON is exactly four distinct criteria worth 25 points each; other rules/weights fail explicitly. Only actual authoritative Challenge rules can justify its format violations.

Challenge URL ingestion delegates to the existing HTTPS allowlist, redirect validation, public-DNS pinning and streamed-byte safeguards. No arbitrary fetch remains. Both presentation paths cap PDFs at 8 MB/60 physical pages/120,000 extracted characters, with existing bounded text exports. Parsing is at most five seconds within up to 15 seconds ingestion and remaining work budget. Blank/image-only pages survive PPT ingestion; Challenge requires usable text, never synthesizes six pages and never claims visual review. The 8 MB parser cap does not establish deployed upload ingress/provider limits. Uploaded bytes remain ephemeral; no PDF base64/binary is persisted.

Bearer identity and membership/owner/admin decisions are verified before service writes. Challenge accepts exact/canonical slug or UUID only, active status and a valid current window; invalid team/mode cannot silently become solo. Read/query errors fail closed, including counts and versions. Actor/target 75-second slots and 24-hour token reservations use the previously read-only verified atomic RPC. PPT adds the conservative 15/team counter plus its existing rolling history check. Challenge adds 5/verified-user/challenge independently of solo/team target, plus rolling history. Fixed reservation counters are not exact rolling failed-attempt measurements, usage billing or refunds. Partial reservations and uncertain responses remain consumed; retries are bounded, not exactly-once.

Routes share a request-entry deadline: preflight up to five seconds, work up to 50 seconds, then at most the remaining five seconds for persistence/reconciliation, under the existing 60-second handler. Every database operation has an abort/deadline bound. Once a PPT ID is allocated, failures attempt a conditional `evaluating -> failed` transition without overwriting completed rows. An uncertain completion re-reads the same authorized ID/request metadata before success; unresolved completion/cleanup returns 409 `persistence_uncertain` and the known ID. A hard termination cannot run catch/finally; the UI labels aged rows interrupted/unconfirmed. An explicit authorized POST can recover at most three rows older than 120 seconds with status/team/id/timestamp CAS, then must recheck active state. A remaining backlog or lost race stops. No repair writes occur from GET, PDF reporting or a scheduler.

The exact 42703/PGRST204 + track-column branch retries initialization once without that optional column, never retries unknown insert outcomes and always preserves resolved track/schema/rubric metadata in JSON. Challenge inserts only completed results after AI validation, verifies exactly the intended record and re-reads uncertain saves without calling the model again. Version serialization uses conservative active admission slots and verified reads, not an unimplemented unique constraint.

Inputs/tokens survive uncertainty. Account changes clear old private state and ignore late responses. Pending inputs cannot change; Challenge preserves its existing waiting-panel behavior with honest text. Explicit later attempts are user actions after history guidance, never automatic retries. No success celebration/navigation occurs before a completed record is confirmed. Sharing from the approved Challenge result page is limited to new confirmed versioned text-only records and includes the method/limitations; it reuses existing Dialog/buttons rather than the unrelated modal that claims a verified multi-model jury. That separate source file remains unchanged.

### Verification and runtime evidence

The commands in PR A's verification section now execute all pipelines. The complete suite includes **698 passing tests, zero failures/cancellations/skips**: 301 evaluator regressions (including all 60 matrix cases), 50 presentation extraction/mode/rubric tests, 38 cleanup cases and 309 retained admin/email compatibility cases. Retirement tests deliberately replace former automatic-heuristic expectations with scoreless failure assertions; ingestion, page preservation, image modalities, strict rubric and legacy rendering checks remain. Tests use real routes/engines with synthetic transport/DB adapters that reject unexpected external requests.

Coverage includes missing/failed Auth, owner/member/admin/visitor authorization, exact challenge/window/team checks, malformed/denied atomic results, duplicate/concurrent admission, actor+challenge quota grouping, failed rolling/version reads, score types/ranges/grade boundaries, false totals/grades, non-grounded feedback/eligibility claims, PDF-to-text shared deadlines, native safety/invalid-output stop conditions, unknown saves with successful reconciliation, zero-row completion, failed cleanup, concurrent terminal transitions and bounded stale recovery. Mock CAS/RPC races do not establish deployed PostgreSQL behavior. No paid provider or real database mutation tests ran.

The actual Idea/PPT/Challenge components/CSS ran in Edge at **390 and 1440px**, with retained drafts/tokens, no failure score/celebration, confirmed native/text modes, interrupted processing, account switching, default-deny team controls, legacy/unrecorded method labels, qualified sharing and no horizontal overflow. The share dialog is fully closed before the result capture. All six total Mission 05 images were visually inspected. The four B artifacts are:

| Evidence | Purpose |
| --- | --- |
| [Team visual 1440](team-visual-1440.png) | Native PDF mode and physical-page feedback |
| [Team text 390](team-text-390.png) | Text-only disclosure and topic guidance |
| [Challenge failure 390](challenge-failure-390.png) | Retained input, explicit failure, no score/celebration |
| [Challenge text 1440](challenge-text-1440.png) | Local total 20, honest method, grounded topic feedback |

All **60/60 synthetic mock-response contracts** executed: 16 Idea, 32 PPT, 12 Challenge; **45 controlled valid mock responses accepted, 15 deliberately invalid evidence responses rejected without scores**. Source/mode/attempts/arithmetic/codes and observed test timing are copied from actual test artifacts in results.json. Native fixtures supply synthetic PDF bytes with the case source on the actual page. Timings are local fixture execution, not live latency. This matrix does **not** establish live model accuracy, quality ranking, repeatability, hallucination rates or resistance to real prompt injection. In particular, adversarial rejections test fabricated evidence anchors, not whether a real model ignores the embedded instructions.

Final standalone TypeScript passed serially after the final production build; scoped lint passed with zero errors/warnings. The final source production build passed all 44 HTML checks with 39 anonymous fixture reads, no writes or external data. Existing middleware/Sentry convention warnings remain unchanged. Exact statuses are in results.json. Run standalone TypeScript serially after Next regenerates .next/types. Existing build warnings about middleware/Sentry remain outside scope. The safe production fixture strips real service/provider/email keys and uses loopback anonymous public reads/offline fonts; it does not deploy or exercise live evaluator authentication, model access or database mutations.

### Release prerequisites, retention and rollback

All #60/#61 operational gates remain: verify actual daily Vercel cron success, correctly authenticated deployed GET maintenance path, service-role SELECT/DELETE permissions and clocks, legacy47 review, key-format compatibility and maximum backlog clearance within 100 rows x five batches / five seconds. Retention physical deletion is only the next successful existing daily run after `reset_time < fixed(now - 60s)`; selection and deletion both recheck it. Complete means a successful empty final probe for that cutoff only. Partial/failed/skipped cleanup is not established retention and blocks release until reconciled. There is no strict physical-deletion SLA or immediate-erasure guarantee. Account erasure, HMAC key rotation and retention obligations require explicit reconciliation before enabling evaluator namespaces. No keys/IPs/hashes/tokens are logged.

No successful production cron/deletion, real Postgres17/Supabase/PostgREST concurrency/permissions/CAS integration, safe account-erasure procedure or live Gemini entitlement/quality/latency was established here. Deployed ingress limits, trusted proxy identity and performance remain unverified. A Vercel build, local mock or PostgreSQL18 result cannot substitute for those gates. No demo target, accounts, new credentials, scheduler, dependencies or infrastructure were created. The existing model/output ceilings are bounded but reservations are not a monetary spending guarantee.

**Separate approval is required before any production deletion, merge or deployment. Merging #60 or a cleanup-dependent application PR may automatically deploy production deletion code; that effect is not authorized.** Do not apply any migration or alter production configuration to make these drafts pass.

Rollback is application-only through a separately reviewed change. B can be withdrawn independently of A; retain history and additive JSON metadata. Do not restore SSRF, forged identity writes, numeric fallback or fail-open admission in a blind revert; keep affected evaluator routes unavailable if needed while a safe targeted rollback is reviewed. No DB rollback or historical rewrite is required. Do not reset/refund limiter reservations to force retries. Disabling retention blocks new namespaces until a compliant approved procedure exists and cannot restore already deleted keys. No production rollback was executed or authorized.
