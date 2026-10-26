# M05-R3 offline authority qualification — 26 October 2026 (IST)

This is an offline source/test report, not database acceptance. Production release is **NO-GO**.

## Frozen source and boundaries

- Repository: `yashshah1211/HackerMate_Backup`.
- Exact source: `d196164697ce49f1d648bde330a124c0c08e9344`.
- PR #69 freshly confirmed open/draft at that head, based on R1/#67 at `df9ac950f67444832e3a221ebb66b1b11576b884`. No PR was edited.
- Original R2 branch `fix/mission05-generation-admission` was clean before qualification.
- Frozen committed tree: `0072b28a5c5c055df56365f6f3df82e8f707887a`. Final read-only Git check confirms the same HEAD/branch, empty `git status --short`, empty index, and clean `git diff --check`.
- Non-Git source export: `C:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/r3-offline-qualification-d196164-20261026`.
- Exported tracked application source, scripts, migration source, public assets, selected existing QA/plans and package/config files only. No working-directory copy, environment files, credentials, database backup, `.git` directory, build output or live data was copied.
- Existing packages referenced through an export-only junction to `gl-bajaj-college-normalization/node_modules`; no install or writes to that dependency tree were performed. Snapshot/parser locations were read-only inputs. Temporary home/cache/output paths point inside this export.
- Root AGENTS, frontend AGENTS/Kiro steering, approved security-remediation plan, R1/R2 QA, evaluator reliability QA, final Mission 05 handoff and revised no-infrastructure planning/approval were read. Older Docker/disposable-DB instructions and prior report Git-state footers are historical and superseded here.

Only five approved source/test/document files are changed in the export:

1. `scripts/test-evaluator-result-authority.cjs` — append assertions/negative controls, SQL-case definitions and mocked authorization tests. Existing assertions remain intact.
2. `scripts/test-evaluator-cli-contract.cjs` — new cached-source integrity/parser/assembly/transport checks.
3. `scripts/check-mission05-sql.py` — new offline checksum and PG17 grammar checks with in-memory negative controls.
4. `docs/qa/mission05-authority-catalog-readonly.sql` — proposed catalog queries; **not executed**.
5. `docs/qa/mission05-database-authority-verification.md` — this report.

All logs/generated evidence are under export `scratch/`. A 692-file frozen-source manifest and final integrity inventory compare the export with its archived baseline: one modified source file plus four additions, exactly the approved five paths. Original authority-test contents are preserved as an exact LF-normalized prefix. M1's raw source bytes are unchanged (raw CRLF SHA-256 `798272388f96dbef5c79555ece09066822b9e37d5986deafb063562021cb9208`). No Git staging, commit, push, PR creation/update, merge or deployment occurred. No source in an existing worktree was changed. No application route/engine, M1 migration, hosted PG17 runner, dependency manifest or deployment configuration was edited.

## M1 integrity and source review

Migration: `supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql`.

Expected and freshly observed LF-normalized SHA-256:

`35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3`

Cached pglast 7.21 reports PostgreSQL **17.7 grammar**, returning exactly `VariableSetStmt`, `DoStmt`, and one parsed PL/pgSQL block. This is grammar-only evidence. No PostgreSQL server/tooling was used to execute SQL. PostgreSQL 18 is not PG17 acceptance evidence and was not used.

Source-verified M1 checks: lock timeout is transaction-local, validated positive and at most 3 seconds before ACCESS EXCLUSIVE locks; OID assignments follow locks; execution identity, object owner/RLS, invoker view, inherited memberships, grantor/column/policy/dependency drift assertions precede revocation. Both clients are checked over all four relations and every live user column. Service SELECT/INSERT/UPDATE/DELETE and BYPASSRLS are asserted. Read/delete policies and ACL snapshots and view definition must remain unchanged. Six known write-policy spellings only are dropped. No failure is swallowed and no authored transaction boundary/nontransactional directive is present.

Limits: top-level `SET LOCAL statement_timeout='15s'` remains only a compatibility hint; no 15-second whole-file bound is established. Lock timeout applies per acquisition. Text matching for functions/views/rules is conservative but cannot enumerate all dynamic SQL, indirect SECURITY DEFINER paths or external extensions. Fresh catalog review remains necessary. The checksum fixes the reviewed artifact; regex/source assertions are not a SQL authorization engine.

