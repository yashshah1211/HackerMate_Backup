# Hustle Round 2 — final disabled release candidate

> Historical PR #27 evidence. The subsequent [activation-preparation patch](hustle-phase2-activation-preparation.md) supersedes the source-gate statements and `git apply` proposal below. The former proposal is retired; this document is not evidence that the new gate has been released or that Desktop’s integration rehearsal passed.

Prepared 18 October 2026 for review only. No production/staging database write, migration, provisioning, registration activation, production deployment or real communication was performed. Feature-branch push and its automatic Vercel Preview were explicitly authorized; Preview evidence is recorded against the final head in PR #27.

## Candidate composition and safeguards

- Production main dcd84634c8a8b7a098a94b692f88341384c42216 (merged security PR #29) is an ancestor of this feature head, through a normal non-rewriting merge.
- Existing PR A implementation/fix commit 4d4fd96ec767f100ba3acea89306d4cb409fd4aa is preserved. No force-push, reset or merge into main.
- Installed versions verified after clean npm ci: Next/ESLint 16.3.8, sharp 0.35.5, librsvg 2.63.2, source-map-js 1.2.2. Package manifests and lockfile are identical to production main.
- PR #28 is EXCLUDED. No communications source, synthetic development page, dispatch adapter or design ledger is part of this candidate. Its optional HTTP-status issue does not block this core release.
- The migration body, all application route/library source, PRODUCTION_RELEASE_APPROVED=false and hustlePublicParticipationEnabled(): false are unchanged by this final preparation.
- Source enablement proposal is documentation only: hustle-phase2-enable.PROPOSED.patch. Only git apply --check was run. It was never applied.

## Final validation evidence

Run from this worktree on the patched dependency tree, using synthetic data and newly initialized disposable loopback PostgreSQL only:

| Check | Result | Local ignored evidence |
| --- | --- | --- |
| Clean npm ci | PASS | test-results/disabled-rc-install.txt |
| TypeScript | PASS | test-results/disabled-rc-typecheck.txt |
| Scoped ESLint, including new test runners | PASS | test-results/disabled-rc-lint.txt |
| Unit/security/regression | 575 passed, 0 failed/cancelled | test-results/disabled-rc-unit.txt |
| Core PostgreSQL authorization/RLS/replay/deadline/concurrency | 167 passed | test-results/disabled-rc-sql.txt |
| Exact migration as nonsuperuser owner + operator SQL | 23 passed | test-results/disabled-rc-ownership.txt |
| Actual Next/browser/API/PostgreSQL, 390/1440px | 47 passed | test-results/disabled-rc-browser.txt |
| Synthetic core-page query smoke | PASS | test-results/hustle-phase2/smoke.txt |
| Default Next 16.3.8 production build (Turbopack) | PASS | test-results/hustle-phase2-production/production-build.txt |
| Actual local production HTTP contracts | 8 passed, 0 failed; zero Round 2 database requests | test-results/hustle-phase2-production/production-runtime-evidence.json |
| npm audit --omit=dev | 0 known findings | test-results/disabled-rc-audit-production.json |
| Full npm audit | 5 high affected-package entries, 0 critical | test-results/disabled-rc-audit-full.json |

575 includes the 554 existing regressions from PR #29 plus 21 Round 2 tests (one added offline permission-failure smoke regression). Scoped lint is not a claim that all legacy lint debt is fixed. No new home-page hydration/browser-audit claim is made; PR #29 documents an existing unrelated home-page issue. The earlier ten-team launch rehearsal is historical supporting evidence, not counted as a new final-candidate run.

The first browser attempt reproduced the native Windows Node UV_HANDLE_CLOSING abort during forced process.exit after every synthetic smoke check printed PASS. Only the synthetic path now sets exitCode and lets HTTP handles drain; normal configured smoke behavior is preserved. The final full browser run passed. An initial new negative-smoke unit fixture used child-process loopback I/O and timed out; the final test injects SDK permission errors offline and asserts exitCode=1, so it cannot mask database failures or depend on sandbox networking. The underlying Node runtime bug is not claimed fixed.

The first offline default build exposed that Turbopack serializes mocked-font exports: the browser runner's dynamic Proxy produced an empty URL map. The production runner now generates concrete entries using the installed Next font URL/axis helpers; the same default builder passed without changing production fonts/configuration. Initial failure logs are retained. No application compatibility defect was found or fixed in this preparation.

Default production tests deliberately set HUSTLE_PHASE2_ENABLED=true, HUSTLE_PHASE2_LOCAL_FIXTURE=true and VERCEL_ENV=production with NODE_ENV=production. Standalone Round 2 HTML still shows unavailable; organizer/export/import APIs return 503; private headers and absence of replay/tracking scripts are asserted. The fake database receives zero Round 2 requests. The public portal and workshops retain expected content and HTTP 200. Unit tests independently verify ordinary Hustle participation remains false.

## Migration and ownership review

The sole unapplied schema file remains:

    supabase/migrations/20261018082156_hustle_phase2_shortlist.sql
    canonical Git blob SHA256: 4fc87a833b6e3c4687cba372a05717383cb8f35fdd60f03a7f90e166038f45e7

It changes no existing profiles/auth.users/event table grant. All five new tables have RLS, no browser raw policies/grants, fixed event constraints and narrow service-role privileges. All mutations remain invokers. Two functions intentionally run as definers: the boolean authorization helper (owner/service-only EXECUTE) and caller-JWT roster projection (owner/authenticated-only EXECUTE), both with empty search paths and qualified relations.

Fresh READ ONLY production catalog inspection confirms postgres is NOSUPERUSER/BYPASSRLS with public CREATE and protected auth SELECT/REFERENCES; auth.users belongs to supabase_auth_admin. Existing partner predicates are postgres-owned definers and deny service-role EXECUTE. Browser public CREATE is denied. service_role cannot read auth.users. All five phase2 tables, ten functions and version 20261018082156 remain absent. No user/contact/participant records were inspected.

The new ownership suite reapplies the exact migration under a nonsuperuser postgres role with only required protected identity privileges; all admin mutation paths and the authenticated organizer projection succeed. It also syntax-checks both read-only operator query files. It is not a full production clone or real Auth/PostgREST deployment. Local PostgreSQL is 18 versus production 17.6; PR #29 separately reports PR A checks on PostgreSQL 17.11 (attributed evidence, not a new local run).

Future installation must explicitly use the trusted postgres owner and verify resulting owners/ACLs rather than assuming the dashboard/runner's login role. No broad auth.users grant is an acceptable workaround. PostgREST schema exposure/cache, real runtime keys/OAuth/session flows, backup/restore availability and named operator eligibility still require approved integration/release checks.

## Official shortlist contract — unresolved blocker

Expected scope: 50–75 teams, 100–130 participants. A 1–2 member model can cover these ranges only when the actual roster satisfies N <= participants <= 2N; e.g. 130 participants requires at least 65 teams. Do not infer pairing or team size from the estimates.

Proposed source columns:

    Sno, Name, Phone number, Gmail, College name

These do not establish team grouping, team IDs/names, or which person is the leader. The sheet is NOT currently approved/importable as the team shortlist. Never treat each participant row as a solo team, pair consecutive rows, group by college or use a shared email as proof of membership.

Organizer clarification required before normalization:

1. Which participant rows belong to each team, with an explicit stable team identifier and approved team name?
2. Which single member is the authoritative leader, with that leader's verified contact email and optional international-format phone?
3. Is the team solo or a pair, and what is the optional second member's full name? Resolve duplicate leader contacts/team identifiers.
4. Does Sno identify a person or a stable team? Do not map it to team_id unless the organizer confirms the latter.
5. What country code belongs to each phone? Do not infer +91 or import an ambiguous local number.

Produce one reviewed normalized row per team:

    team_id,team_name,leader_name,leader_email,leader_whatsapp,optional_second_member_name

Gmail is merely a proposed header label: valid leader email need not be a gmail.com address. Map Name/Gmail/Phone only AFTER leader selection. College name has no eligibility/authorization meaning and no supported importer target. Keep it in the organizer's approved private source if needed; remove it explicitly in the reviewed normalized copy rather than silently discard unknown columns. Preserve the raw source privately, never in Git or support logs.

No importer semantics, 500-team implementation cap, team-size enforcement or production data were changed to accommodate this unconfirmed sheet.

## Proposed organizer accounts — no provisioning

- ellusion@glbajajgroup.org
- 4454ashutosh@gmail.com

These are proposals only. No named-account lookup, creation, verification or provisioning occurred. An approved operator must privately establish each existing account UUID, authenticated identity and eligible non-banned protected profile before exact-event assignment.

Use the existing admin provisioning API for approved read-only organizer assignments. Ordinary organizers can read/export shortlist statistics; import, activation, issuance and revocation remain verified founder/admin actions. Do not promote these accounts to platform admin or authorize by email/domain. Name the actual admin issuer separately.

## Minimal release path and outstanding approvals

PR #27 plus the already merged security baseline is the minimum viable release. PR #28, Resend automation, a communications ledger and WhatsApp API are not required. After separate communication approval, an admin may generate one private link at a time and hand it to the matching recorded leader through an approved existing individual organizer channel, without URL rewriting/tracking or a wa.me bearer query. No messages are sent by this PR.

For 50–75 teams, permit setup/reissues and human delivery time beyond the 30 admin-mutations/minute ceiling; 75 links alone occupy three fixed minute buckets. Shared public budget is 300 operations/minute, with 12 per token; exchange and response both consume it. Do not infer usable Resend capacity from the nominal 100/day advisory guard.

Disabled-release approval can be reviewed now with these safeguards intact. It does NOT approve applying the migration or live registration. Before any live step, obtain:

1. Exact final PR #27 SHA approval, explicit permission to merge/deploy DISABLED code, and residual development-tool braces-risk acknowledgement if not already covered by PR #29 approval.
2. Named compatible integration target and any separately scoped hosted testing/setup authorization; the existing staging project is not assumed production-equivalent.
3. Exact migration/checksum, postgres executor, recoverable backup identifier and reviewed versioned apply/ledger-recording procedure. Raw psql alone does not record migration history; no custom history write or backlog push is authorized here.
4. Exact operator account UUIDs/admin issuer, read-only assignments, access/PII retention and private contact/consent approval.
5. Official grouping/leader clarification, normalized CSV mapping/count/digest, import and separate activation approval.
6. Privacy/APM/cookie/body redaction evidence and an approved controlled integration/release smoke sample; do not insert synthetic teams into the official production shortlist.
7. Separate approval of the documentation-only production enablement patch, Production-only environment configuration, final live deployment, rollback authority and actual individual communications.

Detailed ordering and incident stop/recovery are in hustle-phase2-release-runbook.md. Preflight and postflight scripts are READ ONLY. The apply mechanism/backup identifiers, real Auth/API integration and organizer assets remain genuine live-launch gates; this report does not silently fill them in.

## Reproduction and evidence limits

    npm ci --no-fund --no-audit
    npx tsc --noEmit
    node --test scripts/test-hustle-phase2.cjs scripts/test-hustle-carnival.cjs scripts/test-hustle-carnival-workshops.cjs scripts/test-partner-authorization.cjs scripts/test-partner-csv.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs scripts/test-email-reliability.cjs
    node scripts/test-hustle-phase2-sql.cjs
    node scripts/test-hustle-phase2-ownership.cjs
    node scripts/test-hustle-phase2-browser.cjs
    node scripts/test-hustle-phase2-production.cjs
    git apply --check docs/hustle-phase2-enable.PROPOSED.patch

Run browser development and production build sequentially; they share .next. The production runner builds by default and --reuse-build repeats runtime probes only. It refuses real .env/.env.local files and removes inherited service secrets before supplying synthetic loopback settings. PostgreSQL runners initialize their own marked temporary cluster and clean up in finally. The fake Auth/PostgREST adapter and synthetic core-page query smoke are not full production core-page click-through coverage.

Scoped lint command is documented in hustle-phase2-pr-a.md; include test-hustle-phase2-ownership.cjs and test-hustle-phase2-production.cjs. Audit logs contain findings, not a guarantee of application security. Final head SHA, draft PR/mergeability and automatic Preview status must be read back after push and reported separately; no production deployment is authorized by that Preview.
