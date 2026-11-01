# Mission 20 C1 — corrected review package and evidence

**NO-GO for production/staging migration execution or rollout. Keep PRs #92 and #93 Draft.** SQL is review-only, outside the active migration loader. Qualification here executes only in newly allocated disposable local PostgreSQL clusters. No existing database/project, live provider, environment, deployment or production data was modified.

Reviewed C1 baseline: `09641f28c2efe4fdc55fd2de448b1503d070f8e0`. This follow-up stays on `design/mission20-c1-database-security`, stacked on unchanged PR #92 at `4818052a944451c74ae0a7d7c4572f3e7c3d0f8e`. Recovery found **13 preserved uncommitted paths**, rather than the preliminary 11; local and remote heads were still the reviewed C1 commit. No reset, stash or cleanup of that work occurred.

Read [REVIEW-CORRECTIONS.md](REVIEW-CORRECTIONS.md) for findings and recommendations; [DESIGN.md](DESIGN.md) for reader/writer, approval, native/community and partner/Rack/certificate/team analysis; [TEST-PLAN.md](TEST-PLAN.md) for the full release matrix. [QUERY-INVENTORY.md](QUERY-INVENTORY.md) and [JSON](QUERY-INVENTORY.json) retain the immutable-base inventory: **66 API chains, 332 SQL fragments, 1,200 reference lines**. No application, active migration, dependency, environment or workflow change is included.

## Corrections and lock decision

- Model the confirmed, named registration/team FK as **ON DELETE CASCADE**. Team deletion deletes linked registrations and releases confirmed row capacity; preservation is not promised. No FK change is proposed. SET NULL changes eligibility/history/access and requires separate review.
- Reject the global roster SHARE lock for release: the real matchmaking trigger reproduces a **40P01** cycle, and unrelated-team writes block.
- Recommend per-team locking for further review: parent FOR UPDATE before event, distinct roster UNION owner, a BEFORE membership parent-lock trigger, and an existing-registration retry path. Tested unrelated-team writes finish while admission stays open. The suite also reproduces a residual child-row/cascading-parent cycle; this is not universal deadlock freedom or release approval.
- Retain `max_participants` as **confirmed registration-row slots**, not humans, distinct teams or all rows. NULL is unlimited, zero waitlists new admissions. No data conversion. Legacy `official` stays community-only pending source-verified review.
- Freeze new admission before expansion and retain the freeze through per-team installation, adapter convergence and contract. New definer RPC writes also honor the freeze. Unfreeze requires independent release receipts; rollback freezes writes rather than restoring the bypass.
- Repair the organizer harness with one dependency-map entry loading the real lifecycle module. Every original assertion expression remains identical.

## Review-only SQL and release order

| File | Purpose |
|---|---|
| [00 preflight](sql/00-preflight.review.sql) | SELECT-only catalog/ACL/FK capture; local fixture qualified, no project query. |
| [00 freeze](sql/00-freeze-admission.proposed.sql) | Commit first in a separately authorized release: remove table/column INSERT and restrict new admission; retain reads/preferences/cancellation. |
| [01 expansion](sql/01-expand.proposed.sql) | Private worker and status/clock/capacity/approval guards. Contains rejected global comparator until 05 replaces it while frozen. |
| [05 per-team](sql/05-per-team-roster.alternative.sql) | Recommended review prototype; no FK or membership authorization expansion. |
| Adapter (future C2) | Use RPC without INSERT fallback; handle review/freeze/retry errors; drain old servers and qualify cached clients. Not implemented here. |
| [02 contract](sql/02-contract.proposed.sql) | Clear table/column INSERT, restore guarded community columns, restrictive native denial. Retains release freeze. |
| [06 unfreeze](sql/06-unfreeze-admission.proposed.sql) | Structural per-team/contract gate; operator/version-convergence receipts independently mandatory. Global comparator is refused. |
| [03 rollback](sql/03-rollback-freeze.proposed.sql) | Revoke both RPC entry permissions and direct inserts; preserve records/approval protection; fix forward. |
| [04 fixture](sql/04-security-tests.review.sql) | Execute only via isolated local runner; unchanged privacy assertions, corrected CASCADE FK and security/release cases. |

