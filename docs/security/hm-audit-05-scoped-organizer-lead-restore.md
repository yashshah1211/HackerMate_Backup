# HM-AUDIT-05: scoped organizer-lead restoration

Base: `2e9875c498326a4e44ae23c7563345c084e9c1d2` (merged HM-AUDIT-04).
Branch: `fix/hm-audit-05-scoped-organizer-lead-restore`.
Scope: local implementation and verification only. No Git publication authorization, production writes, real email, migration execution, deployment, merge, or HM-AUDIT-06 work.

## Root cause and resulting behavior

The old empty-body POST selected all removed rows with a default-limited query, then looped over unguarded updates. It inferred `new` from a null send timestamp and counted no-error writes without checking affected rows. It could restore suppression and contact records without an individual administrator decision.

The replacement requires exactly one canonical UUID and no additional body keys or URL filters. The administrator opens **Review Removed Leads**, browses a bounded server page, chooses one lead, reviews its title/UUID/history indicators and proposed hold, then confirms that individual restoration. Cancel, closing, paging and browsing perform no writes.

## State machine and history

| State at locked mutation | Receipt / HTTP | Result |
| --- | --- | --- |
| Missing UUID | missing / 404 | No change |
| Any status except removed, including null | conflict / 409 | No change |
| removed with prior send timestamp | restored / 200 | restored_review; history unchanged |
| removed with last-recipient-only evidence | restored / 200 | restored_review; conservative suppression retained |
| removed without durable send evidence | restored / 200 | restored_review; uncertainty remains explicit |
| Database/transport/unexpected receipt | error / 500 | No success claim; refresh before retry |

Every successful restoration updates only `status` and `updated_at`. It preserves `pitch_sent_at`, `last_sent_to`, `opened_at`, `open_count`, `organizer_email`, notes, created timestamp and every other column. A timestamp is recorded send evidence, not proof of delivery. Missing evidence does not prove an organizer was never contacted. No fictitious timestamp or recipient is written.

**Restored — review held** is visible in the existing CRM status selector and all-leads table. Individual Pitch is disabled, bulk manual pitch excludes held rows, and the manual-send API rejects the state before budget/provider access. Existing authorized status/notes/email editing remains available as a separate decision with unchanged privileges. Moving a held lead out of hold requires deliberate CRM status editing; the restore operation never does that itself.

Both automatic senders reject held records. The legacy automatic sender now also includes held rows in its paginated recipient history query, protecting duplicate new rows even when the held row lacks send evidence. The scheduled worker already suppresses every non-new record's recipients and event URL. Send timestamps and last-recipient-only evidence still suppress automatic contact even after an administrator chooses new. Restoration never accesses recipient claims, email quotas or providers.

## Authorization and SQL security

Both new listing and replacement mutation call the unchanged `requireOutreachAdmin` helper first. No protected query/RPC occurs for an unauthorized session. The helper retains its existing verified-session and outreach-email allowlist behavior; this change adds no administrator identities or general admin privileges.

Migration: **`supabase/migrations/20261107100402_scoped_organizer_lead_restore.sql`**.

Function: `public.restore_organizer_lead(uuid) RETURNS jsonb`.

- SECURITY INVOKER, fixed empty search_path, fully qualified table and functions.
- Explicit REVOKE ALL from PUBLIC, anon and authenticated.
- EXECUTE granted to service_role; trusted database owner/superuser powers remain inherent.
- No table grants, column grants, RLS/policy changes, schema backfill or bulk data update.
- The existing primary-key index scopes the lookup/update to one UUID.
- A row lock reads the current status; an additional status=removed predicate guards the UPDATE. Receipt is emitted only after RETURNING confirms one changed row.
- Concurrent calls serialize on that row: first succeeds, later callers see the held state and conflict. A preceding concurrent CRM edit is observed after lock wait.
- An exception rolls back the transaction. A trigger that suppresses the UPDATE produces a conflict instead of fabricated success.
- The API validates outcome, matching UUID and exact held status. It returns safe public messages and logs only validated actual SQLSTATE/PostgREST codes, excluding record-bearing messages/details.

