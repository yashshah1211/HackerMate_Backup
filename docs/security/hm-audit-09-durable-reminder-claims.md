# HM-AUDIT-09 — Durable deadline reminder claims

Branch `fix/hm-audit-09-durable-reminder-claims`. Reviewed base `055ae28265b03eeb5638e4fea9b490533c83d5de`.

**READY FOR PR.** The changes remain local and unstaged.

## Failure and guarantee

The old route let request A and request B both read the same pending saved hackathon. Both could contact Resend before either attempted to update `reminder_sent_at`. The old completion RPC returned VOID, so the caller could not distinguish a changed row from a zero-row update. In the offline reproduction, 24 concurrent requests across three handler instances made 24 synthetic provider attempts for one reminder. After all completion writes were forced to fail, a subsequent invocation made a 25th attempt.

For each logical reminder, the revised route admits at most one provider POST under the shared-primary-database coordination model. It authenticates the cron request before creating the service client. Pending discovery uses the existing service-only RPC and pages by ordered saved UUID, even if a PostgREST page is shorter than requested. A held row stays pending until its original eligibility ends, but paging lets later eligible reminders be processed independently. This is a keyset walk over live data. A concurrently inserted bookmark behind the cursor can appear in a later invocation.

I found no checked-in schedule for this POST route in Vercel or GitHub Actions and no second application caller of the two reminder RPCs. The database authorization audit scripts reference the RPCs for access probes. External callers and provider history require operator verification before rollout.

## Identity and ownership

The key is `cron:deadline-reminder:v1:<sha256>`. The SHA256 input is the JSON tuple of lower-case builder UUID, lower-case hackathon UUID and the registration deadline normalized to UTC with six fractional digits. Offset-equivalent deadlines and UUID case changes collapse to one identity. The saved-row UUID is used to recheck and complete the particular relationship, and is excluded from the claim hash. Neither keys nor evidence store a raw email address.

An unchanged deadline remains the same obligation after deletion and re-saving. A distinct deadline is a distinct claim identity for a currently eligible bookmark. The legacy non-null `reminder_sent_at` marker continues to suppress the particular saved row, including after an event deadline changes. The route preserves that marker as history. A fresh eligible bookmark with a different deadline can have its own claim. An old held claim is retained if a deadline moves and then returns to its former value.

