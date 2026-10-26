# Mission 05 consolidated release candidate — 26 October 2026 (IST)

**Draft publication: GO after the repeated non-deploying preflight. Generation-disabled source candidate: ready for final founder authorization; actual production deployment: NO-GO pending the operational gates below. M1 execution and full evaluator activation: NO-GO.** This is a draft integration candidate and authorization checklist, not permission to deploy, execute SQL, invoke cron, merge or enable generation.

## Frozen inputs and integration

Repository: `yashshah1211/HackerMate_Backup`. Branch: `release/mission05-integrated`. Isolated worktree: `C:/Users/yashs/OneDrive/Desktop/HackerMate_Backup/mission05-integrated`.

Freshly fetched origin/main: `5454f57d4ba8baf98b277589a2eb6e9584610397`. Frozen stack: `4cff459ce38036a04f44e98c728192cad10d038f`. Merge base: `83a9fa3187715dbb0f8a0104e97d492cd73e3a50`. Fresh comparison confirms **9 stack-only commits and 3 main-only commits**, rather than assuming the prior comparison remains valid.

| PR | Verified head |
| --- | --- |
| #60 retention | 40023bf5350b8b19a1e4eeade950a7e81efe50b1 |
| #61 trusted Idea | 0861c28746f462e2f64bcdb0ad0ac703c533e5f7 |
| #62 PPT/Challenge reliability | 0f7863839faa59482ec2b1a2ae64f1dc68b5ef20 |
| #63 result authority | f8e268dc643deca18bf62bb3a40728bc2d2aa32e |
| #67 Challenge correctness | df9ac950f67444832e3a221ebb66b1b11576b884 |
| #69 generation/provenance | d196164697ce49f1d648bde330a124c0c08e9344 |
| #70 offline qualification | 4cff459ce38036a04f44e98c728192cad10d038f |

Every head and successive ancestry was verified. All seven original PRs remain drafts and unchanged. Main's GL Bajaj #64 changes are retained. #65 remains excluded. The separately approved exact #68 and #66 patches are now integrated as recorded below.

The merge completed **without conflicts**. Before the narrow history correction, all 56 paths changed by the stack matched the frozen stack's indexed Git blobs, and all 18 paths changed by main matched main's blobs. The two changed-path sets have no intersection. No manual conflict resolution was needed. The endpoint-to-endpoint main/R3 diff includes apparent reversions of college changes; merging their ancestry preserves those main changes instead of applying that misleading endpoint diff.

Main's branch metadata reports `protected:false`, required checks off, and an empty ruleset list. No protection was changed. This makes founder-controlled merge/release discipline essential; a draft PR is not an enforced deployment lock.

M1: `supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql` is preserved. Expected LF-normalized SHA-256:

`35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3`

Main's separate GL Bajaj migration/rollback remain unchanged. Never replay either migration directory as a backlog. Existing ledger drift remains a release preflight issue.

## Narrow pre-production correction

The initial integration's application correction: `src/app/api/evaluator/history/route.ts` GET/DELETE query failures and exception handlers return fixed generic errors, preserving HTTP 500 and actual server-side error logging. They no longer expose database/exception messages or missing-configuration details to the client. Existing authentication, verified-user ownership filters, legitimate history, deletion, and PATCH behavior are unchanged.

`scripts/test-evaluator-result-authority.cjs` adds eight adversarial cases: GET/DELETE x returned query error, thrown query error, thrown auth error, and missing service configuration. Each checks the generic response, unchanged synthetic records/no mutation, and retained server logging. The pre-fix negative run failed **8/8 as expected**; after the fix the complete authority suite passed **74/74**. All prior assertions remain.

The history code/test paths above and this QA/checklist document were the only initial release-specific changes beyond the frozen stack. The approved security continuation adds exactly the five paths below. No new schema, deployment config, privilege grants, provider behavior or unrelated cleanup.

## Final scoped security integration and evidence

Starting published release commit: `67c98dc5823c1024c9248850bfac65255ce9b2ae`. Exact conflict-free `git cherry-pick -x` integrations:

| Reviewed input | Release commit | Exact additional paths |
| --- | --- | --- |
| #68 `44127522a3e4a0dcd7fc1295d01dcd6d30de9c05` | `9f34e88694f8810f986dc2a191f09e472686ad64` | `src/lib/net/publicHttpFetch.ts`; `src/app/api/link-preview/route.ts`; `scripts/test-link-preview-security.cjs` |
| #66 `280dbf2db2bf05ac4cb2ae8a11d1cb3068a1f614` | `7c0262c87887f5ea80e010ca2bdbd436f8ea0baf` | `package.json`; `package-lock.json` |

