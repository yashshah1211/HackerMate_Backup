# Round 2 participant accounts — disabled review candidate

Base main: `97bb87d935d4b9e5efa7d592e4e9ea715f61bed1`. Branch: `feat/hustle-round2-account-onboarding`. No production/staging connection, real records, messages, release flags, merge or deployment is authorized by this document. PR #28 is excluded. No dependencies or paid services added.

## Journey and independent states

The leader opens the private `/partners/hustle-carnival/phase-2/invite#<secret>` link. The standalone landing page removes the fragment immediately. Explicit continuation exchanges it for a 20-minute, HMAC-signed hash context in a root-path HttpOnly/Secure/SameSite=Lax cookie. It grants no guest authority. The old raw-token cookie is ignored. Login/onboarding uses only the fixed, token-free Round 2 return path through the existing Google/GitHub flow. Nothing puts the invitation in `next`, query strings, storage, analytics or rendered team details.

After existing onboarding, the participant explicitly verifies their roster entry. The server and authenticated SQL verify the current nonanonymous Auth user, confirmed Auth email, active owned session, non-banned protected profile and onboarding completion. Exact normalized official roster email establishes the slot; names/editable profile email never do. Distinct verified Auth UUIDs sharing one normalized email are ambiguous and both denied. Changed email, deleted/recreated account or already occupied slot requires reconciliation, never automatic rebinding.

The leader needs their own valid invitation plus bound account to inspect invitation context or respond. A second member uses the fixed private entry `/partners/hustle-carnival/phase-2`, signs in independently and claims only their official member slot; they never need the leader secret and cannot respond. The same fixed entry permits account verification without attendance authority. Missing/expired context offers safe recovery; the leader reopens the original invitation to respond.

Attendance remains `pending/confirmed/declined`. A verified leader may respond while the second member is absent. Account progress is independently `not started/partially verified/fully verified`; solo requires one verified slot, pair two distinct accounts. Later signup never changes attendance. The SQL window is October 23, 2026, **10:00 inclusive–23:00 exclusive IST** (04:30–17:30 UTC), checked after response locks. There is **no second-member signup cutoff**. Account completion records successful verification; access always rechecks current session/profile/email eligibility. An emergency OFF stops all routes temporarily; do not use it as routine member-signup closure.

## Unapplied database contract

`supabase/migrations/20261020055415_hustle_participant_accounts.sql` is a new transaction, not an edit to either historical migration. It requires trusted `postgres`, the reviewed auth-guards helper and trusted existing RPC ownership, Auth metadata SELECT for the owner, and an **empty existing shortlist**. Existing data causes STOP; it is never backfilled by guessed roles/emails.

Canonical SHA256 (UTF-8, LF): `f94387c30b0960c6f6d65f0d3b159d2d7684cd38a5d5cd8b85d6b5ae3752e404`. This is the migration source, **not** an approved production execution-envelope checksum.

Adds one RLS-protected `hustle_phase2_participants` table: `(team_id, role)` primary key; official name/email; nullable bound Auth UUID and verification timestamp; unique event/email and event/UUID. Browser roles have no raw table privileges. Service role may insert only official roster columns, never account binding fields. No new Auth/profile grants or global helper/policy changes. Audit gains `account_verified` with actual actor UUID. Name equality is no longer identity: only the original cross-column name CHECK is replaced; attendance timestamp constraints remain.

Four new functions: owner-only `participant_identity` and `invitation_matches`, authenticated-only `claim` and `participant` (all prefixed `hustle_phase2_`). Legacy `inspect(text)` and `respond(text,text)` keep signatures but now require the bound caller; service/anon/PUBLIC execution is revoked. `import` atomically creates official slots; `snapshot` retains organizer/event/session authorization and adds private per-member verification. Expected total: **six Phase 2 tables, fifteen functions**. Raw table access remains denied. Internal functions have no browser/service EXECUTE. Trusted owners use empty search paths. Claims and responses take team-first locks, enforce distinct identities and limits, and preserve idempotency/audit.

Existing token-only clients fail closed intentionally. Old code must not be used as an enabled rollback after installation. A disabled source-OFF artifact remains compatible. Direct PostgREST RPCs are independent of Next.js flags: only install after the database authorization is approved, and keep official import/batch activation separately gated. Next.js OFF does not itself revoke RPCs.

## Roster and reconciliation

Use the updated [CSV contract](hustle-launch-rehearsal/CSV-CONTRACT.md) and seven-column synthetic template. Names and emails for a pair must both be supplied; both empty means solo. Named columns designate leader/member. Distinct emails across the whole event are mandatory; preserve Gmail dots/plus aliases rather than guessing equivalence. College/phone/row order cannot establish identity. The old 75-team six-column fixture/evidence is historical, not a passing new-contract rehearsal.

Official roster is outstanding. Club Ellusion must approve exact team IDs, grouping, leader/member emails and totals. If an address is wrong/changed or a binding ambiguous, STOP that slot and ask the founder/authorized organizer to verify the authoritative correction privately. Do not ask for credentials, create another account or reuse somebody else's link. This candidate deliberately provides **no self-service rebind/admin override RPC**. Any correction after import/binding needs separately reviewed, versioned, audited remediation preserving existing decisions and account history. Do not improvise live UPDATEs. Organizer snapshots/exports are private PII and must stay outside Git/shared artifacts.

## Release and rollback gates — not execution authorization

