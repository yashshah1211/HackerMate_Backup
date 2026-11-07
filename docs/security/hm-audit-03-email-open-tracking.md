# HM-AUDIT-03: authenticated organizer email tracking

Base: latest fetched `origin/main`, `109d744` (2026-11-07). Branch:
`fix/hm-audit-03-signed-email-tracking`. No production database writes,
emails, tracking requests, deployment, merge, staging, commits or pushes were
performed for this work. The final review read live database metadata in explicit
READ ONLY transactions; no lead records were read. This document is the release
readiness report and proposed PR body.

## Root cause and scope

The public GET handler used a lead UUID as authorization to read and update
`organizer_leads` with service-role credentials. Concurrent read/modify/write
increments could overwrite one another. Its update also touched suppressed leads.

Only two existing paths emit tracking pixels:

- `src/app/api/admin/send-organizer-pitch/route.ts` (manual pitch).
- `src/lib/admin/autoSendPitches.ts` (automatic pitch).

Both now use `src/lib/emailOpenTracking.ts`. Scheduled organizer outreach in
`src/lib/admin/scheduledOrganizerOutreach.ts` does not emit tracking pixels and
is unchanged. Dispatch, recipients, reply-to, subjects, rate limits, quotas,
provider acceptance handling and CRM dispatch bookkeeping are unchanged. Automatic
eligibility now also excludes nonempty `last_sent_to` evidence when a historical
timestamp is missing; blank/whitespace metadata still permits fresh contacts. Sandbox
emails still have no pixel. No packages were added or changed.

## Adversarial review decision

**READY FOR PR**, with the existing lint/Windows baseline failures disclosed.
Production rollout is still gated on the secret, reviewed migration, ACL checks,
and compatible sender/verifier deployment. Latest main was fetched again for the
final review and remains `109d744d76593a96af1f1c9c660f49cb3f04fce5`.

### Standards review

Independent review found no hard workspace-standard violation in the final
10-file diff. New files have no lint diagnostics. No table permissions were
changed, no production tests wrote records, and synthetic clusters use `finally`
cleanup. Staging, committing and pushing remain reserved to the owner.

### Specification review

Two reproduced correctness defects were fixed during final review: early
first-send prefetch could defeat contact bookkeeping; last-recipient-only
historical rows could be automatically contacted again. Both now have real SQL
regressions. Cleanup documentation was corrected after proving the helper has
no runtime caller. No HMAC/authentication bypass, RPC privilege bypass, lost
counter update, or suppression revival was found in the final tracking path.

Existing HMAC helpers in `src/lib/hustle-phase2/core.ts` are event-specific and
expire quickly; their tokens/secrets cannot safely authorize organizer tracking.
The same built-in Node crypto primitives are used with a separate purpose and
key. Svix verifies provider POST callbacks, not recipient GET image requests.
Existing rate-limit helpers concern other endpoints; no limits were changed.

## Security design and behavior

- A 32-byte, server-only key signs `hackermate:email-open:v1:<lowercase UUID>`
  with HMAC-SHA256. URLs contain `id` and a 64-character hex `sig`.
- UUID syntax, signature syntax/length, duplicate parameters and configuration
  are checked before using `timingSafeEqual` on equal-size buffers. The handler
  creates no privileged client until authentication succeeds.
- Invalid, unsigned, missing-key, nonexistent and suppressed requests return the
  original transparent 1x1 GIF with identical status/content/cache headers. There
  is no row data, existence result or internal error in the HTTP response.
- A valid request calls `public.record_organizer_email_open(uuid)` once. SQL
  increments `COALESCE(open_count, 0) + 1` in one UPDATE. Row locking prevents
  lost updates and rechecks suppression after a concurrent writer commits.
- All tracking mutations require persisted `pitch_sent_at` evidence. Even a
  correctly signed request leaves a never-contacted lead completely unchanged.
  This prevents an early provider/proxy image fetch from changing `new` before
  the sender's status compare-and-set records recipient and timestamp.
- Among previously sent leads, `new` and `pitch_sent` become `opened`.
  `opened`, `replied`, `negotiating`, and
  `partner_live` retain status while updating the count and latest-open time.
  `removed`, `archived`, `no_email`, `email_outcome_unknown`, NULL and every
  unrecognized status remain completely unchanged, including timestamps.
