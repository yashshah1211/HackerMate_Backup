# HM-AUDIT-04 release-readiness and PR handoff

Base: `4342f27929ae675caccec0cee5b2343bcdbb6ec8`, verified by fetching latest
main before work on 2026-11-07. Branch:
`fix/hm-audit-04-atomic-hackathon-admin-actions`.

**READY FOR PR**, with the baseline lint/Windows failures below disclosed.
Production deployment requires the migration and privilege/graph checks first.
No staging, commit, push, PR creation, deployment, production migration, live
deletion/status update, real email or tracking request was performed. The HM03
publication exception does not extend to HM04. HM03 implementation files are
unchanged; its existing regression suites were exercised. HM05 was not started.

## Root cause and behavior

The admin route deleted two child tables and then the parent through independent
REST operations. It ignored child errors and did not verify an affected parent
row. It also mapped every non-delete/non-approve action to rejection.

The POST route now preserves `requireAdmin`, validates the JSON object, UUID
string and exact `approve`/`reject`/`delete` allowlist before event access or
mutation, and canonicalizes the UUID. Missing/malformed/incorrectly typed inputs
and malformed JSON return 400. Signed-out, ordinary and banned users are rejected
before service-role creation by the unchanged shared authorization helper.

Deletion calls `public.admin_delete_hackathon(uuid)` once. Its one parent DELETE
uses `RETURNING` to derive a boolean receipt. Only literal `true` is success;
false is 404, FK restrictions are 409, and database errors, invalid receipts and
unexpected exceptions produce safe 500 responses. Transport failures say that
deletion could not be confirmed, rather than falsely asserting no commit occurred.
Server diagnostics retain actual SQLSTATE/PostgREST codes without logging database
messages, detail fields, records, credentials or arbitrary exception strings.

Approve/reject retain existing feedback fields, `reviewed_at`, `reviewed_by` and
public `status`, in the existing single update. Failed reads are logged errors,
not missing records; zero-row updates are 404 and returned target/status are
checked. No nonexistent `hackathons.updated_at` column is introduced. GET listing
behavior and unrelated admin actions are unchanged.

The permanent-delete confirmation is retained, including explicit confirmation
and irreversible wording. It now accurately says team associations and event
records are removed while teams and accounts survive. Failures show errors and
do not refresh as successful deletions; successful responses refresh the listing.

## Transaction and privilege design

Migration: `supabase/migrations/20261107091636_atomic_admin_hackathon_delete.sql`.
It was created with Supabase CLI after the latest existing migration version.

- One schema-qualified `DELETE FROM public.hackathons WHERE id = p_hackathon_id`.
- Existing FK cascades and SET NULL effects participate in that same transaction.
- No child pre-deletes, exception-swallowing handlers, new CASCADE policies, table
  grants, RLS changes, or unrelated record deletes.
- `SECURITY INVOKER`, fixed empty `search_path`, boolean return.
- Explicit EXECUTE revocation from PUBLIC, anon and authenticated; service_role
  EXECUTE only, apart from normal database-owner/superuser authority.
- Function creation and ACL changes are wrapped in one migration transaction.
- Missing targets, repeated calls and losing concurrent calls cannot report true.

The shared helper verifies server-authenticated identity plus protected profile
role/ban state before making its service client. Its authenticated-client fallback
does not gain RPC permission: a missing service key fails closed for deletion.
Existing production service_role SELECT/DELETE permissions on the parent were
verified; no new table privilege is necessary. The FK engine executes existing
cascades even where direct child DELETE access is absent, as tested explicitly
with `event_organizers`.

## Actual database dependency investigation

Production inspection used explicit READ ONLY catalog queries; no application
records were read. Repository migrations were also searched. No suitable existing
hackathon-deletion RPC exists. Production has 28 hackathon columns, including
UUID id, text status and JSONB ai_feedback, and **no updated_at**. Relevant RLS,
role privileges, FK actions, deferral flags, user triggers and trigger source were
inspected. Metadata capture is point-in-time, not a guarantee against future drift.