## CLI cache integrity and provenance

Read-only input: `C:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/trusted-idea-evaluation/scratch/mission05-cli-source`.

Frozen QA attributes these snapshots to Supabase CLI **2.122.0**, revision **5afad870388552d0198087d27037da7ac745ba2b**. Freshly measured raw-byte SHA-256 pins are verified before compilation and again by the tests:

| Cached snapshot | SHA-256 |
| --- | --- |
| sql-split.ts.txt | 0faf67881937a00e6a5b72d4fd065343aa7b9b3995fbc8e6d90d43efc32594b2 |
| migration-file.ts.txt | 4fee1670b2129737b42ec033a7cc61cf7598eb01bd9852a4a9988c13161c8266 |
| migration-apply.ts.txt | cc73a81cdf3354e6dcd10f83789adce3562fb3be9c2c6141c24a8075f8e8148e |
| db-connection.sql-pg.layer.ts.txt | c3f7957301f8166be39369afc5974dd24f121de3bcc65ad01d77bd93c690d02b |
| db-push-core.ts.txt | c3da04c843b4ce0d7635319bff91df68874469dc8a93bf499484344a8d6551c8 |

**Provenance limitation:** these are new local integrity pins plus previously recorded release attribution. The cache has no independently authenticated upstream hash manifest. No network fetch was used to turn the old attribution into independent source-authenticity proof. That stronger check is **BLOCKED** under cached-only access; local contract results below must be read with this limitation.

Actual cached SQL splitter and `parseMigrationContent` run after TypeScript transpilation in a VM with allowlisted imports. Actual pure transaction/pipeline/role-reset predicates are extracted unchanged. Actual `flushBatch` operations-assembly prefix is extracted from its TypeScript AST; only its enclosing variables are supplied. Actual `PgBatchQuery` and its value encoder run against an in-memory transport. No socket/DB driver/native CLI is instantiated.

M1 yields two transactional statements, neither authored transaction control nor pipeline-incompatible. Default/no-transaction directive position/BOM/CRLF, quoted/dollar/nested-comment splitting, authored-boundary predicates, final history position, optional role restore, parameter encoding, one final Sync, dead streams and parse/bind/describe/execute/Sync exceptions are covered. Server error callbacks are directly simulated; this does not simulate PostgreSQL transaction state. The splitter retains a trailing comment token; this is documented behavior observed in the new fixture, not an M1 statement-count defect.

**Blocked:** the Effect runtime is absent; `migration-history.ts` is not cached. The full migration executor is not run, and a clearly named inert history placeholder replaces the missing ledger SQL in transport tests. Executor branch selection/history ordering/error mapping are additionally source-inspected, not complete executor runtime acceptance. No install/download or native CLI invocation was attempted to fill these gaps. Transport success proves neither rollback nor actual ledger SQL/atomicity, lock eligibility, warnings, cancellation or timeout behavior.

## Evidence classes and security cases

| Evidence class | Coverage and limits |
| --- | --- |
| Source verified | Exact M1 hash, syntax shape and safety predicates; actual CLI branch/assembly source; server-side service client and verified protected profile; admission before quota/provider/mutation; preserved projections and history/attachment routes. |
| Mocked contract passed | Real handlers/engines with synthetic boundaries: guest vs supplied invalid identity, banned user/admin, owner/member/admin distinctions, history/delete/attachment, forged request fields and persisted metadata, confirmed vs uncertain persistence, simulated idempotency/CAS/concurrency, R1 correctness and R2 default-off/provenance. These do not prove database effects. |
| SQL case defined but not executed | Eight role/relation definitions (anon/authenticated x three bases/public view), default/full INSERT, score/grade/JSON spoof, upsert, team_id-only/mixed UPDATE, base TRUNCATE, and dynamic every-column privilege/INSERT/UPDATE plan definitions. Hosted runner's existing generated SQL is inspected only, never run. |
| Real database verification not performed | All effective grants/row-policy checks, denial execution, service-role persistence, FK/trigger/view behavior, PostgREST/JWT, transaction rollback/ledger/locking/timeouts and real concurrency. |

Definitions explicitly require SQLSTATE 42501 attributable to permissions. FK/type/updatability/unsupported-view errors must not become denial passes. Per-column definitions enumerate `pg_attribute` at later approved execution time, avoiding a static schema list. View upsert feasibility must be resolved on the actual catalog. EXPLAIN without ANALYZE is permission-planning evidence only; it cannot establish successful writes, row visibility or cleanup. TRUNCATE/trigger effects require separate permission and controlled execution; nothing here executes them.

