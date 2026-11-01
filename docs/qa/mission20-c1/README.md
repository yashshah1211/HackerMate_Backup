# Mission 20 C1 — final locking qualification and evidence

**Review only. NO-GO for production/staging migration execution or rollout. Keep #92 and #93 Draft.** Proposed SQL remains under docs, outside the migration loader. All SQL qualification here used newly allocated disposable loopback clusters, fake identities and verified cleanup. No existing/project database, live provider, production data, environment or deployment was touched.

This follow-up starts from PR #93 commit `f7845bc5993a8145782b1d614c62a391c1012081`, stacked on unchanged PR #92 at `4818052a944451c74ae0a7d7c4572f3e7c3d0f8e`. The working tree was clean at recovery. Prior corrections are retained; no reset/stash/clean or force-push.

[LOCKING-QUALIFICATION.md](LOCKING-QUALIFICATION.md) contains the current authoritative graph, complete writer audit, protocol, schedule matrix and proposed C2 split. [DESIGN.md](DESIGN.md) retains registration/approval/capacity/partner/Rack/certificate analysis. [TEST-PLAN.md](TEST-PLAN.md) distinguishes executed cases from release gates. [REVIEW-CORRECTIONS.md](REVIEW-CORRECTIONS.md) retains earlier review history with corrected FK facts.

## Corrections and recommendation

- Founder confirms production **PostgreSQL 17.6**, both registration/team and member/team **CASCADE**, member/profile CASCADE and the conversation/participant CASCADE graph. The fixture now models these facts before either comparator. No production FK change is proposed.
- Load actual repository matchmaking, canonical user deletion and profile audit code; model the supplied conversation trigger definitions/behavior. Audit **94 API query chains / 366 SQL contexts**, including **13 direct application mutation chains**, with exact projections/fields/filters in [LOCK-QUERY-INVENTORY.json](LOCK-QUERY-INVENTORY.json). Original registration inventory remains **66 API chains / 332 SQL contexts / 1,200 reference lines**, unchanged.
- Retain both old `40P01` diagnostics. The member-CASCADE residual cycle is production-relevant, not hypothetical. Neither global SHARE nor a blocking BEFORE member trigger alone is a release recommendation.
- Review prototype 07/08: writer entry points lock complete sorted team parents, then affected event parents before child DML. Legacy child-first membership writes, registration DELETE and late successor-profile locks use **NOWAIT** and roll back with `55P03`. This bounds the tested risk without claiming zero deadlocks or a universal HTTP deadline.
- New member/role/team-delete wrappers are **SECURITY INVOKER**, retaining table ACL/RLS. Existing invite/request/ensure/user-deletion checks are preserved and rechecked; source-comparison tests verify this. Broad lock/transfer helpers have no client EXECUTE. **No base-table grant, RLS or FK change is introduced by these writer prototypes.**
- User deletion now pre-locks non-owned memberships and registration-linked teams/events; existing protected-admin, storage, handover, notification and mandatory audit checks remain. Private bulk transfer uses atomic DELETE+INSERT so existing conversation hooks run; it grants no new user transfer capability.
- Freeze-first ordering remains mandatory. 07/08 refuse installation without the freeze; unfreeze rejects both old comparator variants. Legacy external/official community behavior and confirmed-registration-row capacity remain intact; no record conversion.

## Review-only SQL order

For a future separately approved release: preflight → commit admission freeze → drain/quiesce relevant writers → expansion 01 → per-team 05 → writer corrections **07/08 while frozen** → separately reviewed adapters/version convergence → permission contract 02 → independently gated 06 unfreeze. Rollback 03 freezes writes and fixes forward. Structural SQL markers cannot prove semantic equivalence or adapter convergence; signed operational gates remain mandatory.

Files 04 and 09 are local fixtures, never release migrations. Expansion alone is unsafe/incomplete; old native INSERT endpoints fail closed after contract and must not receive a fallback bypass. No release or application adapter is implemented in C1.

## Verification