Nothing is promoted to `supabase/migrations/`. Admission intentionally pauses during release. Expansion alone is not completed remediation. Quiesce privileged jobs; a client freeze cannot constrain the database owner.

## Verification — corrected working tree

| Check | Result / scope |
|---|---|
| Inventory | Reproducible: 66 API chains / 332 SQL fragments / 1,200 reference lines. |
| C1 artifacts | **12 passed**; intent/scope checks, not SQL execution. |
| Offline selection | **876 passed, 0 failed/skipped**: 12 artifacts + 864 existing checks, including all 24 organizer cases. Native/create/lifecycle, compatibility, Rack, partner authorization/admin/organizer/CSV, approval, certificates, teams and squad. |
| Local PostgreSQL | **18.4**, two fresh clusters, **279 SQL assertions per variant**, including unchanged baseline privacy. **41 orchestration checks** (20 global, 21 per-team): real matchmaking hooks; native/community last slot; rollback/idempotency; roster additions/departures; distinct owner count/transfer; cancellation/retry; deadline edits/cutoff; 55P03 rollback; CASCADE/cache cleanup; unrelated-team contention; documented deadlocks; release/rollback gates. |
| Deadlock diagnostics | Expected 40P01 with victim rollback is a passing diagnostic, **not** release approval. Global is rejected. Per-team residual writer/cascade contention requires review and qualification. |
| TypeScript | Full `tsc --noEmit --incremental false --pretty false`: passed. |
| Scoped ESLint | Four CJS files (inventory, artifact, qualification, organizer harness): **0 errors / 0 warnings**. |
| Exact Rack browser | `node qa/rack-qualification.cjs funnel-browser`: **32 passed**, 390/1440px, unchanged About this hackathon assertion, synthetic-only, **0 mutations / external requests**. |
| Diff/scope | Whitespace clean; no application/active migration/config/dependency/workflow edits; original organizer assertion expressions preserved. |
| Unexecuted | Exact target catalog/version, adapters, partner/access/isolation/metrics/squad SQL runners, live acceptance, 20/100-way stress and full deployed writer/cascade graph. No current-head hosted Linux/SQL CI claimed: workflows target main while this Draft targets PR #92's feature branch. No production build rerun for this documentation/test-only follow-up. |

Local logs outside checkout, parent workspace `audit-artifacts/mission20/`: `c1r-postgres-final.log`, `c1r-regressions-final.log`, `c1r-targeted.log`, `c1r-organizer.log`, `c1r-typecheck.log`, `c1r-lint.json`, `c1r-rack-browser.log`. PostgreSQL output includes server version, counts and cleanup receipts for both owned roots. The runner ignores inherited connection credentials, uses owned empty password/service files, accepts only `--local-only`, and refuses connection overrides before startup.

Eight ignored browser screenshots in `scratch/rack-funnel/`: `portal-390.png`, `guest-390.png`, `member-next-action-390.png`, `incomplete-next-action-390.png` and four corresponding `1440` images. No C1 UI change; PR #92's 768px baseline remains presentation evidence, not SQL qualification. Local Chrome required sandbox escalation; scrubbed environment/network guards remained in place.

### Historical failures reconciled

The initial C1 report had five organizer cases fail before assertions due to the missing lifecycle dependency (19 pass / 5 fail on baseline). The one-line repair resolves all five: **24/24 now pass**, included in 876. No assertion changed or was deleted.

The original selection accidentally included a database-backed metrics runner; it and its baseline comparison failed in Windows initdb before server startup. That separate runner remains unqualified and is not counted as fixed. During correction-runner development, Windows CRLF initially hid a psql barrier marker after SQL assertions passed. The orchestrator was corrected; final qualification and cleanup passed. Partial logs are superseded by `c1r-postgres-final.log`. No existing or remote database was substituted.

## Reproduction — explicit selections only