No stored JSON flag, timestamp, rubric revision or request ID becomes trusted provenance. Attachment tests confirm only `team_id` changes even when score/provenance fields are supplied, and preserve historical JSON without certifying it. Existing mock atomic stores are explicitly modeled assumptions, not PostgreSQL serialization proof. M1 checks make future client writes deny-by-default only after separately approved successful application; closing R2 routes does not revoke old deployment URLs or direct database grants.

Source-review warning outside this test-only scope: existing Idea history GET/DELETE handlers still return `error.message` or caught exception messages in HTTP 500 responses (`src/app/api/evaluator/history/route.ts`). This can disclose database diagnostics to an authenticated caller when a query fails; the new attachment tests exercise PATCH's sanitized path and must not be generalized to all history error responses. No production failure or exploit was tested, and no source fix is included. DELETE also retains its existing success-with-no-matching-row semantics; this is not a read-back confirmation of deletion. Authorization filters remain `id` plus verified `user_id`.

## Fresh commands and results

Commands run sequentially from the export; exact argument arrays, executable paths, allowlisted environment-key names, network guard and exit status are recorded in `scratch/r3-*.command.json`; raw output is in matching `.log` files. No inherited credentials/provider keys/PG connection variables are passed. The wrapper resets environment to OS process essentials and export-local temporary/home paths, sets telemetry off, passes only explicit test paths, and preloads Node guards that refuse external fetch/TCP/TLS/DNS/UDP. Loopback is allowed for existing synthetic fixtures only. This is a test-process guard, not an OS firewall or an isolation claim against malicious native code.

Installed versions freshly checked against frozen lockfile: Next 16.3.8, TypeScript 5.9.3, ESLint 9.39.4, Playwright 1.64.0, esbuild 0.28.2, jsdom 26.1.0. No packages installed. Effect is absent and its corresponding verification remains blocked.

Fresh results (earlier R1/R2 reports and their 595/595 record remain historical):

| Command / evidence stem | Fresh result |
| --- | --- |
| Python `-B scripts/check-mission05-sql.py --migration supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql --expected-sha256 35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3 --catalog docs/qa/mission05-authority-catalog-readonly.sql` (`r3-sql-grammar-final`) | PASS: 7 integrity/grammar checks, 3 in-memory negative controls; 8 catalog SELECTs parsed only. |
| Node `--test --test-reporter=tap --test-concurrency=1 scripts/test-evaluator-cli-contract.cjs scripts/test-evaluator-result-authority.cjs` (`r3-targeted-accepted`) | PASS: 91/91, zero failed/cancelled/skipped. 25 CLI + 66 authority tests. |
| Node `--test --test-reporter=tap --test-concurrency=1 scripts/test-evaluator-generation-admission.cjs scripts/test-challenge-correctness.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-result-authority.cjs scripts/test-ppt-vision.cjs scripts/test-rate-limit-retention.cjs` (`r3-full-regression`) | PASS: 630/630, zero failed/cancelled/skipped; 122.467 seconds. Includes all 52 R1 and 69 R2 cases. |
| Node `node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false` (`r3-typescript`) | PASS: exit 0, zero diagnostics; no generated tsbuildinfo. |
| Node `node_modules/eslint/bin/eslint.js scripts/test-evaluator-result-authority.cjs scripts/test-evaluator-cli-contract.cjs` (`r3-scoped-lint`) | PASS: exit 0, zero errors/warnings. |
| Node `node_modules/eslint/bin/eslint.js` followed by the 19 frozen R2 application paths listed in `r3-r2-baseline-lint.command.json` (`r3-r2-baseline-lint`) | Existing baseline findings reproduced: exit 1, **1 error + 3 warnings**, no R3 changes in those files. |
| Node `scripts/test-evaluator-reliability-browser.cjs` (`r3-browser`) | BLOCKED at Edge launch; zero browser scenarios completed. No fresh UI acceptance claimed. |

The two Node runs overlap on 66 authority cases: **655 distinct Node tests passed**, not 721 distinct tests. They preserve the previous 595 cases and add 60 (35 authority + 25 CLI). The source controls include 16 individual guard-removal mutations and a swallowed-exception mutation; grammar/integrity adds 3 separate negative controls. SQL-definition tests are counted as definition tests, never successful PostgreSQL denials.

