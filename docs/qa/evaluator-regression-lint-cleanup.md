# Evaluator deadline and scoped lint remediation

Date: 2026-10-29. Repository: yashshah1211/HackerMate_Backup.
Branch: fix/evaluator-regression-lint-cleanup. Starting HEAD: a84370e6b42252073be6d5adbf9b12b157e6ff6d (PR #75).
All changes remain unstaged and uncommitted. No production, database, provider or deployment operations are part of this change.

## Root cause and correction

PR #73 deliberately allows up to 36 seconds of native-PDF plus eligible text evaluation, with a 16-second native attempt. The gateway previously stored a provider deadline using the PDF default and execution deadline, but omitted the caller's shorter totalTimeoutMs. Although the first invocation locally honored that shorter limit, fallback recalculated a relative timeout against the longer stored deadline.

The real engine/gateway reproduced admission deadlines [30000, 36000] for a 30-second caller and [10000, 16000] for a 10-second caller, each with a 50-second execution deadline. A deterministic native 503 at 15900 ms followed by a valid text response at 30500 ms returned a numeric score despite the caller's 30000 ms budget. This was a correctness defect; the existing explicit 30-second assertion was valid and is retained unchanged.

The gateway now stores the minimum of the execution deadline, existing provider deadline (or initial mode default), and current invocation's requested timeout. The deadline can only tighten on subsequent calls. Explicit 36-second PDF budgets, 16-second native attempts, 15-second text attempts, cancellation, two-attempt ceiling, models, prompts, scoring, admission and persistence contracts are preserved. The production route's outer 50-second execution and bounded persistence windows are unchanged. No production overrun beyond that outer execution cap was established by this investigation.

## Exact seven-file scope

1. src/lib/ai/geminiClient.ts — pin the original provider budget across fallback.
2. scripts/test-evaluator-reliability.cjs — retain the original case and add 18 real engine/gateway deadline and error/cancellation regressions.
3. src/components/CertificateModal.tsx — metadata extension values are unknown; consumed certificate/team strings are narrowed at runtime. Valid historical strings, null metadata and extra metadata remain supported; malformed values use existing defaults.
4. src/lib/admin/databaseActivityReport.ts — replace nine any callbacks with validated unknown-record readers and explicitly typed report arrays. Nullable timestamps/updater fields, skills, recruiting flags, object/singleton/null joins, fallback labels, counts and PDF output are covered. Existing query selections, filters and access paths are unchanged. Query errors retain safe SQL/PostgREST codes without raw messages, rows, credentials or personal data. Invalid required data produces a logged type error instead of silently becoming report output.
5. src/components/PitchEvaluatorClient.tsx — use router.push for the existing internal destinations; preserve opaque prefill IDs, nested login encoding and session storage.
6. scripts/test-evaluator-maintenance.cjs — 21 synthetic runtime cases plus their Node parent test (22 reported tests), exercising real report/PDF and component handler/effect code.
7. docs/qa/evaluator-regression-lint-cleanup.md — this handoff.

No package.json, package-lock.json, schema, migration, environment file or other source changes. package-lock.json SHA-256 remains 7abcf0b3b57e907e64bcfc3a7250a264a41e0c2d55021e8b8537aa0d12b73d3f. PRs #73/#74/#75 remain the baseline.

## Regression evidence

- Before correction, the original explicit-30s case failed (36000 !== 30000). The seven-case new deadline subset ran before the source fix: 4 passed, 3 failed, including the late successful-score reproduction.
- After correction, the original case and all 18 added deadline/error cases passed in the combined run. Tests exercise actual engine and gateway code with synthetic fetch/clock responses, including the 36s allowance after 30s, tighter existing/execution limits, native timeout, parent cancellation and ineligible failures.
- Combined 14-file offline run: 1318 tests; 1311 passed, 7 failed, 0 skipped/cancelled. Five failures are existing loopback socket checks blocked by Windows connect EACCES 127.0.0.1 (one admin HTTP case and four link-preview socket/TLS cases). No permission elevation or sandbox bypass was attempted.
- The other two reported failures were a new maintenance child equality assertion and its parent. The values matched but objects originated in different VM realms. The assertion now normalizes JSON-compatible values before deep equality; all expected fields remain asserted. The affected suite was rerun: 22/22 passed, 0 failed/skipped/cancelled. Accounting for that rerun, 1313 distinct reported cases have passing evidence; five runtime socket cases remain blocked. This is not a clean 1318/1318 run.
- Initial maintenance harness mistakes (omitted Dialog description and an incorrect history response envelope) were corrected to match actual component/API contracts. No application behavior was changed to accommodate the fixtures.
- Component tests execute real render/handler/effect code with synthetic framework controls, identity, transport and router. They cover authenticated/anonymous paths, exact nested URL encoding, prefill storage, storage failure, unconfirmed persistence, auth subscription cleanup and in-flight cancellation. They are not browser/Next routing acceptance tests. No Playwright or browser automation ran.

## Commands and results

All application checks use an allowlisted child environment, synthetic data and the reviewed loopback-only network guard. No live environment files or provider keys are loaded. The ignored scratch runner invokes the named commands without changing their assertions or lint rules.

Combined command (prefixed with node scratch/run-maintenance-offline.cjs):

~~~powershell
node --test --test-concurrency=1 scripts/test-evaluator-maintenance.cjs scripts/test-ppt-document-identity.cjs scripts/test-ppt-vision.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-generation-admission.cjs scripts/test-evaluator-result-authority.cjs scripts/test-challenge-correctness.cjs scripts/test-auth-return-paths.cjs scripts/test-auth-return-ui.cjs scripts/test-link-preview-security.cjs scripts/test-admin-authorization.cjs scripts/test-email-reliability.cjs scripts/test-rate-limit-retention.cjs scripts/test-event-compatibility.cjs
~~~

Affected-suite rerun: node --test --test-concurrency=1 scripts/test-evaluator-maintenance.cjs — 22/22 PASS.

TypeScript: npm run typecheck -- --incremental false --pretty false — PASS (exit 0).

Scoped lint: node node_modules/eslint/bin/eslint.js --max-warnings 0 src/lib/ai/geminiClient.ts scripts/test-evaluator-reliability.cjs scripts/test-evaluator-maintenance.cjs src/lib/ppt/analysisMetadata.ts src/lib/ppt/evaluatorEngine.ts src/components/PPTEvaluatorTab.tsx src/components/PitchEvaluatorClient.tsx src/components/CertificateModal.tsx src/lib/net/publicHttpFetch.ts src/lib/auth/returnPath.ts src/lib/admin/analyticsSummary.ts src/lib/admin/databaseActivityReport.ts src/app/api/link-preview/route.ts src/app/api/evaluator/evaluate/route.ts src/app/api/evaluator/history/route.ts 'src/app/api/teams/[id]/ppt-evaluate/route.ts' scripts/test-ppt-document-identity.cjs scripts/test-ppt-vision.cjs scripts/test-link-preview-security.cjs scripts/test-auth-return-paths.cjs — PASS (exit 0), 0 errors and 0 warnings across 20 files, versus the reproduced 10 errors/2 warnings before correction. No new rule suppressions.

Build: FAILED / ENVIRONMENT BLOCKED (exit 1). Exact command: node scratch/build-maintenance-offline.cjs, which launches node node_modules/next/dist/bin/next build --webpack using allowlisted synthetic configuration, offline fonts and the loopback-only guard. Webpack reported EPERM: operation not permitted, mkdir '.next/server/app/api/upload/presign'. The synthetic server recorded 0 reads and 0 mutations before compilation stopped. No production build PASS is claimed. No elevated retry or permission changes were attempted. Unsuppressed warnings concerned middleware deprecation, Sentry instrumentation/configuration and webpack cache serialization.

Full audit: BLOCKED (exit 1). Production-only audit: BLOCKED (exit 1). Both returned getaddrinfo ENOTFOUND registry.npmjs.org when contacting the official npm advisory bulk endpoint. npm also could not write its local cache log directory. Neither response contains a vulnerability report; zero current vulnerabilities is NOT attested. Historical PR #75 audit results were zero and the lockfile/installed versions remain unchanged, but historical results do not replace a fresh audit.

Exact audit commands (sanitized environment, no lifecycle scripts or dependency updates):

~~~powershell
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' audit --json --ignore-scripts --registry=https://registry.npmjs.org --no-fund --no-progress --fetch-retries=0 --fetch-timeout=15000
node 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' audit --json --ignore-scripts --registry=https://registry.npmjs.org --no-fund --no-progress --fetch-retries=0 --fetch-timeout=15000 --omit=dev
~~~

## Environment and remaining acceptance gates

PowerShell is explicitly authorized. Git Bash and CIM/WMI were not retried. The optional dependency junction failed (relative-target validation, then Access denied). Ordinary file copying reused the existing security-remediation installation without downloads or lifecycle scripts; all 673 present package manifests match this worktree's lockfile. Robocopy exit 1 means files copied, not a failed install. Lifecycle-enabled installation was not performed or independently verified.

Release/merge readiness: NO-GO pending the offline build, fresh full/production audits and five blocked socket cases. Draft source review may proceed with these limitations disclosed.

Five socket checks require a separately permitted local environment that can connect to its own loopback server. They must pass before claiming complete runtime acceptance. Existing link-preview transport source and its tests are unchanged. Browser routing and production performance/provider behavior remain unverified. No generation activation or release approval is implied.

Validation artifacts under ignored scratch/: maintenance-regressions.log, maintenance-runtime-final.log, maintenance-typecheck.log, maintenance-lint-final.log, maintenance-build.log and maintenance-audit-{full,production}.json. Helper scripts and copied dependencies are excluded from publication.

## Risks and rollback

Short caller budgets now stop on time rather than accepting late fallback scores. The shared gateway's other evaluator regressions passed, but no live model latency or production behavior was tested. Malformed report records now stop PDF generation with a safe logged error; valid nullable data and query-error empty fallbacks are retained. Client navigation preserves layouts instead of reloading the document; actual browser acceptance remains outstanding.

After a future reviewed publication, rollback should be a separately approved revert of this maintenance commit through the normal release process. That would reintroduce the fallback budget defect; assess that exposure before rollback. Do not revert PR #75's dependency fixes, alter node_modules, restore client database grants, change generation settings, or run migrations as rollback.

## Final review and evidence classification

This final pass reviewed the complete tracked diff against a84370e6b42252073be6d5adbf9b12b157e6ff6d and the complete two new files. Separate read-only standards and specification reviews found no introduced application defect. The standards review identified insufficient exit/SHA guards in the earlier manual publication block; that documentation defect is corrected below. The publication block also requires exactly one expected push URL during preflight and immediately before push, so a separate or multiple pushurl configuration cannot redirect publication. The specification review requested an explicit Draft PR body and clearer evidence categories; both are supplied here. These agent reviews are source reviews, not independent execution of validation or external acceptance.

Confirmed from the source and recorded tests:

- The shared provider deadline is monotonic: it is at most the execution deadline, any existing shared deadline, and the current caller timeout. PDF-to-text fallback cannot renew it.
- A granted 36s PDF allowance remains available; the engine's native 16s attempt cap, text 15s attempt cap, retry ceiling, cancellation and failure eligibility are unchanged.
- The original explicit-30s regression block is byte-for-byte unchanged after line-ending normalization. It passes in the recorded candidate run.
- Certificate metadata extension values remain compatible; valid strings are preserved, null metadata is supported, and malformed consumed values use safe defaults.
- All admin query selection/filter/ordering calls are unchanged. Nullable joins/columns are narrowed, query failures retain safe error codes before the existing empty fallback, and malformed required fields fail explicitly. Query failures are logged before retaining the existing empty-result fallback. Reports can still be partial after a query failure; this preserved behavior is a compatibility limitation, not evidence that the failed query succeeded.
- Router destinations, storage payload, opaque ID encoding and nested login return-path encoding are unchanged. The component cleanup still aborts in-flight work and unsubscribes identity callbacks. Real Next.js navigation remains an acceptance gap.
- Model identifiers, scoring, prompts, admission, protected engine/route/contract source, dependencies, migrations and environment files are unchanged.

| Evidence category | Exact status |
| --- | --- |
| Recorded verified passes | Original deadline case plus 18 added cases: 19/19. Corrected maintenance rerun: 22/22. TypeScript exit 0. Scoped lint: 0 errors, 0 warnings across 20 files. These are reviewed earlier execution logs, not reruns during this final source review. |
| Historical pre-existing failures | Original deadline assertion failed before correction; baseline scoped lint had 10 errors and 2 warnings. These issues are fixed in the candidate's executed checks. The five socket failures are environment-blocked checks, not established pre-existing application defects. |
| Candidate-specific failures, corrected | Initial targeted run: 34/39 passed; 4 maintenance child failures plus their parent arose from fixture mistakes (Dialog description omitted; incorrect history envelope). The subsequent maintenance run passed 21/21. After adding further assertions/cases, the combined run reported the cross-VM equality child failure plus its parent. JSON-value normalization corrected that assertion; final maintenance rerun passed 22/22. No outstanding introduced functional failure was identified by the executed checks or source review; unexecuted acceptance remains unknown. |
| Initial combined run | 1311/1318 passed, 7 failed, 0 skipped/cancelled: 5 socket/environment failures plus the cross-VM assertion and its parent. Do not present the later 22/22 affected-suite rerun as a clean full-suite rerun. |
| Environment-blocked checks | Five loopback socket cases: EACCES. Build: EPERM creating .next/server/app/api/upload/presign. Both fresh npm audits: registry ENOTFOUND, with local cache-log write error. None is reported PASS. |
| Final-pass rerun decision | One 2.5-second maximum loopback readiness probe was executed through the same allowlisted/guarded runner: BLOCKED, EACCES, exit 1. The full-suite precondition is still unmet. The complete suite was not rerun; blocked socket tests, build and audits were not repeatedly retried. No privilege/security changes were made. |
| Not performed / unverified | A clean complete-suite run; successful production build of this candidate; fresh audit vulnerability counts; actual Next.js/browser navigation; lifecycle-enabled clean installation; live Gemini or production acceptance. No browser, paid provider, deployment or production database checks were performed. |

The cross-VM correction is meaningful for the tested report DTOs: their allowed fields are JSON-compatible strings, nulls and string arrays. It compares the same expected keys and values while excluding realm-specific prototypes, which are not part of the report contract. Separate direct assertions retain null/type checks, and malformed required values are tested for rejection. It is not evidence for arbitrary class instances, undefined values or non-JSON data; those are outside these fixture contracts. No test was skipped, removed, or assigned a weaker expected report value.

The loopback preflight command was node scratch/run-maintenance-offline.cjs scratch/maintenance-loopback-preflight.cjs. It binds and connects only to a disposable 127.0.0.1 socket, closes its owned resources, and has a 2500ms timeout. No service, database or provider is contacted.

## Manual publication (founder only)

Do not publish as release-ready. Independent review and the blocked socket checks remain required. Check the seven-file inventory, empty index, base and complete diff first; no other files may be staged.

~~~powershell
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\evaluator-regression-lint-cleanup'
$ExpectedBase = 'a84370e6b42252073be6d5adbf9b12b157e6ff6d'
$ExpectedBranch = 'fix/evaluator-regression-lint-cleanup'
$ExpectedFiles = @(
  'src/lib/ai/geminiClient.ts'
  'scripts/test-evaluator-reliability.cjs'
  'src/components/CertificateModal.tsx'
  'src/lib/admin/databaseActivityReport.ts'
  'src/components/PitchEvaluatorClient.tsx'
  'scripts/test-evaluator-maintenance.cjs'
  'docs/qa/evaluator-regression-lint-cleanup.md'
)
function Invoke-CheckedGit {
  param([string[]]$GitArguments)
  $OutputLines = @(& git @GitArguments)
  $GitExitCode = $LASTEXITCODE
  if ($GitExitCode -ne 0) { throw ('Git failed ({0}): {1}' -f $GitExitCode, ($GitArguments -join ' ')) }
  return $OutputLines
}
function Assert-ExactFiles {
  param([string[]]$ActualFiles)
  if (Compare-Object ($ExpectedFiles | Sort-Object) ($ActualFiles | Sort-Object)) { throw 'Unexpected file inventory' }
}
function Get-RemoteBranchSha {
  param([string]$BranchName)
  $RemoteLines = @(Invoke-CheckedGit -GitArguments @('ls-remote', '--exit-code', '--heads', 'origin', $BranchName))
  if ($RemoteLines.Count -ne 1) { throw 'Expected exactly one remote branch result' }
  $Fields = $RemoteLines[0] -split '\s+'
  if ($Fields.Count -ne 2 -or $Fields[1] -ne "refs/heads/$BranchName" -or $Fields[0] -notmatch '^[0-9a-f]{40}$') { throw 'Invalid remote branch result' }
  return $Fields[0]
}
if ((Invoke-CheckedGit -GitArguments @('branch', '--show-current')) -ne $ExpectedBranch) { throw 'Wrong branch' }
if ((Invoke-CheckedGit -GitArguments @('rev-parse', 'HEAD')) -ne $ExpectedBase) { throw 'Unexpected HEAD' }
if ((Invoke-CheckedGit -GitArguments @('remote', 'get-url', 'origin')) -ne 'https://github.com/yashshah1211/HackerMate_Backup') { throw 'Wrong origin' }
$PushUrls = @(Invoke-CheckedGit -GitArguments @('remote', 'get-url', '--push', '--all', 'origin'))
if ($PushUrls.Count -ne 1 -or $PushUrls[0] -ne 'https://github.com/yashshah1211/HackerMate_Backup') { throw 'Unexpected push destination' }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath 'package-lock.json').Hash.ToLowerInvariant() -ne '7abcf0b3b57e907e64bcfc3a7250a264a41e0c2d55021e8b8537aa0d12b73d3f') { throw 'Lockfile drift' }
Invoke-CheckedGit -GitArguments @('status', '--short')
$TrackedFiles = @(Invoke-CheckedGit -GitArguments @('diff', '--name-only'))
$NewFiles = @(Invoke-CheckedGit -GitArguments @('ls-files', '--others', '--exclude-standard'))
Assert-ExactFiles -ActualFiles @($TrackedFiles + $NewFiles)
if (@(Invoke-CheckedGit -GitArguments @('diff', '--cached', '--name-only')).Count -ne 0) { throw 'Index is not empty' }
Invoke-CheckedGit -GitArguments @('diff', '--check')
if ((Get-RemoteBranchSha -BranchName 'main') -ne $ExpectedBase) { throw 'Remote main changed; review before publication' }
if (@(Invoke-CheckedGit -GitArguments @('ls-remote', '--heads', 'origin', $ExpectedBranch)).Count -ne 0) { throw 'Remote feature branch already exists; inspect before publication' }
Invoke-CheckedGit -GitArguments @('diff', '--')
Get-Content -LiteralPath 'scripts/test-evaluator-maintenance.cjs'
Get-Content -LiteralPath 'docs/qa/evaluator-regression-lint-cleanup.md'
if ((Read-Host 'After reviewing the complete seven-file candidate, type STAGE') -cne 'STAGE') { throw 'Stopped before staging' }