Read-only connected production metadata confirmed the current 14-column organizer_leads schema, free-text nullable status, UUID primary key, unique unstop_url, RLS enabled, no user triggers, existing administrator policy and service-role SELECT/UPDATE privileges. No production lead rows were read for testing. Operators must check metadata again before migration if schema has drifted.

## Listing and stale UI behavior

GET `/api/admin/organizer-leads/removed` permits only one optional UUID cursor. It selects explicit columns under status=removed, orders by unique UUID ascending, and requests 26 rows to return at most 25 plus a next-page cursor. There is no arbitrary limit/filter or unbounded/bulk alternative. The browser receives history indicators, not recipient addresses or notes. Responses are private/no-store.

Strict id > cursor pagination traverses a stable snapshot without duplicate/default-1000 truncation. Previous navigation uses a cursor stack. This is live keyset browsing, not a transaction-wide frozen snapshot: concurrent insertions/status changes behind an already-used cursor can require refreshing from the first page. A mutation rechecks live status regardless of what was displayed.

Old page requests are aborted and ignored after cursor changes or dialog unmount. Pending restores disable dismissal, paging, refresh and repeat writes. Unconfirmed/conflicting results cannot be retried directly; the administrator must refresh. A valid receipt refreshes the removed page and requests a parent CRM refresh independently. The dialog handles a rejecting refresh callback truthfully. The existing admin page's `loadLeads()` catches/logs its own database errors and resolves, so that inherited failure path may leave the active table stale without the dialog's refresh-failure message. Use the CRM refresh control after resolving the query failure; the confirmed restore and independently refreshed removed list remain accurate.

## Regression evidence

Verification continued in this same worktree after a usage-limit interruption; no implementation was discarded or restarted. The effect/state lint correction and 14 dialog tests were already complete on disk when resumed. Recovered completed processes explicitly returned: webpack build exit 0; HM03/HM04/HM05 native SQL selection exit 0; remaining native SQL plus Python selection exit 0; full Chromium selection exit 0; offline selection exit 1 with the single CRLF baseline failure. Final-source reruns and independent reviews are recorded below.

| Check | Confirmed result | Evidence / provenance |
| --- | --- | --- |
| New restore API | 46 passed, 0 failed/skipped | Included in final offline selection; independently rerun by Spec reviewer |
| New review-dialog UI | 14 passed, 0 failed/skipped | Includes stale unmounted request and rejecting parent callback; final selection and independent review |
| New native restoration SQL/API | 13 passed, 0 failed/skipped | Newly rerun after resumption; hm05-native-final.log, process exit 0 |
| HM03 tracking + HM04 deletion + HM05 native selection | 33 passed, 0 failed/skipped | Recovered hm05-native-regression.log with completed process exit 0; overlaps the 13 above |
| Other CI native workspace/chat selection | 40 passed, 0 failed/skipped | Recovered hm05-other-native.log, completed process exit 0 |
| Team-document Python SQL suite | PASS | Recovered hm05-python.log and completed process exit 0; script prints five PASS groups, no numeric test count |
| Full CI Chromium selection | 8 passed, 0 failed/skipped | Recovered hm05-all-browser.log and process exit 0 |
| Final HM05 Chromium rerun | 1 passed, 0 failed/skipped | Newly rerun; hm05-browser-final.log, exit 0; one test covers four desktop/mobile × success/conflict scenarios |
| Existing email UI | 5 passed, 0 failed/skipped | Newly completed hm05-email-ui.log, exit 0 |
| Exact updated PR offline selection | 1,362 passed, 1 known baseline failure, 0 skipped/cancelled/todo | Newly completed hm05-regression-final.log; 1,363 reported tests, exit 1 |
| Synthetic core-page query smoke | PASS: 10 reads, 0 mutations | Recovered hm05-smoke.log and completed process exit 0; no deployed-page/RLS claim |
| TypeScript | PASS, exit 0 | Newly rerun npm run typecheck -- --incremental false --pretty false; hm05-typecheck-final.log |
| Changed-file lint vs base | 0 new diagnostics | Newly rerun hm05-lint-final.log and build/verification/hm05-lint.json; existing OutreachTab 15 vs baseline 16, manual sender 1 vs baseline 1; other changed code/tests 0 |
| Safe offline webpack build | PASS, exit 0 | Newly rerun npm run build -- --webpack; hm05-build-final.log, compiled, typechecked, generated 89/89 pages and route inventory |
| Founder Brief offline preview | PASS, exit 0 | Newly completed hm05-founder-preview.log; generated artifacts moved under ignored build/verification/hm05-founder-brief-preview |
| Diff/scope/credential-pattern checks | PASS | Exactly 16 scoped files, no staged files, no credential-pattern findings, git diff --check exit 0 |

