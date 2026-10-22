# Round 2 inactive shortlist import

This release separates CSV preparation from participant release. It changes no
schema, grants, RLS, Auth configuration, Google provenance checks or historical
migration. No official roster is included in this repository.

## Scope and gates

The existing `/partners/hustle-carnival/phase-2/organizer` UI supports:

- Authenticated, non-banned founder/admin authorization and a current Auth session.
- Explicit column mapping, CSV validation, signed dry-run receipt, exact digest,
  reviewed import, and private readback through `GET .../phase-2/organizer`.
- An imported batch with `activated_at = NULL`; every team starts pending and
  every solo leader slot starts unbound. An import does not issue invitations.

Ordinary event organizers, unrelated users, banned users and revoked sessions
cannot use this mode. It does not grant any account a new role or event access.
The database independently rechecks admin/founder eligibility in the unchanged,
service-role-only `hustle_phase2_import` RPC. The supported route supplies the
actor from verified Auth, never from the request body.

Existing database snapshot privileges are unchanged: a separately assigned,
non-banned event organizer with an active session can still call the authorized
read-only snapshot RPC directly. The application import-only gate is not a new
database confidentiality boundary. Production had zero event-organizer
assignments at preparation; privately reverify intended readers before importing
real contact information. No browser role can directly execute the import RPC.

The reviewed import source approval is `INACTIVE_IMPORT_RELEASE_APPROVED = true`.
It approves **only this import capability**. Both new server-only switches
default OFF and must separately be approved before an operator sets them:

```
HUSTLE_PHASE2_IMPORT_ENABLED=true
HUSTLE_PHASE2_IMPORT_RELEASE_APPROVED=true
```

Production additionally requires `NODE_ENV=production`, `VERCEL_ENV=production`,
the exact `https://www.hackermate.in` request origin, the exact hackos Supabase
URL, nonempty server credentials, and no local fixture flag. Hosted Preview,
foreign projects, noncanonical hosts and malformed URLs deny. Local tests use
only an explicit development/test loopback fixture with no `VERCEL_ENV`.

The original `ACCOUNT_ONBOARDING_RELEASE_APPROVED = false` remains unchanged.
Both original switches must stay unset/false:

```
HUSTLE_PHASE2_ENABLED=false
HUSTLE_PHASE2_RELEASE_APPROVED=false
```

Import-only mode allows only POST `columns`, POST `import`, and GET `organizer`.
Every other API operation returns disabled 503 before constructing a database
client. Participant and invitation pages remain unavailable. Activation,
invitation creation/revocation, attendance, account claims and CSV exports are
unavailable, including to admins. The UI omits their controls. Normal HackerMate
authentication is unchanged; no Round 2 Google-proof callback runs while its
participant source gate is off. Participant Google-only checks remain intact.

## Separate release and import approvals

1. Review this PR and its exact SHA. Merge/deploy and production environment
   changes require separate founder approval; this development task performs
   none of them. Start with **all four switches OFF**. No migration is needed.
2. Verify the exact READY artifact, canonical production domain and backend
   `rhryjrbebfrrfhtyyzbs`. Confirm 142 ledger versions, the four historical Hustle
   migrations, seven protected tables, seventeen functions and expected ACLs.
   Recheck current state immediately before an approved import; today's empty
   state is not an enduring baseline.
3. Separately approve import-only enablement. Set only the two new switches in
   the Production scope and deploy the approved artifact/configuration. Keep
   both original switches OFF. Vercel environment edits apply to a new deployment;
   do not assume an edit instantly changes an already deployed function.
4. Use the existing authorized admin's normal HackerMate login. Verify the page
   says **Import-only preparation**, the readback API is admin-only, other APIs
   still return 503 and no participant page exposes a roster. Do not create a
   platform admin or use synthetic production records for a smoke test.
5. Obtain separate authorization for the actual private roster dry run/import.
   Map all seven normalized fields explicitly: `team_id`, `team_name`,
   `leader_name`, `leader_email`, `leader_whatsapp`,
   `optional_second_member_name`, `optional_second_member_email`. For each solo
   row leave both member values blank. Do not silently discard extra columns.
6. For the founder-approved first batch, independently reconcile exactly 42
   solo teams, IDs HC26-R2-001 through HC26-R2-042, approved leader identity and
   contact details. These IDs are an operator reconciliation requirement, not a
   hardcoded restriction preventing subsequent separately approved batches.
7. Upload privately, select mapping and **Validate dry run**. Review normalized
   rows, zero issues, count 42 and digest. Dry run creates no shortlist or batch;
   the existing admin rate limiter can update its internal counter. Keep CSV,
   receipt, credentials and contact details out of logs, Git and screenshots.
