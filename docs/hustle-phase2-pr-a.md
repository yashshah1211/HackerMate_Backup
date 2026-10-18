# Hustle Carnival Round 2 — PR A

Original base: `1b41e63f46346ff1d8cae693f4f458be22424a19`. Reconciled with `main` `ca87b8ac419083e2a2b6e6b99bf79797e817f3cd` (public workshops PR #26) by a non-rewriting merge on the existing feature branch. Implementation authorized October 18, 2026. Production/staging changes, live activation, outreach and merging remain separately gated.

## Design decisions

- Dedicated shortlist data; no changes to generic registrations, profiles, team sizes, public browsing or the existing hard-off participation guard.
- Teams have a leader and zero or one additional member. CSV headers are explicitly mapped; no guessed member semantics or silently ignored columns. Up to 500 teams / 512 KiB per CSV, with a 500-team event cap for this pilot.
- Verified event organizers read the roster and export. Verified founder/admin imports, activates, issues and revokes invitations. Mutation/token functions use SECURITY INVOKER and service-role-only execution. One intentionally narrow SECURITY DEFINER roster projection rechecks `auth.uid()` and the existing exact-event access predicate on every call; it accepts no actor/event input. Raw tables have RLS and no browser-role grants.
- Imported batches start inactive. Activation is separate and audited. The server feature switch defaults off; production additionally requires a future reviewed source change. Missing configuration or migration fails closed.
- Invitation possession authenticates a leader. 32 random bytes; only SHA-256 hashes persist. The generated invitation carries its secret in a URL fragment, removed from browser history before exchange. A deliberate POST exchanges the bearer into a short-lived HttpOnly/SameSite cookie and redirects to a clean URL. GET never changes team state. One authoritative decision per team, same-choice replay is idempotent during the window; conflicting changes require review and are not supported by this MVP.
- Database wall clock governs opening at 2026-10-23T04:30:00Z (inclusive) and closing at 2026-10-23T17:30:00Z (exclusive), checked after row locks. No fee or payment integration.
- Standalone HTML route handlers avoid the site's analytics, replay and app providers. CSP, no-store, no-referrer, noindex and escaped HTML protect sensitive responses. Explicit application logging omits tokens and PII. Generated links keep bearer secrets out of HTTP paths and access logs. Platform/APM request-body and cookie capture/retention must still be verified before real invites.
- No dispatch implementation: links are created on explicit admin action and shown once. No email-read/delivery metrics are fabricated. PR B owns messaging and its durable dispatch ledger.
- Reuse installed Next, Supabase, Node crypto, PostgreSQL and Playwright; no new package dependency or paid service.

## Pre-migration permission-impact sweep

Before writing the migration, `git grep -n -E 'hustle_phase2|hustle_p2' -- .` on the verified base returned no matches. All five tables are new: `hustle_phase2_batches`, `hustle_phase2_teams`, `hustle_phase2_invites`, `hustle_phase2_audit`, `hustle_phase2_limits`, with no existing queries or joins. No existing table grants/policies are altered.

New server access is exclusively through narrowly scoped RPCs. SQL explicitly projects roster fields (id, external_team_id, team_name, leader_name, leader_email, leader_whatsapp, second_member_name, batch_id, decision, decided_at), batch metadata and safe invite state. Anonymous invitation inspection returns team_name, leader_name, second_member_name, decision and window state only. Token hashes and contact details never enter the leader response.

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
node scripts/test-hustle-phase2-browser.cjs
node --test scripts/test-hustle-carnival-workshops.cjs scripts/test-hustle-carnival.cjs scripts/test-partner-authorization.cjs scripts/test-partner-csv.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs
```

The browser runner starts the actual Next server and invokes `node scripts/smoke-test-core-pages.js` with `HM_SMOKE_SYNTHETIC=true`, a dedicated loopback URL and a fake anon key. It does not load `.env.local`. This smoke check verifies query contracts against synthetic responses, not the full production schema or all core-page click paths. New Round 2 browser operations execute the actual migration functions in PostgreSQL through a minimal local Auth/PostgREST adapter. The adapter is a test harness, not a full Supabase deployment.

Local SQL requires PostgreSQL binaries (default Windows path `C:\Program Files\PostgreSQL\18\bin`, or `PARTNER_TEST_PG_BIN`). Browser checks use installed Edge on Windows, installed Playwright Chromium elsewhere, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. No added npm package is needed. The SQL runner first validates loopback address, unique fixture database name and a server fixture marker. Tests substitute the clock only in disposable function copies; production migration functions always use database wall time after acquiring locks. Cluster shutdown and deletion run in `finally`, including failures.

October 18 verification: TypeScript and scoped lint passed; 20 new unit/security tests, 99 SQL checks, 47 browser/API/SQL checks and 472 existing regression tests (including PR #26) passed. Screenshots and detailed local evidence are in ignored `test-results/hustle-phase2/`. Initial failures were a Windows sandbox `initdb` rename restriction, a test SQL-NULL assertion, a loopback-origin fixture mismatch and the browser form POST/no-referrer interaction. All were resolved and the relevant suites rerun. The exchange now uses same-origin fetch while retaining strict Origin validation and no-referrer. The resume browser harness initially rejected an empty offline font fixture; a valid local @font-face substitution fixed that test setup without changing production font configuration.

## Remaining operational limits

- Feature is hard-disabled on all production builds, including Vercel Preview. Environment flags alone cannot enable it. Local fixture opt-in additionally requires a loopback Supabase URL and nonproduction runtime.
- Service-role credentials are required for backend mutations; the roster projection uses the verified caller JWT. Exact Supabase grants on existing `profiles`/`auth.users`, platform behavior and schema compatibility need separate approved integration verification before release.
- Bearer possession authenticates the leader; forwarding a link delegates that capability. Fragment links appear once to an authorized admin, can be revoked/reissued, and expire at the cutoff. Losing a link requires explicit revoke/reissue; there is no automatic resend.
- A shared 300-per-minute public mutation ceiling and 12-per-token ceiling provide bounded database-backed throttling. Deliberately exhausting the shared ceiling can temporarily delay legitimate users; tune against the approved shortlist size and deployment protection before live operation.
- The official CSV is not yet known. Explicitly map supported columns, with leader + optional second member. Extra columns must be removed in a reviewed normalized copy; the importer does not silently discard or infer them. The pilot caps total imported teams at 500.
- `npm audit` on the unchanged lockfile reports 8 existing dependency advisories (7 high, 1 critical), including Next.js 16.3.5. No dependency versions changed in this PR. Resolve framework/dependency security advisories in a separately scoped change before production release.

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
