# Hustle Round 2 disabled-release and reversible launch runbook — NOT EXECUTED

> Activation-preparation update (base `8f9b9cf`): use [the current release checklist](hustle-phase2-activation-preparation.md) for the two-switch gate and emergency stop. Historical PR #27 rehearsal/database instructions below remain subject to Desktop’s independent sign-off. The old source-enable proposal is retired. Nothing in this document authorizes execution.

Use only after the separate approvals listed in hustle-phase2-disabled-release-candidate.md. This document authorizes no connected writes, production merge/deploy, live activation or messaging. Stop at any failed gate. The registration window is October 23, 2026, 10:00:00 IST inclusive to 23:00:00 IST exclusive; database time is authoritative after locks.

Security PR #29 is already in production main dcd84634c8a8b7a098a94b692f88341384c42216. The candidate merges that baseline without rewriting PR #27 history. PR #28 is EXCLUDED from this release and is not a dependency of any step below. Expected scope is 50–75 teams / 100–130 participants; final grouping and leader designation are unresolved. No account has been provisioned by this work.

## 1. Freeze the release, preferably by October 21

1. Freeze the reviewed PR #27 head that contains production main dcd8463. Verify its ancestor and unchanged production dependency manifests. Exclude PR #28 and its design ledger, development page and dispatch foundation.
2. Rerun TypeScript, scoped lint, the 575-test core/unit/regression baseline, 167 core SQL checks, 23 ownership/operator-SQL checks, actual Next/browser flow and optimized default production build. Repeat hard-off/portal/workshop probes. No automatic dependency upgrade. The earlier ten-team rehearsal is historical evidence; do not label it a new final-candidate run.
3. Obtain an approved schema-compatible integration target. Prefer PostgreSQL 17 with actual Supabase Auth/PostgREST for final compatibility. First inspect its schema and ledger read-only; the current staging project has not been established as a clone. Obtain separate authorization before any connected setup/migration. Use only synthetic records with cleanup.
4. Rehearse a real verified admin session, refresh/rotation, exact-event organizer read, unrelated/banned denial, inactive import, activation, one-time link, leader response, replay, expiry and rollback. Browser fixture Auth is not a replacement for this.
5. Record final commit(s), migration SHA256, package-lock hash, environment scope, owner/executor, operator list, verified backup/restore evidence or documented disabled-migration-only exception, intended deployment ID and a known-good HARD-OFF production rollback artifact. Record who can operate rollback. Existing production main is hard-off, but verify its actual deployment ID/content before relying on it. A feature Preview is not the production rollback artifact.

Reviewed PR A migration:

    supabase/migrations/20261018082156_hustle_phase2_shortlist.sql
    version: 20261018082156
    canonical Git blob SHA256: 4fc87a833b6e3c4687cba372a05717383cb8f35fdd60f03a7f90e166038f45e7

Windows working-copy CRLF bytes have a different SHA256 (1b3caeeb97191e50288737dd718de48f4be4309ad509913efc0267d6c7f3cdcd). Compare normalized canonical content or the Git blob, not an unexplained platform newline difference.

## 2. Verify production readiness READ ONLY

Repeat immediately before applying anything; October 18 catalog facts may change.

- Confirm the intended hackos production project/region, current production code SHA, database version and migration ledger. Record either verified backup/restore evidence or the explicitly authorized, documented no-backup exception defined in the current activation checklist, limited to the disabled additive migration. Existing free-tier backup availability was not established. The exception does not establish recoverability or authorize activation; protect any backup PII.
- Verify the fixed event UUID 0da43cba-90dc-449c-a126-a2fc8be8a379 exists and is the approved Hustle event. Do not change its generic metadata, max_team_size, registrations or workshop links.
- Verify postgres is the trusted executor/owner, has public CREATE/USAGE and protected auth SELECT/REFERENCES; auth.users remains owned by supabase_auth_admin. service_role must NOT gain auth.users SELECT. Confirm profiles id/role/is_banned and event PK types.
- Verify existing has_partner_admin_access()/can_access_partner_event(uuid): postgres-owned definers, authenticated EXECUTE, service_role denied. Verify current protected-profile read/role guards and public schema API exposure. Ensure new RPCs will be visible through the actual Data API after schema refresh.
- Verify all five phase2 tables, ten functions and migration version are absent. If any exist, STOP and reconcile the actual state; this migration is not a rerunnable IF NOT EXISTS repair.
- Verify production app configuration points at the same approved project; public anon key matches, server-only service key is available through secure configuration, canonical NEXT_PUBLIC_SITE_URL and Supabase Auth callback allowlist match the real HTTPS host. Do not log/persist secrets in reports.
- Verify official existing admin account and each proposed organizer are eligible/non-banned. Approve exact account UUIDs privately. Do not create a new platform administrator merely to share statistics.

