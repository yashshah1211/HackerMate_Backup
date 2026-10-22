# One-time after-reset scheduler - PR #46 review

Keep PR #46 Draft, stacked on unchanged PR #45 head
3b4c9a71dc6bac0c940c2df40401ffd1d8678840. This is preparation and synthetic testing;
no production mutation, canary, participant scheduling or configuration is approved.
Both ACCOUNT_ONBOARDING_RELEASE_APPROVED and AUTODISPATCH_SOURCE_APPROVED remain false.
Environment variables alone cannot enable this release.

## Fixed timing and explicit consent

All participant invitation recipient dispatch is scheduled exactly
2026-10-23T08:35:00.000Z = **23 October 14:05 IST**. Manifest, message, provider POST
validation and SQL constraint reject every other time. No immediate-send fallback.
Attendance remains 04:30Z inclusive to 17:30Z exclusive = **10 AM to 11 PM IST**.

The early cron starts between **06:15 and 07:15 IST** and may submit invitation
contents to Resend until **07:20 IST**,
asking it to hold recipient dispatch until 14:05 IST. A provider POST is NOT an
email arriving in an inbox. No guarantee of exact inbox arrival or provider uptime.
If the founder means no provider submission before 14:00, this design is NO-GO.
A new default-OFF HUSTLE_PHASE2_EARLY_PROVIDER_SUBMISSION_APPROVED switch requires
explicit consent to that distinction; it does not replace the other approvals.

Suggested separate live consent (NOT granted by this document):
"I approve submitting the exact 51 approved invitation payloads to Resend during
06:15-07:20 IST on 23 October solely for delayed recipient dispatch at 14:05 IST.
No immediate dispatch or recipient dispatch before 14:00 is permitted. Attendance
remains 10:00-23:00 IST. This approval applies only to the reviewed manifest,
sender, account, source SHA and one-time job; STOP on any uncertainty."

## Complete metadata inventory, not a guessed date cutoff

Resend documents after-cursor pagination from newer to older, and 30-day advance
scheduling. It also provides an update/reschedule API, without an immutable original
created_at cutoff guarantee. Therefore neither 30 nor 31 days is used to skip old
messages. A historical pending message rescheduled into a later future day is still
unsafe and must be found. Future pending schedules beyond the 14:05 target also STOP.

The worker scans the **entire API-exposed account inventory** to has_more=false,
within **12 seconds total**, **2 seconds per GET**, and a secondary 50-page/5000-row
resource bound. It validates UUIDs, required metadata, descending creation chronology
across pages, duplicates/cursor loops and pagination; unknown/pending Hustle states
STOP. It rereads the head to detect insertions during traversal. No email body is
requested. No addresses, subject lists or IDs are written to the audit artifact.
The page limit is not evidence of completeness: exceeding either bound is STOP.
This is not a transactional provider snapshot. The operator must prohibit other
campaign creation/rescheduling/cancellation during inventory and dispatch; concurrent
edits to an old page cannot be ruled out by a stateless list API. Head stability
alone is not that guarantee. No alternate sender may submit early campaign messages.

Read-only actual-account evidence, 22 October (existing local credential, not a
certification that Vercel uses that same credential):

- 18:07:24Z: strict one-second page timeout STOP after900 records; no automatic retry.
- 18:08:56Z: separate45-second diagnostic completed1548 records/16 pages in9276ms,
  has_more=false, pending Hustle0, unchanged head.
- **18:12:06Z: final worker limits completed1548 records/16 pages in10860ms**,
  has_more=false, pending Hustle0, unchanged head. Creation range
  2026-09-24T04:09:39.992Z through2026-10-22T13:08:18.919Z.
  Seventeen inventory requests: observed p50=415.09ms, p95/p99=max=1103.82ms.
  These are sample order statistics, not a statistically established hosted p99.
- Daily51/100, monthly780/3000; actual daily reset2026-10-22T23:59:59.999Z
  = **05:29:59.999 IST on23 October**. Only49 daily slots remained at observation.