Each of the five resulting Git blobs equals its reviewed input blob, not merely an equivalent rewrite. Both commits retain their source SHA trailer. This existing QA document is the only further changed path. The source candidate is `7c0262c87887f5ea80e010ca2bdbd436f8ea0baf`; its subsequent evidence-only commit is identified by the publication handoff/PR head. No original PR branch was modified.

Stable patch IDs also match: #68/source and release both `1e904a94a2528de88e1dbe27d08d6585171949a6`; #66/source and release both `14ac494bfb8d6537d9afe294b54312330371f46e`. The final ancestry/blob audit preserved all seven original heads, all 18 main-changed blobs and 54/56 frozen-stack blobs; the only two stack exceptions remain the already published history correction and its tests. #65 is not an ancestor. Final evidence checksums and exact command outcomes are indexed in ignored `scratch/security-final-evidence.json`.

The release-only ignored `node_modules` junction now references the existing `security-next-sentry-oct2026/node_modules` cache read-only. All 673 installed lock entries match reviewed version/resolved/integrity fields; 143 absent entries are optional. Next and eslint-config-next are **16.4.3**, Sentry **10.75.3**, sharp **0.35.5**, TypeScript **5.9.3**. No package installation or install script ran, no target cache/other worktree was changed, and lock sources remain official npm/bundled optional entries with no new install-script flags.

These are fresh results after both cherry-picks. Successful checks were restored from actual command/evidence files after the usage interruption and were not needlessly rerun. The earlier results below remain dated pre-security evidence.

| Final check | Result |
| --- | --- |
| Complete combined Node run, 17 files | **1,246/1,246 passed**, zero failed/skipped/cancelled, one sequential run with loopback permission and external network denial. Resolves the earlier sandbox-only PDF failure in a single combined run. Includes admission, authority, reliability, Challenge, PPT, admin, retention, email and main-compatibility suites plus #68. |
| #68 standalone security suite | **22/22 passed**, zero skips, including actual local TCP/TLS, trusted certificate/SNI, mismatch and untrusted certificate rejection, proxy avoidance, mixed DNS/rebinding/redirect/private ranges, 120 KiB wire/decoded caps, decompression bombs, stalled/trickling streams and CPU cases. Benign metadata schema/fallback assertions pass. |
| TypeScript | Pre-build and post-build **passed, zero diagnostics**; post-build uses `--incremental false --pretty false`. |
| Newly changed source/test lint | Three files, **0 errors / 0 warnings**. |
| Same-tool application/main lint comparison | Candidate **252 errors / 98 warnings**, 349 source files; main **314 / 108**, 343 files. **Zero introduced fingerprints**; no rules suppressed. Full lint still exits 1 due inherited debt. |
| Next 16.4.3 production build | **Passed**; **44/44 HTML checks**, 39 anonymous synthetic reads, zero writes/external data. Offline fonts and synthetic configuration only. |
| Existing evaluator browser | Passed at **390px and 1440px**, including Idea/PPT/Challenge, historical leaderboard filters, stale identity and uncertain responses. No invented assertion total. |
| Supplemental actual LinkPreviewCard browser | **8/8 states passed** at 390px/1440px: received/own cards, fallback and denied preview, preserved links/images/text/layout. Eight synthetic GET fixtures, zero external requests/provider operations/page errors. |
| Existing login/return-path/UI regressions | **315/315 passed**, zero failed/skipped. Synthetic OAuth/session adapters; no hosted sign-in or real account. |
| Existing core-query smoke | **8/8 passed**, ten synthetic read-only loopback requests. Not real RLS or authenticated core-page integration evidence. |
| Built Next HTTP | **5/5 passed**: three consistent scoreless generation-closed 503s and two sanitized history errors, no service key or enabled generation. |
| M1/SQL | Unchanged LF checksum above; **7 offline checks passed**, including **3 negative controls**, PG17.7 grammar; eight catalog SELECTs parsed only. No PostgreSQL server, SQL execution or database contact. |
| Local test network guard | **7/7 passed**: external/direct and non-loopback custom lookup results denied, including forged localhost lookup; only actual loopback accepted. This is a test-process guard, not OS isolation. |

Commands and inline fixture programs, environment-key names, exit codes and raw output are in ignored `scratch/security-*.command.json` and `.log`. Combined command is the 16-file command below with `scripts/test-link-preview-security.cjs` appended, `--test-concurrency=1`, and the actual argument array preserved (default reporter for this run). Auth command: `node --test --test-concurrency=1 scripts/test-auth-return-paths.cjs scripts/test-auth-return-ui.cjs`. Other fresh commands use the existing build/browser/smoke/SQL scripts listed below. Scoped lint uses ESLint `lintFiles` on the three #68 paths; baseline comparison uses the same updated ESLint configuration and main source blobs in memory.