Prepared operator queries are docs/sql/hustle-phase2-production-preflight.sql (BEFORE installation) and docs/sql/hustle-phase2-production-postflight.sql (AFTER separately approved installation). Both are transactionally READ ONLY and finish ROLLBACK. Run preflight as metadata inspection under the verified intended connection; require every must_* boolean true, all expected rows/signatures present and no unknown treated as a pass. The files contain no account lookup, token, participant query, grant or migration. The local ownership suite syntax-checks both; hosted integration remains separate.

Useful metadata-only postflight shape queries, after approved installation:

    SELECT c.relname, pg_get_userbyid(c.relowner) AS owner, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN
      ('hustle_phase2_batches','hustle_phase2_teams','hustle_phase2_invites','hustle_phase2_audit','hustle_phase2_limits');

    SELECT p.proname, pg_get_userbyid(p.proowner) AS owner, p.prosecdef, p.proconfig, p.proacl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'hustle_phase2_%';

Expected: five postgres-owned RLS tables, ten postgres-owned functions. Only authorized and snapshot are definers, each with empty search_path. Snapshot EXECUTE is authenticated-only; the remaining functions are service-role-only. No PUBLIC/anon raw table/privileged-function access. Audit service privileges are SELECT/INSERT only.

## 3. Land disabled code and apply the ONE migration

1. After explicit merge/deploy approval, land the reviewed registration/security code with BOTH `HUSTLE_PHASE2_RELEASE_APPROVED` and `HUSTLE_PHASE2_ENABLED` unset/false. Verify its exact production artifact is READY and record it as the disabled rollback target. Existing portal/workshops must remain healthy.
2. Obtain explicit production migration approval naming the file/version/checksum, trusted postgres executor and either verified backup/restore evidence or the documented disabled-migration-only no-backup exception from the current activation checklist. Keep both release flags OFF. The exception does not establish recoverability or authorize activation. Use the approved versioned migration runner to apply ONLY the reviewed file atomically and record its ledger entry. The file already encloses its DDL in BEGIN/COMMIT.
3. Do NOT run a full-directory supabase db push, bootstrap script, old backlog or PR #28 design ledger. Repository migration history does not equal production history. Do not run hand-edited SQL that grants service_role access to auth.users.
4. The database operator must establish the exact ledger-recording method BEFORE cutover. If using a raw psql file run, note that psql does not itself write Supabase migration history: runbook approval must also cover a reviewed versioned history procedure. Do not improvise a second ad-hoc ledger INSERT after the migration or assume an unrecorded file was registered.
5. Stop on any permission, duplicate-object, FK, role, owner or migration-history mismatch. A failure inside the migration transaction must roll back; reconnect and verify no partial objects before retrying. Do not mask it with IF NOT EXISTS or broader grants.
6. Read back the five tables, ten functions, RLS, exact ACLs, empty search paths, owner and ledger checksum/version mapping. Confirm the existing auth/users/table ACLs and two partner predicates did not change. Confirm the correct Data API schema refresh/cache visibility using approved tooling.
7. With feature still off, repeat the disabled registration and public core/portal/workshop smoke checks. Roll back the CODE artifact if unrelated routes regress; keep the additive schema for investigation unless a separately approved clean pre-data removal is necessary.

## 4. Provision, privacy review and release smoke

