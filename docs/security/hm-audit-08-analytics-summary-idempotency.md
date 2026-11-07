# HM-AUDIT-08 — Analytics digest idempotency

Branch `fix/hm-audit-08-analytics-digest-idempotency`. Reviewed base `2f4594996d841e62cc815fd20f052e6c3ee3d27d`.

**READY FOR PR.** The implementation is local, unstaged and uncommitted. The offline PR selection has one confirmed Windows line-ending baseline failure.

## Failure and guarantee

The old analytics-summary route authenticated, generated its report and contacted Resend independently on each GET or POST without a durable admission record. Two valid requests could both send. The offline reproduction returned 24 successes from 24 concurrent invocations. A lost response could also lead an operator to manually repeat a send already accepted by Resend. The HM07 workflow sends once per invocation, so it cannot prevent repeats across invocations.

The new route admits at most one provider attempt per **Asia/Kolkata reporting date** among handlers using the same primary database and claim namespace. It derives the date from the server-generated analytics snapshot using the existing `indiaReportDate` helper. Subject, PDF title, attachment name and claim identity share that snapshot. India midnight is 18:30 UTC on the preceding UTC date. UTC midnight stays inside the same India reporting date. An invocation that crosses midnight still belongs to the date of its snapshot.

## Admission and durable evidence

The route inserts one `cron:analytics-summary:v1:YYYY-MM-DD` row into existing `public.app_settings`. PostgreSQL's primary key on `key` arbitrates concurrent inserts. A plain INSERT must return exactly one matching row with the exact key and serialized evidence. A 23505 conflict returns HTTP 409 with `success: false`. Missing credentials, permission errors, missing or malformed receipts and unconfirmed writes fail closed before provider contact. There is no read-then-write admission check. [PostgreSQL primary keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS) and [Supabase insert receipts](https://supabase.com/docs/reference/javascript/insert).

The value stores the reporting date, random attempt UUID, SHA256 digest of the provider payload, timestamps, state and provider status or message ID when available. It stores no report body, attachment, credentials or recipient addresses. The hash aids comparison of attempts but is not the admission key. Database errors are logged as fixed text and validated error codes. Duplicate responses omit the existing row and report details.

| State or outcome | Meaning |
| --- | --- |
| `claimed` | Initial INSERT committed. Provider contact has not started. A stopped process leaves the row held. |
| `dispatching` | The confirmed owner committed this transition before issuing the provider POST. A stopped process may have reached Resend. |
| `accepted` | A 2xx response contained a valid nonblank provider ID. Record the ID and HTTP status. |
| `rejected` | Resend returned a definitive 4xx other than 408, 409 and 429. Keep the row. |
| `unknown` | Transport loss, timeout, redirect, 408/409/429, 5xx, empty or malformed acknowledgement, or another ambiguous response. Keep the row. |
| `bookkeeping: failed` | A transition failed or its receipt was unconfirmed. A start transition failure blocks the provider call. A final transition failure leaves the previous hold or a committed outcome whose acknowledgement was lost. A confirmed provider acceptance still returns HTTP 200 with `resendId`, `success: true` and `retrySafe: false`. |
| Duplicate or infrastructure unavailable | Return 409 or 503. Neither response grants authority to contact the provider. |

Every update matches both the key and the entire prior value, including owner UUID and state, then verifies the exact returned row. No provider request is made inside a database transaction. Claim writes have a ten-second client timeout. A timed-out write may have committed, so the request fails closed. Claims have no expiry, release, deletion or reset endpoint. Other report and outreach namespaces remain distinct.

## Provider and HTTP compatibility

The route makes one POST with a 15-second timeout and rejects redirects. It sends `Idempotency-Key: hm-analytics-summary/v1/YYYY-MM-DD` for defense in depth. Resend documents a 24-hour retention window and requires an identical payload for safe replay. Analytics counts and generated PDFs can change between invocations, so the durable claim blocks all same-date replays and the route does not retry. [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys)

The route keeps its own provider request because the shared dispatcher imposes different sender configuration, rewrites sandbox recipients and changes the subject. The existing analytics sender and recipient fallback order, report counts, PDF layout, unmeasured metrics and partial data states are preserved. HM07 continues to validate `success`, `resendId`, `dispatch.status` and `dispatch.providerStatus`. Provider acceptance does not establish delivery.

Both GET and POST email paths require the existing Bearer secret, including in development. Authenticated `?format=pdf` works before and after a claim and never accesses the claim or provider. The existing local development PDF exception is preserved. Only the exact optional PDF parameter is supported. Explicit payload framing is rejected except zero Content-Length. The route does not use body contents. Unsupported methods cannot send, including Next.js's implicit HEAD dispatch. The Node adapter regression covers the stream Next.js wraps around a bodyless POST. The digest workflow retains its manual trigger, canonical origin, no redirects and no retries.

## Verification

The interrupted session completed 50 focused tests, 21 native PostgreSQL tests and 146 analytics, daily-report and email compatibility tests. The review agents stopped at the usage limit without findings. The resumed review found a production compatibility problem in the request-body check and an authorization gap in the development email path. The fixes accept the Node adapter's empty stream with absent or zero Content-Length and require authorization for every email path. Both independent reviewers rechecked the changes and reported zero remaining actionable implementation findings.