Initial targeted runs are retained: `r3-targeted-initial` **81 passed / 10 failed / 91**, then `r3-targeted-final` **90 passed / 1 failed / 91**. These were new test-scaffolding errors: an omitted enclosing `statements` variable in assembly extraction, wrong assertion-count expectation (15 actual M1 RAISE statements), trailing-comment splitter expectation, and an LF-only mutation failing to match CRLF source. Corrections remain inside the approved test files. The final accepted run passes all assertions; application/M1 source was not changed. All negative controls now prove they actually alter input before testing rejection.

Browser boundary: synthetic bundler/adapters and existing context routes were reviewed; all page requests outside the loopback fixture origin are aborted. The launch wrapper additionally supplies an unusable loopback proxy, non-loopback DNS denial and background-networking disable flags. Edge exited before a page/context opened, reporting Windows PathService/profile-path failure and the non-default data-directory requirement despite an explicit export-local user-data directory. The generated log contains the launch failure; this is an environmental blocker, not a source defect or a passing browser run. No real user profile was substituted. Previously recorded 390/1440 browser successes remain dated R2 evidence only.

The initial export attempt hit the Windows command-length limit before archive creation; directory pathspecs fixed that. Creating the export dependency junction required sandbox elevation, which was granted for that exact local link only. No dependency contents or existing worktrees were edited. Two command-construction syntax errors were corrected before the relevant command executed; they are not product/test failures.

No build was run: this scope changes tests/documents only, with no routing/server/configuration/application edit. The prior R2 safe build is historical evidence, not a new R3 build result. No hosted or production-connected smoke test ran.

Baseline lint detail: `LinkedIdeaScorecard.tsx:124` no-explicit-any error, `:137` hook dependency warning; `PitchEvaluatorClient.tsx:453` and `:455` internal location-assignment warnings. These exactly reproduce the prior recorded categories/counts; no rule suppression or cleanup was performed. Newly changed R3 JavaScript files have zero lint findings.

Evidence inventory: `scratch/frozen-source-manifest.json`, `scratch/r3-final-integrity.json`, `scratch/r3-review.patch`, `scratch/r3-review.patch.sha256`, the command/log stems in the table, and generated `scratch/evaluator-benchmark-{idea,presentations}.json`. These contain source/synthetic evidence only. Review patch includes the complete four new files and the authority additions; it is not a commit or publication.

## Unexecuted catalogs and release decision

`mission05-authority-catalog-readonly.sql` contains exact proposed session-read-only catalog queries for version/ledger existence, owners/RLS/invoker view, memberships, effective table/every-column privileges, policies and direct dependencies. Optional ledger lookup is separately commented and requires existence confirmation. The file was **not database-executed**. Even approval of these catalog queries would not establish actual denied writes, persistence, PostgREST auth or migration atomicity.

Remaining release blockers:

1. Authenticating cached CLI contents against the pinned upstream revision; full executor/real ledger source and runtime qualification.
2. Real PostgreSQL 17 M1 execution, transaction/ledger atomicity, assertion rollback, lock contention, effective timeouts and cancellation.
3. Effective anon/authenticated table/column/view denial and unchanged authorized SELECT/DELETE under actual role/JWT contexts.
4. FK-valid service-role persistence/read-back, PPT status/CAS/trigger/concurrency and Idea attachment, with permitted disposable fixtures and verified cleanup.
5. PostgREST/browser-to-server/database integration and authorized core-page runtime acceptance after an approved permission change.
6. Provider entitlement/quality/mode/latency, retention/erasure/cron/backlog, old deployment/direct-grant exposure and all previously recorded operational release gates.

Dormant `ShareScoreCardModal.tsx` retains obsolete verified-AI wording; no new use is authorized. R1/R2 remain frozen drafts, and production activation remains NO-GO. Never restore client result-write privileges as rollback.

Least additional-infrastructure next steps: founder independently reviews these five export-only files/logs; separately approves authentication of cached source if wanted; optionally separately approves only the proposed metadata queries through an existing read-only connection. Do not create new infrastructure or accounts, or infer permission for any live query/migration. If no permitted PG17/PostgREST fixture path exists, leave enforcement/persistence acceptance blocked.
