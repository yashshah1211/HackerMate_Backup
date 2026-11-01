# Exact compatibility review — signoff required

**NO-GO for production migration/deployment.** This review uses repository migrations, the reviewed C1/C2 proposals and the founder's documented read-only facts. It is not a fresh live schema dump. Codex has not connected to hackos. The newly supplied catalog summary confirms the types/default contracts, ledger summary and normalized parity listed in [CATALOG-RECONCILIATION.md](CATALOG-RECONCILIATION.md). Full raw-body/effective-ACL/dependency/ledger receipts remain unsigned; do not treat the summary as a complete catalog dump.

Use [CATALOG-REQUESTS.select-only.sql](CATALOG-REQUESTS.select-only.sql) through an independently authorized read-only session. It contains catalog SELECTs, an explicitly conditional ledger SELECT and optional aggregate-only readiness queries. Do not blindly execute the ledger query before checking presence/columns. Save function bodies/settings privately, not in a public PR. Collect a timestamp, project identity, operator and transaction/snapshot identity with the receipt. No data correction is authorized.

## Evidence classification

| Status | Meaning |
| --- | --- |
| CONFIRMED | Founder explicitly inspected this live fact; recheck for release-time drift. |
| REPOSITORY | Required by existing migration/proposed code, not independently confirmed live. |
| QUALIFIED FIXTURE | Executed in a newly allocated PG17.6 fixture; not proof of live parity. |
| BLOCKED | Needed production/operational evidence or decision is absent. |

Confirmed: PostgreSQL **17.6**; no new Mission 20 RPCs/registration policies installed; authenticated registration column INSERT bypass exists; owner `team_members_update` using `is_team_owner(team_id)` and UPDATE(project_role); `teams_delete_owner` owner OR `is_admin(auth.uid())`; six CASCADE edges below; supplied conversation/profile-audit trigger behavior and postgres-owned SECURITY DEFINER/search_path public,pg_temp for the four supplied functions. Matchmaking and conversation triggers exist. Complete policy/function/role/index/ledger parity is **not** thereby confirmed.

## Table/column contract checklist

Each row requires catalog type, nullability, default, generated/identity state and effective permissions—not just a matching column name. Stop on an unknown NOT NULL column without a usable default, enum/domain mismatch or divergent constraint.

| Object | Required contract / specific risk | Evidence / release receipt |
| --- | --- | --- |
| public.hackathons | UUID id/organizer_id; type/status values native/external/official and pending/approved; boolean archived; registration_start/end, registration_status, start/end dates; integer min/max_team_size, max_participants; JSONB ai_feedback with protected review keys. Uses `%ROWTYPE` and `to_jsonb`. | Confirmed types above; remaining columns/defaults/checks/domains require full capture. CONFIRMED: start/end DATE, registration start/end TIMESTAMPTZ, type VARCHAR(50). Older comparator fixtures used timestamptz event dates; the new atomic rehearsal corrects these types without changing production. |
| public.hackathon_registrations | UUID id/hackathon_id/user_id/team_id; status confirmed/waitlisted; created_at; looking_for_team, is_hidden booleans; metadata JSONB. id/status/created_at defaults must support native INSERT of only event/user/team. Unique(event,user) and non-null event/user/status are essential. | Column INSERT exposure and table-wide INSERT absence CONFIRMED. Registration defaults/unique identity contracts confirmed in summary; exact complete named constraints/types/defaults require capture. No identity/status UPDATE is permitted by new trigger. |
| public.teams | UUID id/owner_id, name, max_members; fields referenced by actual matchmaking functions and canonical deletion (skills, roles, college, recruiting, etc.). | Owner/admin DELETE policy CONFIRMED; exact ACLs, all relevant columns and owner-transfer constraints pending. |
| public.team_members | UUID id used by adapters plus team_id/user_id, role, project_role, created_at; unique membership and exact owner semantics. Transfer prototype copies complete `%ROWTYPE`, not a fabricated new subset. | Owner role-update policy/column grant CONFIRMED. Member identity/default/unique membership confirmed in summary; capture exact definitions and any extra mandatory columns. |
| public.team_hackathons | Composite team/event identity; owner-authorized DELETE; existing linkage SELECT; team/event CASCADE per repository. Cancellation unlinks only the registered team/event while still owner-authorized. | Junction CASCADE now CONFIRMED live. Exact ACL/policy parity remains pending. Atomic and HTTP fixtures model CASCADE, not a production change. |
| public.profiles + auth.users | Profiles id, role, is_banned, onboarding_completed plus audit/matchmaking fields. Auth id/email and JSON-readable is_anonymous/deleted_at/banned_until; exact deployed auth.uid() must bind current request, never user_metadata. | Partial supplied audit/deletion behavior CONFIRMED; full type/FK/function parity pending. No new client profile/auth-table grants proposed. |
| conversations/participants | Conversations id/type/team_id, unique team_id for ON CONFLICT(team_id); participants conversation_id/user_id, unique pair and any mandatory defaults. | Supplied trigger behavior and graph CONFIRMED; exact uniqueness/columns/ACLs still require capture. |
| team_invites/join_requests | id/team_id/status plus invited_user_id or user_id; original authorization and pending checks; caller cannot choose request identity through a replacement team argument. | REPOSITORY; exact deployed body, FKs, columns and grants pending. |
| notifications, deleted_user_logs, storage.objects | Preserve canonical notifications, required deletion audit and storage ownership blocker (owner/owner_id), all profile-audit fields. Trigger suppresses audit errors, but RPC requires the resulting record or rolls back. | Founder supplied behavior CONFIRMED; complete deployed body and ancillary dependencies pending. |
| matchmaking schema, badges/certificates/submissions/announcements/event_organizers | Existing triggers/projections/private readers and all inbound deletion FKs. Do not assume certificate/team/user history is preserved by unspecified FKs. | Existing regression/SQL fixtures qualified; full live dependency closure and workflow parity BLOCKED. No schema/read-policy changes proposed here. |