The native harness uses a fresh loopback PostgreSQL cluster, real INSERT and UPDATE statements through independent `psql` processes and three separate route instances. A loopback HTTP server counts provider POSTs. Twenty-four simultaneous GET/POST invocations yielded **one provider POST, one HTTP 200 and 23 HTTP 409 responses**. Follow-up requests left the existing row untouched. The tests also exercised failed database permissions, stale or forged update ownership, commit with lost acknowledgement, acceptance with failed bookkeeping, provider connection loss, ambiguous and definitive errors, PDF-only access, legacy namespace isolation and date rollover.

The native harness translates the Supabase operations into SQL. It verifies PostgreSQL semantics and the route's handling of receipt shapes. It does not certify production PostgREST, deployment or email delivery. Tests use synthetic credentials and the loopback-only Node guard. The HM07 workflow harness uses its read-only Bash curl function. The unchanged Windows CRLF database-report test stops before its PATH-based curl stub can run.

| Final check | Result |
| --- | --- |
| Focused HM08, analytics PDF/auth, daily-report claim and email compatibility | 198 passed, including 52 HM08 tests. Zero failures or skips. `hm08-focused-final.log` |
| Native HM08 and HM03–HM06 | 81 passed, including 21 HM08 tests. Zero failures or skips. PostgreSQL 18 with loopback HTTP. `hm08-native-final.log` |
| HM07 workflow shell | All 103 passed within the updated offline PR selection |
| Exact updated offline PR selection, including HM07 | 1,636 total, 1,635 passed, one unchanged Windows CRLF failure, zero skipped. `hm08-pr-offline-reviewed.log` |
| TypeScript | Passed with `--incremental false --pretty false` |
| Changed-file ESLint | Passed, zero diagnostics |
| Offline production webpack build | Passed. 89 of 89 pages generated with synthetic loopback configuration and fixture fonts. `hm08-build-final.log` |
| Diff and scope | Passed. Eight scoped files, empty index, no credential patterns or generated output in the diff. |

Counts overlap. The known Windows baseline failure comes from `scripts/test-database-report-workflow.cjs:11`, which splits on an LF-only marker in the unchanged CRLF checkout of `daily-database-report.yml`. Neither file was edited or omitted. The first resumed PR-selection run encountered Windows sandbox restrictions on Bash and loopback connections. The approved rerun used the same test selection and network guard. The initial build hit an EPERM writing generated files under `.next`. The guarded rerun completed with existing Sentry and middleware warnings and expected synthetic data fallbacks. Rack, Aggregator and browser qualification paths were outside this server route and CI selection change.

## Release and rollback

No migration is needed. The existing table already has `key text PRIMARY KEY` and `value text NOT NULL`. Before rollout, confirm read-only that the intended project still has this schema, service-role SELECT/INSERT/UPDATE, private ledger access under RLS and no unexpected triggers or policies. All serving instances must share that database and the same claim namespace. Keep existing cron and provider configuration private. The historical claim counts are snapshot observations and are not deployment checks.

1. Pause manual workflow invocations and all direct email-producing GET/POST calls. Drain in-flight requests and retire old unguarded instances before allowing the guarded route to send.
2. Reconcile recent provider history and dispatch records for the current India reporting date, including any attempts whose outcomes were lost. An absent row does not establish that a legacy sender did not contact Resend. If there is an accepted or unresolved same-day attempt, keep email dispatch paused for that reporting date. Resume on a later independently reconciled date.
3. Deploy the compatible route with its claim helper after review and CI. No schema operation precedes the deploy. Keep email dispatch paused if the table, role, return representation or primary key cannot be confirmed. Use synthetic staging verification. Resume normal authorized invocations only after the guarded version serves every email path.
4. For rollback, keep the email paths paused and preserve the claim rows. Prefer a forward correction or a safe unavailable response for email. Do not restore an unguarded route with email enabled, erase claims, rotate namespaces to bypass a hold or rerun the workflow after an uncertain result. An operator can reconcile a known date with read-only ledger and provider history.

Residual limits include clock differences near India midnight, an older unguarded instance or a deployment against another database, administrative deletion of evidence, indefinite holds after uncertain attempts, and the gap between acceptance and delivery. A failed acceptance write can leave only `dispatching` durable, even when the caller received a receipt. Review the provider's records before taking any operational action. No production endpoint, workflow, email provider or database was invoked for HM08 verification.

## Scoped files

1. `.github/workflows/pr-validation.yml`
2. `docs/security/hm-audit-08-analytics-summary-idempotency.md`
3. `scripts/analytics-digest-harness.cjs`
4. `scripts/test-analytics-digest-claim-local.cjs`
5. `scripts/test-analytics-digest-claim.cjs`
6. `scripts/test-analytics-summary.cjs`
7. `src/app/api/cron/analytics-summary/route.ts`
8. `src/lib/admin/analyticsDigestClaim.ts`

The first session left three tracked modifications and four new implementation and test files in the worktree. The resumed session kept all seven paths, corrected the route, focused test and its harness, and added this handoff. The repository owner can review the exact eight paths for later publication under the workspace Git rules.
