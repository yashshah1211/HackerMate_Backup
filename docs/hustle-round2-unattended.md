# Round 2 launch and scheduled leader invitations

This PR prepares delivery; it does not authorize a production migration, merge,
deployment, batch activation, release-switch change, key creation or email.
Existing 42 imported teams must never be reimported or overwritten.

## Implemented P0 path

The existing organizer page adds batch preparation and scheduling controls.
Every request retains verified current admin/founder authorization, ban checks,
active-session validation, same-origin POST/JSON, rate limiting and no-store
headers. Production launch controls additionally require the canonical www
origin. Ordinary organizers cannot dispatch. No generic `/api/send-email` call,
new dependency, cron, paid service, reminder or automatic attendance decision.

`launch` accepts only a batch ID and explicit confirmation. A server-only approved
manifest supplies its exact digest/count/schedule. One transaction validates every
entry, activates that batch, calls existing invitation issuance, and writes a
unique permanent team delivery reservation plus append-only events. Any error
rolls back everything. Identical preparation is idempotent, not replacement.
Existing invitations/decisions prevent new preparation; wrong scopes deny.

`dispatch` handles at most five messages per request. The organizer UI drains
prepared records automatically **tonight**, while the authenticated operator keeps
the page open. Finish all batches and inspect acknowledgments before leaving.
Tomorrow needs no application worker/cron to start delivery: Resend holds the
scheduled messages. SQL alone enforces 23 October 04:30:00Z inclusive through
17:30:00Z exclusive. A forwarded link still requires the bound, verified Google
leader, current session, non-banned profile and completed onboarding. Members
retain their own separate verification path and cannot decide attendance.

Only designated leader email addresses are used. The dedicated random 256-bit
server secret derives unpredictable, domain-separated HMAC invitation tokens;
SQL stores their SHA256, never tokens/bodies/contact copies. Tokens appear only
in email link fragments, never queries or Auth return paths. Payload SHA256 binds
the exact recipient, subject/body, sender and schedule. Secret/template/recipient
drift blocks dispatch. Losing/rotating this secret requires reconciliation, never
automatic reissuance. Preserve it privately outside Git/logs.

One durable `prepared -> dispatching -> accepted/rejected/failed/unknown` transition
is allowed. A SQL lock prevents two simultaneous provider attempts. Resend also
receives a stable per-delivery idempotency key, but its 24h lifetime is **not** the
permanent deduplication boundary. A crash after claim remains `dispatching`, shown
as unknown. A timeout, 5xx, 408/409 or malformed acknowledgment is unknown; explicit
other 4xx is rejected. Any unknown/rejected/failed/in-flight record stops further
automatic dispatch across batches. No reset, lease expiry, resend or replacement
endpoint exists. Accepted means provider acknowledgment, **not inbox delivery**.

The admin aggregate report distinguishes prepared/submitted/accepted/rejected/
failed/unknown, pending/confirmed/declined, active and verified accounts. Its private
server RPC additionally returns team UUID/status pairs to drain the queue; no
emails, bodies or secrets. Automatic alerts/final-summary jobs/reminders are P1
and deferred. Counts remain available after the SQL deadline; pending is never
automatically declined. Provider transport delays can cause delivery after the
requested schedule; SQL still refuses late attendance. We cannot guarantee inbox
arrival time or provider availability.

## Verified infrastructure and unresolved provider gate

Read-only inspection on 22 October found main and READY production deployment
at `74d40ee3018b43293d12489234d3b87fe136d5ac`, ledger 142, 42 pending teams,
one inactive batch and zero invitations. Vercel team is active Hobby.
Resend `/usage` reported daily **51/100**, monthly **780/3000**, rate **10/second**.
The existing locally configured sender matched a verified `hackermate.in` sending
domain with click/open tracking false. No messages or provider changes occurred.
These snapshots are not reserved quota and must be refreshed before approval.
The local credential's account must be matched to production operator configuration;
Vercel production sensitive values were not decrypted/read back.

Runtime requires read-only account-usage/domain API access, verified sender,
tracking explicitly OFF, a finite free allowance (daily 100, monthly <=3000), and
enough current daily/monthly headroom. There is no paid-plan fallback. Other
HackerMate traffic can consume quota concurrently; provider rejection stops safely.
No claim is made that scheduling reserves future-day quota. With the observed
headroom only 49 additional emails fit the conservative preflight; a larger final
manifest is NO-GO until actual capacity is verified. Do not buy an upgrade or
silently split/retry an approved campaign to evade limits.