- Proposed organizer contacts are ellusion@glbajajgroup.org and 4454ashutosh@gmail.com. These email strings are NOT proof of an existing eligible account and are not authorization inputs. No named-account lookup, creation or provisioning was performed. After explicit approval, an authorized operator must verify each existing authenticated account, protected profile/ban state and exact UUID privately. The founder/admin already has event authority; no event_organizers row is needed for admins. To give a reviewed existing non-admin read-only event access, use the existing verified admin POST /api/admin/partner-organizers with eventId and userId. Read back the exact assignment. Do not insert arbitrary accounts, infer authority from an email domain or grant platform admin for convenience.
- Confirm the organizer can only read/export, and unrelated/other-event/banned users are denied. Admin-only import/activation/link issuance must remain separate. Preserve current SSR refreshed cookies on every response.
- Verify platform access logs/APM/Sentry/replay and operator tools do not retain CSV bodies, ephemeral URLs or invitation/auth cookies. Sentry configuration exists globally with production tracing/replay defaults; private standalone HTML avoids client replay scripts, but that does not prove platform/server capture is safe. Verify settings/redaction on the actual artifact before real PII or bearer handoff.
- Check HTTPS, CSP/no-store/no-referrer/noindex, cookie HttpOnly/Secure/SameSite=Strict, fragment removal, no raw token in request path or rendered HTML, no analytics on leader pages, and private CSV access/formula neutralization.
- Approve the official normalized CSV mapping, expected 50–75 team rows (hard implementation cap remains 500), trusted storage, consent, recipient matching, retention and deletion owner. The proposed Sno/Name/Phone number/Gmail/College name participant sheet lacks confirmed team IDs/names, grouping and leader designation. It MUST NOT be imported as one team per row. Obtain the explicit roster/leader mapping first; see the candidate document for the exact normalized contract. Do not commit/export the real CSV or contacts to GitHub.
- Define the approved internal/synthetic smoke identities in the integration environment. Do not contaminate the one-shot production shortlist with fake teams: there is no public delete/reset endpoint. Any production smoke invitation must refer to a separately approved legitimate shortlisted/internal sample and is a separately authorized real-data operation.

## 5. Production activation — PREPARATION ONLY

The old `PRODUCTION_RELEASE_APPROVED=false -> true` patch is retired. The reviewed preparation patch instead requires TWO server-only environment switches, a production deployment and valid hosted Supabase configuration. Both switches default OFF. See [the current release checklist](hustle-phase2-activation-preparation.md) for the exact contract, release gates, controlled activation and rollback limitations. No additional source flip is needed after that patch is approved and deployed disabled.

Do NOT change `hustlePublicParticipationEnabled(): false`. Do not activate either environment switch, deploy or distribute invitations without the separate release authorization. PR #28 is excluded.

## 6. Shortlist, activation and individual invitations

1. Staff the admin issuer, read-only organizer, support contact and incident operator before opening. Have the official list early enough to review; arrival at 10:00 implies opening after review/activation, never before it.
2. In /partners/hustle-carnival/phase-2/organizer, upload the official CSV and explicitly map every header. Leader + optional second member; no third member. Resolve invalid identifiers/email/phone, duplicate contacts/IDs, formulas, unknown columns and pilot cap before proceeding.
3. Run dry run. Review all normalized rows, count and exact digest. It must perform no shortlist insert. Approve and import that exact receipt within its validity; if stale or edited, re-preview rather than bypass.
4. Read back the inactive batch and count; initial totals must be shortlisted=N, confirmed=0, declined=0, pending=N. Confirm no generic registrations enter this dataset.
5. Separately approve and click activation for that exact official batch/digest. Capture safe audit identifiers/counts, not PII or bearer material. Activation does not override the time window.
6. Generate links one team at a time. Only a verified admin can do this; an ordinary event-organizer assignment is not enough. Keep the fragment capability opaque and deliver it immediately to the matching recorded leader through the separately approved individual channel. No automatic emails, bulk WhatsApp, public groups, link shorteners, tracking rewrite or wa.me query bearer.
7. A dismissed/lost link is unrecoverable from hashes. Revoke and reissue while pending, ensuring the old link is invalid and the correct recipient receives the replacement. Do not blindly issue again or infer send status from ready.
8. Leaders open the link, continue securely, attest they lead the whole team and confirm/decline once. No HackerMate signup or fee is required. A forwarded URL delegates bearer access; handle suspected sharing by revocation/support.
9. Refresh the dashboard and reconcile N=confirmed+declined+pending. Manual sending, provider acceptance, delivered/read labels and team registration must never be conflated.