The earlier guaranteed300-record failure is removed. The full observed inventory
fits the measured scan ceiling; a slower/newer scan can still STOP. No stateful
claim is retried after a stopped run. No paid upgrade, split quota or guessed reset.
Metadata probes are reproducible via scripts/audit-hustle-provider-readonly.cjs
with the existing private credential-file path and --worker-budget. It only uses
GET /usage, /domains and paginated /emails. A separate diagnostic mode has a45-second
ceiling; its result must not be described as passing the worker ceiling.

Sources: https://resend.com/changelog/list-sent-emails-endpoint ,
https://www.resend.com/changelog/extended-email-scheduling ,
https://resend.com/docs/api-reference/emails/update-email .

## Canary created tonight, delivered after reset without manual early action

Proposed harmless NONPARTICIPANT canary: create before the verified reset while
current free headroom is available; exact delayed schedule
**2026-10-23T00:15:00.000Z = 05:45 IST**, after reset and30minutes before earliest cron.
The worker verifies the real provider ID with its actual key, exact approved sender,
controlled recipient absent from all51 leader emails, fixed nonparticipant subject,
explicitly empty/null CC/BCC, created_at tonight and before reset/schedule, schedule
exactly05:45 and after actual reset, and delivered status. Missing/malformed metadata
STOP. A post-reset-created canary is rejected: this path requires no human to create
an email between05:30 and06:15. Both canary and real dispatch remain unperformed.

Fixed subject: HackerMate scheduling canary — no participant invitation
Suggested reviewed body: Controlled nonparticipant scheduling check. No registration
link, invitation token, roster information or attendance action is included.
Required private server values: HUSTLE_PHASE2_CANARY_APPROVED, CANARY_ID, CANARY_EMAIL,
CANARY_SCHEDULED_AT (all with HUSTLE_PHASE2_ prefix). The schedule is an exact constant,
not arbitrary input. No test identity is invented or participant email reused.

Separate approval wording:
"I approve ONE harmless canary to [exact controlled nonparticipant inbox] from
[exact verified sender/account], submitted before the observed reset and scheduled
for23 October05:45 IST, using the exact reviewed non-invitation subject/body.
Read back its ID/schedule before leaving; STOP on any error or uncertain result,
with no retry or immediate-send fallback. This does not authorize participant emails."

Provider delivered status proves receiving-server acceptance, not inbox placement.
Actual inbox proof remains UNTESTED until this separately approved canary exists.
A controlled inbox owner may inspect it later before participant delivery; that is
not a required pre-cron creation/configuration step. If inbox proof must gate the
cron itself, an approved automated inbox receipt verifier is additionally required;
none is configured, and no manual attestation is fabricated in advance.

Published sources did not establish which quota day a cross-reset scheduled email
is charged to. Do NOT claim tonight-only accounting. After separately approved canary
creation, inspect actual usage/readback without retry; runtime independently checks
post-reset usage after the canary is delivered and conservatively requires>=52
remaining daily/monthly slots. This covers51 plus a safety slot even if the canary
is charged tomorrow. Provider rejects/uncertain accounting cannot trigger an upgrade.

## Actual cron host and protected routing evidence

Read-only Vercel project metadata confirms projectprj_dXTET08w44oZnkTBXh72Nu9nqACT,
exposeSystemEnv=true and existing cron host
hacker-mate-backup-j39utyqp4-yashshah1211s-projects.vercel.app, matching the current
production deployment dpl_EFKLENSiD5PsD53mZbA1Ca1W2yeC at main74d40ee3018b43293d12489234d3b87fe136d5ac.
The corrected guard accepts only the **exact platform VERCEL_URL** generated for this
project/owner, HTTPS, no credentials/port. It never derives an allowlist from request
headers, query parameters, a general *.vercel.app suffix, or a user-provided URL list.
VERCEL_ENV=production, exact VERCEL_PROJECT_ID, source/env/CRON_SECRET, absolute date
and unique SQL claim remain mandatory. Preview and other deployment hosts deny.