Browser evidence: `scratch/security-browser/results.json` and PNGs; `scratch/security-link-browser/results.json` and eight PNGs. Build artifacts/logs: `scratch/security-build-artifacts/public-metadata`. Core/runtime evidence: `scratch/security-core-smoke-evidence.json`, `scratch/security-next-http-evidence.json`. Lint details: `scratch/security-app-lint-details.json`. All remain excluded from Git.

Environmental/harness issues during verification: an initial wrapper syntax error occurred before tests and was corrected; the first security run passed 21 and skipped TLS because OpenSSL was outside PATH, then the existing Git OpenSSL enabled the complete 22/22 run. The supplemental browser initially failed before mounting (`process is not defined` from unadapted Next Link through the design-system barrel); the standard existing-harness Next Link adapter resolved it without application changes. Diagnostic log remains `security-link-preview-browser-diagnostic.log`. No security assertion was removed or relaxed. Test sockets using synthetic public hostnames are accepted only after their test-only lookup resolves to actual loopback; non-loopback results remain denied. Existing Sentry instrumentation/middleware conventions and Edge-runtime warnings remain unsuppressed.

### Final security disposition and residual risks

- **Closed source blockers:** #68 validates every DNS answer, rejects mixed/private/special ranges, pins socket lookup, validates every redirect, preserves TLS/SNI verification, disables connection pooling/proxy inheritance and credential forwarding, and bounds time, wire/decoded bytes and parsing work. The route remains public by design. No confirmed bypass was found in this scoped review; offline cases are not a universal internet/deployed-network proof.
- **Operational abuse warning:** no application authentication/rate or concurrency limiter protects this route; many permitted public requests can still consume DNS/CPU/connection budget. An aborted DNS promise cannot cancel the underlying OS lookup. Actual ingress/egress/concurrency protections require separate operational verification/acceptance. Preview image/favicon URLs are browser-fetched HTTP(S), not passed through the server DNS guard; privacy/local-network requests and third-party favicon fetching remain outside #68's server-fetch guarantee. No broad universal SSRF claim is made, including for the separate PPT downloader.
- **Dependency disposition:** Next 16.4.3 and Sentry 10.75.3 exceed the fixed versions of the four reviewed advisories cited below. The original sharp workaround was already present; this does not mean every old advisory was exploitable. Residual lock entries remain DOMPurify 3.4.16 via jsPDF 4.2.1, zod 4.4.3 (dev/lint), and fast-uri 3.1.8 (Ajv/tooling). Their advisories are not fixed by this scoped update: [DOMPurify shadow/template mode](https://github.com/cure53/DOMPurify/security/advisories/GHSA-cg2g-xh64-v4q7), [Zod collection DoS](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), [fast-uri host confusion](https://github.com/fastify/fast-uri/security/advisories/GHSA-wjr9-j795-jxcr). Source search found no direct app import of these three, no jsPDF `.html()` call, and no required DOM template/shadow configuration. Thus affected versions are confirmed, application exploitability is not established; treat them as inherited dependency warnings requiring explicit release disposition, not a clean dependency audit. No new npm audit or dependency upgrade is implied.
- **Secrets/auth/authority:** scoped high-confidence secret-pattern scan passed; no environment file is tracked or included, and none was read. No changed client credential path, service-role fallback, auth bypass or stored-provenance authority was introduced. The exact literal generation check still protects all three POSTs/direct engines before work; existing protected banned-user/owner/member guards and result persistence/read-back tests pass. Historical metadata still cannot establish verified provenance. An inherited `NEXT_PUBLIC_GEMINI_API_KEY` fallback exists only in the server upload-moderation module's current caller chain; no configured value/exposure was inspected or asserted. Never populate public-prefixed secrets; actual secret/config isolation remains a separately approved metadata-only release check. Scoped scanning is not a full historical secret audit.
- **Highest remaining production gates:** existing direct result grants/old deployments are not closed by new source; real PG17/PostgREST enforcement, ledger/atomicity/recovery evidence and approved M1 execution remain missing. Retention can activate independently on deployment, without enabling generation; current backlog, erasure and deletion acceptance remain unverified. Dormant sharing-modal claims, inherited lint debt, incomplete Sentry initialization and provider/ingress/runtime acceptance remain documented limitations. No new source correction beyond the approved exact patches was required.

## Verification and environment boundary

The initial run used the old cached packages; the final security run uses the compatible cache and exact reviewed manifests/lock documented above. No packages, browser, server or database software were installed. No Docker, new Supabase project, database backup, database service, live provider, external application endpoint or production/shared-staging data operation was used.

Test processes use an allowlisted environment with no inherited provider/database credentials and no `.env` files. A preload denies external fetch/TCP/TLS/DNS/UDP; reviewed synthetic fixtures may use isolated loopback. Logs, fixture data, temporary profiles and generated build artifacts stay local and are excluded from the release index. These guards are not an OS firewall or proof against malicious native code. Enabled evaluator tests use synthetic adapters; the real process remains default closed.

Exact commands, environment-key names, exit status and raw outputs are stored in local `scratch/release-*.command.json` and `.log`. Counts below are updated only from commands actually run; earlier R1/R2/R3 evidence is separately dated and is not relabelled as release-candidate acceptance. No mocked/source check is real database integration evidence.

### Initial pre-security candidate results — historical evidence

| Verification | Observed result |
| --- | --- |
| Authority targeted run | **74/74 passed**; includes all eight new disclosure tests. The pre-fix **0/8 pass, 8 expected failures** is retained separately. |
| Combined applicable Node run | **1,223 passed / 1 failed / 1,224 total**, no skips/cancellations. Sole failure was the existing synthetic localhost HTTP authorization test's sandbox `fetch failed`. Its isolated loopback-permitted rerun passed **1/1**, retaining the external deny guard. Thus all 1,224 distinct cases passed across these runs; no claim of a single 1,224/1,224 run. |
| TypeScript before and after build | Both passed, zero diagnostics, `--incremental false`; no generated tsbuildinfo. |
| Changed-file lint | 40 code/test files: **1 error, 3 warnings**, exactly documented R2 findings; no suppressions/cleanup. History route and authority-test correction have zero findings. |
| Full application lint | Candidate **252 errors / 98 warnings** across 348 source files; current-main source baseline **314 / 108** across 343 files under the same tool/config. Fingerprint comparison found **zero introduced diagnostics**, 62 fewer errors and 10 fewer warnings. These are unresolved inherited lint debt, not a green full-lint result. The older 323/114 whole-repository record has a different scope and is not substituted for this comparison. |
| Synthetic production build | **Passed**, existing Next production harness with offline fonts and loopback-only synthetic Supabase. Follow-on **44/44 HTML checks**, **39 anonymous fixture reads**, zero fixture writes/external data. |
| Existing core-query smoke script | **8/8 checks passed**, ten read-only synthetic loopback requests. Includes three fake profile IDs; no real identity, database or RLS proof. |
| Built Next HTTP | **5/5 passed**: three scoreless/no-store generation_closed 503s with the server flag unset, plus generic history GET/DELETE 500 responses with service configuration absent. No provider/service credential was supplied. |
| Synthetic browser | **Passed at 390px and 1440px** using actual evaluator/Challenge components and CSS with synthetic adapters; includes eight Challenge failure-state cases, eight populated leaderboard filter states plus empty states, stale accounts and uncertain responses. Zero external requests/provider operations. No overall browser assertion total was invented. |
| M1/offline SQL | Exact checksum passed; cached pglast 7.21 uses **PG17.7 grammar**, seven integrity/grammar checks including three negative controls, AST VariableSetStmt+DoStmt, one PL/pgSQL block. Eight proposed catalog SELECTs parsed only; no SQL executed. |

Combined Node command:

```text
node --test --test-reporter=tap --test-concurrency=1 scripts/test-evaluator-generation-admission.cjs scripts/test-challenge-correctness.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-result-authority.cjs scripts/test-evaluator-cli-contract.cjs scripts/test-ppt-vision.cjs scripts/test-rate-limit-retention.cjs scripts/test-admin-authorization.cjs scripts/test-admin-moderation.cjs scripts/test-email-reliability.cjs scripts/test-analytics-summary.cjs scripts/test-my-teams-applications.cjs scripts/test-college-normalization.cjs scripts/test-dashboard-join-requests.cjs scripts/test-onboarding-submission.cjs scripts/test-team-creation.cjs
```

Other commands: `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`; changed paths through `node node_modules/eslint/bin/eslint.js --format json <40 explicit paths>`; full source through ESLint's lintFiles(['src']) and main blobs through lintText with the same config, excluding shifted line numbers from diagnostic fingerprints; `node scripts/test-public-hackathon-metadata-production.cjs`; `node scripts/test-evaluator-reliability-browser.cjs`; `node scripts/smoke-test-core-pages.js` with HM_SMOKE_SYNTHETIC and its dedicated loopback fixture/key; Python `-B scripts/check-mission05-sql.py --migration supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql --expected-sha256 35336ee3c43dddb513dc92ce235c17b4ee3d6811eff18eade9b7b7a0c86ff5a3 --catalog docs/qa/mission05-authority-catalog-readonly.sql`. Wrapper argument arrays and inline synthetic fixture/comparison programs are preserved in the matching command JSON, not installed or added to application code.

Installed packages matched the lock: Next16.3.8, TypeScript5.9.3, ESLint9.39.4, Playwright1.64.0, esbuild0.28.2, jsdom26.1.0. Browser execution used the existing installed Edge with a new Playwright temporary profile and unusable external proxy/DNS denial. OS profile-location variables were allowlisted for Windows path resolution; no real browser profile/session was used. This resolves the earlier R3 launch-environment blocker for this run only and does not change its dated evidence.

Build warnings retain the framework middleware/Sentry convention and Edge-runtime dependency notices; no suppression was added. Full CLI executor/ledger runtime and independent cache authentication remain blocked as documented by R3. Native Supabase CLI, PostgreSQL/PostgREST, production/shared-staging, live providers, actual cleanup/cron/email, real account erasure and authenticated database-backed core-page acceptance were not exercised. Query/HTML/browser mocks do not establish those properties.

Local evidence paths: `scratch/release-full-node.log`, `release-local-http-rerun.log`, `release-app-lint-details.json`, `release-browser/results.json` and PNGs, `release-core-smoke-evidence.json`, `release-next-http-evidence.json`, and `release-sql-offline.log`. The production harness's generated `work/public-metadata` was moved, after its processes exited, to ignored `scratch/release-build-artifacts/public-metadata`; build/runtime logs, fonts and synthetic HTML remain there. No generated output, dependency junction or real environment file belongs to the staged release.

Source compatibility review repeated the result-table caller/embedded-join scan and compared the approved M1 inventory: enabled result inserts/updates and Idea attachment remain service-role API operations; client callers read explicit result projections/joins; M1 preserves SELECT/authorized DELETE and service privileges while denying client table/every-column/view writes. The history correction changes only error responses, not queries or grants. Main's preserved college normalization introduces no result-writing path. Missing additional_rules/track_id compatibility remains narrowly scoped. Actual deployed columns, grants, trigger/FK behavior and ledger cannot be established from source and remain unverified.

Fresh publication control-plane checks: Vercel Preview branch tracking disabled, no custom environment mapping, Production matcher main; Supabase organization has no repository/project connections or Vercel integration; Render's five services map to other repositories and no Blueprint instances exist. Existing repository workflows are manual-only and no active local Git hook was found. No configuration/permission was changed and no production data was read. Recheck remote main/head and duplicate PR state immediately before the normal release-branch push.

## Pre-integration adjacent security review — exclusion findings superseded

The following records why integration was required. Both exact patches are now incorporated and their fresh acceptance evidence is above; references below to exclusion or subsequent approval describe the previous checkpoint, not the current candidate.

Two read-only code-review axes (Standards and Spec) inspected #66 and #68 independently. Neither found a confirmed implementation/spec violation; each identified two release-risk/disposition findings. Both agree the worst issue is the public route left vulnerable when #68 is excluded. Reviewers performed source/current primary-advisory inspection, not tests or live probes.

### Standards axis

- **High release blocker — #68 excluded:** current public `src/app/api/link-preview/route.ts` validates initial hostname text only, follows redirects automatically, does not validate DNS addresses, clears its timeout before body reading, and has an unbounded `res.text()` fallback. The evaluator generation flag does not guard this route.
- **Warning — #66 recommended:** Next 16.3.8/Sentry 10.75.0 fall in advisory ranges. The lock already pins sharp 0.35.5, the Image Optimization advisory's stated workaround; no app `use cache`, `use server`, or configured `tunnelRoute` was found. Do not claim all four reported advisories are demonstrably exploitable here.

### Spec axis

- #68's requirements to validate all DNS answers, pin the socket, recheck redirects and bound body/decompression/CPU address concrete missing protections in this candidate. Obtain separate approval to integrate #68 or an equivalent reviewed fix **before a production code release**, even with generation closed.
- #66 meets its dependency-only scope. Adopt it with separate approval and matching installed dependency validation before release; no current source proof establishes every advisory prerequisite.

Neither PR's changed paths overlap the stack's paths. #66 changes two manifests; #68 changes three source/test files. No textual conflict is expected, but conflict-free merging is not compatibility proof. #66's lock review found 18 added and 31 changed non-root entries, official npm/bundled optional sources and no added install-script flags. No install was performed in this task.

Required subsequent regression work: #66 exact lock/package parity, fresh synthetic Next build and image/auth/redirect/admin checks, full M05 suite; #68 its complete DNS/redirect/socket/TLS/rebinding/decompression/stream/CPU suite, benign chat/LinkPreviewCard browser compatibility and PPT downloader preservation. Remaining #68 unauthenticated rate exposure, uncancellable DNS and browser-fetched metadata URLs need operational disposition; its scope does not prove universal SSRF/abuse protection.

Primary advisory references: [Next image](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw), [Next cache](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr), [Next Server Actions](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r), [Sentry tunnel](https://github.com/getsentry/sentry-javascript/security/advisories/GHSA-mchm-gjx6-7h55).

## Production operations checklist — proposed, unexecuted

Every connected check/action below requires separate founder authorization naming the exact target and allowed operation. Neither this document nor publishing its draft authorizes it. Do not inspect/copy credentials into evidence.

1. **Freeze candidate and deployment boundary.** Recheck final SHA, all original heads, main, automatic deployment branch mappings, old URLs, service-role-only result writers and `EVALUATOR_GENERATION_ENABLED` exact disabled/unset state. #68/#66 source integration is complete; record the residual dependency/abuse disposition above. Preview isolation must be established before any preview is exercised; a disabled automatic-preview toggle does not isolate existing URLs.
2. **Production version/schema/catalog preflight.** Under separately approved read-only access, verify PostgreSQL major/version; base result tables, columns, defaults/FKs/indexes and timestamp trigger; exact owner/RLS/force-RLS/view invoker definition; role membership/BYPASSRLS; effective table and every-column privileges; all policies and indirect function/view/rule paths. Use the proposed `mission05-authority-catalog-readonly.sql` metadata queries only after approval, supplemented with narrowly reviewed missing metadata checks. They have not been DB-executed here.
3. **Ledger and runner.** Verify pinned Supabase CLI 2.122.0 provenance, actual source/executor/ledger module, current migration ledger including known live-only/different-version entries and that M1 version 20261024030634 is not already applied. Never infer applied bytes from a ledger row. Do not rewrite or backfill history automatically. Existing PostgreSQL 18 tooling is not PG17 acceptance evidence.
4. **M1 execution rehearsal/approval.** Actual PG17 transaction/ledger atomicity, assertion rollback, lock contention, cancellation and timeout evidence remains blocked. Top-level statement_timeout is a hint, not a guaranteed 15-second file deadline; 3-second lock_timeout is per acquisition. No authored transaction boundary or transaction=false may be introduced. Obtain a permitted existing fixture/runner method; no new infrastructure, accounts or shared-staging mutation is authorized. If it cannot be provided, leave the gate blocked.
5. **Service-role configuration.** Confirm presence and server-only use through an approved non-secret configuration check. Do not reveal values. Confirm deployment is not depending on anonymous/authenticated fallback for result writes, that current profile checks use protected `is_banned === false`, and that history/attachment/read/delete authorization is preserved. Never fix failed saves by restoring client grants.
6. **Real authority acceptance.** With separately approved synthetic FK-valid fixtures and cleanup, establish actual anon/auth table/every-column/view INSERT/UPDATE/upsert/team_id/JSON-score/provenance denial with permission SQLSTATE 42501, not unrelated errors. Establish service save/read-back, authorized history/delete/attachment, status/trigger/CAS/concurrency and PostgREST/JWT behavior. Test scope, fake-ID allowlist, rollback/finally cleanup and cleanup verification must be approved. Source tests, EXPLAIN and mocks do not close this gate.
7. **Retention cron and deletion.** Verify real deployed machine-only authentication, service SELECT/DELETE rights, scheduling, clocks, request duration, sanitized `rateLimitCleanup` outcomes and observed backlog/throughput. Source cadence is 03:30 UTC daily; cutoff is invocation minus 60 seconds; bounds are five seconds, 100 rows/batch, 500 selected rows. Only a successful empty final probe reports complete. Partial/unverified/backlog is not retention acceptance.
8. **Independent cleanup activation risk.** **Deploying #60 can activate deletion on the next existing scheduled cron invocation even while evaluator generation is disabled.** Closing generation is not a cron/deletion kill switch. Review legacy key compatibility, current expired-record aggregate backlog and capacity before deployment. The earlier 47-record backlog is historical, not current evidence. No cron invocation, deletion, cleanup or email-report send is authorized here. Existing cron also performs reporting/streak/email behavior; HTTP 200 or email acceptance alone is not cleanup proof.
9. **Erasure/rotation.** Reconcile pseudonymous counter/token lifetimes, daily physical-cleanup lag, skipped/partial failures, account-erasure requirements and old/new key-rotation overlap. Do not promise immediate storage erasure or strict physical deadlines from the bounded daily cleanup. Existing account/file-erasure gaps remain unresolved.
10. **Provider acceptance/cost.** Separately approve bounded synthetic entitlement/model/quality/latency/native-PDF/text-mode and billable attempt/output/thinking limits. No paid budget is implied. Match provider-attempt telemetry with actual success/persistence and fixed request IDs; invalid output stays scoreless. Human advisory coaching is not automatic winner selection; #65 quality-policy changes remain excluded.
11. **Proxy/ingress.** Verify exact machine cron secret handling without exposing it, direct-versus-forwarded caller/IP trust, accepted proxy header policy, rate-limit identity and actual Vercel request-body behavior. R1's direct file cap is 4,000,000 bytes and multipart cap 4,100,000; downloaded-PDF processing stays 8 MiB. Offline byte tests are not proof of deployed ingress behavior.
12. **Old deployments and rollout.** Inventory production, preview and old deployment URLs/credentials without exercising unapproved endpoints. Drain in-flight old evaluator work before hardening. New default-closed APIs do not close older URLs or direct database grants. Perform approved core-page/history/runtime checks on the actual release only when authorized.

## Proposed deployment order and rollback

1. Review the now-integrated security patches and explicitly disposition residual dependency/abuse/lint warnings and required operational evidence. Keep generation disabled throughout. Provider-quality and full persistence acceptance are activation gates, not evidence to invent for an initial disabled-code rollout. Actual PG17/CLI rehearsal remains required before M1 execution; a compatible disabled-code rollout still needs explicit acceptance of its interim old-URL/direct-grant exposure and independent retention activation.
2. Founder separately approves exact candidate, target, service configuration, M1 bytes/runner, ledger action, a recovery/forward-repair plan and **retention deletion activation**. No database backup/copy is created or proposed as an action under the current authorization.
3. Deploy a compatible server-authoritative, generation-disabled build only after the cron/deletion implications are explicitly approved. Restrict/drain old deployment paths; verify the closed scoreless responses without starting generation.
4. Apply only M1 through the separately approved rehearsed execution path after fresh drift preflight; never directory-push historical migrations. Compatible code first, permission hardening next, then approved real denial/service/history/core-page verification.
5. Reconcile real retention execution/backlog/erasure and provider gates. Founder separately authorizes bounded provider smoke and then full generation activation if all gates pass. No merge/activation is authorized by this draft.

Rollback is generation closure plus a compatible server-authoritative application build or forward repair. **Never restore authenticated/anonymous result INSERT/UPDATE grants.** A pre-authority old build is not automatically compatible after M1. Stopping cleanup requires separate operational approval, reopens retention acceptance, and cannot restore already deleted expired keys. Do not reset active counters or resurrect expired counters to make retries work. Preserve historical results; no provenance backfill/certification is implied.

## Decisions at the founder checkpoint

- **Draft candidate publication: GO** after the repeated automation-safety verification and exact staged inventory. Existing one-time scoped authorization applies; keep #71 Draft and normally push only this release branch. No production authorization follows.
- **Generation-disabled source candidate: ready for final authorization. Actual production deployment: NO-GO currently.** The #66/#68 source blockers are closed, but real non-secret configuration/old-deployment and retention preflight and explicit acceptance/approval are pending. A disabled-only rollout can be considered before M1 only with explicit temporary direct-grant exposure acceptance; it does not establish database authority.
- **M1 execution: NO-GO.** Exact bytes/grammar are qualified, but actual PG17 transaction/ledger/rollback/lock evidence, fresh catalog/ledger drift and exact runner/recovery approval remain missing. PostgreSQL 18 tooling or mocks cannot substitute. If no approved existing PG17 fixture is available under the no-infrastructure restriction, this gate remains blocked.
- **Full evaluator activation: NO-GO**, additionally real PostgREST/JWT authority/persistence, retention/erasure, provider entitlement/quality/cost, proxy/ingress and actual runtime gates remain open.

Minimum next founder authorization: read-only existing-target catalog/ledger and non-secret release/retention aggregate/old-deployment metadata checks, naming the target and exact queries; no row data, writes, credential disclosure, cleanup or migration. These checks require no new infrastructure. Then separately approve the exact final candidate's merge/deployment with generation unset/false, its independent scheduled-retention deletion implications and any accepted interim grant/dependency/abuse risks. M1 and real mutation/provider acceptance need their own later approvals; willingness to accept risk is not permission to execute them. No infrastructure provisioning or broad redesign is proposed.

## Exact release inventory

Nine unchanged stack commits (integration adds one merge commit whose parents are current main and frozen R3):

- `6b250214d15339e12456d124ac360b9b8cf8083b fix: bound expired rate-limit maintenance to machine cron`
- `40023bf5350b8b19a1e4eeade950a7e81efe50b1 docs: align retention QA warnings with final build logs`
- `0861c28746f462e2f64bcdb0ad0ac703c533e5f7 fix: verify Idea identity and bound evaluator execution`
- `0f7863839faa59482ec2b1a2ae64f1dc68b5ef20 fix: validate presentation outcomes and recover interrupted evaluations`
- `d165dbe9435c55bd5bbf91986bd71d5d4338cb69 fix: enforce server-authoritative Mission 05 evaluation results`
- `f8e268dc643deca18bf62bb3a40728bc2d2aa32e fix: correct Mission 05 migration transaction handling`
- `df9ac950f67444832e3a221ebb66b1b11576b884 fix: correct challenge evaluator requirements and submission flows`
- `d196164697ce49f1d648bde330a124c0c08e9344 fix(evaluator): default-close generation and clarify historical provenance`
- `4cff459ce38036a04f44e98c728192cad10d038f test(evaluator): add M05-R3 offline database authority qualification`

Initial 57 paths relative to current main are listed below. The final candidate has **62 paths**: these 57 plus the five exact security paths in the integration table above. Only the history route, authority tests and this document differ from the exact frozen-stack/main inputs, apart from those reviewed security patches.

- `docs/plans/2026-10-23-evaluator-reliability-quality.md`
- `docs/plans/2026-10-24-mission05-security-remediation.md`
- `docs/qa/evaluator-reliability/README.md`
- `docs/qa/evaluator-reliability/challenge-failure-390.png`
- `docs/qa/evaluator-reliability/challenge-text-1440.png`
- `docs/qa/evaluator-reliability/idea-failure-390.png`
- `docs/qa/evaluator-reliability/legacy-mode-1440.png`
- `docs/qa/evaluator-reliability/results.json`
- `docs/qa/evaluator-reliability/team-text-390.png`
- `docs/qa/evaluator-reliability/team-visual-1440.png`
- `docs/qa/mission05-authority-catalog-readonly.sql`
- `docs/qa/mission05-challenge-correctness.md`
- `docs/qa/mission05-database-authority-verification.md`
- `docs/qa/mission05-generation-admission.md`
- `docs/qa/mission05-integrated-release.md`
- `scripts/check-mission05-sql.py`
- `scripts/fixtures/evaluator-benchmarks.cjs`
- `scripts/ppt-vision-harness.cjs`
- `scripts/test-admin-authorization.cjs`
- `scripts/test-challenge-correctness.cjs`
- `scripts/test-evaluator-cli-contract.cjs`
- `scripts/test-evaluator-generation-admission.cjs`
- `scripts/test-evaluator-reliability-browser.cjs`
- `scripts/test-evaluator-reliability.cjs`
- `scripts/test-evaluator-result-authority-pg17.cjs`
- `scripts/test-evaluator-result-authority.cjs`
- `scripts/test-ppt-vision.cjs`
- `scripts/test-rate-limit-retention.cjs`
- `src/app/api/challenges/[slug]/evaluate/route.ts`
- `src/app/api/challenges/[slug]/route.ts`
- `src/app/api/challenges/[slug]/submissions/route.ts`
- `src/app/api/cron/database-activity-report/route.ts`
- `src/app/api/evaluator/evaluate/route.ts`
- `src/app/api/evaluator/history/route.ts`
- `src/app/api/teams/[id]/ppt-evaluate/route.ts`
- `src/app/challenges/[slug]/page.tsx`
- `src/app/challenges/[slug]/submissions/[submissionId]/page.tsx`
- `src/components/LinkedIdeaScorecard.tsx`
- `src/components/PPTEvaluatorTab.tsx`
- `src/components/PitchAnalysisBadge.tsx`
- `src/components/PitchEvaluatorClient.tsx`
- `src/components/challenges/ChallengeLeaderboard.tsx`
- `src/lib/ai/geminiClient.ts`
- `src/lib/challenges/challengeEvaluationContract.ts`
- `src/lib/challenges/challengeEvaluatorEngine.ts`
- `src/lib/challenges/challengeExtractor.ts`
- `src/lib/evaluator/evaluationContract.ts`
- `src/lib/evaluator/evaluationProvenance.ts`
- `src/lib/evaluator/evaluatorBudgetGuard.ts`
- `src/lib/evaluator/evaluatorTypes.ts`
- `src/lib/evaluator/generationAdmission.ts`
- `src/lib/evaluator/rateLimitRetention.ts`
- `src/lib/evaluator/trackEvaluatorEngine.ts`
- `src/lib/ppt/analysisMetadata.ts`
- `src/lib/ppt/evaluatorEngine.ts`
- `src/lib/ppt/presentationExtractor.ts`
- `supabase/migrations/20261024030634_mission05_evaluator_result_authority.sql`