# Only the exact seven approved paths are staged.
Invoke-CheckedGit -GitArguments @('add', '--',
  'src/lib/ai/geminiClient.ts',
  'scripts/test-evaluator-reliability.cjs',
  'src/components/CertificateModal.tsx',
  'src/lib/admin/databaseActivityReport.ts',
  'src/components/PitchEvaluatorClient.tsx',
  'scripts/test-evaluator-maintenance.cjs',
  'docs/qa/evaluator-regression-lint-cleanup.md')
$StagedFiles = @(Invoke-CheckedGit -GitArguments @('diff', '--cached', '--name-only'))
Assert-ExactFiles -ActualFiles $StagedFiles
Invoke-CheckedGit -GitArguments @('diff', '--cached', '--')
Invoke-CheckedGit -GitArguments @('diff', '--cached', '--check')
if (@(Invoke-CheckedGit -GitArguments @('diff', '--name-only')).Count -ne 0) { throw 'Unstaged tracked changes remain' }
if (@(Invoke-CheckedGit -GitArguments @('ls-files', '--others', '--exclude-standard')).Count -ne 0) { throw 'Unexpected untracked files remain' }
if ((Read-Host 'After inspecting the staged diff, type COMMIT') -cne 'COMMIT') { throw 'Stopped with index available for review' }
Invoke-CheckedGit -GitArguments @('commit', '-m', 'fix: preserve evaluator deadlines and resolve scoped lint')
$CommitSha = Invoke-CheckedGit -GitArguments @('rev-parse', 'HEAD')
if ((Invoke-CheckedGit -GitArguments @('rev-parse', 'HEAD^')) -ne $ExpectedBase) { throw 'Unexpected commit parent' }
Assert-ExactFiles -ActualFiles @(Invoke-CheckedGit -GitArguments @('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'))
if (@(Invoke-CheckedGit -GitArguments @('status', '--porcelain')).Count -ne 0) { throw 'Worktree is not clean after commit' }
if ((Invoke-CheckedGit -GitArguments @('branch', '--show-current')) -ne $ExpectedBranch) { throw 'Branch changed' }
if ((Get-RemoteBranchSha -BranchName 'main') -ne $ExpectedBase) { throw 'Remote main changed; review before push' }
if (@(Invoke-CheckedGit -GitArguments @('ls-remote', '--heads', 'origin', $ExpectedBranch)).Count -ne 0) { throw 'Remote feature branch appeared; inspect before push' }
if ((Read-Host 'Type PUSH to publish this independent-review candidate only') -cne 'PUSH') { throw 'Stopped before push' }
$PushUrls = @(Invoke-CheckedGit -GitArguments @('remote', 'get-url', '--push', '--all', 'origin'))
if ($PushUrls.Count -ne 1 -or $PushUrls[0] -ne 'https://github.com/yashshah1211/HackerMate_Backup') { throw 'Unexpected push destination' }
Invoke-CheckedGit -GitArguments @('push', '--no-follow-tags', '--set-upstream', 'origin', 'fix/evaluator-regression-lint-cleanup:refs/heads/fix/evaluator-regression-lint-cleanup')
$RemoteSha = Get-RemoteBranchSha -BranchName $ExpectedBranch
if ($RemoteSha -ne $CommitSha) { throw 'Remote SHA mismatch; stop and reconcile without force/retry' }
if ((Invoke-CheckedGit -GitArguments @('rev-parse', 'HEAD')) -ne $CommitSha) { throw 'Local HEAD changed' }
if (@(Invoke-CheckedGit -GitArguments @('status', '--porcelain')).Count -ne 0) { throw 'Worktree is not clean' }
Write-Output "Local commit: $CommitSha"
Write-Output "Remote branch: $RemoteSha"
Write-Output 'Published branch for Draft independent review only; no PR creation or merge executed.'
~~~