The reviewed direct incoming graph has 16 constraints:

| Existing action | Referencing tables |
| --- | --- |
| CASCADE (12) | event_organizers, hackathon_registrations, saved_hackathons, hackathon_posts, hackathon_resources, team_hackathons, partner_configs, hackathon_stages, hackathon_announcements, team_submissions, team_github_repos, team_links |
| SET NULL (2) | teams.hackathon_id, user_badges.hackathon_id |
| NO ACTION / protected (2) | hustle_phase2_batches.event_id, hustle_phase2_teams.event_id |

Two further constraints cascade team_link_upvotes/comments from deleted links;
announcements linked to a deleted stage have that stage reference set NULL.
Teams and badges have nullable UUID event columns and no additional CHECK
constraints blocking detachment. The parent organizer_id FK points *to* profiles;
deleting an event never deletes that profile. Team workspaces/members/conversations
are below preserved teams, so their team-deletion cascades are not entered.
Protected Hustle batches/teams prevent entry into their deeper dependent graph;
the RPC deliberately does not purge protected deliveries, invites, participants
or audit records to bypass those restrictions.

The parent source-metadata guard and registration guard apply to INSERT/UPDATE,
not DELETE. No relevant live delete trigger with external side effects was found.
The broader descendant graph was reviewed, including team/matchmaking triggers;
the teams SET NULL action updates only hackathon_id and does not invoke triggers
limited to other changed columns. Current FK actions, rather than assumptions
from historical migrations, define the intended delete scope.

The committed schema-only fixture records the 16 direct and three secondary
relationships. Its local tables project relevant columns and do not reproduce
every production column/policy/trigger. It preserves the exact observed FK
actions and tests RLS/role denial and cascade permissions separately. Missing or
new restrictive dependencies fail atomically; future schema drift must still be
reviewed before deploying a destructive capability.

## Regression evidence

The API/auth harness executes the real route and real `requireAdmin` against
isolated adapters. The native fixture accepts no database URL, loads no env file,
starts a new loopback-only cluster with a fixture marker, uses clearly fake IDs,
and stops/removes its cluster in `finally` after checking the exact temp path.

Real SQL tests execute the actual migration through the actual route/RPC adapter:

- Target and intended cascaded data are removed; unrelated event data, teams,
  users, members, projects and badges are verified against full state snapshots.
- An AFTER DELETE child trigger first verifies registrations are already absent,
  then raises. The complete before-state, including earlier deleted children,
  is restored. No response-code-only rollback claim is made.
- An AFTER DELETE parent trigger verifies both child sets are absent, then raises;
  full before-state is restored again.
- Each real protected dependency, missing parent DELETE privilege, unexpected
  database exception and a trigger suppressing deletion fail without false success.
- Eight concurrent API requests yield one success and seven 404s. Repetition and
  missing targets preserve state. PUBLIC/anon/authenticated EXECUTE denial,
  invoker mode, search_path and return type are asserted in PostgreSQL.

Failure-injection functions exist only in the disposable test cluster. Their
test-only definer context lets assertions inspect deleted child state without
granting production child permissions; they are not part of the migration.

API tests cover malformed/unknown actions, typed IDs/bodies, authorization denials,
safe errors, invalid RPC receipts, zero affected updates and preserved review
metadata. React tests cover confirmation and truthful success/error behavior.
The Chromium fixture mounts the actual notification provider and tab at 1440px
and 390px, checks cancel-before-mutation, then success/error confirmation flows
with all non-loopback network requests blocked.

## Commands executed and results

Local runtime: Node 24.17.0 and PostgreSQL 18. CI is Node 22; live metadata reports
PostgreSQL 17. The function uses ordinary SQL supported by both PG versions.
No tests were removed, weakened, skipped or silently excluded.