Anonymous read-only GET of the new (not-installed) route on that production host
returned302 to Vercel Authentication; www returned404 with no redirect. No protection
was bypassed or changed. This is a **protected result**, not proof that managed cron
is blocked or that it reaches the handler. Managed-cron ingress through protection
remains a hosted release check on an approved **disabled** deployment. Do not create
an automation bypass, share link or exception under this task's authorization.

Source middleware does not match /api/cron; next.config.ts has no canonical host
redirect. The local production build tests the exact host header with fake cron
credentials:503, no Location, zero fake DB calls. Enabled synthetic worker tests use
the production-deployment host shape and complete51 messages; www/arbitrary/other
project/other deployment/Preview hosts deny. This separates application routing proof
from Vercel platform reachability. Vercel does not follow cron redirects.

Proposed cron45 0 23 10 * starts00:45-01:45 UTC =06:15-07:15 IST. Handler and SQL claim
permit only23 October2026, end exclusive. Future-year annual invocations cannot mutate.
Existing two cron definitions are unchanged. Remove this one later only with approval.
Sources: https://vercel.com/docs/cron-jobs ,
https://vercel.com/docs/cron-jobs/manage-cron-jobs ,
https://vercel.com/docs/environment-variables/system-environment-variables .

## Duration, authority and STOP

Verified Hobby Fluid maximum300s; route maxDuration=300. Internal budget270s, with a
five-second stop margin. Table GET retries explicitly OFF, per-mutation/provider
IO timeout1s, inventory separately bounded12s with2s page allowance. No transport or
provider retry after irreversible claim. The current empty-inventory synthetic run
and conservative full-inventory accounting are recorded with final tests below.
A capped inventory replaces one/two short GETs; it does not add an unbounded traversal.
Windows GET observations do not measure hosted SQL/Auth/provider POST/readback p95/p99.
Those remain UNKNOWN under this no-production-write scope. A named escalation owner
must reconcile after about07:20 IST, well before14:05. Timeouts can still commit or
accept a request. The permanent campaign job and per-team reservations forbid replay.
No lease reset, token replacement, silent retry, immediate email or attendance decision.

CRON_SECRET uses timing-safe fixed-length hashing. No request actor/manifest/recipient
is accepted. The server-held approved admin is rechecked through current Auth and
SQL founder/admin+ban checks, with no impersonated browser session. Import/participant
modes remain exclusive; Google provenance, official identity, member/leader rules,
CSRF and attendance cutoff are unchanged. Manual UI dispatch is locked in auto mode.

Preparation is atomic **per batch**, not across both. A second-batch failure can leave
the first active/prepared but unsent; a consumed job prevents automatic continuation.
Each team requires SQL claim, one scheduled POST, exact provider schedule readback,
then terminal SQL finish. All51 unique team/provider IDs must reconcile before completed.
Accepted means scheduled-provider proof, not delivered/inbox/attendance proof.

STOP on any error, unknown commit, incomplete inventory, provider mismatch, missing
canary, wrong day, revoked admin, quota failure or incomplete51-team reconciliation.
Do not retry, clear ledgers, rotate secrets, regenerate links or repair automatically.
Code/env rollback cannot cancel queued messages or undo receipt/exposure. Separate
incident approval is required for provider cancellation, revocation, repair or rollback;
preserve all audit/reservations after any submission. Retain partial provider IDs.

## Minimal separately authorized release order

1. Review PR45 and PR46; preserve the existing42-team batch. Approve and import ONLY
   the additional nine through supported signed dry-run/inactive workflow; reconcile
   exact IDs/digests/counts and PerfectDuo's already confirmed official identity.
2. Freeze production preflight and separately choose recovery. Approve/apply PR45
   migration20261022141142, then20261022173139, each with its single ledger row in the
   same transaction; no historical replay or blind BEGIN/COMMIT concatenation.
   Both migrations remain UNAPPLIED here and unchanged by these fixes. From reported
   142 versions/7 tables/17 functions, expect144/10/23 afterward, trusted ownership,
   RLS/raw-denied new tables/service-only RPCs and unchanged roster/historical ACLs.
   Frozen canonical migration hashes remain in the review manifest. Prior no-backup
   exceptions do not automatically cover these migrations.