## Draft PR description (copy after manual branch publication)

Title: fix: preserve evaluator deadlines and resolve scoped lint

Base: main. Head: fix/evaluator-regression-lint-cleanup. Status: Draft.

> This PR is for independent review only. Build, full regression suite and fresh security audits require independent verification before merge.

The PPT gateway previously allowed PDF-to-text fallback to renew a shorter caller timeout against a longer stored provider deadline. A synthetic 30-second request could return a validated score at 30.5 seconds. Pin the shared absolute deadline to the caller budget while preserving the granted 36-second PDF allowance, 16-second native attempt, two-attempt ceiling and existing cancellation/error behavior. Retain the original explicit-30-second assertion and add 18 real engine/gateway regressions.

Also replace 10 unsafe any usages with metadata narrowing and validated admin report field readers, preserving valid nullable data and query contracts. Use Next.js router navigation for the two existing internal destinations while retaining session-storage prefill, opaque IDs, login return-path encoding and cleanup. No scoring/model/prompt, dependency, schema, migration or environment changes.

Validation:

| Check | Recorded result / limitation |
| --- | --- |
| Deadline regressions | 19/19 passed, including the unchanged original case |
| Maintenance runtime tests | Corrected rerun: 22/22 passed |
| Initial combined regression run | 1311/1318 passed; 7 failed: 5 blocked socket cases plus the corrected cross-VM child assertion and its parent |
| Complete-suite acceptance | Not verified cleanly; the affected-suite rerun is not a full-suite rerun. A later bounded readiness probe still returned EACCES. |
| Scoped ESLint | 0 errors, 0 warnings across 20 files |
| TypeScript | Passed |
| Offline production build | Blocked: EPERM creating .next/server/app/api/upload/presign |
| Fresh full and production npm audits | Blocked: registry.npmjs.org ENOTFOUND; no vulnerability count available |

Remaining merge gates: independently run the full regression suite, successful offline production build and both fresh audits in a permitted environment. Real browser routing, lifecycle-enabled installation and live-provider/production acceptance have not been verified here. No paid calls, production access, deployments, merges or Git publication were executed by the agent.

The cross-VM assertion now compares the same JSON-compatible expected fields/values across realms; separate null/type/malformed-data assertions remain. No tests or lint rules were weakened or suppressed. See this QA report for command lines, initial failure history, evidence classification and rollback considerations.

Rollback, if separately approved after eventual publication: revert this maintenance commit through the normal reviewed release process. That reintroduces the deadline defect; preserve PR #75's dependency remediation and all database/generation controls.



Final Git review: exactly five modified and two new approved files; index empty; HEAD unchanged; git diff --check passed. An optional whole-file whitespace probe flagged existing gateway comment whitespace; comparison with HEAD confirmed those lines unchanged, and no unrelated whitespace cleanup was made. New-file whitespace checks passed. The original main worktree remains at 5454f57d4ba8baf98b277589a2eb6e9584610397 with its existing untracked .kiro/ directory preserved.