Counts overlap across selections and reruns; they must not be summed as distinct tests. All commands ran only against synthetic data or fresh disposable local databases. Existing email reliability, scheduled outreach, admin authorization, HM03 unit and HM04 action/UI regressions are included in the final offline selection.

The **single known baseline failure** is scripts/test-database-report-workflow.cjs:11: its exact LF-only marker `        run: |\n` does not match the unchanged daily-database-report.yml CRLF checkout (`1 !== 2`). Both baseline files match origin/main after newline normalization. Exact unchanged CRLF copies under ignored build/verification/baseline reproduce the same failure (hm05-baseline.log). Neither source file was edited, normalized, skipped or excluded. This is a Windows baseline defect; no Linux GitHub result is claimed.

An earlier sandboxed selection failed loopback HTTP fixture connections with EACCES. The permitted local execution rerun eliminated those environment failures, leaving only the baseline above. The first new SQL run also exposed a typo in its ACL-inspection test query; the query was corrected and all SQL tests rerun successfully without weakening assertions. Final build output retains inherited Sentry/middleware/Supabase Edge warnings and expected synthetic unavailable-event fallbacks; no live credentials or external services were used.

Tests execute actual TS handlers/authentication, React components, migration SQL and Chromium. All inserted records belong to newly created disposable PostgreSQL clusters with loopback-only connection parameters, synthetic IDs and finally cleanup. The reused HM04 native cluster allocator starts an empty database; it never accepts a production URL or imports environment files. Provider behavior in browser tests is synthetic, and external requests are blocked.

Coverage includes unauthorized listing/restoration; malformed, missing, array, bulk and extra-filter inputs; exact receipts and safe errors; missing/conflicting/repeated states; all-history preservation and unrelated-row invariance; last-recipient-only and uncertain histories; actual role privileges and transaction rollback; concurrent calls and a competing CRM edit; zero-row trigger behavior; signed/replayed/unsigned tracking against holds; both automatic senders and duplicate recipient suppression; claims/quota invariance; 1,137 removed rows over 46 pages; confirmation/cancel/errors, duplicate clicks, stale responses and failed parent refresh; desktop/mobile layout; existing status editing, notes and manual composer/send behavior.

The HM03 native query adapter was extended to translate the newly added held-state history predicate. Its existing assertions and tests remain intact. No tests were skipped, weakened or silently excluded.

## HM03/HM04 guarantees and residual limitations

- HM03 HMAC signing/validation and its migration are unchanged. Signed image requests cannot modify restored_review because the RPC has an explicit active-status allowlist. Legacy unsigned requests are no-ops. Signed replay remains possible for eligible active states; mail proxies/prefetching mean image requests do not prove human reading.
- The five-day cleanup remains dormant with no runtime caller and matches pitch_sent only. Restored holds cannot match it.
- HM04 deletion/authentication/UI/migration files are unchanged and their native/browser/API tests are included in verification.
- The hold is not a new opt-out/legal-consent ledger. An authorized administrator can intentionally change status and send manually; those existing capabilities are preserved.
- Existing Gmail reply synchronization is a separate authorized operation and may move matching rows into replied/negotiating. Those states remain excluded from automatic outreach. Its broader pre-existing matching behavior is not redesigned here.
- Existing sender dispatch/status-CAS races and the advisory legacy quota design are not repaired by restoration. In-flight sends already admitted before a separate remove/restore operation cannot be recalled.
- A transport failure after commit leaves an uncertain client outcome. Refresh/repeated restore shows the held state/conflict; there is no automatic resend or rollback to new.
- Performance uses the existing UUID primary key. No status index is added for the current small CRM; very large growth may justify a separate measured indexing change.
- Local fixtures do not prove deployed RLS, provider delivery, production infrastructure or live end-to-end behavior.
- Verification runs locally on Node 24.17.0 / Windows; GitHub PR validation specifies Node 22 / Ubuntu. No PR or GitHub Actions run has been created for this unpublished branch. The native allocator supports Linux through PARTNER_TEST_PG_BIN, but this session does not claim a Linux CI execution.