A plain `INSERT ... RETURNING` via the existing `app_settings.key` primary key arbitrates concurrent claims. Only an exact matching key/value receipt grants authority. PostgreSQL 23505 counts as a duplicate. Other errors or missing, extra or mismatched rows fail closed. Subsequent writes match both the key and the full previously confirmed value, which contains a random owner UUID and prior state. The updated value must be returned exactly once. The ten-second write deadlines can leave an unconfirmed write committed. A later invocation still meets the unique key. [PostgreSQL uniqueness checks](https://www.postgresql.org/docs/current/index-unique-checks.html)

## Eligibility and the provider boundary

1. Preflight the current profile and event before spending the permanent claim. A known ineligible record is deferred. The event must be approved and nonarchived, have the claimed deadline within 24 hours, and permit registration under its current dates and status. A persisted `not-yet-open` snapshot can become open at its verified start. Explicit closed, unknown or other unsupported states defer. Legacy rows with no explicit registration status use the valid date window. The intended recipient must have a valid single address and an active, non-banned profile. No separate persisted deadline-reminder opt-out was found in the checked-in policy.
2. Acquire the claim and verify its owner through a `dispatching` compare-and-swap. The journal binds the prepared message and effective sandbox target via a payload hash. The server computes the action link from trusted HTTPS configuration or the canonical HackerMate origin. Request host headers cannot control it.
3. Refresh profile, event and prepared payload after the ownership write. A changed policy or payload suppresses the owned claim. Run the existing pending RPC filtered by saved UUID as the last database read before provider contact. Its query rechecks the exact saved relationship, absent registration, null completion marker, relevant event/profile existence and current deadline. Compare the returned identity and payload fields and check that the deadline still has time remaining.
4. Make a single POST with the existing email dispatcher and `hm-deadline-reminder/v1/<sha256>` as the provider idempotency key. The reminder route opts into rejecting redirects. Other senders retain their existing dispatcher configuration. The same claim never grants a second payload. The provider's 24-hour window is defense in depth. The database hold persists beyond it. [Resend idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)

Policy and pending checks are separate database reads. A ban or event-policy edit can land after its fresh read. A registration, deletion or deadline edit can land after the final pending snapshot and before Resend receives the request. The route holds no database transaction across external I/O. The durable claim still limits duplicate attempts for the same identity. Imported events use stored registration fields. These checks do not establish current availability on the external platform or apply the catalog's provider metadata freshness rule. A per-candidate filtered call reexecutes the legacy set-returning function. Higher volume may warrant a targeted RPC or worker under a separate review.

## Durable outcome and completion

| State or result | Meaning |
| --- | --- |
| `claimed` | Initial write committed. A crash leaves a permanent hold. |
| `dispatching` | Ownership and prepared payload are confirmed. The process may contact the provider. Loss of the response or of the process leaves the hold. |
| `accepted` | Valid provider acknowledgement. Records provider ID and status when available. A sandbox acceptance is labeled separately and counts toward usage only. |
| `rejected` | Definitive provider 4xx other than 408, 409 or 429. Claim stays held. |
| `unknown` | Timeout, lost response, blocked redirect, malformed receipt, 408/409/429 or 5xx. Claim stays held. |
| `suppressed` | Eligibility changed after claim, or the final eligibility result was unavailable. No provider call was made. |
| `not_dispatched` | Provider configuration was unavailable at the dispatch boundary. If detected in preflight, no claim is consumed. If detected after arming, the claim stays held. |
| Duplicate or infrastructure failure | No provider authority. A write with an unconfirmed receipt may already have committed. |

Evidence includes the owner, normalized deadline, state, timestamps, payload hash, bounded provider identifier and HTTP status when available, and a fixed failure category. The claim stores no message contents, credentials, recipient addresses or raw database errors. Journal updates, bookmark completion and accounting failures are counted separately. Once the provider returns an accepted receipt, the API includes that acceptance in its totals even if later persistence fails. A lost final write can leave only `dispatching` durable. The operator must inspect provider history.

Only intended-recipient acceptance can set `reminder_sent_at`. The update matches saved UUID, builder UUID, hackathon UUID and an existing NULL marker. It verifies the one returned saved UUID and written timestamp. An old completion cannot overwrite a new bookmark row or an existing marker. Completion records the first accepted reminder on that bookmark as historical evidence, even if the event changes after dispatch. The durable deadline-specific journal remains independent of that marker. Accepted sandbox mail updates usage but does not update completion.

The API returns aggregate discovered, deferred, claimed, attempted, accepted, intended and sandbox acceptance, rejected, unknown, duplicate, suppressed, configuration and persistence counts. `heldCount` counts duplicates plus confirmed new claims without confirmed intended-recipient acceptance. `bookkeeping` describes completion. `accounting` describes the existing batch-level usage write. Partial batches retain provider acceptance counts and `retrySafe: false`. Acceptance is not proof of delivery.

## Verification

The native test used three independently instantiated handlers and the installed Supabase JS client against an isolated loopback REST adapter. The adapter checks request methods, filters and representation headers, then executes the unchanged pending RPC and guarded writes on a fresh PostgreSQL cluster through separate `psql` processes. It is not a running PostgREST server. A barrier confirms all 24 concurrent invocations discovered the same pending row before release. **One provider HTTP POST was received and 23 claims were blocked as duplicates.** The loopback receiver counts requests before returning a fixture acknowledgement. A bookmark recreation cannot change the winning journal. The suite also exercises later eligible deadlines, registration committed after arming, denied INSERT, forged ownership, lost write receipts, provider redirect and response loss, and failed journal, completion and accounting writes.

The focused fixtures use synthetic reserved-invalid addresses. Test network traffic is limited to loopback. The HM07 workflow uses its read-only Bash curl function. The unchanged Windows database-report test stops at its CRLF assertion before its PATH-based curl fixture can run. No production cron, Resend API or Supabase operation was invoked.

| Local check | Result |
| --- | --- |
| Focused reminder and email reliability | 141 passed, including 51 HM09 cases. No failures or skips. |
| HM09 native PostgreSQL and loopback HTTP | 14 passed, no failures or skips |
| Preserved HM03–HM08 native regressions | 81 passed across HM03, HM04, HM05, HM06 and HM08. No failures or skips. HM07 runs in the offline selection. |
| Exact updated offline PR selection | 1,686 passed, one existing Windows CRLF failure, zero skips. All 103 HM07 cases passed. |
| TypeScript and changed-file ESLint | Passed |
| Offline production webpack build | Passed with the network guard and synthetic configuration. Generated 89 of 89 static pages. |
| Diff, scope and secret checks | Passed. Ten intended files, empty index, no credentials or generated artifacts in scope. |

The Windows baseline is the LF-only marker at `scripts/test-database-report-workflow.cjs:11` against the unchanged CRLF checkout of `daily-database-report.yml`. No test was edited or skipped to bypass it. Rack, Aggregator and browser qualification paths were outside the changed code.

## Independent reviews

- **Standards and security.** The first pass found that pre-open events could be permanently claimed before eligibility and that stale event and profile policy could survive the ownership write. Preflight now defers before claiming, and the owned attempt refreshes policy and payload after the write. Regressions exercise all four tested policy changes during that write.
- **Specification.** The first pass also found that held records could fill a capped page and starve later eligible reminders, and that a persisted pre-open status should recognize its valid elapsed start. Keyset discovery continues across capped short pages, and the date rule allows opening at the existing deadline. Regressions cover both cases.
- Both reviewers rechecked the fixes and native fixture. No actionable Standards or Specification findings remain. The handoff review identified rollout clarifications about unresolved legacy sends, provider configuration and isolated staging, incorporated below.

## Release and rollback

No migration is required. Before rollout, verify the intended shared database read-only. Confirm `app_settings` has its primary key, non-null text value, private RLS access and service-role SELECT/INSERT/UPDATE. Confirm service-only execution of the pending RPC and service access to the explicit profile and event columns and guarded saved-row completion columns. Verify accounting privileges, existing `CRON_SECRET`, the intended provider sender, deliberate sandbox configuration and the actual external callers. Keep reminder and analytics operations distinct and preserve the HM08 analytics firewall hold.

1. Pause reminder endpoint dispatch and all scheduler or direct callers. Drain in-flight invocations and retire the old unguarded sender instances.
2. Reconcile `reminder_sent_at` history and recent provider attempts for each currently eligible builder, hackathon and deadline. Missing new claims cannot prove the old route never contacted Resend. The new route has no selective legacy hold. Keep dispatch paused while any eligible obligation has ambiguous history unless a separate selective hold has been verified. Recheck after all ambiguous obligations are reconciled or expire. Bookmark recreation may already have removed the old timestamp.
3. Deploy the guarded route after review and CI. No schema step precedes deployment. Verify with synthetic data on an isolated staging database. Sandbox sends consume the same claim identity when they share a database. Resume only after all callers reach guarded instances using the same production database and claim namespace, and the legacy cohort is safe.
4. During rollback, pause email dispatch and retain all claims. Restore a guarded route or keep the endpoint unavailable while correcting the issue. Never reactivate the old unguarded route, erase claims or rotate the namespace to bypass a hold. Read-only journal and provider history support reconciliation.

Residual risks include edits after the final policy or registration snapshots, old instances still serving requests, different database targets, manually deleted claims, an external provider accepting a request without returning evidence, and usage undercount if the process exits before batch accounting or a concurrent accounting compare-and-swap loses. Failed completion or usage writes never reopen admission. A permanently held valid reminder may require human reconciliation and may never be delivered. The application does not claim exactly-once delivery.

## Exact changed files

1. `.github/workflows/pr-validation.yml`
2. `docs/security/hm-audit-09-durable-reminder-claims.md`
3. `scripts/deadline-reminder-harness.cjs`
4. `scripts/test-deadline-reminder-claims-local.cjs`
5. `scripts/test-deadline-reminder-claims.cjs`
6. `scripts/test-email-reliability.cjs`
7. `src/app/api/cron/reminders/route.ts`
8. `src/lib/admin/deadlineReminderClaims.ts`
9. `src/lib/admin/emailBudgetGuard.ts`
10. `src/lib/emailDispatch.ts`
