# Mission 05 — retention prerequisite QA

Status: **retention amendment implemented offline; production release blocked on operational evidence and explicit approval**. This is not the complete Mission 05 release candidate. Evaluator PRs A/B remain outstanding.

Base: latest main independently fetched and verified October 23, 2026: `83a9fa3187715dbb0f8a0104e97d492cd73e3a50`. Branch: `fix/expired-rate-limit-retention`. The separate retention draft is a prerequisite for the approved evaluator sequence. PR #58 and its branch are untouched.

## Exact inventory — seven files

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

No real scheduled execution, production DELETE/latency, PostgreSQL 17/Supabase/PostgREST mutation/concurrency integration or live model accuracy was tested. No demo environment was provisioned. Local builds and mocked races cannot replace these gates. Existing build warnings concern deprecated middleware convention, Sentry instrumentation/config conventions and Node's deprecated url.parse; none was changed here.

## Release dependencies and rollback

1. Verify successful real daily cron invocations, authenticated deployed service-role path/SELECT+DELETE permissions and clock health. Schedule configuration alone is insufficient.
2. Review the 47 legacy expired records and key compatibility without logging keys; obtain separate explicit production deletion approval. No deletion occurred here.
3. Demonstrate maximum observed/expected backlog, including evaluator growth, fits 500 selected rows and five seconds. Mocks do not establish throughput/query-plan cost; no expiry-index migration is authorized.
4. Reconcile failed/skipped/partial cleanup, erasure and key-rotation obligations before enabling namespaces or claiming established retention.
5. Obtain separate production deletion, merge and deployment approval. **Merging may automatically deploy code that deletes production records; such a merge is not authorized.** A/B must document this dependency.

Rollback is application-only: revert the retention commit through a separately approved release. It stops future cleanup but cannot restore deleted ephemeral keys. Never reset active counters or restore expired counters to make retries/tests pass. No schema/config rollback is needed. Disabling cleanup invalidates retention evidence and blocks new namespaces until an approved procedure is restored. No production rollback is authorized by this draft.