```text
node scripts/mission20-c1-inventory.cjs --check
node --test scripts/test-mission20-c1-design.cjs scripts/test-organizer-broadcast-authorization.cjs
node --test scripts/test-mission20-c1-design.cjs scripts/test-native-registration.cjs scripts/test-hackathon-create-dates.cjs scripts/test-hackathon-lifecycle.cjs scripts/test-event-compatibility.cjs scripts/test-rack-it-up-2026.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-authorization.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs scripts/test-partner-csv.cjs scripts/test-organizer-broadcast-authorization.cjs scripts/test-admin-hackathon-approval.cjs scripts/test-certificate-id-integrity.cjs scripts/test-certificate-verification-page.cjs scripts/test-team-creation.cjs scripts/test-squad-matching.cjs
node scripts/qualify-mission20-c1-postgres.cjs --local-only
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js scripts/mission20-c1-inventory.cjs scripts/test-mission20-c1-design.cjs scripts/qualify-mission20-c1-postgres.cjs scripts/test-organizer-broadcast-authorization.cjs
node qa/rack-qualification.cjs funnel-browser
```

Do not use wildcard CJS selections: several scripts start databases. Do not execute proposed SQL against any existing database. Use installed native PostgreSQL, no Docker/project creation.

## Exact file inventory

**15 follow-up paths** relative to 09641f2: 10 modified, five new. **18 total PR paths** relative to PR #92: 17 new C1 files plus the existing organizer harness. Three immutable inventory paths are inherited unchanged.

| Repository-relative file | Follow-up change |
|---|---|
| `docs/qa/mission20-c1/README.md` | Modified: recovery, evidence, limits and inventory. |
| `docs/qa/mission20-c1/DESIGN.md` | Modified: FK, capacity, locking and release contract. |
| `docs/qa/mission20-c1/TEST-PLAN.md` | Modified: executable strategy / remaining matrix. |
| `docs/qa/mission20-c1/REVIEW-CORRECTIONS.md` | New: finding analysis and decisions. |
| `docs/qa/mission20-c1/QUERY-INVENTORY.md` | Inherited unchanged. |
| `docs/qa/mission20-c1/QUERY-INVENTORY.json` | Inherited unchanged. |
| `docs/qa/mission20-c1/sql/00-preflight.review.sql` | Modified: FK catalog output. |
| `docs/qa/mission20-c1/sql/00-freeze-admission.proposed.sql` | New: freeze-first proposal. |
| `docs/qa/mission20-c1/sql/01-expand.proposed.sql` | Modified: CASCADE, freeze-aware guard, capacity terminology. |
| `docs/qa/mission20-c1/sql/02-contract.proposed.sql` | Modified: retain freeze. |
| `docs/qa/mission20-c1/sql/03-rollback-freeze.proposed.sql` | Modified: local versus existing-project execution. |
| `docs/qa/mission20-c1/sql/04-security-tests.review.sql` | Modified: real FK and release/role/native/community tests. |
| `docs/qa/mission20-c1/sql/05-per-team-roster.alternative.sql` | New: per-team prototype. |
| `docs/qa/mission20-c1/sql/06-unfreeze-admission.proposed.sql` | New: structural release gate. |
| `scripts/mission20-c1-inventory.cjs` | Inherited unchanged. |
| `scripts/test-mission20-c1-design.cjs` | Modified: 12 artifact/scope/harness checks. |
| `scripts/qualify-mission20-c1-postgres.cjs` | New: isolated PostgreSQL/concurrency qualification. |
| `scripts/test-organizer-broadcast-authorization.cjs` | Modified: one dependency-map entry; assertions identical. |

## Decisions before any migration

Review per-team ordering and residual child/parent deadlocks, all deployed writers/FKs/triggers, the privileged worker boundary, the retained row-slot interpretation, and freeze/adapter/operator gates. Catalog exceptions, source-verified official classification, stress/transport/workflow qualification and production acceptance remain separate gates. SET NULL needs its own proposal. No execution or rollout approval is implied or requested.