## 7. Monitor and close

- Before opening, verify operator login, error alerts, clock UTC conversion, off-artifact rollback ability and support availability. A tab opened before 10:00 may need refresh; no live countdown is an authorization boundary.
- At opening and periodically during the 13-hour window, check API availability, database permission errors (42501), 5xx, 409 collisions, 429 limits and safe aggregate response totals. Suggested staffed dashboard refresh: every 15 minutes initially and during the last hour; tune to traffic. Do not include raw bodies/cookies/contacts in alerts.
- Respect 30 admin mutations/minute, shared 300 public operations/minute and 12/token/minute limits. Session exchange and response both consume public budget. Deliberate anonymous exhaustion remains a known availability risk; tune only through reviewed controls and approved existing/free platform facilities.
- For 50–75 teams, links alone can occupy 2–3 fixed minute buckets at the admin ceiling, plus import/setup/reissue operations and human delivery time. Do not mistake the nominal 100/day existing email guard for verified free provider headroom. Individual organizer-operated capability delivery avoids making email automation or PR #28 launch dependencies.
- At 22:45–22:55, remind support/organizers of the hard cutoff; do not queue all remaining link issuance/responses at the deadline. Observe pending count without publicly exposing the roster.
- At exactly 23:00 IST (17:30 UTC), pending decisions must reject, including requests waiting on locks. There is no automatic extension or admin override in this MVP. Preserve the audit and report remaining pending separately.
- Disable registration through the approved environment/source-off deployment after closure as operational cleanup. Keep authorized read-only reporting available only if separately approved; the current shared feature flag turns private organizer routes off too.

## 8. Reversible stop / rollback

1. On unauthorized disclosure, unexpected mutation, broken access or severe availability failure: stop manual issuance/contact immediately and have the named incident operator roll back code to the recorded verified HARD-OFF production artifact using approved deployment controls. Verify its exact SHA, not merely a branch label.
2. Verify Round 2 APIs return 503/unavailable without database calls and private pages show unavailable; existing portal/workshops remain healthy. An environment change to HUSTLE_PHASE2_ENABLED=false needs a new deployment; it is not an instantaneous kill of existing functions.
3. Allow already-running requests to drain and reconcile any decisions against audit. The schema has no global emergency stop function. If immediate database-level denial is required, obtain the separately approved incident plan for scoped Phase2 RPC access revocation; do not improvise broad service_role or auth grants/revokes.
4. Keep all phase2 tables, invitations, response decisions and audit intact. Do not drop migration tables, truncate the roster, reset decisions, delete migration history or restore a full database backup over valid responses. Do not weaken authorization to recover availability.
5. Resume only after diagnosis, approved fix, repeated security/concurrency/window checks and renewed release approval. Lost/misdirected pending tokens require explicit revoke/reissue; no automatic resend or silent decision override.
6. Before any real import only, a complete schema removal could be separately reviewed if needed; additive unapplied/off code normally permits simply retaining the unused schema. A destructive SQL rollback is intentionally not the default.

## Exit criteria

Disabled-code release and live registration are DIFFERENT approvals. A disabled-code release may be reviewed with the unapplied schema and unresolved organizer assets because it cannot serve registration or query the new data. Live launch still requires final code/security/migration artifacts, actual hosted authorization, operator/official CSV/contact approvals, privacy controls, READY production deployment and reversible stop evidence. The local checks resolve the targeted SQL ownership concern but do not authorize any release action. PR #28 and email automation are excluded from the minimum viable registration release.