1. Review/publish the exact source diff and hashes; obtain independent security review. Both environment flags stay OFF. `ACCOUNT_ONBOARDING_RELEASE_APPROVED=false` is an additional source gate: environment changes alone cannot enable Production/Preview. Ordinary `hustlePublicParticipationEnabled()` stays false.
2. Separately authorize metadata-only hosted preflight of `hackos` (`rhryjrbebfrrfhtyyzbs`): current ledger and migration source checksums, PR #33 installation/definitions, function owners/ACLs, profile columns/eligibility protections, owner Auth column privileges, empty shortlist and unchanged unrelated permissions. This work did not contact that project; earlier baseline counts are not current evidence.
3. Decide recovery explicitly: verified private encrypted export **and independently verified isolated restore**, or a new, narrowly scoped informed exception. An untested export or additive schema rollback is not a full backup; previous exceptions do not carry forward.
4. Prepare/review a project/owner/baseline guarded, checksum-frozen single-migration execution envelope with the versioned ledger row in the **same transaction**. The migration source already has BEGIN/COMMIT; do not append ledger writes after its COMMIT or nest transactions accidentally. Review the final integrated envelope separately. Never run historical backlog. SQL errors/unknown commit outcome require STOP, read-only reconciliation, no retry/repair.
5. Only with new explicit migration authorization: apply the one envelope as trusted postgres. Read-only postflight must verify the exact ledger increment/source, six tables/fifteen functions, owners/RLS/column and function ACLs, internal helper denial, legacy service mutation denial and unrelated-object fingerprint. No code here executes that operation.
6. Separately approve disabled code merge/deployment, verify exact READY SHA and disabled503/no database access. Then perform explicitly approved hosted synthetic Auth/PostgREST tests before real roster: actual Google/GitHub callback + existing onboarding + cookie refresh, owned active/revoked/expired sessions, verified/anonymous/missing/banned profiles, direct RPC browser/service denial, organizer event isolation, bindings/replays/concurrency and cutoff. Local password Auth is not external OAuth or hosted proof. No real account/session testing without approval.
7. Separately approve official roster handling/import, review dry-run digest/counts/roles and activate the exact batch. Separately approve organizer accounts, invitation creation and delivery; none is authorized here. Check privacy/logging: no tokens, cookies, JWTs, query bodies or participant values in telemetry/screenshots; no replay/third-party scripts on private pages. No payment or PR #28 dependency.
8. Only after those gates, review the minimal source change `ACCOUNT_ONBOARDING_RELEASE_APPROVED=false → true` and approve its deployment plus both server-only release switches. Preview remains denied by deployment scope. Do not apply a historical flags-only activation recipe. Check attendance and onboarding independently; retain account entry after attendance closes pending a separately approved lifecycle decision.

Incident: stop communication/import, deploy the verified source-OFF artifact through separately authorized controls, confirm private503 and public portal/workshop health, then reconcile in-flight decisions using retained audit. Keep tables, bindings, ledger and attendance intact. Never restore token-only RPC authority, drop data or reset responses as an automatic rollback. A code rollback cannot undo exposure, restore lost data or instantly cancel in-flight/database calls. DB permission containment requires a separate scoped incident approval.

## Reproducible local verification

- `npx tsc --noEmit`
- Scoped ESLint on the three Hustle modules and changed test scripts.
- `node --test scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-release.cjs scripts/test-hustle-csv-preflight.cjs`
- Existing auth-return/onboarding, admin, partner and public portal/workshop unit regressions.
- `PARTNER_TEST_PG_BIN=<existing PostgreSQL17 bin> node scripts/test-hustle-participant-sql.cjs` (PowerShell: set `$env:PARTNER_TEST_PG_BIN` separately).
- `node scripts/test-hustle-round2-auth-integration.cjs` with existing CLI/Docker/CSC/Edge environment paths. Creates a unique unlinked loopback-only Supabase stack and synthetic accounts; checks actual published bindings before tests; cleanup in finally. Real GoTrue/PostgREST and Next browser are distinct evidence from VM mocks. Disposable timing functions/fixtures are explicitly synthetic and never shipped in SQL.
- `node scripts/test-hustle-phase2-production.cjs`: default Turbopack build with offline font fixture, then disabled production/public HTTP checks against loopback only. No hosted deployment.

Screenshots/evidence live in ignored `test-results/participant-accounts` and `test-results/hustle-auth-real-integration.json`. Capture only authorized synthetic pages after fragment removal; never production PII/secrets. Final current results and publication status belong in the PR handoff; historical counts are not rerun evidence.

## Completed local results — October 20

| Gate | Result |
| --- | --- |
| TypeScript / scoped ESLint | PASS |
| Unit, release guards, CSV | 67 passed, 0 failed |
| Auth return/onboarding, admin, partner, portal/workshop regressions | 801 passed, 0 failed |
| Native PostgreSQL 17.6 synthetic SQL/RLS/concurrency | 63 passed, 0 failed; cleanup complete |
| Actual local Supabase Auth/PostgREST/Next/browser | 145 passed, 0 failed; owned containers/volumes/network removed |
| Default Next.js 16.3.8 Turbopack build | PASS, offline font fixture |
| Local production HTTP | 8 passed, 0 failed; zero Round 2 database requests |
| Independent Standards / Spec rereviews | No remaining actionable defect; diff whitespace check PASS |

The local stack used PostgreSQL **17.11**, GoTrue **v2.197.0** and PostgREST **v16.4**; native SQL used existing **17.6** binaries. Synthetic schema/grant prerequisites and disposable test-clock replacements are not the full production catalog. No external OAuth callback was run. These results establish neither managed-host compatibility nor production recovery. Final passing runs supersede diagnosed earlier assertion/fixture/UTF-8 errors; one regression also required rerun outside sandbox loopback restrictions. No failed gate was waived.

Publication is manual under workspace rule 8: no staging, commit, push, remote PR or Preview is claimed by these local results. Before any commit, inspect the complete status and explicitly stage only the task paths. Do not publish screenshots containing private links. The known approved synthetic screenshots contain no raw invitation.
