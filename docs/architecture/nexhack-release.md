# NexHack engineering evidence and controlled release

2026-10-06. Production base: `48050504ba710f753393e9eabba07a362e7fbbcf`;
feature HEAD audited: `a3851fe`. Verdict: **READY WITH CONTENT BLOCKERS**.
Commit 9 changes only tests/tooling/docs. No production connection, migration,
configuration, organizer provisioning, deployment, merge or push was performed.

## Whole-branch scope and independent review

Eight feature commits: 75 files, 8,987 insertions / 1,837 deletions. Categories:
organizer authority/projections/privacy; shared event/profile/native broadcast
compatibility; opt-in public presentation; workspace/API/CSV; admin config and
event assignments; supporting types/middleware/navigation, tests and docs.
The large partner-page deletion is extraction into `LegacyPartnerPage`, retaining
legacy presentation with safe discovery/participation helpers.

No Team OS, Talent, Expo, activation implementation, dependencies, historical
migrations, environment files, generated build output or local artifacts changed.
Added-line credential scanning found no credential material. No NexHack organizer
identities or production user UUIDs were introduced. New predicates and fixtures
repeat the **existing exact founder email exception**; “no production emails at
all” would be inaccurate. No new founder identity or email-domain authority exists.

Independent spec review: **0 confirmed implementation blockers/scope findings**.
Standards review: **1 nonblocking diagnostic gap**—`eventParticipation.failure`
discards original query errors, native organizer access denial does not log its
`accessError`, and private helpers deliberately log reduced codes. These paths
show distinct unavailable/denied states and fail closed. Possible duplication in
the disposable SQL runners is a maintenance heuristic. Neither justifies cleanup
or feature expansion in Commit 9.

## Migration audit

| Exact file under `supabase/migrations/` | Purpose / compatibility / dependency | Authority / rollback |
| --- | --- | --- |
| `202610060002_partner_organizer_access.sql` | Additive event assignment table and authority predicates. Existing frontend compatible. Requires existing events, profiles and Auth users. | Composite event/user PK; RLS self/admin SELECT, admin INSERT with authenticated `created_by`, admin DELETE. No UPDATE/TRUNCATE/anon/service grants. Two stable definers: `has_partner_admin_access`, `can_access_partner_event`; authenticated EXECUTE only. No old policies change. Leave dormant on frontend failure; later migrations/callers depend on these functions. |
| `202610060003_partner_read_projections.sql` | Additive overview/participant/team projections and safe discovery/count RPCs. Requires 002; old frontend compatible. | Three private stable definers independently check event authority; authenticated EXECUTE only. Two public stable definers use public-event/privacy gates; anon/authenticated EXECUTE. PUBLIC/service EXECUTE removed for all five. No base-table ACL/RLS change. Leave successful unused objects; do not drop while compatible frontend/004 depends on them. |
| `202610060004_partner_registration_privacy.sql` | **Restrictive**, despite its old header saying “Additive Commit 4.” Requires 002/003 and deployed compatibility consumers. Preserves self joins/preferences/leave, scoped native/admin reads and service cleanup. | Replaces **all** registration/announcement policies and PUBLIC/anon/authenticated table/column ACL drift. Self/event-authority registration SELECT; self DELETE, restricted INSERT/UPDATE columns and invoker metadata trigger. Exact-event registered/authority announcement reads; native owner/admin writes, assignments read-only. Adds identity definer; replaces public profile definer's registration privacy. Existing service table ACLs retained. Identity helper authenticated EXECUTE; trigger no RPC grant; profile RPC anon/authenticated only. Keep privacy on rollback; disable UI/assignments and forward-fix rather than restoring broad reads. |

All eight new definers plus the replaced profile definer pin `search_path` to
`public, pg_temp`, qualify protected relations and revoke default PUBLIC execution.
The invoker trigger pins the same path. Anon/service cannot execute private RPCs;
normal PostgreSQL owner privileges are not application authority. Files are
transactional and unchanged in Commit 9. **002 → 003 → compatible frontend → 004**.
001 is already in the production baseline. Prior read-only ledger evidence ended
at 001; the release operator must recheck the **current** ledger/schema.

