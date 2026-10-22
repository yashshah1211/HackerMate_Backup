# One-time after-reset scheduler - review only

Status: **NO-GO for live dispatch until the prerequisites below are verified and
separately approved**. Local code, unapplied SQL and synthetic tests are not release
authorization. PR #45 is preserved; this is a stacked follow-up.

## Fixed times and actual platform evidence

Participant message schedule: **2026-10-23T08:35:00.000Z = 14:05 IST** exactly.
Manifest parsing, template generation, provider submission and the new SQL constraint
all reject any other time. No immediate-send fallback. Positive fixtures and runbooks
use this time; revoked earlier timestamps appear only as negative tests.
SQL attendance window remains **04:30Z inclusive to 17:30Z exclusive (10 AM to 11 PM IST)**.

Read-only local Resend credential inspection at 2026-10-22T17:25:56.245Z reported:
51/100 daily used, 780/3000 monthly used, daily resets_at
`2026-10-22T23:59:59.999Z` (05:29:59.999 IST tomorrow), rate limit 10/1000ms.
Only 49 daily slots remained then. A separate GET-only inventory at
2026-10-22T17:43:28.534Z inspected 1,000 metadata entries with zero pending Hustle
schedules found **in that subset**, but has_more remained true. Thus account-wide
absence of old pending schedules is UNKNOWN. The worker's 300-entry bound will
refuse this account as observed; a separately reviewed complete inventory strategy
within the duration budget is required before unattended GO. No contacts/bodies
were printed or retained. This proves neither tomorrow's quota nor that
Vercel uses the same account. Runtime verifies its actual credential/account again.

Vercel project `prj_dXTET08w44oZnkTBXh72Nu9nqACT` has resourceConfig.fluid=true.
Hobby Fluid functions have a 300-second maximum. The route declares maxDuration=300.
Proposed cron `45 0 23 10 *` can invoke between 00:45 and 01:45 UTC, i.e.
06:15 to 07:15 IST. The handler and SQL claim allow only 23 October **2026**, with the
end exclusive; future years cannot run. It must finish by about 07:20 IST, leaving
6h45 before delivery. Hobby scheduling is imprecise and is not guaranteed delivery.