Resend supports ISO scheduled sends up to 30 days ahead; choose a reviewed
absolute time well before opening (for example 23 October 04:15Z = 09:45 IST),
not natural-language time. Its status/queue and a separately approved controlled
inbox canary must be verified before real invitations. Scheduling/inbox delivery
has **not** been exercised with this production account. If scheduling is not
accepted, an earlier send tonight requires a new explicit schedule/recipient
approval and new preparation before any attempt; existing reservations cannot be
silently rewritten. Hobby cron is daily with up to 59 minutes timing variation,
so it is deliberately excluded from the launch path.

References: [Resend scheduling](https://resend.com/docs/dashboard/emails/schedule-email),
[idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys),
[usage](https://resend.com/docs/api-reference/usage/retrieve-usage),
[Vercel cron](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Source and environment approval boundaries

`ACCOUNT_ONBOARDING_RELEASE_APPROVED = false` stays OFF in this PR. The exact
proposed single-line participant source approval is in
`docs/hustle-round2-participant-enable.PROPOSED.patch`; it needs separate review,
merge/deployment approval. Environment variables cannot bypass it. Public
`hustlePublicParticipationEnabled()` remains false. Hosted Preview is denied,
including all switches ON and fixture flags. No Preview overlays are included.

Server-only variables required **after separate production approvals**:

```
HUSTLE_PHASE2_IMPORT_ENABLED=false
HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED=false
HUSTLE_PHASE2_ENABLED=true
HUSTLE_PHASE2_RELEASE_APPROVED=true
HUSTLE_PHASE2_DELIVERY_ENABLED=true
HUSTLE_PHASE2_DELIVERY_RELEASE_APPROVED=true
HUSTLE_PHASE2_DELIVERY_TOKEN_SECRET=<dedicated 64 lowercase hex characters>
HUSTLE_PHASE2_LAUNCH_MANIFEST=<privately reviewed JSON below>
RESEND_API_KEY=<existing verified production account>
RESEND_FROM_EMAIL=<existing verified sender>
```

Existing Supabase production URL, anon and server key stay unchanged. Import and
participant modes deny when either import approval is true alongside participant
mode. Delivery approvals alone never enable participants. Never put secrets in a
NEXT_PUBLIC variable. No values or real roster are committed here.

Manifest shape (placeholder IDs/digests are not production approval):

```json
{"batches":[{"batchId":"<approved UUID>","digest":"<64 lowercase hex>","count":42}],"scheduledAt":"2026-10-23T04:15:00.000Z"}
```

Add the second batch only after organizer approval, signed dry run and separate
inactive import/readback. Reconcile IDs, all leader/member emails, phones and
membership against existing records; unchanged import code/SQL rejects conflicts.
Approve the complete batch list, each count/digest, total leaders, sender,
schedule, email copy and support route. Never hardcode the first 42 as the final
campaign or reimport them. The configured manifest is an additional approval
boundary, not a substitute for authenticated admin authority.

## Migration, permissions and rollout order

New migration: `20261022141142_hustle_round2_delivery.sql`, UNAPPLIED. Depends on
all four existing Hustle migrations through Google sessions. Adds two RLS tables
`hustle_phase2_deliveries` and `hustle_phase2_delivery_events`, four locked-path
SECURITY DEFINER functions `hustle_phase2_delivery_{prepare,claim,finish,report}`.
Trusted postgres owns all objects; EXECUTE only service_role; no raw table grants
to PUBLIC/anon/authenticated/service_role. The only source accesses to these new
tables are explicit SQL projections in this migration. There were no preexisting
queries to these new names; no existing table ACL, policy, Auth grant, profile
predicate or participant function is modified. Definer access is restricted to
service RPCs that independently recheck the existing founder/admin/ban predicate;
the verified caller/session comes from the server, never a body actor ID.

1. Review exact PR, source-off build, migration hash and tests. Freeze current
   production identity/ledger/schema/ACL baseline privately via a separately
   approved read-only preflight. Expect 142 versions, 7 tables, 17 functions,
   existing roster unchanged. Stop on drift/new version/unknown ownership.
2. Founder separately chooses a verified private recovery export+isolated restore
   or a **new explicit** narrow no-backup risk exception. Prior exceptions do not
   automatically authorize this migration. Logical additive rollback is not a
   verified full backup or recovery from exposure/loss.
3. Separately approve a one-version installation envelope under postgres on hackos
   `rhryjrbebfrrfhtyyzbs`. Execute only this migration, with its ledger version/source
   insertion in the **same transaction**. Do not replay historical migrations or
   blindly concatenate around this file's BEGIN/COMMIT. A reviewed installer must
   replace only the outer transaction boundary, preserve payload and add the one
   ledger row before COMMIT. This document is not an executable production envelope.
4. Read-only postflight: 143 ledger versions; new version exactly once with exact
   source hash; 9 protected Phase 2 tables, 21 functions; trusted owner/empty paths;
   four new functions executable only by service; both new tables RLS/no browser
   or service raw ACLs; zero deliveries/events; all imported teams, bindings,
   decisions, invitation counts, previous ledger rows/ACLs unchanged. STOP on failure.
5. Separately approve merge and **disabled** deployment, exact SHA/dependency lock
   and release flags OFF. Verify www/bare domain artifact, participant APIs 503,
   no-store/no-referrer, portal/workshops healthy; do not claim no DB calls without
   instrumentation. No production key/account/provider changes are made by this PR.
6. Finish second roster review/import while import-only remains active. Freeze the
   final manifest and verify sufficient provider capacity, sender/tracking and
   a separately authorized controlled scheduling/delivery canary. Prior hosted
   Google/member acceptance is existing evidence, not a new email-delivery test.
7. Founder separately approves exact participant source patch/deployment, turning
   import mode OFF, participant approvals ON, dedicated key/manifest setup and
   delivery approval switches. Reverify Google proof and production/project binding.
8. Founder separately approves exact batch activation and scheduling to the reviewed
   designated leaders. A current authorized admin uses each batch's prepare, then
   schedule control. Keep the page/session alive until every approved leader has
   a provider acknowledgment. Reconcile counts to manifest, scheduled timestamps
   and provider state privately. **Any partial/unknown/rejected state is NO-GO for
   unattended launch** until separately authorized reconciliation succeeds.
9. Once all queued messages and participant path are verified tonight, no routine
   founder action is required tomorrow. Leaders sign in/verify/decide themselves;
   provider delivery and Google availability remain external dependencies. Reporting
   is on demand; automated alerts/final reports are deferred, not claimed implemented.

## Emergency STOP and rollback

On error/timeout/mismatch/unknown commit or acknowledgment: stop the browser drain,
do not retry or issue replacements. Record private batch/count/state/provider IDs,
never raw links or message bodies. Read-only reconciliation must distinguish
prepared, in-flight unknown, accepted and rejected. A provider-accepted message
cannot be rolled back by reverting code or SQL. With separate incident approval,
cancel scheduled provider IDs **before their schedule**, verify cancellation, and
use existing authorized invitation revocation if necessary. Cancellation may race
delivery; it cannot retract an inbox message. No automatic cancel/reset is added.

With separate emergency approval, set delivery switch false to stop new app
submissions, and participant enabled false to stop new app claims/responses;
roll back to known prior main `74d40ee3018b43293d12489234d3b87fe136d5ac` if needed.
Environment rollback does not cancel provider schedules or revoke existing direct
database RPC capabilities. SQL still enforces identity/session/window. Preserve all
teams, decisions, invitations and audit/delivery evidence. Do not drop new tables,
replay migrations, delete imported batches or broaden grants. A destructive DB
rollback or post-commit repair needs an independently reviewed recovery procedure.

## Reproducible synthetic verification

```
node scripts/test-hustle-delivery.cjs
node --test scripts/test-hustle-phase2.cjs scripts/test-hustle-google-session.cjs scripts/test-hustle-inactive-import.cjs scripts/test-hustle-phase2-release.cjs
node scripts/test-hustle-round2-auth-sql.cjs
node scripts/test-hustle-participant-sql.cjs
node scripts/test-hustle-inactive-import-browser.cjs
node scripts/test-hustle-phase2-production.cjs
npx tsc --noEmit
npx eslint src/lib/hustle-phase2/{server,pages,delivery,delivery-core}.ts scripts/{hustle-delivery-fixture,test-hustle-delivery,test-hustle-phase2}.cjs
```

On Windows set existing Chrome and PostgreSQL paths for the test process, as in
the inactive-import runbook. Fixture PostgreSQL is 18.4 versus production 17.6.
Delivery tests use actual SQL, handlers and a mobile browser, but substitute Auth,
PostgREST transport, provider, and clock in a wholly disposable cluster. No test
clock or local transport setting exists in the production migration. `finally`
closes the browser/server and deletes its verified temporary cluster even on error.
No hosted Google/provider sends or new production compatibility claims result.

Initial fixture failures were an unqualified synthetic clock reference under the
locked search path, missing synthetic event projection, old manual-link assertions,
and Windows browser sandbox/path setup. They were diagnosed without weakening
application or SQL guards. Final counts and build evidence are recorded separately.

Final candidate verification: 164/164 delivery, 89/89 unit/security, 57/57 authorization SQL, 91/91 participant SQL, 51/51 import browser, 8/8 disabled production-mode/public-route checks. Default Next.js 16.3.8 Turbopack build, TypeScript and scoped ESLint passed. No hosted/provider send was performed. Local build observed zero Round 2 calls to its fake database only; this is not production telemetry. Automated alerts, reminder delivery, duplicate-attempt counters and automatic final-summary emission remain deferred P1 work.