| Check | Actual result / scope |
|---|---|
| Artifact/design | **16 passed**: immutable inventories, exact source-preservation comparison, no source/active migration/config changes, helper/ACL intent, writer fixture/guard checks. |
| Explicit application selection | **1,084 passed; 0 failed/skipped**: 16 artifacts + 1,068 existing checks. Includes native/create/lifecycle, compatibility, Rack/partner authorization/admin/organizer/CSV, all 24 organizer harness cases, certificates, team creation/squad/request lifecycle/owner review, invitations and admin authorization/user deletion. |
| PostgreSQL 18.4 | Two fresh clusters. **279 counted baseline/security SQL assertions per variant**, including unchanged privacy assertions, plus **64 orchestration checks** (21 global / 43 per-team and revised writers), with additional in-database writer/security assertions. Old deadlock diagnostics remain explicit; revised schedules assert completion or exact bounded rollback. Both clusters stopped and exact owned roots removed in finally. |
| Scope of SQL races | Confirmed conversation/member graph; real matchmaking; native/community last slot, rollback/idempotency, deadline/roster/owner; raw and wrapped deletion, full team/chat CASCADE, participant UPDATE contention, reciprocal bulk transfer/rollback, stale isolation, invite race, native admission, cancellation, user deletion/non-owned teams/successor admission, audit/storage/admin/EXECUTE negatives and freeze/rollback gates. |
| PostgreSQL 17.6 | **BLOCKED / unexecuted.** Only 18.4 is installed in standard local paths/PATH. `--local-pg17-only` returned missing-binary ENOENT before cluster allocation or SQL. No existing/remote DB, installation, Docker or new Supabase project substituted. PG18 success does not qualify production 17.6. |
| TypeScript | Full `tsc --noEmit --incremental false --pretty false`: passed. |
| Scoped ESLint | Five changed/new CJS files: **0 errors / 0 warnings**. |
| Exact Rack browser | **32 passed**, unchanged heading assertion, 390/1440px, synthetic-only, zero mutations/external requests. No browser assertion changed. |
| Whitespace / source scope | `git diff --check` passed. No edits under src, supabase, .github, package manifests or environment files. No production build rerun for this review-documentation/test-only change. |
| Hosted CI | No current-head Linux/database qualification is claimed. Existing workflows target main; #93 targets #92's feature branch. Post-push available status is reported in the PR body. |

**Expected deadlock diagnostics are not rollout approval.** The old global and blocking per-team variants still reproduce `40P01` with victim rollback. Revised raw-child conflicts assert `55P03`; successor contention additionally asserts original SQLSTATE **55P03**, preventing a concealed 40P01 from satisfying that case. Invoker wrappers do not invent a missing member UPDATE policy or admin-team DELETE entitlement; those remain actual-permission acceptance questions.

Local evidence outside the checkout, parent workspace `audit-artifacts/mission20/`: `c1-locking-postgres-final.log`, `c1-locking-pg17.log`, `c1-locking-offline-final.log`, `c1-locking-artifacts.log`, `c1-locking-typecheck.log`, `c1-locking-lint.json`, `c1-locking-rack-browser.log`. SQL logs print version, counts and cleanup receipts. The runner accepts only a local-major selection, no host/URL/credentials/SQL-path override; children use a whitelist and owned empty password/service files.

Eight ignored screenshots in `scratch/rack-funnel/`: portal, guest, member-next-action and incomplete-next-action at each of 390/1440px. No UI changed; #92's existing 768px evidence remains baseline presentation evidence, not SQL qualification.

### Failure reconciliation

Initial writer-fixture development hit an existing status-column overlap, then a release-gate regprocedure cast evaluated for a missing function. The fixture overlap and null-safe gate lookup were corrected; original expected-error and behavioral assertions were retained. Final SQL qualification passed and cleanup ran on failed as well as successful attempts.

The first expanded application run reported **1,083 pass / 1 fail**: the inspected synthetic admin-authorization HTTP test could not connect to its own loopback server under the filesystem sandbox (EACCES). Rerunning the exact unchanged selection with local socket access passed **1,084/1,084**; clients remained mocked and external fetch forbidden. Chrome and native PostgreSQL also required sandbox escalation; no target restrictions were bypassed.

The prior five organizer harness failures remain fixed by the existing one-line dependency entry; assertions stay unchanged. The historical separate metrics initdb failure is not claimed as fixed. Other standalone partner/privacy/access/isolation/metrics/squad SQL runners and full post-contract projection replay remain outside the executed selection; the unchanged privacy SQL assertions are included in both current clusters.

## Reproduction — explicit local selections only

```text
node scripts/mission20-c1-inventory.cjs --check
node scripts/mission20-c1-locking-inventory.cjs --check
node scripts/mission20-c1-writer-proposals.cjs --check
node --test scripts/test-mission20-c1-design.cjs
node scripts/qualify-mission20-c1-writers.cjs --local-only
node scripts/qualify-mission20-c1-writers.cjs --local-pg17-only
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js scripts/mission20-c1-locking-inventory.cjs scripts/mission20-c1-writer-proposals.cjs scripts/qualify-mission20-c1-postgres.cjs scripts/qualify-mission20-c1-writers.cjs scripts/test-mission20-c1-design.cjs
node qa/rack-qualification.cjs funnel-browser
```

The explicit 1,084-test selection is:

```text
node --test scripts/test-mission20-c1-design.cjs scripts/test-native-registration.cjs scripts/test-hackathon-create-dates.cjs scripts/test-hackathon-lifecycle.cjs scripts/test-event-compatibility.cjs scripts/test-rack-it-up-2026.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-authorization.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs scripts/test-partner-csv.cjs scripts/test-organizer-broadcast-authorization.cjs scripts/test-admin-hackathon-approval.cjs scripts/test-certificate-id-integrity.cjs scripts/test-certificate-verification-page.cjs scripts/test-team-creation.cjs scripts/test-squad-matching.cjs scripts/test-team-request-lifecycle.cjs scripts/test-team-owner-review.cjs scripts/test-invite-handoff.cjs scripts/test-admin-authorization.cjs scripts/test-admin-delete-user.cjs
```