Official references: [duration](https://vercel.com/docs/functions/configuring-functions/duration),
[Hobby cron timing](https://vercel.com/docs/cron-jobs/usage-and-pricing),
[Resend usage](https://resend.com/docs/api-reference/usage/retrieve-usage),
[email readback](https://resend.com/docs/api-reference/emails/retrieve-email).

## Implementation and replay boundary

`GET /api/cron/hustle-round2-once` authenticates CRON_SECRET (>=32 characters) with
fixed-length SHA256 timing-safe comparison. No query/body actor, recipients, batches
or schedule overrides. It additionally requires both source approvals, all existing
participant/delivery approvals, production Vercel environment and exact project ID,
exact production Supabase URL, and import mode OFF. Preview cannot dispatch.

Two server-only switches default OFF:
`HUSTLE_PHASE2_AUTODISPATCH_ENABLED`, `HUSTLE_PHASE2_AUTODISPATCH_RELEASE_APPROVED`.
`AUTODISPATCH_SOURCE_APPROVED=false` is an additional source gate. No source gate
is changed by this PR. Manual prepare/dispatch is locked while auto mode is enabled.

A server-held `HUSTLE_PHASE2_AUTODISPATCH_ADMIN_ID` must be separately approved.
Auth Admin GET verifies the current confirmed nonanonymous identity; existing SQL
hustle_phase2_authorized enforces founder/admin plus current ban checks at claim and
every mutation. This is delegated background authority, not an active user session
or an exception to participant Google checks. No session is impersonated.

The new job record is unique for the campaign, not per invocation or manifest.
Concurrent, completed, stopped and crashed/running jobs can never be reclaimed.
A lost claim acknowledgement is uncertain: STOP. No automatic reset, retry, lease
expiry or repair exists. Provider and RPC POSTs are never retried. Table GET queries
explicitly disable SDK retry/backoff. A rejected run can require a separate manual
reconciliation even if no message was sent; safety takes priority over availability.

Preparation remains atomic **per batch**, not across both batches. If preparing the
second batch fails, the first may be active with prepared invitations but no sends;
the consumed job prevents a restart. Do not call this an all-51 atomic transaction.

## Exact prerequisites / separate approvals

1. Independently review PR #45 and this follow-up. Do not merge, deploy or apply SQL
   as part of development. Approve recovery for both new migrations independently;
   prior no-backup exceptions do not automatically apply. Apply PR #45 first, then
   `20261022173139_hustle_round2_autodispatch.sql` using reviewed atomic versioned
   envelopes and production pre/postflight. No historical replay. Baseline is 21
   trusted Phase 2 functions and an **empty** delivery ledger; after both migrations
   expected totals are **10 tables / 23 functions**. If starting from the reported
   142 ledger baseline, two correctly recorded migrations would yield 144; reverify.
2. Import the separately approved nine-team CSV through the existing inactive-only
   supported workflow. Preserve the existing 42 rows. Verify both exact batch IDs,
   source digests and counts; no identity/email overrides, including PerfectDuo.
   Manifest must contain exactly two batches with counts 42 and 9 and 51 distinct
   leader destinations. Obtain separate activation/invitation preparation approval.
3. Approve exact server manifest, exact sender, dedicated token secret and delegated
   admin identity. No contacts/secrets in Git or logs. Manifest JSON shape:
   `{ "batches": [{"batchId":"<42-batch UUID>","digest":"<64 hex>","count":42},
   {"batchId":"<9-batch UUID>","digest":"<64 hex>","count":9}],
   "scheduledAt":"2026-10-23T08:35:00.000Z","sender":"<exact approved From>" }`.
   Sender must equal RESEND_FROM_EMAIL and have verified domain/sending with open
   and click tracking OFF. No paid/uncapped fallback; actual free limits required.
4. Obtain separate approval for a **nonparticipant** canary identity/content and a
   delayed schedule after the actual reset but before the cron window. No invitation
   links, tokens or participant information. This PR does not send/schedule it.
   Required server values: HUSTLE_PHASE2_CANARY_APPROVED=true, CANARY_ID,
   CANARY_EMAIL, CANARY_SCHEDULED_AT (all prefixed HUSTLE_PHASE2_).
   Its fixed subject is `HackerMate scheduling canary — no participant invitation`.
   Readback must show created_at after reset and before scheduled_at, delivered,
   exact sender/one recipient, empty CC/BCC. Confirm controlled inbox receipt
   separately. This is required evidence that the actual account supports delayed
   scheduling and exact readback formatting, not just POST acknowledgement.
5. Set separately approved HUSTLE_PHASE2_EXPECTED_RESET_AT to the actual account's
   observed prior reset. Runtime requires that reset passed, current daily reset is
   in the future, sufficient rate metadata and >=52 free daily/monthly headroom.
   This reserves a conservative extra canary slot even though its approved canary
   is already counted in used. Prove production credentials match the reviewed
   sender/canary account. No key decryption or provider sends occurred in development.
6. Independently reconcile all existing Resend campaign schedules. Runtime scans up
   to 300 account message metadata entries and refuses any pending Hustle message,
   including a cancelled early-time proposal if still pending. Overlarge inventory,
   unknown status or missing pagination proof => STOP; do not silently skip older
   pages. Existing pending schedules require separately approved intervention.
7. Verify actual hosted DB/provider latency and metadata readback semantics, budget,
   deployment timestamp and exact cron/project binding **before source activation**.
   One-second per-request timeouts are intentionally strict. At most 218 successful
   external operations plus pacing fit the synthetic <270-second accounting model;
   real network/serialization/platform behavior remains unverified. A timeout can
   still commit SQL or accept a provider request: consumed job prevents resubmission.
   Runtime checks 270-second internal budget and retains platform shutdown margin.
   Synthetic tests do not prove live 51-message reliability. Without hosted latency
   and canary proof, unattended dispatch remains NO-GO.
8. Obtain exact source/deployment/env approvals (source participant and auto gates,
   both participant, both delivery, both auto flags; import flags OFF), exact one-time
   cron/activation/communication approval and a named monitoring/escalation owner.
   The owner must inspect after 07:20 IST and reconcile 51 accepted unique provider
   IDs with exact scheduled readbacks before leaving the campaign unattended.
   Preview deployments have no authority to run this path and no production keys
   are copied into local test environments.

## Completion, STOP and recovery limits

Before sends: current authorized background actor, consumed job claim, actual quota
and reset, sender/tracking, bounded account inventory, exact inactive 42+9 batches,
empty delivery ledger and delivered canary proof. Only then activate/prepare.
Each team: permanent SQL claim, one scheduled POST with stable per-team key,
GET email readback of ID/from/one recipient/subject/CC/BCC/status/schedule, terminal
SQL finish. A valid POST ID without verified delayed schedule becomes UNKNOWN,
never accepted; known uncertain provider ID is retained in the private job record.

Completion requires **51 distinct teams, 51 unique provider IDs, 51 verified
scheduled_at=08:35Z and matching accepted ledger**, then one completed job. This is
scheduled-provider evidence only, never a claim of inbox delivery or attendance.
No automatic attendance response exists. Denials and errors expose no token/contact.

Any mismatch, timeout, wrong date, unknown COMMIT or incomplete report => STOP.
Do not refresh/retry, change digest, regenerate tokens, clear job/ledger or replace
provider IDs. Disable approved switches only with operational authorization; retain
ledger/evidence. Rolling back code cannot cancel already scheduled provider emails,
unactivate batches, undo received messages or undo exposure. Provider cancellation,
schema rollback and any manual continuation each need separate incident approval.
Do not drop durable reservations after provider submission. Narrow migration rollback
before use can remove the new job objects/constraint, but is not automatic and must
be independently reviewed; after use preserve them.

If unattended operation is not proven safe, use a separately approved **staffed
manual fallback at 14:05 IST or later**: verify provider/SQL state first and obtain a
new exact future schedule >=14:05 plus reviewed source/SQL change (current invariant
accepts only exactly14:05), sufficient free capacity and an operator for bounded
existing UI dispatches. Never omit scheduled_at or reuse the consumed run. At/after
14:05 the current fixed-schedule worker must not be used. If staff or a safe future
schedule is unavailable, postpone invitations; do not promise immediate delivery.

## Local validation evidence (22 October 2026)

Final suite results: 107 autodispatch assertions; 251 preserved delivery/SQL/mobile
browser assertions; 89 unit/security/release tests; 57 auth SQL and 91 participant
SQL/RLS/concurrency assertions; 51 inactive-import Next/browser assertions;
13 production-mode local HTTP contracts. Total **659 passed, zero final failures**.
TypeScript, scoped ESLint and default Next.js production build are separate gates.
The final build is rerun after the last Auth-ban source change.

The 51-team worker test uses real disposable PostgreSQL but synthetic Auth/provider
transports and a simulated absolute clock. It accounts for 218 one-second IO calls
plus pacing: **244,125 synthetic milliseconds**, below its 270-second internal budget.
This is budget accounting, not measured hosted throughput. Production PostgreSQL is
17.6; the available local PostgreSQL is 18.4. Local compatibility is not production
recovery, hosted authentication or live Resend scheduling proof.

Security review identified and fixed SDK GET retries, missing canary timestamp
validation and malformed/active Auth-ban denial. A real installed SDK test proves
retry(false) ignores Retry-After:300 and makes one request. Both source gates remain
false. Tests verify unknown/malformed/429/final-team failures, lost SQL acknowledgement,
concurrent durable claims, completed/failed replay, bad quota/reset/sender/canary,
changed batch, source/Preview/date/secret denial and exact provider readback.

Initial runs included checkout CRLF integrity and browser executable/fixture failures;
these are superseded by full passing reruns. Historical migration bytes and published
PR #45 head remain unchanged. All disposable clusters/browsers/servers are cleaned
up. No production/staging database calls, roster writes, real sends or canaries.

Reproduction (set PARTNER_TEST_PG_BIN and PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to
existing local binaries; never load real .env files):

- node scripts/test-hustle-autodispatch.cjs
- node scripts/test-hustle-delivery.cjs
- node --test scripts/test-hustle-phase2.cjs scripts/test-hustle-google-session.cjs scripts/test-hustle-inactive-import.cjs scripts/test-hustle-phase2-release.cjs
- node scripts/test-hustle-round2-auth-sql.cjs
- node scripts/test-hustle-participant-sql.cjs
- node scripts/test-hustle-inactive-import-browser.cjs
- node scripts/test-hustle-phase2-production.cjs
- npx tsc --noEmit
- scoped npx eslint for the changed TypeScript/CJS files

Do not run the Next import browser build concurrently with the production build;
both use .next. Raw test results and build logs stay under ignored test-results.
