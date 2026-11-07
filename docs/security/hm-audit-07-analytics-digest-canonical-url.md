# HM-AUDIT-07 — canonical analytics digest workflow

Base: `311d8af8b95bbd5e4f988b21c3eb6004911ac255`.
Branch: `fix/hm-audit-07-analytics-digest-canonical-url`.

**Verdict: READY FOR PR**, with the disclosed Windows baseline failure, historical verification incident and residual limits below. Both independent review axes have zero remaining actionable findings. This means ready for independent PR review, not permission to publish, merge or dispatch production email. Publication is not authorized for this finding. Nothing has been staged, committed, pushed, merged or deployed.

## Root cause and investigation

The manually triggered analytics-digest workflow interpolated SITE_URL and CRON_SECRET directly into executable shell, defaulted to the apex origin, and POSTed to `/api/cron/analytics-summary` without following redirects. The apex redirects to www, so the request could return 308 without executing the route. HTTP failure was detected, but the intended digest was never requested at its canonical destination. Adding curl redirect following would obscure the destination and credential policy.

Fresh origin/main matched the supplied base before creating this isolated worktree. An unauthenticated HEAD to the public apex **homepage only** on 2026-11-07 returned HTTP 308 with Location `https://www.hackermate.in/`. No authenticated request was needed to establish the redirect.

The old shell mixed the response body and status with a textual marker, printed the full operational response, and did not explicitly bound transport duration or distinguish transport failure. Secret expression interpolation also allowed shell syntax in configured values to become executable source.

The database-report workflow provides the reference canonical-origin, environment, timeout, no-follow/no-retry and private-response principles. Its receipt fields are different and were not copied. That workflow remains unchanged.

## Exact scope

Exactly four files:

1. `.github/workflows/analytics-digest.yml`
2. `.github/workflows/pr-validation.yml`
3. `scripts/test-analytics-digest-workflow.cjs`
4. `docs/security/hm-audit-07-analytics-digest-canonical-url.md`

No route, application, SQL, recipient, secret value, dependency manifest/lockfile, AGENTS.md or unrelated workflow changes. HM03 signed tracking, HM04 deletion, HM05 restoration suppression and HM06 organizer claims are preserved. No migration is needed.

## Origin, authorization and single-request policy

- Only exact `https://hackermate.in` and `https://www.hackermate.in` are accepted; both become `https://www.hackermate.in` before Authorization is sent.
- Empty or unset SITE_URL uses that canonical default. Whitespace, HTTP, credentials, ports, trailing slash/path, query, fragment, host lookalikes and malformed values are refused without a request. Invalid inputs are not printed.
- GitHub secrets enter only through step `env`. Quoted shell expansions preserve values as literal arguments. Missing or CR/LF-containing CRON_SECRET fails before curl. No secret or Authorization header is printed.
- The sole outgoing request remains POST to `/api/cron/analytics-summary`, with its existing Bearer header and JSON Content-Type. There is no PDF query parameter, endpoint or recipient change.
- `curl --disable` is first, ignoring user curl configuration that could enable tracing, redirects or additional requests. HTTPS only, zero redirects, zero automatic retries, 15-second connect timeout and 240-second overall timeout are explicit. The job timeout is five minutes.
- HTTP status is captured separately from the body. A nonzero curl exit fails independently of any HTTP status/body already received, reports transport uncertainty and does not resend. Only a three-digit HTTP 200 advances to receipt parsing.
- All 3xx fail without following Location; 401/403 report authorization failure; other statuses, including 429/500, report unconfirmed acceptance. No response body is emitted. Temporary response storage is removed by an EXIT trap on normal success/failure.
- `workflow_dispatch` is the only trigger. No recurring schedule, workflow retry, second send step or automatic resend was added. Token permissions are limited to contents read.

The route still permits local-development access and requires exact Bearer authorization in production before any database/provider operation. Its existing GET/PDF paths and POST implementation are untouched. This is a caller fix, not a redesign of route authentication.

## Analytics-specific acceptance contract

Real route success requires provider acknowledgement and returns:

```json
{
  "success": true,
  "resendId": "provider-receipt",
  "dispatch": { "status": "accepted", "providerStatus": 201 }
}
```

The workflow requires exactly one JSON document, boolean `success === true`, accepted dispatch, non-whitespace string resendId, and an integer providerStatus from 200 through 299. Empty, concatenated, malformed, incomplete, rejected and unknown responses fail closed. jq output/errors are suppressed so neither report contents nor parse excerpts enter logs. The regex uses a POSIX whitespace character class, avoiding native Windows jq argument escaping differences.