## Independent Standards review

No actionable findings or security blockers. The reviewer inspected all tracked changes and all ten new scoped files, confirmed authorization before protected queries, scalar UUID/receipt validation, invoker/ACL/search_path hardening, history preservation, held-recipient suppression, disposable fixture cleanup and intact HM03 assertions. No smell-based refactoring was warranted.

## Independent Specification review

No blocking requirements gaps or scope creep. The reviewer independently executed the final focused API/UI selection: **60 passed, zero failed or skipped**. It confirmed single-row/history safety, real concurrency/privilege tests, 1,137-row keyset traversal and confirmation behavior. Its one nonblocking documentation qualification about the existing parent loader swallowing refresh errors is recorded above; no unrelated code change was made.

Review totals: Standards 0 actionable findings; Specification 0 blockers and 1 documented inherited limitation. Root's adversarial pass also found no implementation blocker. **Final verdict: READY FOR PR**, with the disclosed Windows baseline failure and deployment prerequisites above. This is readiness for independent review, not authorization to deploy or merge.

## Migration prerequisites and deployment order (owner runbook; not executed)

1. Independently review the exact 16-file diff and test evidence. Reconcile any new main commits first. Do not deploy the old bulk-restore version as a fallback.
2. Confirm target project and migration history read-only. Verify the live columns/types, RLS, policy, service-role table privileges and absence of unexpected UPDATE triggers against the metadata above. Confirm this UUID-signature function/version does not already exist with different content.
3. Do not run an unreviewed `supabase db push` or blindly apply pending migrations. HM03 and HM04 migrations must remain present and their deployed guarantees intact.
4. Before schema work, prevent use of the old bulk restore through an owner-controlled maintenance window or narrowly targeted temporary block on POST /api/admin/organizer-leads/restore. Review the block in staging first; do not interrupt unrelated CRM routes. Keep it until new UI/API are active.
5. Apply **only the exact reviewed HM05 SQL file** as one transaction with an authorized database operator. It does not rewrite existing records. On error, the transaction rolls back; stop and investigate. Do not continue application rollout or claim restoration is available.
6. Verify signature, definition, invoker setting, empty search_path and EXECUTE ACL using read-only metadata. Verify PUBLIC/anon/authenticated deny and service_role execute, with existing table/RLS permissions unchanged.
7. Reconcile migration history only after verifying the exact SQL applied successfully. If applied manually and the matching history row is absent, the owner may use `supabase migration repair 20261107100402 --status applied --linked` after confirming the linked project. This records history; it does not apply SQL. Never mark a failed/unapplied/different migration as applied or repair unrelated versions to hide drift.
8. Deploy the compatible new server routes, send/automatic guards and UI together after the function exists. No new secret/environment prerequisite is introduced. Retain the HM03 signing secret/configuration unchanged. Old clients' empty-body POSTs now receive 400.
9. If application is accidentally ahead of migration, RPC-not-found/permission failures produce 500 with no fallback/bulk update; restoration remains unavailable until corrected. Pause restore rather than using the old endpoint.
10. In an approved staging environment, verify one synthetic row's review/restore and compare history, then refresh active CRM. Never verify by restoring a real production organizer or sending email. Production operator checks should initially be read-only. Lift the narrow temporary route block only when the new server and UI are confirmed.

## Safe rollback

Prefer a forward fix. If restoration must be paused, keep the new scoped API and disable its restore action or return a clear unavailable response; other CRM functions continue. Revoke service-role EXECUTE on only this function through a reviewed follow-up migration if necessary. Keep held-state handling and sender guards.