3. Separately approve merging the dependent PRs and an exact disabled deployment.
   Verify SHA, source gatesOFF, environment approvalsOFF, HARD-OFF503, public routes,
   exact generated cron host and managed platform ingress with no redirects whileOFF.
4. Separately approve and schedule the one nonparticipant05:45 canary tonight; privately
   record exact ID/sender/account/recipient/readback and actual usage. No messages now.
5. Freeze private exact42+9 manifest, sender, dedicated token secret, delegated admin
   and expected reset. Approve source/env transition, importOFF, both participant,
   delivery and auto approvals, plus explicit EARLY_PROVIDER_SUBMISSION approval.
   No secrets or roster in Git. Exact template must include scheduledAt08:35Z and sender.
6. Obtain distinct explicit authority for real batch activation, invitation preparation
   and provider scheduling; name an escalation/rollback owner. Reverify tomorrow's
   actual quota, delivered canary, complete inventory and remaining budget at runtime.
   No real communication occurs solely because a PR is green.

If early submission is disallowed or hosted capacity/ingress/proof fails, live auto
mode is NO-GO. A staffed2PM-or-later fallback requires separately reviewed exact future
schedule/source+SQL changes and fresh capacity/state reconciliation. Never omit
scheduled_at or reuse a consumed job. Postpone rather than make an immediate unsafe send.

## Validation

Run the original659 checks plus new inventory/cron/canary cases, TypeScript, scoped
ESLint and default production build. New tests include1501-record full history,
ancient rescheduled future pending message, loops/order/malformed pages/head changes,
deadline/timeout, unauthorized/pre-reset-created canary, actual cron host shape,
null-versus-populatedCC/BCC, early-submission consent, and51-message success/final failure.
Fixtures are synthetic disposable PostgreSQL18.4 (production17.6), with Auth/provider
substitutes. No hosted OAuth rerun, production account/session mutation or real canary.
Final verification: **687 passed, zero final failures**:118 worker,16 inventory,
251 delivery/SQL/mobile-browser,89 unit/security,57 authorization SQL,91 participant
SQL,51 inactive-import Next/browser,14 disabled production-mode HTTP contracts.
Locked TypeScript, scoped ESLint and default Next.js16.3.8 production build passed.
All disposable SQL/browser/server fixtures cleaned up. Local HARD-OFF instrumentation
recorded zero Round2 requests to its fake database; this is not production telemetry.

Final empty-inventory synthetic accounting:245250ms. Replacing its2250ms inventory
with the full12000ms ceiling yields a conservative **255000ms** network/pacing model,
15s below internal270s,10s before its265s stop margin and45s below platform300s.
This model is not a hosted p95/p99 certificate. Source/migration integrity verified: no
changes to PR45 or either reviewed migration. The first TypeScript attempt found
unpacked review-source copies under test-results; only that generated directory was
removed (original ZIP retained), then the full checks/build passed. No tsconfig or
application workaround was added. Independent code review found one consent-window
wording mismatch; it now covers submissions through07:20, matching the run budget.

Commands: node scripts/test-hustle-inventory.cjs; node scripts/test-hustle-autodispatch.cjs;
node scripts/test-hustle-delivery.cjs; node --test scripts/test-hustle-phase2.cjs
scripts/test-hustle-google-session.cjs scripts/test-hustle-inactive-import.cjs
scripts/test-hustle-phase2-release.cjs; node scripts/test-hustle-round2-auth-sql.cjs;
node scripts/test-hustle-participant-sql.cjs; node scripts/test-hustle-inactive-import-browser.cjs;
node scripts/test-hustle-phase2-production.cjs; local tsc --noEmit and scoped eslint.
Never build the import fixture and production .next concurrently. Keep review ZIPs
compressed; unpacked copied source under test-results is picked up by tsconfig globs.

Private manifest shape (placeholders are not approval; replace privately):

```json
{"batches":[{"batchId":"<42-batch UUID>","digest":"<64 hex>","count":42},{"batchId":"<9-batch UUID>","digest":"<64 hex>","count":9}],"scheduledAt":"2026-10-23T08:35:00.000Z","sender":"<exact approved From>"}
```