It intentionally does not require the shared dispatcher's attempted/intendedRecipientAccepted/sandbox fields: analytics-summary does not return them. A valid acknowledgement means **provider acceptance; delivery is not confirmed**. Existing configured analytics recipient/sandbox behavior is unchanged. A validated receipt does not prove that the configured recipient was the operator's intended recipient, that the PDF contained complete measurements, or that a human read it. Partial analytics remain partial.

The route returns 401 for failed production authentication, 503 when provider configuration is absent, 502 for rejected or uncertain provider results, and 500 for report-generation errors. The workflow treats every non-200 as failure and makes no unsafe inference that an uncertain email was not sent. Accepted-but-lost responses require provider-history review before another manual invocation.

## Verification and evidence

All final dynamic workflow cases execute the actual Bash obtained by parsing YAML; the request/status/JSON logic is not separately reimplemented. A read-only Bash curl function is defined before that shell runs, records calls and exact NUL-separated arguments, copies a synthetic body and returns controlled transport/status results. This avoids dependence on PATH ordering. Bash/jq are real executables. Fixtures contain reserved-invalid addresses and synthetic credentials; no .env is loaded. Every temporary fixture directory is removed in finally.

| Check | Confirmed local result |
| --- | --- |
| New actual-workflow tests | 103 passed, zero failures/skips; `hm07-workflow-final.log` |
| Existing analytics/PDF/auth + email reliability + signed tracking + organizer pitch/scheduler selection | 239 passed, zero failures/skips; `hm07-email-regressions.log` |
| TypeScript | PASS, `npm run typecheck -- --incremental false --pretty false`; `hm07-typecheck.log` |
| Changed-file ESLint | PASS, zero diagnostics; `hm07-lint-final.log` |
| YAML parsing | Both changed workflows parsed with existing lockfile-provided js-yaml; covered by new tests |
| Shell syntax | Actual workflow `bash -n` passed; covered by new tests |
| ShellCheck | Not available on this machine; not claimed as executed |
| Exact updated PR offline selection | 1,584 tests: 1,583 passed, one unchanged Windows CRLF baseline failure, zero skipped/cancelled/todo; exit 1; `hm07-pr-offline-final.log` |
| Diff check | `git diff --check` passed |

Counts overlap and must not be added as unique tests. The new tests cover allowed/default origins, rejected URL forms, missing/multiline secrets, shell metacharacters as literal secret content, exact POST/Authorization/destination, no follow/retry/tracing, HTTP 307/308 and other statuses, timeout/DNS/connect/TLS/write failures even with HTTP 200, invalid status output, malformed/multiple JSON documents, invalid receipts/provider statuses, rejected/unknown outcomes, acceptance-vs-delivery wording, private logs and response-file cleanup. They pin manual-only triggering and unchanged reference workflow content after checkout newline normalization.

CI now registers both this workflow test and the existing analytics-summary PDF/auth/email test in the existing offline selection. No assertions were removed, weakened or skipped. The production build was not rerun: no application, dependency or build configuration changed. Local verification used Windows/Node 24.17, Git Bash and checksum-verified portable jq 1.8.2 under ignored build storage. CI uses Ubuntu/Node 22 and the runner's jq. Local checks are not newly executed GitHub Actions or deployed end-to-end verification.

### Unchanged Windows baseline

The existing `scripts/test-database-report-workflow.cjs:11` requires the exact LF-only marker `run: |\n`, but the unchanged database-report workflow has Windows CRLF checkout. This produces `1 !== 2` before its tests run. Both source files match reviewed main after newline normalization. Neither was altered, normalized, excluded or skipped. The reference-content assertion in the new test normalizes only its in-memory comparison; it does not modify the file or that existing test.

### Verification incident and corrected harness

The first new harness used an executable curl fixture prepended to PATH. Git Bash prepends its own binary directories during startup and selected system curl instead. That initial run therefore made requests to the live analytics-summary endpoint using only the literal **synthetic** test token; observed responses were HTTP 401. This violated the intended offline-only test boundary. Do not characterize this task as having made no live endpoint contact.

After identifying the failure, the PATH-based interception was replaced with a read-only Bash function installed and checked before execution of the workflow. The initial suite had already completed; it was not cancelled early. The final 103-case run recorded fixture calls/arguments and passed; subsequent full-selection verification uses this corrected harness. The initial requests had no real CRON_SECRET/provider credentials, and the unchanged route rejects a 401 request before analytics/database/provider work. No real email, live database/claim/quota mutation, deployment, production secret change or production workflow dispatch was performed. The issue and correction were reported to the owner during work and reviewed independently.

A second local harness failure involved native Windows jq backslash handling. Direct native invocation confirmed the JSON predicate itself; actual Bash/native-jq execution then exposed the escape loss. Using the equivalent POSIX character class resolved it. Final results above supersede the failed intermediate runs, which remain in ignored local logs.

## Deployment prerequisites and rollout — owner only, not executed

