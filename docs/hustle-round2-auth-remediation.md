# Hustle Round 2 authorization remediation — proposed, unapplied

Base inspected: deployed `6aaa4caaf33241c71b55f15987ec881e1f58ecfe`, also fetched `origin/main` when this work began. Isolated branch: `fix/hustle-round2-auth-guards`. Production target for a future approved operation only: hackos, `rhryjrbebfrrfhtyyzbs`, PostgreSQL 17.6. No production/staging writes, real accounts, session changes, invitations, imports, messages, deployments or activation occurred in this task.

**Decision: ready for review; NO-GO for real roster import or activation until the separately approved remediation and hosted verification succeed.** Production still has the old definitions. Both release switches and the ordinary `hustlePublicParticipationEnabled(): false` guard are unchanged. This branch is local and uncommitted; no PR, push or Preview was created. Workspace rule 8 requires the operator to stage, commit and push manually.

Proposed migration canonical LF SHA256: `1eb152e2191f48e879f674d6879cf605a8de69cb28b5b06859bb631750cf2e34`. This is a NEW migration and does not replace the original migration's approved checksum. Recompute after review/any edit; neither this hash nor the earlier production authorization permits execution.

October 19 final review: remote `main` was read without fetching/modifying refs and still resolves to the base above; the feature branch is unpublished. **GO for manually publishing a security draft for review; NO-GO for production execution/activation.** The operator explicitly permitted an automatic Preview for this branch on October 19, with release flags unchanged. The twelve task files were reviewed. Standards review found a documentation-only inventory gap (dynamic column names and the nudge modal's update-vs-RETURNING columns), now corrected; no blocking implementation defect. Requirements review found no blocking defect or scope expansion. No security implementation, migration or release-gate change was made on October 19.

## Root causes and demonstrated exploitation

1. Live `is_admin(uuid)` checks `profiles.role = 'admin'` without checking `is_banned`. The `profiles_admin_update` policy and the existing protected-role/ban UPDATE trigger both trust that predicate. An administrator with a still-valid JWT and `is_banned = true` can PATCH their own profile through PostgREST to set `is_banned = false`. This is an authenticated privilege bypass, not an anonymous attack. It also leaves the global policies and badge RPC using this predicate available to banned admins. The old behavior was reproduced against a disposable database and against actual local GoTrue/PostgREST before applying the proposed fix.
2. Live `hustle_phase2_snapshot()` checks caller identity/event access but not the session row. PostgREST accepts an unexpired signed JWT after its Auth session has been revoked. A previously authorized organizer/admin can therefore continue reading private shortlist data through the direct snapshot RPC even while Next.js release flags are OFF. Actual local Auth logout followed by the original signed JWT reproduced this, then the proposed fix rejected that same JWT. No real production JWT or participant row was used.

Metadata was inspected read-only: helper definitions/owners/ACLs, all profile policies, column privileges, PK/FK, Auth creation trigger, profile mutators, `auth.sessions` columns/indexes/owner access, and live callers. A malformed metadata SELECT during investigation returned a syntax error; it was corrected read-only, without changes to the database.

## Minimal implementation and impact

- New migration `20261018174144_hustle_round2_auth_guards.sql` replaces `is_admin(uuid)` with the same signature, owner and EXECUTE ACL, adding `is_banned IS FALSE` and an empty search path. NULL ban state fails closed. No profiles column grants, policies or trigger definitions change. The existing trigger now preserves protected fields for a banned actor, including a profile UPSERT; ordinary non-banned administrator operations remain authorized.
- The global predicate necessarily affects eleven live policies across six tables and two direct function callers. See the complete [query and caller inventory](hustle-round2-profile-query-audit.md): 90 direct profile calls and 20 embedded joins across 431 tracked JS/TS files, plus a dynamic dispatcher. Existing admin ban/unban, badge issuance, reports access, delete protections, founder protections and organizer management have regression coverage. `delete_user_completely` has its own caller/target checks and was not rewritten. This is not a global redesign of every unrelated role check or owner/self-service policy.
- New `hustle_phase2_has_active_session()` is a zero-argument, boolean-only, STABLE SECURITY DEFINER function owned by trusted `postgres`, with an empty search path. It requires the trusted top-level JWT role to be `authenticated`, a UUID `session_id`, and an `auth.sessions` row matching BOTH session ID and `auth.uid()`, with `not_after` absent or strictly in the future. User metadata and caller-supplied actor/session IDs cannot authorize it. EXECUTE is limited to authenticated plus its owner; PUBLIC, anonymous and service-role execution are denied. No Auth-table SELECT permissions are granted to those roles.
- The snapshot definer calls this check before reading the private shortlist. Its existing event/profile authorization and authenticated-only ACL remain. The other nine Phase 2 RPCs remain service-only. There are eleven Phase 2 functions after this migration, not the ten expected by the original historical postflight.
- `src/lib/hustle-phase2/server.ts` adds the same check through the verified user's client before protected Hustle reads or service-role mutations. False/missing/unexpected results deny access; lookup errors return generic 503 and log only the database error code. Global middleware/admin session policy is unchanged. The leader's separate invitation-token flow does not require an Auth session and remains unchanged.

The helper does not return session identifiers or rows. Its PK lookup is indexed and limited to the caller's session. A missing/legacy `session_id` fails closed: an affected organizer needs a fresh legitimate sign-in, never a fallback bypass. This protects new requests; it cannot cancel an already executing request or erase data already downloaded into a browser. Profile bans and Auth session revocation remain distinct controls. This task does not claim every provider-specific Auth ban operation deletes sessions or changes `profiles.is_banned` automatically.

## Test evidence

All inserted accounts/data were synthetic and disposable. The real integration stack was unlinked, loopback-only, with no external OAuth or mail delivery; actual published bindings were checked before Auth tests. Cleanup verified zero owned containers/volumes and removed its project network/temp files. No paid dependency or package/lockfile change.

| Suite actually run | Result |
| --- | --- |
| TypeScript `npm run typecheck` | PASS |
| Scoped ESLint on changed TS/CJS, `--max-warnings 0` | PASS, zero warnings/errors |
| Hustle/admin moderation/admin authorization/partner authorization unit suites | 301 passed, 0 failed |
| Release gates, admin UI/delete/dashboard/attention, partner admin/organizer API regressions | 517 passed, 0 failed |
| New PostgreSQL 17.6 authorization and operator-SQL suite | 57 passed, 0 failed |
| Existing canonical SQL/RLS/deadline/concurrency suite | 167 passed, 0 failed |
| Existing strict nonsuperuser ownership/permission suite | 23 passed, 0 failed |
| Actual GoTrue/PostgREST + Next + browser integration | 72 passed, 0 failed; cleanup verified |
| Legacy browser/API/PostgreSQL regression at 390/1440px, including core-page query smoke | 110 passed, 0 failed |
| Production-mode webpack build and disabled-route HTTP regression | Build PASS; 8 passed, 0 failed; zero Round 2 database requests |

Final completed numeric suites total **1,255 passed, 0 failed**. Typecheck/lint/build are additional non-counted checks. Default Turbopack was attempted and failed on the local junction limitation described below; it is not included as a passing build.

**October 19 follow-up:** TypeScript and scoped ESLint passed again; the combined unit/release/admin/partner suites passed **818/818** again. A fresh disposable source copy of this candidate used real copied dependency files, no junction, no prior `.next` or environment files, and checked all top-level installed versions against the unchanged lockfile. Default **Next.js 16.3.8 Turbopack production build PASSED**, followed by **8/8** HTTP checks with **zero Round 2 database requests**. Offline font responses and synthetic loopback Supabase configuration were used; there was no package installation or network-backed application service. The copy was cleaned up. Evidence: ignored `test-results/20261019-final-review/`. The earlier 57/167/23 SQL suites, 72 real local integration checks and 110 legacy browser checks were **not rerun** today. The repeated 826 checks are not added to the prior 1,255 as distinct coverage. Hosted compatibility and CI results are still separate.

The new SQL suite covers baseline exploits, active/missing/malformed/expired/revoked/wrong-user sessions, banned/NULL-ban admins, self-unban/UPSERT/other-user promotion attempts, existing badge RPC, ordinary admin ban/unban, exact-event organizer/founder/unrelated/anonymous/service roles, no raw session grants, unchanged profile/snapshot/helper ACLs and trigger, and metadata-only operator SQL before/after with a stable unrelated-object fingerprint.

The real integration suite uses GoTrue `v2.197.0`, PostgREST `v16.4`, and local Supabase PostgreSQL `17.11.0.004`; the separate strict-grant SQL suite uses PostgreSQL 17.6 with a NOSUPERUSER/BYPASSRLS owner. Foundation tables/functions are explicitly synthetic substitutes for the necessary production contracts, not a production schema dump. Real Auth sessions, logout, cookie-backed admin moderation, bearer-backed Hustle routes and mobile/desktop browser denial were exercised. The legacy adapter suite is compatibility evidence only, not proof of session revocation behavior.

Evidence is in ignored `test-results/auth-*.txt`, `test-results/hustle-auth-real-integration.json`, `test-results/hustle-phase2/` and `test-results/hustle-phase2-production/`. Core query smoke loaded three synthetic profiles and verified dashboard, developers, connections, team roster/certificate/PPT queries; browser checks also retained the public Hustle portal and workshops. No real user profile was inspected for testing.

Resolved test-environment failures are not hidden: the initial sandbox loopback restriction required the authorized local test runner; local CLI configuration/registry-helper issues were fixed only inside the disposable project; an initial moderation probe used bearer-only transport where existing middleware requires SSR cookies and was corrected. The final real integration run passed 72/72. The first default Turbopack attempt refused the worktree's out-of-root dependency junction; the October 19 clean-copy default build resolved this local blocker without configuration/dependency changes. This was a clean source/dependency copy, not a fresh network `npm ci` or hosted CI run. Hosted CI remains to be observed after manual publication.

## Unresolved hosted gates and recovery decision

- Local success does not prove the managed project's exact Auth/PostgREST version, schema cache behavior or platform customizations. After a separately approved installation, verify the helper is visible as authenticated-only, raw Auth tables remain inaccessible and installed definitions/ACLs exactly match the candidate. If a schema-cache refresh would require a write/NOTIFY, stop and obtain approval rather than doing it under read-only validation.
- Current operator JWTs must have trusted top-level `session_id` claims. Do not copy JWTs, refresh tokens, cookies or private session rows into chat, logs or artifacts. Read-only checks with an already held operator session can verify active access without importing a roster; no synthetic production accounts/rows are needed. Revoking/signing out or banning an actual operator for a negative test changes session/account state and requires separate authorization. Local negative tests are complete; hosted negative validation remains separately gated.
- Profile ban state must remain authoritative and `false` for legitimate active operators. The global predicate deliberately removes admin authority when the ban is NULL/true; do not “repair” accounts or grants as part of migration. Preserve independently verified founder identity and event-scoped organizer assignments.
- No verified full production backup/restore has been established by this task. The previously accepted no-backup exception applied to the original additive migration ONLY. This security migration changes global authorization behavior and needs a NEW explicit recovery decision and migration approval. A saved definition/ACL snapshot supports a schema forward-fix, not recovery from data loss/exposure. Returning to the vulnerable definition is not a safe routine rollback.

## Exact separately authorized production sequence

Operator checklist for October 19 release preparation (no production SQL was run during this final review):

- [ ] **Target and disabled state:** supervising founder independently selects hackos / `rhryjrbebfrrfhtyyzbs`, verifies trusted `postgres` executor and the actual current deployment SHA; both Round 2 release flags remain OFF and disabled API returns 503. A database named `postgres` does not prove project identity.
- [ ] **Freeze candidate:** code SHA after manual commit; migration version `20261018174144`, LF SHA256 `1eb152e2191f48e879f674d6879cf605a8de69cb28b5b06859bb631750cf2e34`; original migration remains unchanged. Recompute hashes after checkout/line-ending normalization. No PR #32 changes.
- [ ] **Fresh authorized read-only preflight:** verify owner/session-column privileges, old definitions/ACLs, all affected policies and unchanged-object fingerprint using the readiness SQL. As last verified: ledger 139; original migration once; remediation absent; five Phase 2 tables; ten functions. If legitimate intervening migrations changed this baseline, STOP and review a new baseline/envelope; do not force the count or apply backlog.
- [ ] **Recovery decision:** obtain a new explicit approval for this global authorization migration, backed by verified recovery evidence OR an explicitly accepted, accurately limited new no-backup exception. The earlier exception does not carry forward. Definitions/ACL snapshots alone cannot restore data or undo disclosure.
- [ ] **Execution envelope review:** still outstanding. One BEGIN/COMMIT transaction, unchanged reviewed migration DDL, trusted-target/executor/version/baseline guards, exactly one correctly typed ledger row before COMMIT. Review/freeze the envelope checksum and approve one attempt in a bounded window. Do not execute the raw migration and add history later.
- [ ] **Postflight:** after separately authorized confirmed commit, expect ledger 140 (if the approved baseline stayed 139), five unchanged tables, eleven exact function signatures, correct definer owners/paths, two authenticated read RPCs/nine service-only RPCs, no raw session/shortlist exposure and unchanged unrelated-metadata fingerprint. Stop on any mismatch or uncertain commit.
- [ ] **Disabled code deployment and hosted checks:** require separate merge/deployment approval. Verify real hosted schema-cache/API visibility, active operator access and existing admin/core-page behavior. Hosted revoked-session/ban tests require separate authorization for any actual session/account mutation; local synthetic success is not that evidence.
- [ ] **Operational authorization remains separate:** approved organizer UUID/event assignments and official team grouping/leader mapping are prerequisites. Roster is now expected late October 22; do not import an unofficial/interim file. Registration is October 23, 10:00 inclusive–23:00 exclusive IST (`04:30Z`–`17:30Z`). Roster import, invitation issuance, communications and flag activation each remain outside this task.

Emergency STOP: wrong target/owner/hash/ledger, unexpected DDL or grants, SQL error, timeout/disconnect/uncertain commit, postflight mismatch or broken legitimate admin operation. No automatic retry, permission repair, disabling the session check, ledger deletion or destructive/vulnerable rollback. Preserve database guards and keep the feature OFF while reviewing a forward fix.

1. Review this diff and query inventory; operator manually stages/commits/pushes the explicit task files and opens a draft PR. Rebase is unnecessary; preserve published history if main advances. Complete clean-checkout default build/PR checks. Approve a final immutable code SHA and canonical LF SHA256 for the new migration. Exclude Cloud's UI work and PR #28.
2. Keep `HUSTLE_PHASE2_ENABLED` and `HUSTLE_PHASE2_RELEASE_APPROVED` OFF. Independently verify hackos/ref `rhryjrbebfrrfhtyyzbs`, deployed code SHA, disabled 503, current owner/grants and migration ledger. Run [the new read-only readiness SQL](sql/hustle-round2-auth-readiness.sql); compare installed original migration source to `4fc87a833b6e3c4687cba372a05717383cb8f35fdd60f03a7f90e166038f45e7`. Before installation expect 139 entries, original version once, new version absent, five tables, ten RPCs, new helper absent. Review the emitted `is_admin`, guard and snapshot definitions, ACLs and unchanged-object fingerprint. Database name `postgres` alone is NOT project identity.
3. Obtain explicit approval naming the new migration/version/hash, trusted `postgres` operator, target, bounded execution window, recovery decision and single-attempt STOP conditions. No previous authorization or recovery exception authorizes this migration. Do not use the connector previously stopped by the operator.
4. Prepare and review ONE execution envelope from the frozen migration, preserving its DDL exactly: use its existing outer BEGIN/COMMIT; insert project/executor/version-absence/expected-baseline guards and the sole ledger INSERT **inside** that transaction, before COMMIT. Store `version='20261018174144'`, `name='hustle_round2_auth_guards'`, and `statements=ARRAY[<the complete canonical LF migration source>]::text[]`. The original 139 entries are untouched. Use a non-conflicting reviewed dollar-quote delimiter for source storage. Explicitly verify the actual ledger columns/defaults first; never insert the new row after a separately committed schema change. Freeze/review the complete envelope checksum before requesting execution approval. No executable production envelope is supplied or authorized by this task.
5. Under separate approval only, the supervising operator submits that unchanged envelope ONCE through the official SQL Editor with the trusted `postgres` role. No historical backlog push, migration-repair command, extra grants, remote setup or retry. Its transaction rolls back DDL and ledger together on SQL failure; new function creation and ledger PK prevent duplicate-version success. A disconnect/timeout/uncertain result is NOT proof of rollback: stop, inspect read-only, and never resubmit automatically.
6. Run the same read-only readiness SQL after confirmed commit. Expect 140 entries, one exact new version with reviewed source hash, five original tables with RLS/owners unchanged, eleven expected function signatures, two authenticated read RPCs and nine service-only RPCs, no PUBLIC/anon execute, no new raw session or shortlist grants. Compare the unchanged-object fingerprint and manually review the two intended changed definitions/new helper. Original `is_admin`/snapshot EXECUTE ACLs must be byte-for-byte preserved. A mismatch means STOP, leave release flags OFF, investigate without automatic repair or destructive rollback.
7. After database postflight and separate code-release approval, merge/deploy the reviewed server change with both release switches OFF. Verify disabled API 503 and no Round 2 database calls; load existing portal/workshops/core pages using approved read-only sessions. Then perform the separately authorized hosted active/revoked/banned checks above. No account/session mutation or feature enabling is implied by deployment approval.
8. Only after all gates succeed may the operator separately approve real organizer provisioning, official roster handling/import and eventual activation. October 23 registration remains 10:00 inclusive to 23:00 exclusive IST. Cloud's invitation/UI work is independent and was not modified here.

## STOP and recovery

STOP on target/owner/hash/ledger/definition/grant mismatch, failed fingerprint comparison, unexpected exposed function, absent required session column/claim, broken legitimate administrator flow, migration error or uncertain commit. Do not add Auth-table grants or bypass the session check to recover availability.

Before commit: transaction failure must leave old schema and ledger; independently verify before any further authorization. After commit: leave/turn both release switches OFF under appropriate operational authorization; this does not remove direct-RPC exposure, so preserve the installed database security guards. A code-only rollback may restore the previous OFF deployment while investigation continues. Prefer a reviewed forward migration to repair a demonstrated regression. Reverting `is_admin`/snapshot to their vulnerable bodies, dropping the helper, deleting ledger entries or assuming schema reversal restores lost/exposed data is unsafe and not authorized. Global admin-policy impact can persist while Hustle flags are OFF, which is why legitimate workflows and the metadata fingerprint are release gates.

Background guidance: [Supabase session revocation and session_id checks](https://supabase.com/docs/guides/auth/sessions#how-to-ensure-an-access-token-jwt-cannot-be-used-after-a-user-signs-out), [Data API security boundaries](https://supabase.com/docs/guides/api/securing-your-api).

## Manual draft-PR handoff and final staging audit

All twelve modified/untracked files below belong to this approved plan. There were no unrelated changes in this worktree, and nothing is staged. Ignored test evidence and the dependency junction must not be committed. Run `git status --short` again before staging, and STOP if anything else appears.

Suggested PR title: `Deny banned admin authority and revoked Hustle sessions`.

Suggested description: `A role-only database admin predicate lets a banned administrator self-unban, and an unexpired revoked JWT can read the Hustle shortlist directly. Make the existing predicate ban-aware and require a caller-bound Auth session in the private snapshot and Hustle server authorization. Includes an unapplied migration, full profile-query impact audit, disposable real Auth/PostgREST/browser tests, and a separately authorized release/rollback procedure. Production, release switches and participant data remain unchanged. Prior completed suites: 1,255 passed. October 19: TypeScript/lint, 818 repeated regressions, default Turbopack clean-copy production build and eight disabled HTTP checks passed. Hosted CI and post-install validation remain required. Draft only; no merge, migration or activation approval.`

Operator-only commands from this isolated worktree, after reviewing the diff:

```powershell
Set-Location 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hustle-round2-auth-remediation'
if ((git branch --show-current) -ne 'fix/hustle-round2-auth-guards') { throw 'Wrong branch' }
git status --short
git diff --check
git diff -- src/lib/hustle-phase2/server.ts scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-release.cjs scripts/test-hustle-phase2-browser.cjs
git add src/lib/hustle-phase2/server.ts scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-release.cjs scripts/test-hustle-phase2-browser.cjs scripts/test-hustle-round2-auth-sql.cjs scripts/test-hustle-round2-auth-integration.cjs scripts/fixtures/hustle-auth-foundation.sql scripts/fixtures/hustle-loopback-docker.cs supabase/migrations/20261018174144_hustle_round2_auth_guards.sql docs/hustle-round2-profile-query-audit.md docs/hustle-round2-auth-remediation.md docs/sql/hustle-round2-auth-readiness.sql
git diff --cached --stat
git diff --cached --check
git diff --cached
git commit -m "Deny banned admin authority and revoked Hustle sessions"
git rev-parse HEAD
```

Run commands one at a time; STOP on any failed check or unexpected staged file. Review the full cached diff, including all new files, before the commit.

Manual publishing command, with automatic Preview explicitly permitted by the operator on October 19:

```powershell
git push --set-upstream origin fix/hustle-round2-auth-guards
```

Pushing this Vercel-linked repository may create an automatic Preview deployment; that side effect is now expressly authorized for this branch only. This does not authorize a production deployment, merge, flag/environment change or migration. No Vercel setting, ignored-build configuration or CI-skip marker was changed. Do not claim Preview READY until its exact committed SHA and actual status are verified.

After an authorized manual push, open [the compare page](https://github.com/yashshah1211/HackerMate_Backup/compare/main...fix/hustle-round2-auth-guards?expand=1), verify base `main` and head `fix/hustle-round2-auth-guards`, use the title/description above (also in ignored `test-results/20261019-final-review/draft-pr-body.md`), and choose **Create draft pull request**. Keep it Draft; inspect actual CI/Preview results separately. GitHub CLI is not available on this session's PATH; no installation is needed for the browser workflow.

No git command above was executed by the agent except read-only status/diff checks. No production deployment, schema execution or activation is part of this handoff.

Reproduction commands (local synthetic only):

```powershell
npm run typecheck
npx eslint src/lib/hustle-phase2/server.ts scripts/test-hustle-phase2.cjs scripts/test-hustle-phase2-release.cjs scripts/test-hustle-phase2-browser.cjs scripts/test-hustle-round2-auth-sql.cjs scripts/test-hustle-round2-auth-integration.cjs --max-warnings 0
node --test scripts/test-hustle-phase2.cjs scripts/test-admin-moderation.cjs scripts/test-admin-authorization.cjs scripts/test-partner-authorization.cjs
node --test scripts/test-hustle-phase2-release.cjs scripts/test-admin-moderation-ui.cjs scripts/test-admin-delete-user.cjs scripts/test-admin-dashboard-data.cjs scripts/test-admin-attention.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs
node scripts/test-hustle-round2-auth-sql.cjs
node scripts/test-hustle-phase2-sql.cjs
node scripts/test-hustle-phase2-ownership.cjs
node scripts/test-hustle-phase2-browser.cjs
node scripts/test-hustle-round2-auth-integration.cjs
```

The SQL scripts require `PARTNER_TEST_PG_BIN` pointing at existing PostgreSQL 17.6 binaries. Browser tests used `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` pointing at installed Edge. The real integration script requires absolute existing Windows `HM_SUPABASE_CLI`, `HM_DOCKER_BIN` and `HM_CSC` paths; it refuses missing prerequisites rather than installing anything. See the script for its bounded local environment and cleanup. For production build reproduction use a clean checkout/dependency tree and `node scripts/test-hustle-phase2-production.cjs`; this worktree's shared junction required `next build --webpack` with the existing synthetic offline-font fixture, followed by that script's `--reuse-build` mode. No `.env` or `.env.local` was present.