## Complete authorization matrix

`ALLOW` is limited to the bracketed scope. `DENY` includes fail-closed errors or
zero RLS-visible rows. `PUBLIC-SAFE` gives only public content/projections.
Target **A** is a public external event; B is another event, N a native event
owned by the native organizer. All ordinary authenticated actors have an eligible
protected profile; ordinary participant is registered A. Organizer page additionally
requires `organizer-v1`; API/RPC authority is independent of that presentation flag.

| Actor | Public partner | Participant event shell | Organizer page A | Overview A | Participants A | Teams A | CSV A |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Unauthenticated | PUBLIC-SAFE | DENY (login) | DENY | DENY | DENY | DENY | DENY |
| Ordinary participant A | PUBLIC-SAFE | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Explicit organizer A | PUBLIC-SAFE | ALLOW | ALLOW [A] | ALLOW [A] | ALLOW [A] | ALLOW [A] | ALLOW [A] |
| Explicit organizer B | PUBLIC-SAFE | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Revoked organizer A | PUBLIC-SAFE | ALLOW | DENY | DENY | DENY | DENY | DENY |
| Banned organizer | PUBLIC-SAFE | DENY (ban) | DENY | DENY | DENY | DENY | DENY |
| Native organizer N | PUBLIC-SAFE | ALLOW | DENY | DENY | DENY | DENY | DENY |
| HackerMate admin | PUBLIC-SAFE | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| Verified founder | PUBLIC-SAFE | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |
| Missing profile, verified Auth session | PUBLIC-SAFE | PUBLIC-SAFE¹ | DENY | DENY | DENY | DENY | DENY |
| Returned profile lookup error, Auth session exists | PUBLIC-SAFE | PUBLIC-SAFE¹ | DENY | DENY | DENY | DENY | DENY |
| Unverifiable Auth / thrown lookup failure | PUBLIC-SAFE | DENY (login/error) | DENY | DENY | DENY | DENY | DENY |

| Actor | Admin config API | Admin provisioning API | Raw registration SELECT | Registration writes | Announcement SELECT | Discovery RPC | Count RPC | Private RPC A |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Unauthenticated | DENY | DENY | DENY | DENY | DENY | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| Ordinary participant A | DENY | DENY | ALLOW [self] | ALLOW [self] | ALLOW [registered events] | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| Explicit organizer A | DENY | DENY | ALLOW [A + self] | ALLOW [self] | ALLOW [A + registered events] | PUBLIC-SAFE | PUBLIC-SAFE | ALLOW [A] |
| Explicit organizer B | DENY | DENY | ALLOW [B + self]; DENY [others in A] | ALLOW [self] | ALLOW [B + registered events] | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| Revoked organizer A | DENY | DENY | ALLOW [self]; DENY [others in A] | ALLOW [self] | ALLOW [registered events]; DENY [unregistered A] | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| Banned organizer | DENY | DENY | DENY | DENY | DENY | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| Native organizer N | DENY | DENY | ALLOW [N + self]; DENY [others in A] | ALLOW [self] | ALLOW [N + registered events] | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| HackerMate admin | ALLOW | ALLOW | ALLOW [all events] | ALLOW [self]² | ALLOW [all events] | PUBLIC-SAFE | PUBLIC-SAFE | ALLOW |
| Verified founder | ALLOW | ALLOW | ALLOW [all events] | ALLOW [self]² | ALLOW [all events] | PUBLIC-SAFE | PUBLIC-SAFE | ALLOW |
| Missing profile | DENY | DENY | DENY | DENY | DENY | PUBLIC-SAFE | PUBLIC-SAFE | DENY |
| Profile lookup error | DENY | DENY | DENY (error) | DENY (error) | DENY (error) | PUBLIC-SAFE³ | PUBLIC-SAFE³ | DENY |
| Unverifiable Auth | DENY | DENY | DENY | DENY | DENY | PUBLIC-SAFE³ | PUBLIC-SAFE³ | DENY |