1. Independently review the four-file diff against fresh main. Confirm SITE_URL is empty or one of the two exact supported origins. Trailing slash and other variants intentionally fail; inspect configuration privately, never print secret values.
2. Confirm GitHub's existing CRON_SECRET matches the production application's existing CRON_SECRET, and the application's current provider/sender/analytics-recipient configuration is correct. No new secret is required, and this change does not edit any configuration.
3. Have the repository owner publish the scoped branch/PR under workspace rules. Let normal PR checks run, distinguish local baseline failures from actual CI, review and merge separately. This task does not authorize those operations or merging.
4. Once approved workflow changes are on main, subsequent explicitly authorized manual dispatches must select the reviewed main revision. No application deployment, Supabase migration or schedule registration is required. Old workflow revisions can retain the old behavior, so do not select one for recovery.
5. This task does not trigger production verification. Metadata/configuration review and synthetic offline receipt tests are the handoff evidence. Any future real digest request needs separate operational authorization and may send email.
6. If a manual invocation has a transport/non-200/invalid-receipt outcome, inspect provider records and reconcile whether it was accepted before considering another manual run. Do not automatically rerun the workflow or assume no delivery from a timeout.

## Safe rollback and residual risks

Prefer a forward workflow correction. If the caller must be paused, stop manual invocations/disable this manually triggered workflow while investigating. Do not recover by adding -L, enabling curl retries, echoing the body/header, selecting the old unsafe workflow revision, or rerunning an uncertain request. No database or secret rollback is needed.

This change controls one invocation's destination and request count. Analytics-summary has no durable cross-invocation dispatch ledger or idempotency key. Separate intentional/repeated manual runs can still send duplicate digests; no global exactly-once guarantee is claimed. Workflow/job interruption after provider acceptance can leave the caller uncertain, and a hard runner termination may prevent its cleanup trap. Provider-history review remains necessary. Standard hosted-runner/HTTPS trust, jq availability and valid existing application configuration remain prerequisites. No new recipient validation, quota reservation, analytics measurement or provider retry policy is introduced.

## Independent adversarial review

- Standards/security reviewer: zero actionable implementation findings. Confirmed exact origins, quoted env secrets, CR/LF checks, --disable ordering, single POST/no redirects/retries, timeout/status separation, analytics-specific receipt and corrected curl-function interception. No code-smell issue justified scope expansion.
- Spec reviewer: zero actionable implementation findings. Confirmed actual response contract, coverage, no schedule/route/SQL/recipient change and actual-shell execution. Required explicit disclosure of the live synthetic-token test incident.
- Both reviewers also reviewed this handoff and completed full-selection evidence. Zero remaining Standards/security findings; zero remaining Spec findings. The Spec reviewer requested accurate wording that the initial test run had completed before its harness was replaced; that documentation correction is included. Neither axis requested another implementation change.

## Guarded owner publication handoff

No HM07 publication exception exists. The assistant leaves this branch unstaged and uncommitted. After independently reviewing all four files and current main, the repository owner can use explicit staging only:

```powershell
Set-Location 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hm-audit-07-analytics-digest-canonical-url'
git status --short --untracked-files=all
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
if ((git branch --show-current) -ne 'fix/hm-audit-07-analytics-digest-canonical-url') { throw 'Wrong branch' }
if ((git rev-parse HEAD) -ne '311d8af8b95bbd5e4f988b21c3eb6004911ac255' -or
    (git rev-parse origin/main) -ne '311d8af8b95bbd5e4f988b21c3eb6004911ac255') { throw 'Base moved; review before publication' }
if (git diff --cached --name-only) { throw 'Unexpected staged changes' }
$files = @(
  '.github/workflows/analytics-digest.yml'
  '.github/workflows/pr-validation.yml'
  'scripts/test-analytics-digest-workflow.cjs'
  'docs/security/hm-audit-07-analytics-digest-canonical-url.md'
)
$changed = @((git diff --name-only); (git ls-files --others --exclude-standard)) | Sort-Object -Unique
if (Compare-Object ($files | Sort-Object) $changed) { throw 'Unexpected scope; review before staging' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged check failed' }
git diff --cached --stat
git diff --cached
# Continue only after reviewing the complete staged diff:
git commit -m 'fix(actions): secure analytics digest canonical endpoint trigger'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push -u origin fix/hm-audit-07-analytics-digest-canonical-url
if ($LASTEXITCODE -ne 0) { throw 'Normal push failed; do not force-push' }
gh pr create --base main --head fix/hm-audit-07-analytics-digest-canonical-url --title 'fix(actions): harden analytics digest canonical endpoint request' --body-file docs/security/hm-audit-07-analytics-digest-canonical-url.md
```

Publication does not authorize a production workflow invocation, real email, production configuration, deployment, merge or HM-AUDIT-08.