### FK / index / constraint checklist

| Edge | Documented live action |
| --- | --- |
| registrations.team_id → teams.id | **CASCADE confirmed**, exact named hackathon_registrations_team_id_fkey required by 01. Team deletion removes registrations; no SET NULL/history-preservation claim. |
| team_members.team_id → teams.id | **CASCADE confirmed**; validated single-column team FK required by 01. |
| team_members.user_id → profiles.id | **CASCADE confirmed**. |
| conversations.team_id → teams.id | **CASCADE confirmed**. |
| conversation_participants.conversation_id → conversations.id | **CASCADE confirmed**. |
| conversation_participants.user_id → auth.users.id | **CASCADE confirmed**. |

- [ ] Capture exact child/parent columns, actions, validation and deferrability for these six, plus every inbound FK to users/profiles/teams/events/conversations. Profiles→Auth, registration→user/event, invite/request and junction FKs require exact definitions; the new audit additionally confirms both junction CASCADE actions.
- [ ] Check unique(event,user), member identity/uniqueness, conversation(team_id), participant(conversation,user), junction(team,event), status/type/capacity checks and column defaults.
- [ ] Capture index validity/readiness and definitions. Admission counts confirmed **registration rows** by event; missing event/status or FK-child indexes can make production latency unacceptable. Membership/team/event lookup indexes and real-volume plans require review. No speculative index or FK migration is introduced.
- [ ] Count invalid native configuration and over-capacity events read-only after type signoff. Existing records are not silently repaired. A nullable max_participants remains unlimited; 0 waitlists all new rows. Four humans in one registered team still consume one row slot. Cancellation/deletion releases a slot without automatic waitlist promotion.

## RLS, grants and privileged writers

- [ ] Capture relrowsecurity/relforcerowsecurity, owners and ALL permissive/restrictive policies on the affected tables, including inherited PUBLIC and role memberships. C1 contract requires exactly the reviewed registration-policy set and rejects drift; it must not delete an unknown policy automatically.
- [ ] Before release, distinguish table-level INSERT from explicit column INSERT. Table REVOKE is insufficient. Final contract deliberately restores only seven community columns: hackathon_id,user_id,team_id,status,looking_for_team,metadata,is_hidden. It retains private authenticated SELECT/self DELETE and guarded preference UPDATE. Direct native INSERT must fail despite this grant and despite a permissive policy, due to restrictive RLS + trigger. Test a forged user/team/status, anonymous access and service boundaries.
- [ ] Keep external and legacy official community writes working only after final contract + unfreeze: verified active self identity, optional owned team, approved/unarchived event. Trigger owns confirmed/waitlisted status. Ended events reject; an external registration deadline is not treated as a community join deadline. Legacy official stays community-only, never silently converted; ordinary new official event creation is rejected.
- [ ] Native creation must be pending; external cross-list creation remains approved. Ordinary authenticated owners cannot change type/status/organizer/review identity. Server admin transitions use the existing authorized service-role path; an admin claim/profile is not a client-side approval privilege. Verify actual admin writers and effective service-role JWT/gateway role behavior.
- [ ] Retain actual team/member base ACL/RLS. New remove/role/delete-team wrappers are SECURITY INVOKER. Private authorized-parent helper does not grant a base write. Owner role UPDATE and owner/admin team DELETE must pass; nonowner/identity-column updates must not. Never add broad UPDATE/DELETE to make tests pass.
- [ ] Ensure no authenticated/anon role can become postgres/service_role or BYPASSRLS/TRUNCATE. Production authenticator may legitimately switch to service_role for trusted backend tokens; do not blindly copy the deliberately narrower fixture login memberships or revoke production capabilities without separate design. Capture graph and token-verification controls.
- [ ] Existing public.add_user_to_team must retain its hardened non-client EXECUTE boundary. CREATE OR REPLACE in 08 preserves existing ACLs/owners; it does not repair an unsafe live grant or prove the current owner is postgres.

## Function, owner, search_path and trigger checklist

Source-hashed proposal order is in [SQL-MANIFEST.json](SQL-MANIFEST.json). Inventory all overloads: stale overloads/default-argument collisions can produce ambiguous or unsafe RPC exposure. New Mission 20 objects are confirmed absent, but the complete private namespace/collision state still requires capture.