¹ Inherited `AuthGuard` allows public `/hackathons` content for missing/non-onboarded
profiles. Returned profile errors can follow that path; raw operations still deny.
Thrown errors display verification failure. This is a public shell, not authority.

² JWT table writes are self-only for **every** role. Existing authorized server
admin/service cleanup retains separate privileges. Self INSERT uses own user and
owned team if specified, with allowlisted metadata; UPDATE cannot move identity,
event, team, status or timestamps. Announcement writes: scoped native owner/
admin/founder only, assignment read-only. For target N, native owner has ALLOW on
all private surfaces if a partner association exists; no authority for an external
event merely having `organizer_id`. Revocation preserves ordinary self participation.

³ Public RPCs do not depend on caller authority; valid anon/authenticated requests
get the same safe result. Invalid JWT transport or broken event/data lookup can
error, never grant private access. All callers deny pending native, archived,
missing/non-public event projections. Private identity/config/access lookup errors
fail closed (401/403/404/500), not successful empty private responses.

## Privacy, metrics and flow evidence

Entire-source raw-query sweep reconciled self-only `eventParticipation` and event
inserts/departure; scoped native organizer; authorized admin composition/deletion
and native/admin broadcast. Public partner/event/profile counters have no raw
fallback. New public loader is anonymous with sessions disabled. New organizer
requests use caller JWT and independently scoped SQL, never service roster fallback.

SQL denies anonymous raw reads, other-user access/writes, wrong/revoked/banned
organizers, spoofed identity, protected status/metadata escalation and cross-event
announcements; deliberately permissive policy/column-grant drift is removed.
Assigned organizers **are intentionally authorized** to raw rows/metadata in their
event; self users can read their own. Reduced API/CSV omit email/phone/metadata/
private profile fields. Names, college, declared skills and approved participation
fields are the approved projection, not a claim of zero personal information.

Profile RPC ignores supplied caller ID and respects hidden/track/banned visibility;
registration details go only to self, event cards to others. Its inherited
self/legitimate-teammate email and public team/submitted-project semantics remain.
Partner authority adds no private profile/workspace/chat/task/resource access.
Existing service-only deadline reminders and admin composition/native broadcast
are privileged consumers, not public or organizer CSV paths.

Metric fixtures **0/5/20/500/1,005** prove distinct registrants, event scoping,
unrelated teams, unregistered team members, multiple teams, looking in/out of
teams, missing profiles/college/skills, duplicate skill variants, varied sizes,
page-independent and filtered totals. No fake analytics or externally verified
NexHack counts. The 500-row query plan is a fixture inspection, not a production
performance guarantee.

Public: exact opt-in/legacy fallback, unknown/missing event, absent branding/facts/
links, URL rejection, signed-out safe reads and separate official/community CTAs.
Participant: executed joins, own state, looking on/off preserving registration/
metadata, capacity errors and race handling. Multi-event team links and existing
invitations/applications remain; those code paths and workspace policies are unchanged.

Workspace: executed zero/populated/error views, server filter/search/sort/paging,
safe links, event-linked minimal teams/rosters, stale-read and revocation handling.
CSV: full matching pages, fresh authorization, scope/filter consistency, formula
neutralization, commas/quotes/newlines/Unicode and no email. Export is a bounded
retrieval window (10,000 rows / 8 MiB / 25 seconds), **not an atomic snapshot**;
detected drift returns error rather than a partial file.

Admin: every method uses `requireAdmin`; existing event association, legacy default/
explicit opt-in, validation, optimistic concurrency, unknown feature preservation,
trusted exact existing Auth UUID, caller `created_by`, event-specific revoke and
no platform-role writes. Existing Auth email must be nonempty and protected profile
eligible; no domain authority. Old lead-driven provisioning is still sequential;
NexHack uses existing-event configuration, not legacy guessed event defaults.

Legacy partner/event/native organizer/profile modules and SQL were exercised.
Team creation/page/link/invite/application paths and their grants are unchanged;
no claim of a full live core-page session. Production smoke below is required.

