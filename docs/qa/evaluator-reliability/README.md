# Mission 05 — retention and evaluator reliability QA

Status: **retention and PR A implemented offline; PR B outstanding; production release blocked on operational evidence and explicit approval**. This is not the complete Mission 05 release candidate. See the PR A checkpoint below for its separate inventory and validation.

Base: latest main independently fetched and verified October 23, 2026: `83a9fa3187715dbb0f8a0104e97d492cd73e3a50`. Branch: `fix/expired-rate-limit-retention`. The separate retention draft is a prerequisite for the approved evaluator sequence. PR #58 and its branch are untouched.

## Retention PR #60 inventory — seven files

1. `src/app/api/cron/database-activity-report/route.ts`: cleanup only on constant-time authenticated machine GET, excluding PDF/interactive/POST paths; aggregate result on report JSON/subsequent report failures. Existing streak/report/email logic and status semantics preserved. Existing catch narrowed from any to unknown with equivalent message behavior for scoped lint.
2. `src/lib/evaluator/rateLimitRetention.ts`: new bounded expiry helper, deletion predicate recheck, confirmed counts, sanitized diagnostics and explicit backlog/uncertainty outcomes.
3. `scripts/test-rate-limit-retention.cjs`: 38 offline regressions using actual helper/handler and real Supabase client transport with mocked fetch.
4. `scripts/test-admin-authorization.cjs`: extend existing VM fixture with AbortSignal/timer globals and expiry-query methods; preserve existing assertions.
5. `docs/plans/2026-10-23-evaluator-reliability-quality.md`: approved plan, read-only findings, approved amendment and expanded inventory.
6. `docs/qa/evaluator-reliability/README.md`: this QA record and release/rollback gates.
7. `docs/qa/evaluator-reliability/results.json`: machine-readable results and outstanding gates.

No UI changes/screenshots, package changes, migrations, environment changes, production writes, paid calls, new schedule, dependencies, accounts or infrastructure. Evaluator screenshots and the 60-case matrix remain requirements of A/B, not claimed results here.

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