| Group | Required boundary / acceptance |
| --- | --- |
| 01 new functions / approval and registration triggers | New schema owned postgres; fixed empty search_path; elevated register_native and trigger guards intentionally owned postgres; internal clock-injected helpers not client-callable. Public register_native_hackathon is invoker, args event/team/review only, JSON status + alreadyRegistered. |
| 05 + 07 | Final per-team lock_context replaces global SHARE; writer entry points pre-lock complete sorted team parents then events. Legacy row hooks use NOWAIT because executor tuple locks precede BEFORE triggers. No user EXECUTE on broad lock/transfer helpers. |
| 08 existing writers | Normalized body parity for the four replaced writers is now CONFIRMED. Exact raw fingerprints/settings/owners/ACLs still require signoff; hardened add_user_to_team parity remains unresolved and is guarded, not replaced. Preserve every original auth/capacity/protected-admin/storage/audit/notification check. Existing SECURITY DEFINER public,pg_temp paths are retained, not silently normalized under this task. |
| C2 atomic cancellation | New invoker wrapper returns exact registration UUID; private definer lock helper checks own participation and team→event order; only authenticated EXECUTE. Owner-only linkage delete + exact self/event/registration delete in one transaction. Any failure rolls both back. |
| Trigger graph | Capture trigger name/event/columns/timing/function/enabled state and actual function bodies on members, teams, profiles, registrations, conversations, participants and auth.users. Matchmaking AFTER hooks reacquire parent/cache locks. Supplied conversation hooks handle INSERT/DELETE, not raw team_id UPDATE. Bulk transfer prototype uses DELETE+INSERT to run them. |
| Profile audit/deletion | Supplied postgres-owned SECURITY DEFINER public,pg_temp profile audit catches errors; canonical delete separately insists audit exists. User deletion locks caller/target, sorted owned AND non-owned member/registration parents/events, then uses bounded late-successor acquisition. All inbound CASCADE/RESTRICT effects and protected/storage cases must match. |

- [ ] Compare live definitions to repository baseline, not merely names. Function owners/EXECUTE/search_path/proconfig and attached trigger bodies must match. Any difference requires independent review/regeneration; do not overwrite a production hotfix with 08 or change ownership automatically.
- [ ] Confirm mission20_private is NOT a PostgREST exposed schema. Check actual gateway/PostgREST version, db-schemas, role switching, JWT verification/cache, timeout and schema-cache reload behavior independently. `current_setting('pgrst.db_schemas',true)` alone is not authoritative process configuration.
- [ ] Capture schema/default ACLs; all new functions start PUBLIC-executable by PostgreSQL default unless explicitly revoked. Verify effective post-install privileges, including private workers intentionally granted to authenticated but kept out of exposed schemas, and no EXECUTE on clock/transfer helpers.
- [ ] Function-level SET statement_timeout is not a demonstrated whole HTTP deadline. Existing client/route budget is 12s. The local HTTP test installs an effective 5s **fixture connection** timeout; production needs separately approved before-statement DB/gateway budgets and disconnect qualification. No production setting is changed here.

## Ledger and migration packaging — blocking release gate

- [ ] Capture live supabase_migrations.schema_migrations presence/columns and version/name ledger; compare full repository migration filenames/checksums and object state. Absence of the new RPCs does not prove ledger consistency. Do not use migration repair, mark-as-applied or replay old migrations here.
- [ ] Allocate new unique ordered versions only after the actual latest ledger is reviewed. No active migration files/versions are allocated or installed by this package. The reported ledger is 147/latest 20261025081515; four tentative unallocated future versions are in atomic/CANDIDATE-MANIFEST.json. The docs' 00/01/05/07/08/etc. names are review steps, not ledger versions.
- [ ] Freeze must be a committed first boundary. The [review-only atomic candidate](atomic/README.md) now packages expansion as an **atomic final-protocol transaction** covering 01→05→07→08→C2 cancellation, so untrusted direct writers cannot observe intermediate blocking/global variants. Standalone proposal files contain their own BEGIN/COMMIT and must NOT simply be wrapped with another BEGIN; inner COMMIT would defeat atomic packaging. The generated candidate selects only final definitions, excludes the unused private transfer prototype and has one BEGIN/COMMIT. Independently review its source hashes, guard receipts and PG17 install/failure/rollback results before any promotion to proper migrations under new authorization.
- [ ] 04 and 09 are fixtures; never migrate them. No fixture users, schemas, grants, auth shim, HTTP timeout function, dummy ledger or authenticator role may enter the release bundle. 03 is a fail-closed response, not a structural/data rollback or automatic unfreeze.
- [ ] Contract 02 must follow the **last** 00 freeze, because freezing revokes community column INSERT. Unfreeze 06 only drops a policy and does not restore ACLs. A rollback/re-freeze recovery needs reviewed exact final ACL reconciliation and removal of the applicable freeze markers, not blindly rerunning 06 or 02 (02 has first-contract policy preconditions).

Until these receipts and the atomic packaging/ledger decision are signed, the deliverable is an independently reviewable **candidate package**, not an execution-ready migration. No schema compatibility PASS is inferred from the fixture or repository alone.