## Validation totals and limits

| Node group | Passed |
| --- | ---: |
| Partner authorization / API / CSV | 50 / 163 / 50 |
| Public presentation / compatibility / private broadcast | 56 / 35 / 24 |
| Workspace / partner admin | 65 / 183 |
| Existing admin authorization / deletion | 156 / 42 |
| **Node total** | **824** |
| SQL access / projections / privacy / existing deletion | **42 / 132 / 231 / 80 = 485** |
| Browser layouts / visible keyboard stops | **80 / 22** |

Browser: real component/CSS with local fonts and synthetic hook/API data. Public
and workspace: 360/390/768/1024/1440; admin: 390/768/1024/1440. Long names/colleges/
skills/teams, expanded details, missing/populated/zero/error states: no horizontal
page overflow. All three surfaces include equivalent 200% CSS reflow cases,
**not browser UI zoom or full Next hydration**. The runner asserts populated
fixtures actually load, preventing visual passes on invalid API envelopes.

Canonical builds on branch and untouched exact production base both compiled and
passed TypeScript, then failed `/_not-found` prerender at shared `FeedbackWidget`:
Supabase URL/API key required. Same dependencies/configuration, no fabricated or
supplied credentials. This is an inherited environment limitation.
`smoke-test-core-pages.js` also exits before network for missing public environment.
Full deployment-session smoke and a successful build with approved environment
remain operational gates. Typecheck, targeted lint comparison and diff results
are recorded in the final verification addendum below.

Reproduce locally (PowerShell, installed Node dependencies, PostgreSQL and Chrome):

```powershell
node --test scripts/test-partner-authorization.cjs scripts/test-partner-organizer-api.cjs scripts/test-partner-csv.cjs scripts/test-partner-presentation.cjs scripts/test-event-compatibility.cjs scripts/test-organizer-broadcast-authorization.cjs scripts/test-organizer-workspace.cjs scripts/test-partner-admin.cjs scripts/test-admin-authorization.cjs scripts/test-admin-delete-user.cjs
$env:PARTNER_TEST_PG_BIN = 'C:\Program Files\PostgreSQL\18\bin'
node scripts/test-partner-access-sql.cjs
node scripts/test-partner-metrics.cjs
node scripts/test-registration-privacy.cjs
node scripts/test-admin-delete-user-local.cjs
npm.cmd run typecheck
npm.cmd run build
node scripts/qa-partner-release.cjs
git diff --check
```

SQL runners scrub DB/Supabase credentials, use fresh localhost clusters/synthetic
UUIDs/invalid-domain email and guarded `finally` cleanup. Deletion SQL's historical
audit/repair migrations run **only inside its disposable fixture**, not in the
release. Browser output defaults to ignored `scratch/release-browser`, or an
explicit artifact directory. Never run disposable fixture SQL on production.

## Ordered release runbook — prepared, not executed

**Engineering blockers: none found.** Content/operational gates: confirm existing
NexHack UUID/slug; actual event year/dates/deadline/time zone, mode/venue/team
limits; official registration URL; approved branding/copy/contact/links; trusted
organizer Auth UUIDs/accounts; acceptance of HackerMate-only dashboard coverage.
Read-only config facts do not edit events: correct facts through the existing
authorized event-management workflow. Also confirm target project, current ledger/
schema, backup, deployment environment/build and approved session testers.

- **NO**, entire branch before migrations: event/legacy discovery/counts need 003;
  native/broadcast authority needs 002. Missing RPCs surface as errors.
- **YES**, 002/003 while old frontend lives: only additive objects; old grants/
  policies/functions retained. Additives alone do not repair privacy.
- **NO**, restrictive 004 before compatible frontend: old raw discovery and
  preference upserts would fail. Never reopen broad reads to rescue old clients.

1. Freeze concurrent DB/deployment changes. Verify clean tree, approved final
   release SHA, ancestry from exact base and main/production still at the approved
   baseline. Record `git rev-parse HEAD`, `git status --short`, `git merge-base HEAD
   48050504ba710f753393e9eabba07a362e7fbbcf`, and SHA256 of all three SQL files.
   Drift requires re-audit, not automatic continuation.