| Exact command | Final result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed; 673 lockfile packages, no dependency/lockfile changes |
| `node --test scripts/test-admin-hackathon-actions.cjs scripts/test-admin-hackathon-approval.cjs scripts/test-admin-hackathon-ui.cjs scripts/test-admin-moderation-ui.cjs` | **90 passed**, zero skipped |
| `node --test scripts/test-admin-hackathon-delete-local.cjs` | **10 passed**, zero skipped, including nine nested real-SQL scenarios |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-admin-hackathon-browser.cjs` | **1 passed**, covering four desktop/mobile success/error scenarios and cancellation |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-admin-authorization.cjs scripts/test-admin-moderation.cjs scripts/test-admin-delete-user.cjs scripts/test-partner-authorization.cjs` | **238 passed**, zero skipped |
| `npm run typecheck -- --incremental false --pretty false` | Passed |
| Changed-file ESLint command below | Existing **6 errors / 3 warnings** in the two existing source files; **zero new diagnostics**; new JS files clean |
| Full CI offline selection, command below | **1,302 passed / 1 unchanged Windows baseline failure**, zero skipped |
| `node --test scripts/test-mission03-workspace-rls.cjs scripts/test-chat-active-actor-local.cjs scripts/test-email-open-local.cjs` | **50 passed**, zero skipped; includes HM03 real SQL tracking |
| `python scripts/test-team-document-local.py` | Passed existing real PostgreSQL concurrency/permission assertions |
| `node scripts/run-stabilization-smoke.cjs` | Passed; runs existing core-page smoke against synthetic loopback fixtures: 10 reads, zero writes |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-stabilization-browser.cjs scripts/test-mission02-browser.cjs scripts/test-notification-categories-browser.cjs` | **6 passed**, zero skipped |
| `git diff --check` | Passed |

Changed-file lint:

```powershell
npx eslint src/app/api/admin/hackathons/route.ts src/app/admin/_tabs/NativeHackathonsTab.tsx scripts/admin-hackathon-harness.cjs scripts/admin-hackathon-local-db.cjs scripts/test-admin-hackathon-actions.cjs scripts/test-admin-hackathon-delete-local.cjs scripts/test-admin-hackathon-ui.cjs scripts/test-admin-hackathon-browser.cjs
```

ESLint comparison against origin/main confirms seven existing errors became six,
with the same three warnings. Existing any annotations and the tab's existing
effect diagnostics were left untouched; no linter suppression was added to app
code. The unchanged workflow test and daily workflow match main byte-for-byte
after checkout newline normalization. Its LF-only `run: |\n` marker fails on
Windows CRLF (`1 !== 2`); the identical failure was reproduced from untouched
base files. No baseline file was edited to obtain green results.

Exact CI selection execution:

```powershell
$workflow=Get-Content .github/workflows/pr-validation.yml -Raw
$section=($workflow -split 'name: Run offline regression selection')[1] -split 'name: Verify workspace permissions'
$files=[regex]::Matches($section[0],'scripts/test-[\w-]+\.cjs') | ForEach-Object { $_.Value }
node --import ./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 @files
```

Production build was run with sensitive service environment variables removed,
no `.env` files, fake Supabase configuration, offline font fixtures and external
network blocked:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-build-only'
$env:NEXT_TELEMETRY_DISABLED='1'
$env:NODE_OPTIONS='--import ./qa/fixtures/rack-network-guard.mjs'
$env:NEXT_FONT_GOOGLE_MOCKED_RESPONSES=(Resolve-Path qa/fixtures/rack-font-mock.cjs).Path
npm run build -- --webpack
```

Final build result: **passed**, exit 0. The fake unavailable data endpoint produced
expected landing-page fallback warnings; this is not production data.
Existing middleware/Sentry deprecation warnings remain outside HM04.

## Production prerequisites and migration-only application

No new environment secret is required. The existing verified admin/session
configuration and server-only Supabase service key must be available. The new
RPC must exist with the expected ACL before this API version receives deletes.