8. Only after data-import approval, click **Import reviewed shortlist** once.
   Receipt binds actor, exact file/mapping digest and 15-minute expiry. Modified,
   expired or missing approval requires a fresh dry run. No overwrite is offered.
9. Reconcile supported private readback: one new batch, matching digest,
   `activated_at=null`, 42 new solo teams/leader slots, 42 pending, zero new
   confirmations/declines, zero verified bindings, zero invitations and no new
   Google proofs. Ledger and function/permission state must be unchanged.
10. Disable import-only access again through a separately authorized deployment
    if no further batches are immediately needed. Activation and invitation
    delivery remain separate decisions and are not authorized by an import.

On any failed/uncertain import response, STOP. Read back the private batch and
digest before considering another attempt; do not blindly click again. The RPC
uses one PostgreSQL transaction/advisory lock, and uniqueness constraints reject
duplicates, but a lost HTTP response does not prove rollback.

## Recovery and rollback

Before an approved production import, explicitly decide its recovery policy;
earlier migration-specific no-backup exceptions do not authorize this data write.
This patch makes no claim of verified production backup/recovery.

Disable either new import switch and deploy the approved disabled configuration,
or roll back to the recorded prior disabled production artifact. At preparation:
`dpl_4arYmZYi1TmBW8nrb2PWBGWxNd89`, commit
`d7db0a07c199aca3b2b509126772a58bb5b2c776`, READY. The supervising founder must
reverify that artifact and own the separately approved rollback operation.

Code/config rollback blocks further access; it does **not** undo an imported
roster or erase private data. Keep an already imported batch inactive and retain
its audit trail. There is no supported public reset/delete/overwrite endpoint.
Corrections or deletion require a separately reviewed, explicitly authorized
data-reconciliation procedure. Do not improvise SQL repairs, activate the batch,
replay migrations, broaden grants or distribute links to recover from an error.

## Verification

All fixtures use clearly synthetic identifiers and `example.invalid` contacts.
The new browser runner disposes of its own database/browser/server in `finally`
and does not connect to the paused staging rehearsal or any hosted database.

```
node --test scripts/test-hustle-inactive-import.cjs scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-release.cjs scripts/test-hustle-google-session.cjs
node scripts/test-hustle-inactive-import-browser.cjs
node scripts/test-hustle-round2-auth-sql.cjs
node scripts/test-hustle-participant-sql.cjs
npx tsc --noEmit
npx eslint src/lib/hustle-phase2/server.ts src/lib/hustle-phase2/pages.ts scripts/test-hustle-inactive-import.cjs scripts/test-hustle-inactive-import-browser.cjs
node scripts/test-hustle-phase2-production.cjs
```

On Windows set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to the existing Chrome binary
and `PARTNER_TEST_PG_BIN` to existing PostgreSQL tools for the test process only.
The production runner builds with default Turbopack, synthetic loopback credentials
and offline font responses, then checks the disabled production-mode runtime and
public portal/workshops. It never deploys or pulls production secrets.

The 42-team browser runner exercises the actual UI and Next handlers against
unchanged migrations in real disposable PostgreSQL. Its loopback Auth/PostgREST
transport is a synthetic substitute; it is not new hosted Google/OAuth acceptance
or proof of the eventual production admin's session/configuration. Previously
completed hosted participant OAuth tests are not repeated by this task.

### Candidate results — 22 October 2026

| Verification | Result |
| --- | --- |
| Unit, release and Google-provenance cases | 89 passed, 0 failed |
| Banned-admin / active-session SQL checks | 57 passed, 0 failed |
| Participant SQL/RLS/replay/concurrency checks | 91 passed, 0 failed |
| Actual UI → Next → disposable SQL, 42 solo teams | 51 passed, 0 failed |
| Disabled production-mode/public portal HTTP routes | 8 passed, 0 failed |
| Default Turbopack production build | Passed |
| TypeScript and scoped ESLint | Passed |

The disposable SQL runs used installed PostgreSQL **18.4**; production metadata
reported **17.6**. No SQL implementation changed. These runs do not replace a
subsequent hosted configuration/admin-session check on an approved deployment.
All fixture runs executed cleanup, including earlier test-harness failures.
Initial Windows browser-path, localhost/selector, response-navigation and test
schema/error-message assumptions were corrected without relaxing application or
database guards; the final runs above have no unresolved failure.

Read-only production inspection found ledger 142, the four required migrations,
seven protected tables, no batches/teams/participants/invitations/responses, and
zero event-organizer assignments. Service role still lacks Auth email SELECT;
the reviewed narrow trusted helper handles the existing permission boundary.
The verified production artifact remained READY and returned disabled API 503.
No official roster import, live enablement or production deployment occurred.