2. Separate operator session: verify installed Supabase CLI/psql versions and
   their help flags, link confirmed project ref and independently check
   DB hostname/project/dashboard identity. Configure secure libpq service
   `nexhack-release` with trusted CA/approved direct connection. Compare current
   ledger, columns, RLS/table/column ACLs, registration-referencing functions/views
   and effective public-profile function with the audited schema. Expected reviewed
   predecessor 001; 002–004 absent. Unknown drift is a stop condition, not backlog
   work. Secure recoverable backup/PITR and current event/config/assignment/policy/
   grant/function snapshots outside Git.
3. Apply **only 002**, verify objects/grants/RLS, record ledger. Then **only 003**,
   verify private/public projection ACLs and ledger. Transaction failures stop.
   If SQL succeeds but ledger recording fails, verify objects and repair that row;
   do not rerun successful CREATE statements.
4. Build with approved existing environment and deploy final release SHA through
   the existing frontend pipeline. Keep new configuration legacy/unpublished and
   no new organizer assignments. This branch is compatibility-capable after
   002/003: no separate intermediate build is necessary. Wait for all instances/
   assets to use it; retire stale clients via normal version refresh. Verify
   discovery/count/profile compatibility consumers use safe RPCs.
5. Smoke old signed-out partner; authenticated external/native event self state,
   joins/looking toggles; native organizer/broadcast authority; team creation/page/
   link/invite/application; profile track records; admin Partnering. Run approved
   core smoke: dashboard, 2–3 profiles, developers, connections, teams/team and
   hackathons/sih. Failure stops **before** 004.
6. Apply **only 004** and verify ledger/policies/ACLs immediately. Smoke anonymous
   raw SELECT denial; ordinary A cannot read B; assigned A cannot read event B;
   event A registration cannot read announcement B; banned/missing/revoked/invalid
   private callers deny; self join/preference/leave works and discovery off preserves
   participation. Public safe RPCs survive. Writes use approved throwaway testers/
   events with before-state and `finally` cleanup, never real organizers as fixtures.
7. Verify already deployed final build against 004, admin authorization/deletion
   preflight (no actual user deletion), private headers and CSV isolation. A second
   deployment is unnecessary unless the pipeline staged an intermediate build.
   Minimum compatible/security rollback frontend: **`38d9e80`**, including the
   public reads and native/broadcast/profile guards.
8. Admin `/admin` → Partnering → partner management: select **existing NexHack
   event**, save approved slug/name/branding/public links and registration mode
   with version **legacy**. Check facts and preserved unknown fields. New config
   API does not create an event; do not use old lead-driven creation for NexHack.
9. After approved content and privacy smoke, explicitly set `organizer-v1`; verify
   signed-out public page, event facts and official registration/community CTAs.
10. Resolve each confirmed account's exact existing Auth UUID; grant via admin UI
    or `/api/admin/partner-organizers`. Verify event/user and acting admin creator;
    do not edit platform roles. Admin/founder already have implicit authority.
11. Fresh-session production smoke: assigned organizer page/overview/participants/
    teams/full filtered CSV; signed-out/ordinary/wrong-event/revoked/banned denied;
    organizers denied admin config. Verify metrics/filter/links/no PII beyond
    approved projection/no workspace controls. Revoke/regrant only approved tester
    assignments, clean up their state and record results without exporting real PII.
12. Deliver `/partners/<approved-slug>/organizer` after gates pass. Public URL:
    `/partners/<approved-slug>`; community: `/hackathons/<existing-event-uuid>`.
    Record frontend SHA, ledger/config/assignment audit. This engineering task
    ends at Commit 9.

### Controlled commands

Prepared operator commands only. Replace project-ref/path placeholders with
approved values; credentials stay outside commands/repository. Use the existing
deployment pipeline for the recorded SHA; no provider credentials are assumed.