1. Back up/review according to normal destructive-action release procedure and
   repeat read-only FK/trigger checks against the intended database. Confirm the
   16 direct actions above; do not change them to bypass protected data.
2. Apply **only** `20261107091636_atomic_admin_hackathon_delete.sql` with the
   organization's approved migration runner. Do not run an unrestricted
   `supabase db push`, `migration up --include-all`, or replay historical SQL:
   this repository has known migration-history drift.
3. If the operator uses libpq with a securely configured intended connection,
   the exact single-file application is:

   ```powershell
   psql -X --set ON_ERROR_STOP=1 --file .\supabase\migrations\20261107091636_atomic_admin_hackathon_delete.sql
   ```

   This command is **not executed by the agent**. Verify connection identity
   first; do not put credentials in shell history or this document. The file
   itself wraps creation/ACLs in BEGIN/COMMIT. If applied outside the normal
   migration runner, record only this successfully applied version in the
   intended project's migration history after verifying its actual definition.
   Supabase CLI 2.79's supported bookkeeping command, for an already verified
   linked project, is `supabase migration repair 20261107091636 --status applied --linked`.
   Repair records history; it does not execute the SQL. Never mark an unapplied
   or failed migration as applied.
4. Verify definition, ACLs and role flags read-only:

   ```sql
   SELECT p.oid::regprocedure, p.prosecdef, p.prorettype::regtype, p.proconfig,
          pg_get_functiondef(p.oid),
          has_function_privilege('anon',p.oid,'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated',p.oid,'EXECUTE') AS auth_exec,
          has_function_privilege('service_role',p.oid,'EXECUTE') AS service_exec,
          EXISTS(SELECT 1 FROM aclexplode(p.proacl) a
                 WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_exec
   FROM pg_proc p
   WHERE p.oid=to_regprocedure('public.admin_delete_hackathon(uuid)');
   ```

   Expect one row: invoker (`prosecdef=false`), boolean, empty search_path,
   anon/authenticated/PUBLIC false, service true, and the reviewed qualified DELETE.
   Also verify existing parent SELECT/DELETE privilege and service BYPASSRLS.
5. **Deploy code after migration verification**, then verify with an isolated
   non-production throwaway event and finally cleanup. Do not perform a real
   event deletion/status change merely to test this release in production.

If migration application fails, its transaction rolls back creation/ACL changes;
stop the code rollout and investigate. Do not bypass security with a definer or
new table grants. If code accidentally precedes the migration, deletion fails
closed with a safe error and logged code; there is no unsafe REST fallback.

Rollback: retain the additive RPC and corrected validation whenever possible.
If RPC removal is required, first disable this admin delete capability (or ship
a version that explicitly refuses deletion), then use a separately reviewed
rollback migration to `DROP FUNCTION public.admin_delete_hackathon(uuid)`.
Never restore the three independent REST deletes or invalid-action fallback.
Schema rollback does not restore a legitimately deleted event; data recovery is
a separate backup/restore operation. Transport uncertainty requires refreshing
state before a deliberate retry; it does not authorize an automatic retry loop.

## Final adversarial review

Independent Standards and Specification review passes found **no blocking
implementation findings**. Both inspected the full source/migration/test diff:
one parent statement, constrained deletion graph, actual row-derived receipts,
strict input/auth gates, service-only execution, concurrent requests, truthful
feedback, and real-state rollback assertions. No new dependencies or unrelated
implementation changes were introduced.

Boundaries: native fixtures project the observed FK graph, not every production
column/constraint/trigger; metadata can drift after inspection. CI's Node 22/Linux
environment differs from this Node 24/PG18 Windows validation. Full production
rendering/deployed RLS behavior and operator migration application are not claimed.
Pre-existing GET listing and concurrent review-metadata edit behavior were not
redesigned. The two disclosed baseline failures remain, without weakened checks.

## Exact change set and publication boundary