No wildcard selection: some scripts start database fixtures. Never point these review SQL files at an existing database. Native PG17 must already be available for the 17-only command; a missing binary is a qualification blocker, not permission to connect elsewhere.

## Exact file inventory

**18 paths in this follow-up** from f7845bc: **10 modified / 8 new**. **26 paths in the full PR** relative to #92: 25 new review/tooling files plus the existing isolated organizer harness repair. Eight paths are inherited unchanged from f7845bc.

| Repository-relative file | Final-locking follow-up |
|---|---|
| docs/qa/mission20-c1/README.md | Modified: current evidence, inventory and blockers. |
| docs/qa/mission20-c1/DESIGN.md | Modified: confirmed graph, bounded protocol, release order. |
| docs/qa/mission20-c1/TEST-PLAN.md | Modified: extended schedules / version gate. |
| docs/qa/mission20-c1/REVIEW-CORRECTIONS.md | Modified: correct prior hypothetical-FK statements. |
| docs/qa/mission20-c1/LOCKING-QUALIFICATION.md | New: writer/trigger audit, protocol, decisions and C2 split. |
| docs/qa/mission20-c1/LOCK-QUERY-INVENTORY.json | New: exact 94 API chains / 366 SQL contexts. |
| docs/qa/mission20-c1/QUERY-INVENTORY.md | Inherited unchanged. |
| docs/qa/mission20-c1/QUERY-INVENTORY.json | Inherited unchanged. |
| docs/qa/mission20-c1/sql/00-preflight.review.sql | Modified: full relevant FK/trigger/function/policy capture. |
| docs/qa/mission20-c1/sql/00-freeze-admission.proposed.sql | Inherited unchanged. |
| docs/qa/mission20-c1/sql/01-expand.proposed.sql | Modified: require confirmed membership CASCADE. |
| docs/qa/mission20-c1/sql/02-contract.proposed.sql | Inherited unchanged. |
| docs/qa/mission20-c1/sql/03-rollback-freeze.proposed.sql | Inherited unchanged. |
| docs/qa/mission20-c1/sql/04-security-tests.review.sql | Modified: confirmed member FK before comparators; explicit comparator-only unfreeze. |
| docs/qa/mission20-c1/sql/05-per-team-roster.alternative.sql | Inherited blocking comparator / admission base, unchanged. |
| docs/qa/mission20-c1/sql/06-unfreeze-admission.proposed.sql | Modified: require final writer helpers/NOWAIT markers. |
| docs/qa/mission20-c1/sql/07-writer-protocol.proposed.sql | New: parent-first invoker writers, private transfer, legacy NOWAIT backstop. |
| docs/qa/mission20-c1/sql/08-existing-writers.proposed.sql | New: full generated existing-writer definitions with explicit lock corrections. |
| docs/qa/mission20-c1/sql/09-writer-fixture.review.sql | New: local-only confirmed graph and supplied trigger models. |
| scripts/mission20-c1-inventory.cjs | Inherited unchanged. |
| scripts/mission20-c1-locking-inventory.cjs | New: immutable scanner reuse for locking audit. |
| scripts/mission20-c1-writer-proposals.cjs | New: deterministic source-preserving SQL generation/check. |
| scripts/qualify-mission20-c1-postgres.cjs | Modified: local-major selection, safe extension, confirmed FK and stronger gate diagnostics. |
| scripts/qualify-mission20-c1-writers.cjs | New: explicit local writer/participant/user-deletion concurrency runner. |
| scripts/test-mission20-c1-design.cjs | Modified: 16 checks, including exact original-function preservation. |
| scripts/test-organizer-broadcast-authorization.cjs | Inherited one-line repair, unchanged. |

## Precise next-phase recommendation

Review the bounded protocol and proposed C2 writer-adapter split in LOCKING-QUALIFICATION.md. A future `fix/mission20-c2-writer-adapters` branch should preserve UI/DB authorization and exact success confirmation, wire typed RPCs and truthful retry handling, and qualify outer timeout/lost-response behavior before native-adapter rollout design is promoted.

**Still blocked for migration/rollout:** disposable PostgreSQL 17.6 qualification; complete deployed function/ACL/role/dependency comparison; any unresolved UPDATE/admin-team policy entitlement; larger load/bulk/disconnect tests; actual API/JWT/adapter/browser-to-database and production acceptance. Keep admission freeze-first and never restore the unsafe native bypass. C1 does not create or deploy C2, change active permissions, merge either PR or authorize production SQL.
