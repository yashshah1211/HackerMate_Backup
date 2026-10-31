# Mission 20 C1 — review package and evidence

**Design only. Not a production remediation. Do not apply or deploy.**

Baseline: reviewed PR #92 commit `4818052a944451c74ae0a7d7c4572f3e7c3d0f8e`; local branch `design/mission20-c1-database-security`, isolated worktree `mission20-c1-database-security-design`. PR #92 was rechecked as open, Draft, unmerged and still at that exact head. The C1 Draft is stacked on its feature branch so the new diff contains only this design package. No application, existing test, active migration, environment, dependency or workflow file changes.

Read [DESIGN.md](DESIGN.md) for the exact writer/reader analysis, proposed authorization and concurrency boundary, legacy official compatibility, partner/Rack/certificate/team review, adapter contract, rollout/rollback and unresolved decisions. Read [TEST-PLAN.md](TEST-PLAN.md) for the sequential, concurrent, abuse and production acceptance matrix. [QUERY-INVENTORY.md](QUERY-INVENTORY.md) and its [JSON companion](QUERY-INVENTORY.json) provide every baseline query chain/projection/write argument and SQL context.

## Proposed SQL, all review-only and unexecuted

| File | Purpose |
|---|---|
| [00 preflight](sql/00-preflight.review.sql) | SELECT-only future metadata/legacy readiness capture; not run against any project. |
| [01 expansion](sql/01-expand.proposed.sql) | Hardened private worker/public native RPC, canonical status/locking trigger, owner/approval guard, exact date helpers. No data rewrite. |
| [02 contract](sql/02-contract.proposed.sql) | Clear table and explicit column INSERT grants, restore only guarded community payload, restrictive native denial and event ownership/state policies. Requires adapter cutover. |
| [03 rollback freeze](sql/03-rollback-freeze.proposed.sql) | Fail-closed rollback: freeze native RPC/community INSERT while retaining readers, preferences, cancellation, records and approval protection. |
| [04 security tests](sql/04-security-tests.review.sql) | Future isolated local SQL assertions, reusing the existing privacy fixture unchanged, fake IDs only, database/loopback/session guards. Not an executable C1 runner. |

None is in `supabase/migrations/` or imported by an active migration/CI runner. Promotion requires a separately approved implementation/release and real generated migration filenames. Applying expansion alone leaves a transitional direct-native-write policy; it is not the finished remediation.

## Verification evidence

| Check | Actual result and scope |
|---|---|
| Inventory reproducibility | Matches exact baseline: **66 API chains, 332 SQL fragments, 1,200 reference lines**, including every requested projection and all 11 raw registration application queries. Initial API/SQL inventory preceded proposed permission SQL; final whole-tree reconciliation adds full Python/HTML/YAML context. |
| C1 artifact checks | **8 passed**, repeated after final SQL edits. Only file/scope/ACL-intent checks; **not a SQL parser or PostgreSQL qualification**. |
| Final offline selection | **848 passed, zero failed/skipped**: eight artifact checks plus 840 existing in-memory application regressions across lifecycle, native/create, event compatibility, Rack, partner auth/admin/organizer API/CSV, approval, certificates and teams. Does not include the unresolved baseline portal harness below. |
| TypeScript | Full `tsc --noEmit --incremental false --pretty false` passed. |
| Scoped ESLint | Two new CJS files: **0 errors, 0 warnings**. |
| Exact Rack browser journey | **32 passed**, 390/1440px, unchanged heading assertion, synthetic providers, **0 mutations / 0 external requests**. Chrome required filesystem-sandbox escalation, retaining qualification's scrubbed environment and network guard. |
| Scope / whitespace | No changes under src, supabase, .github, package manifests or environment files; `git diff --check` passed. Existing assertions were not changed or weakened. |
| Database / live acceptance | **Not performed.** No proposed SQL, migration or fixture SQL file executed; no production/staging connection, schema/RLS/privilege/data change, live integration, scraping, deployment or merge. |

Raw local logs are outside the Git checkout under the parent workspace's `audit-artifacts/mission20/`: `c1-artifacts-final.log`, `c1-offline-final.log`, `c1-typecheck.log`, `c1-lint.json`, `c1-rack-browser.log`, `c1-regressions.log`, `c1-baseline-failures.log` and `c1-organizer-baseline.log`. Rack screenshots/results are under ignored `scratch/rack-funnel/` and reproducible with the exact command below. C1 changes no UI; the three-width screenshots in PR #92 remain baseline presentation evidence, not evidence that proposed database SQL works.

### Failures and attempted-run reconciliation