- The function returns void, is `SECURITY INVOKER`, uses an empty `search_path`
  and a qualified table name. PUBLIC/anon/authenticated cannot execute it;
  service_role can. No table grants, column grants or RLS policies are changed.
- Database failures are logged with their actual error server-side and still
  return the image. No signing keys, URLs or request tokens are logged by the
  tracking code. Senders warn when a pixel cannot be signed and omit it, while
  preserving email delivery. There is no unsigned fallback.

## Compatibility policy: previously delivered unsigned emails

Old `?id=<UUID>` URLs cannot be authenticated retroactively. They always receive
the GIF but **never mutate CRM state**, regardless of Referer, User-Agent, IP,
known lead, pitch timestamp or deployment date. Historical counts are retained;
opens from old emails after rollout will not be counted. Do not resend old
outreach merely to replace its pixel.

The five-day helper `autoRemoveUnopenedPitchedLeads` is **dormant** on current
main: the complete application source has its definition but no import/caller.
The active `auto-scrape-leads` cron delegates only to catalog synchronization;
the separate scheduled organizer worker performs no unopened-lead cleanup.
The final source-boundary regression and runtime cron spies keep this distinction
explicit. The earlier handoff's implication that an active cleanup job needed
pausing was incorrect.

Counterfactual hazard: calling that dormant helper would remove `pitch_sent`
rows with `opened_at IS NULL` and a send timestamp at least five days old. New
leads without a send timestamp do not match; historical unsigned emails can
match even if a human later reads them. Do not re-enable that helper without a
separate reviewed retention policy that accounts for legacy unsigned links,
missing configuration, image blocking, and key rotation. No cleanup logic was
enabled, disabled, or rewritten by this patch. External/manual jobs not present
in this repository are not proven absent by source inspection.

Unsigned image requests themselves have no database or email side effects. They
cannot clear contact history, restore suppression, or create outreach eligibility.
Automatic outreach now excludes both timestamp-based history and trimmed nonempty
`last_sent_to` history, on the same row and across duplicate rows; this also covers
an owner-restored `new` row with durable contact evidence. The scheduled worker
already excludes those histories and retains its once-per-recipient claims.
Rows with no durable evidence after a historic bookkeeping failure cannot be
classified as contacted from a pixel; reconcile them manually. Intentional manual
resends remain an authorized action, not an effect of an unsigned pixel.

CRM transition review (explicit admin operations retain their existing authority):

| Path | Existing transition / contact evidence |
| --- | --- |
| Manual send | Accepted intended dispatch writes `pitch_sent`, timestamp and recipient under status guard; unknown outcome is held as `email_outcome_unknown`. Removed/archived/unknown-held records are rejected. Intentional resends are permitted. |
| Automatic send | Fresh `new`/legacy-null-status eligibility only, now with no timestamp or nonempty last recipient and no historical recipient duplicate; accepted/unknown bookkeeping uses the same guards as before. |
| Scheduled worker | Explicit approved `new` lead only, no timestamp/last recipient; historical/suppressed email/event exclusion and durable recipient claim. No tracking pixel or cleanup invocation. |
| Remove / restore | Explicit admin removal sets `removed`; restore uses `pitch_sent` when timestamp exists, otherwise `new`. History fields are retained; a restored row with last-recipient-only evidence remains automatically ineligible after this fix. |
| Mark-replied / update-status / Partnering UI | Authorized admin transitions remain unchanged. A manually set status alone is not persisted send evidence for tracking. |
| Gmail sync | An explicit inbox-sync action can set `replied`/`negotiating` (or retain `partner_live`) based on a matching message. Its broader legacy status behavior is independent of pixel requests and unchanged. |
| Legacy enrichment script | Can set an enriched row to `new`; it does not clear durable contact markers. Automatic-send guards still exclude timestamp/last-recipient history. This script is not called by current catalog cron. |
| Five-day helper | Dormant; no application caller. If manually reintroduced, absence of an authenticated open is unsafe retention evidence for legacy emails. |
| Tracking RPC | Only signed requests and rows with a send timestamp plus an active allowed status; never sends email or changes recipient/timestamp evidence. |

## Environment configuration requirements

**Before enabling this release**, provision `EMAIL_OPEN_TRACKING_SECRET` in every
server deployment that emits or verifies these pixels. It must be exactly 64
hexadecimal characters encoding 32 cryptographically random bytes. Use a secure
secret-generation/provisioning process; do not paste the value into chat, source,
logs or this document. No real secret is generated by the tests or included here.