```text
.github/workflows/pr-validation.yml
docs/security/hm-audit-04-atomic-hackathon-admin-actions.md
scripts/admin-hackathon-harness.cjs
scripts/admin-hackathon-local-db.cjs
scripts/fixtures/hm-audit-04-hackathon-graph.json
scripts/test-admin-hackathon-actions.cjs
scripts/test-admin-hackathon-browser.cjs
scripts/test-admin-hackathon-delete-local.cjs
scripts/test-admin-hackathon-ui.cjs
src/app/admin/_tabs/NativeHackathonsTab.tsx
src/app/api/admin/hackathons/route.ts
supabase/migrations/20261107091636_atomic_admin_hackathon_delete.sql
```

All 12 files are part of HM04. Logs, node_modules, build products and diagnostic
scripts are ignored local artifacts. No AGENTS.md file was edited. No HM03 source,
secret/environment file or production configuration is included.

Suggested PR title: `fix(security): make admin hackathon deletion atomic and validate actions`.
Target: main. Use this document as the PR description and retain its baseline
failure/rollout disclosures. Git publication remains an owner action; no PR URL
exists for this uncommitted branch yet.

### Owner-only safe PowerShell publication

The following commands are a handoff, not operations executed by the agent.
They stop on branch/base/index/file-set drift. Review the staged diff before
running the second block. All 12 paths were audited; no unrelated file is included.

```powershell
Set-Location -LiteralPath 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hm-audit-04-hackathon-admin-actions'
if ((git branch --show-current) -ne 'fix/hm-audit-04-atomic-hackathon-admin-actions') { throw 'Wrong branch' }
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
if ((git rev-parse origin/main) -ne '4342f27929ae675caccec0cee5b2343bcdbb6ec8') { throw 'Main moved; inspect intervening commits before publication' }
git status --short --untracked-files=all
if (@(git diff --cached --name-only).Count -ne 0) { throw 'Existing staged files require review' }
$files = @(
  '.github/workflows/pr-validation.yml'
  'docs/security/hm-audit-04-atomic-hackathon-admin-actions.md'
  'scripts/admin-hackathon-harness.cjs'
  'scripts/admin-hackathon-local-db.cjs'
  'scripts/fixtures/hm-audit-04-hackathon-graph.json'
  'scripts/test-admin-hackathon-actions.cjs'
  'scripts/test-admin-hackathon-browser.cjs'
  'scripts/test-admin-hackathon-delete-local.cjs'
  'scripts/test-admin-hackathon-ui.cjs'
  'src/app/admin/_tabs/NativeHackathonsTab.tsx'
  'src/app/api/admin/hackathons/route.ts'
  'supabase/migrations/20261107091636_atomic_admin_hackathon_delete.sql'
)
$changed = @(git diff --name-only origin/main) + @(git ls-files --others --exclude-standard)
if (Compare-Object ($files | Sort-Object) ($changed | Sort-Object -Unique)) { throw 'Unexpected or missing changes' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
if (Compare-Object ($files | Sort-Object) (@(git diff --cached --name-only) | Sort-Object)) { throw 'Unexpected staged file set' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged check failed' }
git diff --cached --stat
git diff --cached
```

After reviewing that diff, the repository owner may run:

```powershell
git commit -m 'fix(security): make admin hackathon deletion atomic and validate actions'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push --set-upstream origin fix/hm-audit-04-atomic-hackathon-admin-actions
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
gh pr create --repo yashshah1211/HackerMate_Backup --base main --head fix/hm-audit-04-atomic-hackathon-admin-actions --title 'fix(security): make admin hackathon deletion atomic and validate actions' --body-file docs/security/hm-audit-04-atomic-hackathon-admin-actions.md
if ($LASTEXITCODE -ne 0) { throw 'PR creation failed; inspect existing PRs before retrying' }
```

Do not force-push, merge, deploy or execute a production migration as part of
publication. PR CI will independently rerun the added API, UI, transaction and
browser tests alongside the existing regression selection.