The initial expanded selection produced **867 passes / 6 failures**. Five failures are `scripts/test-organizer-broadcast-authorization.cjs`'s native owner portal cases. They throw **Unmocked portal dependency @/lib/hackathons/lifecycle** at the harness's require map (`:115`) before executing their assertions. Running that unchanged file on the original PR #92 worktree at `4818052` reproduced **19 passes / 5 failures**. These are an unresolved baseline coverage gap requiring a separately scoped harness update/requalification. C1 does not weaken those assertions or claim these cases pass. The failing labels cover banned/revoked identity, event predicate error, external owner, wrong native owner and positive scoped native owner reads.

The sixth failure was a mistakenly included **database-backed** `scripts/test-partner-metrics.cjs`, not an in-memory test. The initial selection and its baseline comparison both attempted a new temporary local initdb. Windows denied WAL file creation/rename; initdb exited before pg_ctl/server startup, createdb or psql. The runner's failure path and finally cleanup ran; both temporary roots were subsequently verified absent. No existing/project database was contacted and no migration, fixture or proposed SQL file was executed. No escalation/retry to run that database fixture was made. It remains unqualified in C1; all further database runners were excluded from execution and are listed for later authorized qualification. This failed bootstrap is recorded explicitly rather than presented as a successful SQL test.

The final green selection deliberately omits those two files; their unresolved/failure states above remain part of this report. Existing SQL privacy/access/isolation runners, squad local SQL, candidate SQL and concurrency cases were not run. Baseline PR #92's historical Linux CI success is not being reused as proof for the C1 proposal. The stacked Draft's base is a feature branch, while existing hosted workflows target main; no current-head hosted C1/database validation is claimed.

## Reproduction (offline only)

```text
node scripts/mission20-c1-inventory.cjs --check
node --test scripts/test-mission20-c1-design.cjs
node --test scripts/test-mission20-c1-design.cjs scripts/test-native-registration.cjs scripts/test-hackathon-create-dates.cjs scripts/test-hackathon-lifecycle.cjs scripts/test-event-compatibility.cjs scripts/test-rack-it-up-2026.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-authorization.cjs scripts/test-partner-admin.cjs scripts/test-partner-organizer-api.cjs scripts/test-partner-csv.cjs scripts/test-admin-hackathon-approval.cjs scripts/test-certificate-id-integrity.cjs scripts/test-certificate-verification-page.cjs scripts/test-team-creation.cjs scripts/test-squad-matching.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js scripts/mission20-c1-inventory.cjs scripts/test-mission20-c1-design.cjs
node qa/rack-qualification.cjs funnel-browser
```

The baseline-only failing portal harness can be reproduced separately with `node --test scripts/test-organizer-broadcast-authorization.cjs`. Do not run a wildcard selection: several existing CJS files launch PostgreSQL, and are not offline source tests. Do not execute the SQL files during C1 review.

## Exact C1 file inventory

All 12 files are new; no pre-existing changes were included.

1. `docs/qa/mission20-c1/README.md` — evidence, failure reconciliation and inventory.
2. `docs/qa/mission20-c1/DESIGN.md` — remediation, compatibility, ordering, rollback and decisions.
3. `docs/qa/mission20-c1/TEST-PLAN.md` — concurrency, abuse and acceptance matrix.
4. `docs/qa/mission20-c1/QUERY-INVENTORY.md` — readable full query/projection inventory.
5. `docs/qa/mission20-c1/QUERY-INVENTORY.json` — exact immutable-base queries and SQL context.
6. `docs/qa/mission20-c1/sql/00-preflight.review.sql` — future read-only preflight.
7. `docs/qa/mission20-c1/sql/01-expand.proposed.sql` — proposed atomic mechanism and guards.
8. `docs/qa/mission20-c1/sql/02-contract.proposed.sql` — proposed grant/RLS contract.
9. `docs/qa/mission20-c1/sql/03-rollback-freeze.proposed.sql` — safe rollback proposal.
10. `docs/qa/mission20-c1/sql/04-security-tests.review.sql` — future local SQL assertions.
11. `scripts/mission20-c1-inventory.cjs` — deterministic immutable-base inventory generator/checker.
12. `scripts/test-mission20-c1-design.cjs` — offline review-artifact/scope checks, no database connection.

## Decisions remaining for independent review

Approve or revise the one-row capacity unit/waitlist behavior, privileged worker ownership and global roster-lock trade-off; classify legacy official/NULL statuses and ambiguous deadlines; confirm actual production metadata/role graph/FK actions and external writer dependencies; decide deployment ordering; resolve the baseline portal harness and qualify all SQL/races. These are gates for a future implementation/release, not permission requested to execute anything now. Keep both PRs Draft and stop for independent review.
