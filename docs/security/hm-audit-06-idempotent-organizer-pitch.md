# HM-AUDIT-06 — idempotent organizer pitch

**Verdict: READY FOR PR**, with the disclosed Windows baseline failure and rollout prerequisites below. This is readiness for independent review, not permission to merge or deploy.

Base: `0a632008d0459b8a84171bc620d4176df7dab864`.
Branch: `fix/hm-audit-06-idempotent-organizer-pitch`.
All work remains local and unstaged. Earlier HM03–HM05 Git exceptions do not authorize HM06 publication. No production mutation, real email, deployment, merge or HM07 work occurred.

## 1. Root cause and verified concurrency failure

1. Requests A and B authenticate independently and read the same eligible organizer.
2. Both pass the daily budget check, which is advisory and reserves no quota.
3. Both contact Resend before either CRM update commits.
4. A conditional CRM update may reject one writer after both external side effects already occurred.

Individual Pitch and Bulk Pitch call the same manual endpoint. The existing scheduler inserted a unique durable recipient key before provider contact; manual sending did not participate. The legacy automatic helper relied on CRM history filtering alone.

## 2. Durable claim design and uniqueness scope

Migration: **`supabase/migrations/20261107112640_idempotent_organizer_pitch.sql`**.

Reuse `public.app_settings(key text PRIMARY KEY, value text NOT NULL)`; no new tables, table grants, RLS/policy changes, quota rewrites or backfill.

| Key | Purpose |
| --- | --- |
| organizer:pitch:v1:intent:<UUID> | Retained attempt journal: immutable identity/fingerprint/lead/recipient hash, state, provider ID and bookkeeping outcomes |
| organizer:pitch:v1:lead:<lead UUID> | Latest attempt pointer; stops different recipients/contents/intent IDs bypassing an outstanding lead attempt |
| cron:organizer-outreach:v1:recipient:<SHA256(normalized email)> | Durable recipient exclusion shared with the pre-existing scheduler; stops alternate CRM records bypassing suppression |

Recipient identity is one trimmed lower-case address. Claim keys contain hashes/UUIDs, not plaintext addresses. New journals do not add plaintext message bodies or recipient addresses. An exact historical scheduler receipt is archived as `legacy_claim` before its pointer is replaced during an approved re-pitch, preserving all prior fields and provider IDs. Existing managed journals are retained when new ones are added. Hashes are not anonymization; protect the ledger with existing RLS and service-role controls.

`claim_organizer_pitch(uuid,uuid,text,text,text,text)` uses a transaction-scoped advisory lock, locks the selected lead and existing claim rows, and relies on the primary-key conflict check plus guarded updates. No provider request occurs inside a database transaction. The advisory lock serializes short claim/transition operations across all updated sender instances, not the duration of email dispatch.

The normalized outgoing payload and sandbox configuration are fingerprinted using SHA256. An existing intent must match its lead, normalized recipient, fingerprint and sender mode. Different intent UUIDs still cannot bypass lead/recipient exclusion. Claim acquisition returns a matching UUID/fingerprint receipt; malformed or unavailable results fail closed.

SQL rechecks live eligibility under the lead lock. Automatic modes additionally require status=new, absent contact history and a matching current organizer address. Scheduled mode rechecks the existing exact approval-note marker. Known historical recipients on other CRM rows remain suppressed.

Manual eligible statuses are now explicit: new, no_email, pitch_sent, opened, replied, negotiating and partner_live. Removed, archived, unknown-outcome, restored_review, declined, null and unknown future statuses default-deny. This intentionally tightens the previous permissive null/unknown behavior. Existing authorized CRM editing remains unchanged; it cannot remove the new ledger's hold.

## 3. Authorization and SQL privileges

The manual route retains unchanged `requireOutreachAdmin`. It validates one lead UUID and one intent UUID, recipient, nonempty bounded subject/HTML, optional predecessor token and exact body keys before any claim. Malformed JSON, arrays, non-string values, controls and broad URL/body filters fail without provider contact.