```powershell
supabase link --project-ref '<confirmed-project-ref>'
psql "service=nexhack-release sslmode=verify-full" -X -W -v ON_ERROR_STOP=1 -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"
pg_dump "service=nexhack-release sslmode=verify-full" -W --schema-only --schema=public --schema=supabase_migrations --file='<secure-schema-snapshot-path>'

# Gate 3: additive files only; verify each before advancing.
psql "service=nexhack-release sslmode=verify-full" -X -W -v ON_ERROR_STOP=1 -f supabase/migrations/202610060002_partner_organizer_access.sql
supabase migration repair --linked --status applied 202610060002
psql "service=nexhack-release sslmode=verify-full" -X -W -v ON_ERROR_STOP=1 -f supabase/migrations/202610060003_partner_read_projections.sql
supabase migration repair --linked --status applied 202610060003

# STOP: deploy and complete gates 4/5 before executing restrictive 004.
psql "service=nexhack-release sslmode=verify-full" -X -W -v ON_ERROR_STOP=1 -f supabase/migrations/202610060004_partner_registration_privacy.sql
supabase migration repair --linked --status applied 202610060004
psql "service=nexhack-release sslmode=verify-full" -X -W -v ON_ERROR_STOP=1 -c "SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;"
```

Ledger repair records **only the named version**, not SQL; flags were checked
against the [official CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-repair).
Supabase CLI is not installed in this audit shell; no CLI/project action ran.
Confirm linked CLI
project matches psql service before each repair. Capture/check effective policy,
ACL and function definitions via `pg_policies`, `pg_class.relacl`,
`pg_attribute.attacl`, `pg_get_functiondef`, `pg_proc.proacl/proconfig`. Verify
004 removes permissive drift and profile function matches reviewed body. No
directory-wide push, historical replay or synthetic SQL belongs in release commands.

### Rollback and containment

| Failure | Action |
| --- | --- |
| Frontend before 004 | Roll frontend back; leave dormant 002/003, stop before 004. |
| Frontend after 004 | Use compatible/security frontend at least `38d9e80`; retain 004. Do not return to production base's broad-registration consumers. |
| Workspace | Set version legacy and stop delivery. Revoke affected event assignments if API/RPC access must stop: presentation flag **does not revoke permissions**. Native/admin implicit authority remains privileged. |
| Bad config | Re-read revision, PATCH recorded partner fields/features only, preserve unrelated keys/events; remain legacy pending review. |
| Assignment mistake | DELETE exact event/user via admin; verify fresh-session denial. Do not ban/delete user/change platform role. |
| Additive SQL | Failed transaction rolls back. Stop rollout, inspect drift, prepare reviewed narrow correction. Leave successful unused objects; do not drop later dependencies. |
| Privacy SQL | Failed transaction rolls back; record remaining legacy exposure and contain access pending correction. If committed but faulty, disable affected UI/assignments and forward-fix restrictive policies/RPCs. Never restore broad anon/authenticated reads for convenience. |

Full backup restoration is separately authorized incident recovery with privacy
controls accounted for, not normal feature rollback. Release success requires
content/build/session/ops gates, not only this offline evidence.

## Final verification addendum

Targeted ESLint: all **62** changed TypeScript/TSX/CJS files, including both new
Commit 9 tools. Zero introduced diagnostics versus exact production base,
accounting for partner-page extraction. Remaining inherited diagnostics: **29
errors / 18 warnings** versus baseline **45 / 19**. New tools and other new feature
files are clean; failures remain in legacy partner/event/native/broadcast and
existing track-record code. This is a comparison result, not an entirely clean
repository lint claim. Typecheck and `git diff --check` pass.

Commit 9 additionally asserts 500-row metrics/filter/pagination and public-safe
RPC behavior for 11 synthetic caller identities (including banned, missing profile
and unverifiable), adding **26 SQL assertions**. Permanent local deletion runner
reproduces its 80 existing checks. Browser report/screenshots stay outside Git;
compiled `.next`, logs, baseline extraction/archive and other scratch are not
staged. The final release report records the evidence commit SHA and clean status.