Do not roll the application back to the unsafe bulk endpoint or an older sender that ignores held-recipient suppression. If a broader application rollback is unavoidable, keep restore blocked and carry forward the held-status sender guards. Existing held rows remain held with history intact. Never bulk-convert them to new/pitch_sent or clear evidence. Resolve individual records only through an explicit authorized workflow after review.

Removing the function is optional after all callers are retired and through a separate reviewed migration. Do not delete historical migration records/files to pretend the change never ran. No routine rollback needs data rewrites or secret rotation.

## Exact scoped files (16)

1. .github/workflows/pr-validation.yml
2. docs/security/hm-audit-05-scoped-organizer-lead-restore.md
3. scripts/organizer-restore-harness.cjs
4. scripts/test-email-open-local.cjs
5. scripts/test-organizer-lead-restore.cjs
6. scripts/test-organizer-lead-restore-ui.cjs
7. scripts/test-organizer-lead-restore-local.cjs
8. scripts/test-organizer-lead-restore-browser.cjs
9. src/app/admin/_components/RemovedLeadsReview.tsx
10. src/app/admin/_tabs/OutreachTab.tsx
11. src/app/api/admin/organizer-leads/removed/route.ts
12. src/app/api/admin/organizer-leads/restore/route.ts
13. src/app/api/admin/send-organizer-pitch/route.ts
14. src/lib/admin/autoSendPitches.ts
15. src/lib/admin/organizerLeadRestore.ts
16. supabase/migrations/20261107100402_scoped_organizer_lead_restore.sql

## Owner Git handoff

No files are staged or committed by this task. Earlier audit publication exceptions do not apply. Review the status again before using the commands below; stop if there are other files or unexpected staged changes.

```powershell
Set-Location 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hm-audit-05-organizer-lead-restore'
git branch --show-current
git status --short
git fetch origin main
git log --oneline 2e9875c498326a4e44ae23c7563345c084e9c1d2..origin/main
if ((git rev-parse origin/main) -ne '2e9875c498326a4e44ae23c7563345c084e9c1d2') { throw 'Main moved; inspect and reconcile before staging' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
$files = @(
  '.github/workflows/pr-validation.yml'
  'docs/security/hm-audit-05-scoped-organizer-lead-restore.md'
  'scripts/organizer-restore-harness.cjs'
  'scripts/test-email-open-local.cjs'
  'scripts/test-organizer-lead-restore.cjs'
  'scripts/test-organizer-lead-restore-ui.cjs'
  'scripts/test-organizer-lead-restore-local.cjs'
  'scripts/test-organizer-lead-restore-browser.cjs'
  'src/app/admin/_components/RemovedLeadsReview.tsx'
  'src/app/admin/_tabs/OutreachTab.tsx'
  'src/app/api/admin/organizer-leads/removed/route.ts'
  'src/app/api/admin/organizer-leads/restore/route.ts'
  'src/app/api/admin/send-organizer-pitch/route.ts'
  'src/lib/admin/autoSendPitches.ts'
  'src/lib/admin/organizerLeadRestore.ts'
  'supabase/migrations/20261107100402_scoped_organizer_lead_restore.sql'
)
if ((git branch --show-current) -ne 'fix/hm-audit-05-scoped-organizer-lead-restore') { throw 'Wrong branch' }
if (git diff --cached --name-only) { throw 'Unexpected existing staged changes' }
$changed = @((git diff --name-only); (git ls-files --others --exclude-standard)) | Sort-Object -Unique
if (Compare-Object ($files | Sort-Object) $changed) { throw 'Scope differs; review before staging' }
# Stop and reconcile if origin/main differs from the reviewed base before this step.
git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged diff check failed' }
git diff --cached --stat
git diff --cached
# Continue only after independently reviewing the staged diff:
git commit -m 'fix(admin): scope organizer lead restoration and preserve outreach history'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push -u origin fix/hm-audit-05-scoped-organizer-lead-restore
if ($LASTEXITCODE -ne 0) { throw 'Push failed' }
gh pr create --base main --head fix/hm-audit-05-scoped-organizer-lead-restore --title 'fix(admin): restore individual organizer leads to a safe review hold' --body-file docs/security/hm-audit-05-scoped-organizer-lead-restore.md
```

These commands publish review material only. They do not authorize deployment, production SQL, sending email or merging.