- Use the same value across the sending routes, cron-triggered automatic pitch
  code, and the public GET route in one environment.
- Use distinct values for production and test/preview environments. Never use
  the public synthetic test key as configuration.
- Do not use a `NEXT_PUBLIC_` variable, Supabase service key, CRON_SECRET, Resend
  key or another application's signing key as a fallback.
- Existing Supabase URL/service-role configuration remains required for a valid
  update. The existing service_role must retain its SELECT/UPDATE access to
  `organizer_leads`; this patch does not broaden table permissions.
- Missing/malformed secret: verification fails closed and senders omit pixels
  with a server warning. This is an emergency safe failure mode, not a complete
  production rollout. Ensure configuration is present before new tracked emails
  are sent.

## Database migration, deployment and rollback order

Migration: `supabase/migrations/20261107075734_signed_organizer_email_open.sql`.
It is additive and transactional. Only the new function's EXECUTE privileges are
modified; existing organizer queries and RLS remain intact.

1. Review this patch and complete isolated tests. Verify dormant cleanup remains
   disconnected and check any externally configured jobs. Provision the signing
   key through deployment secrets **before application deployment**.
2. Apply the reviewed migration through the normal migration pipeline to the
   intended database. Do not blindly apply all historical/unapplied migrations.
3. Verify the function exists, is invoker/void, and that anon/authenticated have
   no EXECUTE while service_role does. A read-only metadata check is:

   ```sql
   SELECT p.proname, p.prosecdef, p.prorettype::regtype, p.proconfig,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_exec
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='record_organizer_email_open';
   ```

4. Deploy sender and verifier changes together with the key available. Avoid a
   mixed-version period in which old senders continue issuing unsigned URLs, or
   new senders reach an old verifier. Migration and key must precede the code.
   Fence scheduled/manual outreach during the version transition, drain old
   sender invocations, then switch the application deployment as a unit and
   resume only after readiness checks. Do not change quotas or recipients.
5. Verify valid/invalid behavior in an isolated environment with throwaway leads
   and cleanup, plus ordinary core-page checks. Review server error logs for a
   missing RPC/configuration before allowing new outreach. No live test email or
   production tracking mutation is required or authorized by this task.

If migration application or its metadata checks fail, stop the application
rollout and investigate; do not deploy a sender/verifier combination that depends
on the missing RPC. The migration wraps creation and ACL changes in one
transaction, so a failure rolls them back together. Accidental app-before-RPC
deployment still returns GIFs and logs RPC errors; tracking updates fail closed,
while email dispatch continues. That safe failure is an incomplete rollout,
not evidence of working tracking. Do not backfill synthetic open events.

Rollback: retain the secured verifier and additive RPC. Remove/disable the key
to turn tracking off safely (GIFs and email delivery continue); this invalidates
existing signed pixels and causes senders to omit new pixels. Do not restore the
original UUID-only handler. If the RPC must be removed, first disable tracking
or deploy a GIF-only handler, then use a separately reviewed rollback migration
to drop `public.record_organizer_email_open(uuid)`. Do not remove the RPC while
valid signed verification still calls it. Key rotation intentionally invalidates
all earlier signatures; there is no multi-key overlap in this focused patch.

## Regression coverage and verification

`scripts/test-email-open.cjs` covers valid signatures, missing/invalid/modified/
truncated/malformed signatures, modified IDs, malformed UUIDs, duplicate parameters,
missing/invalid secrets, no privileged client for rejected requests, RPC failures,
HTML-safe generation and exact GIF/no-cache compatibility.

`scripts/test-email-open-local.cjs` executes the actual route with an RPC adapter
to real disposable PostgreSQL. It tests nonexistent IDs, permissions, status
transitions, nullable counters, suppressed leads, 88 increments from concurrent
route/SQL calls, and a suppression transaction holding the row lock. It uses
clearly fake lead IDs and always stops/deletes the cluster in `finally`. It also
executes both real sender functions through a PostgreSQL adapter that enforces
their actual status predicates. An image fetch is injected before provider
acceptance: send bookkeeping succeeds, contact evidence persists, and a later
signed request works. Never-contacted rows and contacted/owner-restored legacy
rows are tested separately, including timestamp-less last-recipient history.

