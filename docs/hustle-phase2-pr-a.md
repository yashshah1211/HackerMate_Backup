# Hustle Carnival Round 2 — PR A

Original base: `1b41e63f46346ff1d8cae693f4f458be22424a19`. Reconciled with `main` `ca87b8ac419083e2a2b6e6b99bf79797e817f3cd` (public workshops PR #26) by a non-rewriting merge on the existing feature branch. Implementation authorized October 18, 2026. Production/staging changes, live activation, outreach and merging remain separately gated.

Current disabled candidate also merges production main `dcd84634c8a8b7a098a94b692f88341384c42216` (security PR #29) without rewriting history. Installed Next/ESLint are 16.3.8, sharp 0.35.5 and source-map-js 1.2.2; dependency manifests match production main. PR #28 is excluded. See [final candidate evidence and organizer blockers](hustle-phase2-disabled-release-candidate.md), [release/rollback sequence](hustle-phase2-release-runbook.md), read-only [preflight](sql/hustle-phase2-production-preflight.sql)/[postflight](sql/hustle-phase2-production-postflight.sql), and the unapplied [enablement proposal](hustle-phase2-enable.PROPOSED.patch).

## Design decisions

- Dedicated shortlist data; no changes to generic registrations, profiles, team sizes, public browsing or the existing hard-off participation guard.
- Teams have a leader and zero or one additional member. CSV headers are explicitly mapped; no guessed member semantics or silently ignored columns. Up to 500 teams / 512 KiB per CSV, with a 500-team event cap for this pilot.
- Verified event organizers read the roster and export. Verified founder/admin imports, activates, issues and revokes invitations. Mutation/token functions use SECURITY INVOKER and service-role-only execution. A boolean SECURITY DEFINER authorization helper reads protected identity fields without granting service_role SELECT on auth.users; it has an empty search path and service-role-only execution. A separate narrow SECURITY DEFINER roster projection rechecks `auth.uid()` and the existing exact-event access predicate on every call; it accepts no actor/event input. Raw tables have RLS and no browser-role grants.
- Imported batches start inactive. Activation is separate and audited. The server feature switch defaults off; production additionally requires a future reviewed source change. Missing configuration or migration fails closed.
- Invitation possession authenticates a leader. 32 random bytes; only SHA-256 hashes persist. The generated invitation carries its secret in a URL fragment, removed from browser history before exchange. A deliberate POST exchanges the bearer into a short-lived HttpOnly/SameSite cookie and redirects to a clean URL. GET never changes team state. One authoritative decision per team, same-choice replay is idempotent during the window; conflicting changes require review and are not supported by this MVP.
- Database wall clock governs opening at 2026-10-23T04:30:00Z (inclusive) and closing at 2026-10-23T17:30:00Z (exclusive), checked after row locks. No fee or payment integration.
- Standalone HTML route handlers avoid the site's analytics, replay and app providers. CSP, no-store, no-referrer, noindex and escaped HTML protect sensitive responses. Explicit application logging omits tokens and PII. Generated links keep bearer secrets out of HTTP paths and access logs. Platform/APM request-body and cookie capture/retention must still be verified before real invites.
- No dispatch implementation: links are created on explicit admin action and shown once. No email-read/delivery metrics are fabricated. PR B owns messaging and its durable dispatch ledger.
- Reuse installed Next, Supabase, Node crypto, PostgreSQL and Playwright; no new package dependency or paid service.

## Pre-migration permission-impact sweep

Before writing the migration, `git grep -n -E 'hustle_phase2|hustle_p2' -- .` on the verified base returned no matches. All five tables are new: `hustle_phase2_batches`, `hustle_phase2_teams`, `hustle_phase2_invites`, `hustle_phase2_audit`, `hustle_phase2_limits`, with no existing queries or joins. No existing table grants/policies are altered.

New server access is exclusively through narrowly scoped RPCs. SQL explicitly projects roster fields (id, external_team_id, team_name, leader_name, leader_email, leader_whatsapp, second_member_name, batch_id, decision, decided_at), batch metadata and safe invite state. Anonymous invitation inspection returns team_name, leader_name, second_member_name, decision and window state only. Token hashes and contact details never enter the leader response.

The targeted production-permission compatibility fix changes only the authorization helper's execution context in this still-unapplied migration. It changes no table grants or policies. Its complete relation/column footprint is `public.profiles(id, role, is_banned)` and `auth.users(id, email)` in `hustle_phase2_authorized`; the existing partner predicates read those fields as definers and remain unchanged. All four caller references are in this migration (`import`, `activate`, `invite`, `revoke`); `src/lib/hustle-phase2/server.ts` calls these RPCs with the verified server actor. The shared `src/lib/admin/requireAdmin.ts` reads only `profiles(role, is_banned)` through the authenticated caller. No new direct application table query or broad auth.users permission is introduced.

## Validation and release gates

Tests use synthetic identities and contacts only. SQL runs in a newly initialized disposable loopback PostgreSQL cluster and cleans up in finally; no existing database URL is accepted. Tests cover grants/RLS, actor authorization, duplicates, foreign event constraints, activation, token expiry/revocation, race serialization, cutoff and rollback. Browser checks exercise actual Next routes with a loopback fixture API and block external traffic.

Before release: review final CSV mapping; confirm official shortlist and organizer assignments; independently approve migration and deployment; review access-log token redaction and retention; run full integration checks against an approved compatible environment; configure the feature and activate only the reviewed official batch. Real invitation distribution is outside this PR.

## Reproducible checks

From this worktree, after `npm ci`:

```powershell
npx tsc --noEmit
npx eslint src/lib/hustle-phase2 src/lib/admin/requireAdmin.ts src/lib/partners/requirePartnerAccess.ts src/app/api/partners/hustle-carnival/phase-2 src/app/partners/hustle-carnival/phase-2 scripts/hustle-phase2-local-db.cjs scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-sql.cjs scripts/test-hustle-phase2-browser.cjs scripts/smoke-test-core-pages.js
node --test scripts/test-hustle-phase2.cjs
node scripts/test-hustle-phase2-sql.cjs
node scripts/test-hustle-phase2-ownership.cjs
node scripts/test-hustle-phase2-browser.cjs
node scripts/test-hustle-phase2-production.cjs
node --test scripts/test-hustle-carnival-workshops.cjs scripts/test-hustle-carnival.cjs scripts/test-partner-authorization.cjs scripts/test-partner-csv.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs
```

The browser runner starts the actual Next server and invokes `node scripts/smoke-test-core-pages.js` with `HM_SMOKE_SYNTHETIC=true`, a dedicated loopback URL and a fake anon key. It does not load `.env.local`. This smoke check verifies query contracts against synthetic responses, not the full production schema or all core-page click paths. New Round 2 browser operations execute the actual migration functions in PostgreSQL through a minimal local Auth/PostgREST adapter. The adapter is a test harness, not a full Supabase deployment.

Local SQL requires PostgreSQL binaries (default Windows path `C:\Program Files\PostgreSQL\18\bin`, or `PARTNER_TEST_PG_BIN`). Browser checks use installed Edge on Windows, installed Playwright Chromium elsewhere, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. No added npm package is needed. The SQL runner first validates loopback address, unique fixture database name and a server fixture marker. Tests substitute the clock only in disposable function copies; production migration functions always use database wall time after acquiring locks. Cluster shutdown and deletion run in `finally`, including failures.

October 18 compatibility-fix verification: TypeScript and scoped lint passed; 20 new unit/security tests, 167 SQL checks, 47 browser/API/SQL checks and 472 existing regression tests (including PR #26) passed. The SQL fixture now denies service_role SELECT on auth.users and execution of existing caller-only partner predicates, grants only the required profile columns, and grants no raw event/assignment reads. It reproduces the old invoker failure (42501) in a rolled-back transaction and exercises import, activate, invite and revoke successfully for both verified admin and exact-founder identities. Negative checks cover every administrator mutation for browser, unrelated, organizer and banned actors. See the security review for the complete compatibility analysis. Screenshots and detailed local evidence are in ignored `test-results/hustle-phase2/`. An initial new test assertion mishandled Windows CRLF output; this harness issue was corrected and the final suite rerun. Earlier resolved fixture issues and cookie/fragment hardening are documented in the security review and Git history.

## Remaining operational limits

- Feature is hard-disabled on all production builds, including Vercel Preview. Environment flags alone cannot enable it. Local fixture opt-in additionally requires a loopback Supabase URL and nonproduction runtime.
- Service-role credentials are required for backend mutations; the roster projection uses the verified caller JWT. No service-role auth.users SELECT or existing partner-predicate EXECUTE is required. The migration must run under a trusted owner able to read protected profiles/auth.users (including RLS), and the existing caller-only partner predicates must remain available to the authenticated roster path. Confirm actual ownership, platform behavior and schema compatibility during separately approved integration verification before release.
- Bearer possession authenticates the leader; forwarding a link delegates that capability. Fragment links appear once to an authorized admin, can be revoked/reissued, and expire at the cutoff. Losing a link requires explicit revoke/reissue; there is no automatic resend.
- A shared 300-per-minute public mutation ceiling and 12-per-token ceiling provide bounded database-backed throttling. Deliberately exhausting the shared ceiling can temporarily delay legitimate users; tune against the approved shortlist size and deployment protection before live operation.
- The official CSV is not yet known. Explicitly map supported columns, with leader + optional second member. Extra columns must be removed in a reviewed normalized copy; the importer does not silently discard or infer them. The pilot caps total imported teams at 500.
- Security PR #29's patched lockfile is now inherited unchanged from production main. Current audit: zero production findings; five high affected-package entries from one unpatched development-only braces chain. Lint only trusted repository inputs and record the residual risk in release review. No additional dependency upgrade was attempted.
- Expected official scope is 50–75 teams / 100–130 participants. Proposed Sno/Name/Phone number/Gmail/College name headers do not establish teams or leaders. Obtain grouping, stable team IDs/names and explicit leader designation before producing the reviewed normalized shortlist. Proposed organizer addresses are not provisioned or treated as authority.

## Changed-file manifest

1. `src/lib/hustle-phase2/core.ts` — CSV normalization/validation, hashing, preview approval and window helpers.
2. `src/lib/hustle-phase2/server.ts` — release gate, authorization, bounded requests, rate limits, import/activation/invitation/response APIs and export.
3. `src/lib/hustle-phase2/pages.ts` — private standalone responsive pages with no analytics/replay.
4. `src/app/api/partners/hustle-carnival/phase-2/[action]/route.ts` — API routing.
5. `src/app/partners/hustle-carnival/phase-2/[[...path]]/route.ts` — standalone page routing.
6. `supabase/migrations/20261018082156_hustle_phase2_shortlist.sql` — unapplied schema, grants/RLS, scoped projection, atomic state transitions and audit.
7. `scripts/hustle-phase2-local-db.cjs` — guarded disposable PostgreSQL lifecycle and synthetic identities.
8. `scripts/test-hustle-phase2.cjs` — unit and HTTP authorization tests.
9. `scripts/test-hustle-phase2-sql.cjs` — real grants/RLS, authorization, state and concurrency tests.
10. `scripts/test-hustle-phase2-browser.cjs` — real Next/browser/SQL flow and screenshots.
11. `scripts/smoke-test-core-pages.js` — opt-in synthetic-only loopback mode; normal behavior retained.
12. `docs/hustle-phase2-pr-a.md` — design decisions, permission sweep, tests, limitations and release gates.

## Resume review

The existing worktree/commit was recovered cleanly. No conflict resolution or history rewrite was needed; the main merge includes only PR #26 files, and the feature diff excludes those inherited files. Cookie-refresh propagation and fragment-only invitations were added after review. The shared auth helpers gained an optional response-cookie callback; existing call sites keep their behavior. The browser suite now exercises real SSR refresh-token rotation and the public portal/workshop routes together using loopback fixtures and local font substitutions. See [security and dependency review](hustle-phase2-security-review.md) for findings, advisory exposure analysis and launch gates.

Additional changed files since the original 12-file manifest:

13. `src/lib/admin/requireAdmin.ts` — optional SSR cookie-update callback for standalone private routes.
14. `src/lib/partners/requirePartnerAccess.ts` — forwards the optional cookie callback while retaining exact-event authorization.
15. `docs/hustle-phase2-security-review.md` — review findings, dependency triage, compatibility and launch gates.

Final disabled-release preparation additionally includes the candidate document, release runbook, read-only preflight/postflight SQL, unapplied enablement patch, exact-migration ownership test, and production build/runtime test. The synthetic core smoke path now drains HTTP handles without forced process exit; a permission-failure regression verifies nonzero exit is preserved. No application runtime source, migration body or production flag changed in this final preparation.