Both RPCs are SECURITY INVOKER, VOLATILE, fixed empty search_path and schema-qualified. EXECUTE is explicitly revoked from PUBLIC, anon and authenticated and granted only to service_role, apart from inherent trusted owner/administrator powers.

- `public.claim_organizer_pitch(uuid,uuid,text,text,text,text)`
- `public.record_organizer_pitch(uuid,text,text,text)`

No broad grants or RLS weakening are introduced. Existing service-role SELECT/INSERT/UPDATE privileges on app_settings and SELECT/UPDATE on organizer_leads are prerequisites. Read-only production metadata confirmed those privileges; app_settings RLS is enabled with no policies, so existing browser-role table grants do not authorize access. It confirmed PostgreSQL 17.6, built-in sha256(bytea), no user triggers on the two tables and no pre-existing HM06 functions. No production data was changed or provider request made to verify this.

Errors expose fixed public messages and validated SQLSTATE/PostgREST codes, not raw database messages, claim payloads or recipients. The shared claim module is server-only. No new secret/environment variable is required.

## 4. Attempt state machine and crash guarantees

| State/outcome | Provider contact / behavior |
| --- | --- |
| claimed | Ownership committed, provider not contacted by this attempt yet |
| dispatching | Persisted before fetch; provider may have been contacted |
| accepted | Valid provider receipt; delivery unconfirmed |
| sandbox_accepted | Provider accepted sandbox recipient; intended audience not contacted |
| rejected | Definitive non-408/non-409 4xx rejection; claim retained |
| unknown | Timeout, transport failure, 5xx, 408/409 or ambiguous response; claim retained |
| not_dispatched | Dispatcher made no request, e.g. configuration unavailable; claim retained |
| duplicate / approval_required / blocked / conflict | This call makes no provider request |
| unavailable | Claim/transition unavailable or unconfirmed; this call makes no provider request |

The acquired claim must be followed by a confirmed persisted dispatching transition before the first provider request. A crash at either pre-send stage leaves a durable hold; no timer expires or deletes it. Unknown/rejected/incomplete attempts do not become retryable when CRM state is edited or bookkeeping fails.

`record_organizer_pitch` permits only valid compare-and-set transitions. Terminal states/provider IDs cannot be rewritten by replaying an outcome transition. CRM and accounting completion are separate fields. Accepted provider responses remain accepted even if the outcome RPC, CRM update, accounting or refresh fails; responses/UX say manual review required and **DO NOT RESEND**.

Accepted CRM bookkeeping retains existing pitch_sent_at and nonblank last_sent_to rather than overwriting historical evidence. Image timestamps/counts, notes and creation time are untouched. Opened/replied/negotiating/partner_live progress is retained when its expected state still matches. A competing state change causes failed bookkeeping rather than reviving suppression. The journal stores the new attempt's provider ID and timestamp separately.

An exception during a claim transaction rolls back all its inserted pointers. Once claim acquisition commits, exceptions/crashes never authorize another provider request automatically. An acceptance whose journal write fails may leave dispatching evidence without a persisted provider ID; provider history and the returned receipt then require reconciliation. This is an uncertainty boundary, not a reason to resend.

**Actual guarantee:** tested normal application paths admit at most one provider request for a claimed intent, and different unapproved intents cannot bypass the durable lead/recipient gate. Explicitly approved completed successors are separate sends. This is not mathematical exactly-once delivery, nor protection against a database administrator deleting claims or unrelated applications sending email.

## 5. Provider idempotency

The dispatcher accepts an optional `{ idempotencyKey }` second argument. Unrelated callers remain opt-in and keep existing behavior. Organizer sends use `hm-organizer-pitch/v1/<intent UUID>`; malformed keys stop before fetch. A single immutable fingerprint binds each intent to its payload, and duplicate claims never replay the provider request.