`scripts/test-email-reliability.cjs` additionally verifies both pixel emitters
with/without signing configuration: identical recipient/from/reply-to/subject,
one provider attempt, preserved quota/bookkeeping, and no sandbox capability.
The new tests are included in `.github/workflows/pr-validation.yml`.

Directly related command:

```powershell
node --test scripts/test-email-open.cjs scripts/test-email-reliability.cjs scripts/test-email-open-local.cjs
```

Final adversarial-review run: **158/158 passed, zero skipped**, using the five
directly affected suites below. Node v24.17.0 / PostgreSQL 18 were used locally;
CI remains configured for Node 22. The live engine reports PostgreSQL 17.

```powershell
node --test scripts/test-email-open.cjs scripts/test-email-reliability.cjs scripts/test-email-open-local.cjs scripts/test-scheduled-organizer-outreach.cjs scripts/test-scraper-data-preservation.cjs
```

| Exact command | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed: 673 lockfile packages; lockfile unchanged |
| `npm run typecheck -- --incremental false --pretty false` | Passed |
| `npm run lint` | Fails on existing repository debt: 191 errors, 92 warnings. ESLint comparison of changed files against HEAD found zero new diagnostics; one old `any` error was removed with the vulnerable counter code. New JS/TS files have zero errors/warnings. |
| PR regression selection, command below | Final review: 1,231 passed, one failed before tests in unchanged `test-database-report-workflow.cjs:11`; zero skipped |
| `node --test scripts/test-mission03-workspace-rls.cjs scripts/test-chat-active-actor-local.cjs` | Passed: 40 tests in disposable PostgreSQL |
| `python scripts/test-team-document-local.py` | Passed: existing real SQL concurrency/permission assertions |
| `node scripts/run-stabilization-smoke.cjs` | Passed; invokes `node scripts/smoke-test-core-pages.js` against dedicated loopback fixtures, 10 reads/zero writes. This is query transport/static verification, not full page rendering or deployed RLS. |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-stabilization-browser.cjs scripts/test-mission02-browser.cjs scripts/test-notification-categories-browser.cjs` | Passed: six Chromium desktop/mobile fixture regressions; external requests blocked |
| `node scripts/render-founder-brief-preview.cjs` | Passed; generated previews moved into ignored scratch storage afterward |
| `git diff --check` | Passed |

The workflow test's unchanged LF-only marker (`run: |\n`) does not match its
unchanged CRLF workflow on this Windows checkout (`1 !== 2`). The identical
failure was reproduced with base files copied into an isolated scratch directory;
neither file was modified to obtain a green result. The final review independently
reproduced it again against unchanged base files. Normalizing only the inspected
string changes the split count from 1 to 2; the actual test was never edited or
excluded. No assertions were removed, tests skipped, or CI entries deleted.
The history-pagination fixture gained real send timestamps to satisfy the query's
history predicate; its existing no-send/three-read assertions remain intact.
Additional tests cover blank metadata to prevent false suppression.
Initial restricted runs also
hit local HTTP EACCES, PostgreSQL WAL filesystem denials and missing sandbox
browser paths; the successful local tests above ran with the needed local access.

Exact PowerShell command used to run the workflow's current offline selection:

```powershell
$workflow=Get-Content .github/workflows/pr-validation.yml -Raw
$section=($workflow -split 'name: Run offline regression selection')[1] -split 'name: Verify workspace permissions'
$files=[regex]::Matches($section[0],'scripts/test-[\w-]+\.cjs') | ForEach-Object { $_.Value }
node --import ./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 @files
```

Build attempts use no `.env`/`.env.local`, no service credentials, a synthetic
loopback Supabase URL and an external-network guard. The default Turbopack build
did not finish and was stopped; the initial webpack attempt hit blocked Google
Fonts requests and was stopped. The offline-font webpack attempt hit a sandbox
EPERM creating an unrelated generated `[slug]` directory. The final retry uses
the same offline configuration with filesystem access:

```powershell
$env:NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:9'
$env:NEXT_PUBLIC_SUPABASE_ANON_KEY='synthetic-build-only'
$env:NEXT_TELEMETRY_DISABLED='1'
$env:NODE_OPTIONS='--import ./qa/fixtures/rack-network-guard.mjs'
$env:NEXT_FONT_GOOGLE_MOCKED_RESPONSES=(Resolve-Path qa/fixtures/rack-font-mock.cjs).Path
npm run build -- --webpack
```

Final build result: **passed** (exit 0, webpack production build with the existing
offline font fixture). The unavailable synthetic Supabase endpoint produced
expected landing-page data warnings; no connected data was accessed. Existing
middleware/Sentry configuration deprecation warnings remain unchanged.

Final-review rerun of the production build: **passed**, exit 0 with the same
offline-font configuration and external-network guard. Final typecheck, smoke,
40 SQL boundary tests, document-concurrency checks and six browser fixtures also
passed again. Changed-file ESLint comparison again found zero new diagnostics.

The final full-diff/file audit passed: exactly the ten files below, an empty
staging index, no environment files or generated artifacts in the change set,
and no credential-shaped material in those files. The original `frontend`
worktree remains on main with its pre-existing untracked `.kiro/` untouched.

## Remaining limitations

A signed pixel is a reusable bearer capability. A recipient/mail proxy possessing
it can replay it; image prefetching/caching means counts are not proof of a human
open or unique readership. Expiry was deliberately omitted to preserve later opens
of delivered emails; removing or rotating the dedicated key revokes these tokens.
Unknown future CRM statuses default to no mutation until deliberately supported.
An early first-send fetch before persisted send evidence is deliberately uncounted;
if a proxy never fetches again, no open will be recorded. This protects contact
history rather than claiming that image loading measures a human read.

Inherited manual-resend limitation: for an already-contacted `pitch_sent` lead,
a pixel can still promote status to `opened` while an intentional manual resend
is awaiting provider acceptance. The unchanged sender's exact-status guard can
then report bookkeeping failure and retain the older recipient/timestamp. That
race exists in main's UUID-only implementation; this patch does not redesign
dispatch transactions or promise that every resend bookkeeping race is solved.
The response distinguishes accepted dispatch from failed bookkeeping and forbids
automatic retry. Likewise, the legacy automatic helper's global cross-process
send admission is not made atomic by the atomic *open counter* RPC.

Live metadata was independently verified read-only on 2026-11-07: 14 organizer
columns match the repository schema, including `id uuid`, nullable `status text`,
`pitch_sent_at/opened_at/updated_at timestamptz`, `open_count integer DEFAULT 0`,
and `last_sent_to text`. The service role has table SELECT/UPDATE; there are no
user triggers or additional status constraints. The new tracking RPC is absent
from production, as expected before deployment. No production function was called.
This confirms migration compatibility, not deployed tracking behavior or future
RPC ACLs. Local tests prove the new function's ACLs and concurrency; rollout
configuration and full rendered production pages remain unverified.

## Query investigation inventory

The repository was searched for all literal/embedded `organizer_leads` references
before changing SQL. There were no embedded relation selectors. No table/column
permission changes are proposed, so existing wildcard callers are unaffected.
Production query paths and their requested/returned columns at the base revision:

| File (under src/ unless prefixed scripts/) | Columns requested/returned |
| --- | --- |
| app/api/webhooks/email-open/route.ts | id,status,open_count,opened_at; update returned none (replaced by RPC) |
| app/api/admin/send-organizer-pitch/route.ts | id,status,pitch_sent_at; bookkeeping returns id |
| lib/admin/autoSendPitches.ts | id,title,organizer_email,last_sent_to,pitch_sent_at,status; bookkeeping returns id; cleanup returns id,title |
| lib/admin/scheduledOrganizerOutreach.ts | id,title,organizer_email,last_sent_to,pitch_sent_at,status,unstop_url,notes; update returns id |
| app/admin/page.tsx | all columns (`*`) |
| app/admin/_tabs/PartneringTab.tsx | update only, no returned columns |
| app/api/admin/create-partner-portal/route.ts | id,title,unstop_url,college_or_host |
| app/api/admin/organizer-leads/mark-replied/route.ts | update only, no returned columns |
| app/api/admin/organizer-leads/remove/route.ts | update only, no returned columns |
| app/api/admin/organizer-leads/restore/route.ts | id,pitch_sent_at; update returns none |
| app/api/admin/organizer-leads/update-status/route.ts | status,pitch_sent_at; update returns all columns (`select()`) |
| app/api/admin/send-outreach-summary-pdf/route.ts | all columns (`*`) |
| app/api/cron/daily-email-report/route.ts | id,title,organizer_email,last_sent_to,pitch_sent_at,status,created_at |
| lib/admin/gmailInboxSync.ts | all columns (`*`); update returns none |
| lib/admin/founderBrief.ts | shared count helper selects id (HEAD/count), filters created_at |
| scripts/discover-organizer-candidates.cjs | id,unstop_url |
| scripts/enrich-organizer-leads.js | all columns (`*`); update returns all columns (`select()`) |
| scripts/send_daily_report_now.ts | id,title,organizer_email,last_sent_to,pitch_sent_at,opened_at,open_count,status,created_at |

Additional matches are offline fixtures/tests (`partner-admin-harness.cjs`,
`test-partner-admin.cjs`, `test-scheduled-organizer-outreach.cjs`,
`test-scraper-data-preservation.cjs`, `test-email-reliability.cjs`) and migrations
creating the table, adding tracking/last-sent columns, and defining admin RLS.
These were inspected as conventions/dependencies, not changed.

## Publication status

No PR is published yet. Workspace rules reserve staging, committing and pushing
to the user; no remote commit was created through another API to bypass that
restriction. The local branch and focused diff are ready for review. No secrets
or generated verification artifacts belong in the staged file list.

Reviewed task file list (five modified, five new; all accounted for by this fix):

```text
.github/workflows/pr-validation.yml
docs/security/hm-audit-03-email-open-tracking.md
scripts/test-email-open-local.cjs
scripts/test-email-open.cjs
scripts/test-email-reliability.cjs
src/app/api/admin/send-organizer-pitch/route.ts
src/app/api/webhooks/email-open/route.ts
src/lib/admin/autoSendPitches.ts
src/lib/emailOpenTracking.ts
supabase/migrations/20261107075734_signed_organizer_email_open.sql
```

Suggested PR title: `fix(security): authenticate organizer email-open tracking and increment atomically`.
Target: `main`. Use this document as the PR body after the user-controlled commit
and push. The known baseline checks above must remain disclosed; no merge or
deployment is authorized by this patch.

### Repository-owner PowerShell commands

These commands are for the owner to run manually; the agent did not run staging,
commit, push or PR creation. They require authenticated Git and GitHub CLI.
Stop if any audit guard fails. Only the ten reviewed files may be staged.

```powershell
Set-Location -LiteralPath 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hm-audit-03-email-tracking'
if ((git branch --show-current) -ne 'fix/hm-audit-03-signed-email-tracking') { throw 'Wrong branch' }
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
if ((git rev-parse origin/main) -ne '109d744d76593a96af1f1c9c660f49cb3f04fce5') { throw 'Main moved: review the new base before publishing' }
git status --short --untracked-files=all
if (@(git diff --cached --name-only).Count -ne 0) { throw 'Index already contains staged files; inspect manually' }
$scopedFiles = @(
  '.github/workflows/pr-validation.yml'
  'docs/security/hm-audit-03-email-open-tracking.md'
  'scripts/test-email-open-local.cjs'
  'scripts/test-email-open.cjs'
  'scripts/test-email-reliability.cjs'
  'src/app/api/admin/send-organizer-pitch/route.ts'
  'src/app/api/webhooks/email-open/route.ts'
  'src/lib/admin/autoSendPitches.ts'
  'src/lib/emailOpenTracking.ts'
  'supabase/migrations/20261107075734_signed_organizer_email_open.sql'
)
$changedFiles = @(git diff --name-only origin/main) + @(git ls-files --others --exclude-standard)
if (Compare-Object ($scopedFiles | Sort-Object) ($changedFiles | Sort-Object -Unique)) { throw 'Unexpected or missing changes: inspect before staging' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace check failed' }
git add -- $scopedFiles
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
if (Compare-Object ($scopedFiles | Sort-Object) (@(git diff --cached --name-only) | Sort-Object)) { throw 'Unexpected staged file set' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged whitespace check failed' }
git diff --cached --stat
git diff --cached
```

After reviewing that staged diff, the owner can publish the focused PR:

```powershell
git commit -m 'fix(security): authenticate organizer email tracking and preserve contact history'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push --set-upstream origin fix/hm-audit-03-signed-email-tracking
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
gh pr create --repo yashshah1211/HackerMate_Backup --base main --head fix/hm-audit-03-signed-email-tracking --title 'fix(security): authenticate organizer email-open tracking and increment atomically' --body-file docs/security/hm-audit-03-email-open-tracking.md
if ($LASTEXITCODE -ne 0) { throw 'PR creation failed; inspect existing PRs before retrying' }
```