[Resend documents](https://resend.com/docs/dashboard/emails/idempotency-keys) an optional Idempotency-Key header with 24-hour retention. Payload mismatch and concurrent-request conflicts both use 409 with different names. The dispatcher distinguishes their safe messages but treats both as unknown, keeps retrySafe=false and does not retry. The database keys have no expiry and remain the primary safeguard beyond the provider window.

The synthetic HTTP provider test verifies stable-key replay returns one receipt and conflicting payload reuse produces unknown/409. A separate focused dispatcher test verifies that an unrelated call still omits the optional header.

## 6. Intentional re-pitch and admin UX

The composer creates one stable intent UUID when opened, and uses a synchronous ref guard plus disabled controls against duplicate clicks. Server-side claims remain authoritative.

A first unapproved request for previously contacted/completed history returns approval_required and an opaque predecessor token without acquiring a new send. The UI then offers **Review and authorize separate re-pitch**, followed by a separate confirmation explaining that another email is intentional. It freezes the reviewed payload and submits a new intent with that predecessor token only after explicit confirmation.

Managed predecessor attempts must be accepted with CRM and accounting recorded. Historical sending needs a current history-snapshot token; an old scheduler claim additionally needs accepted/provider-ID/send-timestamp evidence. The receipt is archived before replacement. Concurrent approvals for the same predecessor admit only one successor; later attempts cannot consume the old token again.

Unknown, rejected, sandbox-only, not-dispatched or incomplete managed attempts remain held. There is no automatic recovery endpoint or automatic release. An operator must inspect durable evidence and provider records; any recovery beyond the completed-acceptance path needs a separate verified, reviewed procedure. Never clear a claim or edit CRM merely to make a send work.

Bulk Pitch creates distinct stable intents per selected lead, excludes restored-review records, prevents duplicate UI batches and never automatically authorizes re-pitch. Previously contacted selections report the need for individual re-pitch approval. Existing individual sending, bulk first-contact sending, notes/email/status editing and restoration review remain available.

## 7. Cross-sender boundary and preserved audits

All three updated organizer-pitch boundaries use the shared durable claim helper: manual route, scheduled worker and legacy automatic helper. A real parallel test runs them against one recipient and counts exactly one HTTP provider request.

The scheduler keeps its once-per-IST-day key and five-send admission. Old scheduler recipient keys are recognized; existing unknown/incomplete claims are never recycled. The legacy automatic helper now claims before sending as well; it currently has no runtime caller in src, but its exported path is protected for future callers/tests.

The global daily quota and accounting remain advisory, not an atomic cross-sender/global reservation. No new guarantee of a concurrent global cap is claimed. Accounting failure is visible and keeps repeat contact blocked.

HM03 HMAC/verification/RPC code is unchanged; its real prefetch regression still proves first-send bookkeeping is not defeated by an early image request. Signed/unsigned images cannot revive HM05 held/removed records. Signed replay and client prefetch remain possible on eligible active states; image requests do not prove human reading. The five-day cleanup remains dormant.

HM04 deletion/auth/SQL and HM05 restore/list/migration code are unchanged. Their API/UI/native/browser regressions run with the new send-intent fixtures. Unrelated notifications, broadcasts and summaries do not participate in this organizer-pitch gate; this is not global deduplication for all mail.

## 8. Verification results

All tests use synthetic fixtures, fake addresses/UUIDs, no .env files or real provider credentials. Native tests allocate fresh loopback PostgreSQL 18 clusters and clean them in finally. Live metadata was read-only on PostgreSQL 17.6; this session does not claim a deployed or Linux end-to-end run. Chromium uses the package-pinned local download; Rack also uses installed Chrome in isolation.

| Check | Confirmed result / evidence |
| --- | --- |
| New focused API/provider tests | 55 passed, 0 failed/skipped; hm06-unit.log |
| New React send/approval/bulk tests | 10 passed, 0 failed/skipped; hm06-ui.log |
| Combined focused rerun | 65 passed, 0 failed/skipped; hm06-focused-final.log |
| Final HM06 native SQL + HTTP provider | 27 passed, 0 failed/skipped after history fix; hm06-native-final.log, exit 0 |
| Combined HM03/HM04/HM05/HM06 native selection | 60 passed, 0 failed/skipped; hm06-native-regressions.log, exit 0; overlaps above, ran before final archive assertion |
| Existing email reliability/scheduled/restoration API selection | 150 passed, 0 failed/skipped; hm06-compat-unit.log |
| Other email/restoration React selection | 19 passed, 0 failed/skipped; hm06-other-ui.log |
| Exact updated PR offline selection | 1,427 passed, 1 known Windows baseline failure, 0 skipped; 1,428 reported tests; hm06-pr-regression.log |
| Updated full PR Chromium selection | 9 passed, 0 failed/skipped; hm06-browser-regressions.log |
| Aggregator offline qualification | 2,012 passed, 0 failed/skipped; hm06-aggregator-regressions.log |
| Aggregator lint gate | PASS: 45 scoped files, 0 new errors/warnings; legacy diagnostics only decreased; hm06-aggregator-lint.log |
| Rack network-boundary self-test | 8 passed, 0 failed/skipped; hm06-rack-isolation.log |
| Rack offline partner selection | 850 passed, 0 failed/skipped; hm06-rack-regressions.log |
| Rack desktop/mobile portal browser | 19 checks passed, 0 failed; hm06-rack-browser.log |
| Rack conversion browser | 32 checks passed, 0 failed; hm06-rack-funnel.log |
| Preserved PPT browser journeys | 2 viewport journeys passed, 0 failed; hm06-rack-ppt.log |
| Existing core-page query smoke | PASS: 10 reads, 0 mutations; hm06-core-smoke.log; query transport, not production rendering/RLS |
| TypeScript | PASS; npm run typecheck -- --incremental false --pretty false; hm06-typecheck-final.log |
| Changed-file lint vs base | 0 new diagnostics; hm06-lint-final.log; existing OutreachTab 14 vs 15, scheduled test 2 vs 2, other changed code/tests 0 |
| Offline production webpack build | PASS, exit 0; 89/89 pages generated; hm06-build.log |
| Diff/scope/secrets audit | Exactly 19 scoped files; unstaged; no credentials or generated artifacts in change set; final manifest under ignored build/verification |

Counts overlap and must not be added as unique tests. No tests were skipped, removed or weakened. Existing fixtures gained valid intent/lead UUIDs and RPC behavior; native adapters execute actual migrations. The scheduled claim-count assertion increased from 2 to 4 to include the retained intent and lead pointer. The HM03 adapter isolates JSON from psql's SET status output; its original assertions remain.

No GitHub Actions run, PR, commit or push exists for HM06. Local Node 24.17.0/Windows results are distinct from the Node 22/Ubuntu workflows that will run after owner publication. CI now includes the new focused, native and Chromium tests.

## 9. Baseline failures and environment observations

The sole final offline selection failure is the unchanged scripts/test-database-report-workflow.cjs:11 LF-only marker against daily-database-report.yml's Windows CRLF checkout, producing 1 !== 2. Both files match the reviewed main after newline normalization. Exact untouched copies under ignored build/verification/baseline reproduce it; hm06-baseline.log. Neither source file was changed, skipped or normalized.

Initial Chromium tests could not launch because the newly pinned binary was absent; installing the package's Chromium resolved this environment failure, and all final browser tests passed. A review agent's independent PostgreSQL initdb probe failed at a sandbox WAL rename; it did not touch production, and is not claimed as a passing native run. Root's permitted local native runs completed.

Existing Sentry/middleware/Edge build warnings and synthetic unavailable-event fallbacks remain. Rack retirement/Turbopack and Aggregator's separately compiled PG17.6 qualification are not claimed as newly executed here: no retired route or aggregator SQL changed; the relevant Rack browser/test selections, offline webpack build, Aggregator selection/lint and HM06 native SQL were verified.

## 10. Migration prerequisites and exact deployment sequence — owner only, not executed

1. Independently review this change and fresh main. Verify target project and current migration history read-only. Do not blindly apply unrelated pending migrations or use an unreviewed supabase db push.
2. Confirm app_settings key/value types, primary key, RLS/policies and service-role SELECT/INSERT/UPDATE; organizer_leads UUID/status/history columns and service-role SELECT/UPDATE; no unexpected user triggers; built-in sha256(bytea); no conflicting HM06 signatures. Compare reviewed SQL with installed definitions if already present; stop on drift.
3. Before enabling the new code, pause **all organizer-pitch entry points**: manual POST /api/admin/send-organizer-pitch, scheduled /api/cron/organizer-outreach, and any external/legacy caller of autoSendPitchEmailsForLeads. Do not run a send to test this block. Keep other CRM operations available where practical.
4. Drain old deployed instances and already admitted jobs. Reconcile old in-flight/uncertain provider attempts using read-only provider history and existing CRM/claims. Do not assume an old timeout meant no email. Do not resume until uncertain old work has an independently reviewed durable suppression decision. The new ledger cannot reconstruct unrecorded pre-HM06 side effects.
5. Apply **only supabase/migrations/20261107112640_idempotent_organizer_pitch.sql** as its reviewed transaction. It creates two functions and ACLs without rewriting data. Installation failure rolls back; stop and investigate before application rollout.
6. Verify function metadata and service-role rights read-only. Verify both PUBLIC and browser roles lack EXECUTE, invoker security and empty search_path, exact definitions and required table rights. Example metadata checks are below. Do not invoke the production claim RPC as a smoke test.
7. Reconcile only this migration version after exact successful SQL application. If manually applied and its history row is absent, the owner may use supabase migration repair 20261107112640 --status applied --linked after verifying the linked project. This records history, not SQL. Never mark failed/unapplied/different SQL as applied or conceal unrelated drift.
8. Deploy compatible frontend, manual route, shared dispatcher/claims and both automatic helpers together. Existing Resend sender/key/sandbox and HM03 signing configuration must already be valid; no new secret is introduced. Old clients lacking intentId now receive 400. Migration alone does not fix an old unclaimed sender.
9. If migration/ACL/schema-cache recognition is missing, claims fail closed; keep sending paused. Never fall back to unclaimed dispatch or repair availability by broadening RLS/table privileges.
10. In approved staging, use only synthetic leads/provider fixture to verify first send, parallel exclusion, unknown holds and explicit successor approval. Production verification is metadata/history-only for this handoff. Resume entry points only after compatible versions are active and old in-flight uncertainty is reconciled.

Read-only verification examples for the operator:

```sql
SELECT p.oid::regprocedure, p.prosecdef, p.proconfig, p.proacl
FROM pg_catalog.pg_proc p
WHERE p.oid IN (
  'public.claim_organizer_pitch(uuid,uuid,text,text,text,text)'::regprocedure,
  'public.record_organizer_pitch(uuid,text,text,text)'::regprocedure
);
SELECT r, has_function_privilege(r,
  'public.claim_organizer_pitch(uuid,uuid,text,text,text,text)','EXECUTE') AS can_claim,
  has_function_privilege(r,
  'public.record_organizer_pitch(uuid,text,text,text)','EXECUTE') AS can_record
FROM unnest(ARRAY['anon','authenticated','service_role']) r;
SELECT p.oid::regprocedure, a.privilege_type
FROM pg_catalog.pg_proc p
CROSS JOIN LATERAL pg_catalog.aclexplode(p.proacl) a
WHERE p.oid IN (
  'public.claim_organizer_pitch(uuid,uuid,text,text,text,text)'::regprocedure,
  'public.record_organizer_pitch(uuid,text,text,text)'::regprocedure
) AND a.grantee=0; -- Must return no PUBLIC grants.
```

For an uncertain attempt, an authorized operator may read the exact intent journal by known UUID and inspect its state/provider ID/predecessor, then compare provider records. Do not parse every unrelated app_settings value as JSON: lead pointers and existing unrelated settings are plain text. Do not delete keys, change terminal states, clear evidence or retry provider requests as part of routine recovery. A further recovery procedure requires separate verified authorization/review; none is implemented or executed here.

## 11. Rollback and limitations

Prefer a forward fix. If the new path must stop, pause organizer sends or keep a reviewed route returning a clear unavailable response while retaining all durable claims and sender guards. A reviewed follow-up migration may revoke EXECUTE on these two functions; missing permission then fails closed.

Never roll back to the old unclaimed manual/legacy sender. If reverting broader application code is unavoidable, block organizer sending first and carry the durable guards forward. Do not clear claims, bulk-reset CRM status, drop journals, erase provider IDs or delete migration history. Retire functions only after all callers are retired through a separate reviewed migration; preserving durable suppression remains mandatory.

Residual boundaries:

- At-most-one admission/provider attempt is not proof of delivery or mathematical exactly-once semantics.
- Old admitted sends and pre-HM06 unrecorded side effects cannot be recalled; release draining/reconciliation is required.
- Other email categories/unrelated senders are outside organizer-pitch coordination.
- Advisory daily/global quotas can race and accounting can be incomplete; this change does not redesign them.
- Provider accepted but failed persistence may require provider-history reconciliation. Unknown/rejected/not-dispatched/incomplete states can remain held indefinitely; no timed automatic recovery exists.
- SHA256 email hashes can be guessed; RLS/service-role protection remains important.
- The journal grows; future retention/cleanup must preserve suppression and provider evidence. No cleanup/expiry is introduced.
- Existing authorized administrators can edit CRM and deliberately approve a valid repeat, but cannot bypass a new outstanding claim through status editing. Pre-HM06 uncertainty still needs disciplined review.
- The existing parent CRM loader logs/catches refresh failures, so the table can remain stale. The accepted outcome remains truthful; do not resend for a refresh failure.
- Live keyset listing and signed pixel replay/prefetch limitations from HM03/HM05 remain documented and unchanged.
- The short global transaction lock favors correctness at current outreach volume; growth may require measured redesign rather than weakening uniqueness.
- Local fixtures do not certify deployed infrastructure/RLS, provider delivery or live end-to-end behavior.

## 12. Independent reviews

### Standards

The independent reviewer found one P2 blocker: an approved historical re-pitch overwrote the legacy scheduler receipt and lost its prior provider ID. Fixed by archiving the exact old receipt as legacy_claim before replacement. The reviewer rechecked the fix and found no remaining actionable Standards/security blockers.

### Specification

The independent Spec reviewer found the same history-preservation blocker. It rechecked the archive/equality assertion and reported no remaining Spec blockers or unrelated scope creep. It confirmed the distributed coordination, predecessor CAS, fail-closed receipts, uncertainty handling, UI approval and provider-call test coverage. It did not claim an independent native pass after its sandbox initialization failure.

Review totals: one shared blocker discovered and resolved; zero remaining blockers per axis. Root reran the affected real native suite successfully after the fix. Null/unknown/declined default-deny and release-draining boundaries are explicitly documented above.

## 13. Exact scoped files and guarded owner handoff

Exactly 19 files:

1. .github/workflows/pr-validation.yml
2. docs/security/hm-audit-06-idempotent-organizer-pitch.md
3. scripts/organizer-pitch-claim-fixture.cjs
4. scripts/test-email-open-local.cjs
5. scripts/test-email-reliability.cjs
6. scripts/test-organizer-lead-restore-browser.cjs
7. scripts/test-organizer-lead-restore.cjs
8. scripts/test-organizer-pitch-browser.cjs
9. scripts/test-organizer-pitch-local.cjs
10. scripts/test-organizer-pitch-ui.cjs
11. scripts/test-organizer-pitch.cjs
12. scripts/test-scheduled-organizer-outreach.cjs
13. src/app/admin/_tabs/OutreachTab.tsx
14. src/app/api/admin/send-organizer-pitch/route.ts
15. src/lib/admin/autoSendPitches.ts
16. src/lib/admin/organizerPitchClaims.ts
17. src/lib/admin/scheduledOrganizerOutreach.ts
18. src/lib/emailDispatch.ts
19. supabase/migrations/20261107112640_idempotent_organizer_pitch.sql

The assistant has not staged, committed, pushed or opened a PR. These are guarded **owner commands**, to use only after independent review and publication authorization:

```powershell
Set-Location 'C:\Users\yashs\OneDrive\Desktop\HackerMate_Backup\hm-audit-06-idempotent-organizer-pitch'
git status --short --untracked-files=all
git fetch origin main
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
if ((git branch --show-current) -ne 'fix/hm-audit-06-idempotent-organizer-pitch') { throw 'Wrong branch' }
if ((git rev-parse HEAD) -ne '0a632008d0459b8a84171bc620d4176df7dab864' -or
    (git rev-parse origin/main) -ne '0a632008d0459b8a84171bc620d4176df7dab864') { throw 'Base moved; inspect and reconcile before publication' }
if (git diff --cached --name-only) { throw 'Unexpected existing staged changes' }
$files = @(
  '.github/workflows/pr-validation.yml'
  'docs/security/hm-audit-06-idempotent-organizer-pitch.md'
  'scripts/organizer-pitch-claim-fixture.cjs'
  'scripts/test-email-open-local.cjs'
  'scripts/test-email-reliability.cjs'
  'scripts/test-organizer-lead-restore-browser.cjs'
  'scripts/test-organizer-lead-restore.cjs'
  'scripts/test-organizer-pitch-browser.cjs'
  'scripts/test-organizer-pitch-local.cjs'
  'scripts/test-organizer-pitch-ui.cjs'
  'scripts/test-organizer-pitch.cjs'
  'scripts/test-scheduled-organizer-outreach.cjs'
  'src/app/admin/_tabs/OutreachTab.tsx'
  'src/app/api/admin/send-organizer-pitch/route.ts'
  'src/lib/admin/autoSendPitches.ts'
  'src/lib/admin/organizerPitchClaims.ts'
  'src/lib/admin/scheduledOrganizerOutreach.ts'
  'src/lib/emailDispatch.ts'
  'supabase/migrations/20261107112640_idempotent_organizer_pitch.sql'
)
$changed = @((git diff --name-only); (git ls-files --others --exclude-standard)) | Sort-Object -Unique
if (Compare-Object ($files | Sort-Object) $changed) { throw 'Unexpected scope; review before staging' }
git diff --check
if ($LASTEXITCODE -ne 0) { throw 'Diff check failed' }
git add -- $files
if ($LASTEXITCODE -ne 0) { throw 'Staging failed' }
git diff --cached --check
if ($LASTEXITCODE -ne 0) { throw 'Staged diff check failed' }
git diff --cached --stat
git diff --cached
# Continue only after independently reviewing the staged diff:
git commit -m 'fix(security): claim organizer pitch intents before provider dispatch'
if ($LASTEXITCODE -ne 0) { throw 'Commit failed' }
git push -u origin fix/hm-audit-06-idempotent-organizer-pitch
if ($LASTEXITCODE -ne 0) { throw 'Normal push failed; do not force-push' }
gh pr create --base main --head fix/hm-audit-06-idempotent-organizer-pitch --title 'fix(security): prevent duplicate organizer pitches with durable send intents' --body-file docs/security/hm-audit-06-idempotent-organizer-pitch.md
```

Publishing review material does not authorize production SQL, secret changes, deployment, emails or merging.
