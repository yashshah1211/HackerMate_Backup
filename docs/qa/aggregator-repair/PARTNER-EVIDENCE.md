# Partner evidence and bounded legacy review

Implementation baseline: merge `218d03e3c1a415a6fb991bef66e847ff3ef84e6c`. This follow-up addresses the confirmed Rack It Up format, partner protection, field-aware evidence, legacy review and empty verified-directory experience. It does not repeat the live investigation or authorize release operations.

## Evidence and before/after result

The completed live observation retained the complete three-round inventory and registration values for Unstop `1777639`, checked at `2026-11-03T15:26:35.099Z`. The original response was 35,648 bytes, SHA-256 `abe9efb958c4a03830ca9b1cdb0f5c8b12ca740b4be83b1b39f2addee2a61902`. **The full raw response was not archived.** The committed fixture explicitly identifies itself as captured contract fields, not that full response. Its exact inventory SHA-256 is `c178df17c418aa4dc8f9c334cb41cffb43acb24ad67534e92fd4d286352f77ea`. Tests use a synthetic category/details wrapper and compute a different fixture hash. They never manufacture a new live check or an adoption authorization.

Running this same captured-field projection through the baseline and new parser gives:

| Contract | Baseline aggregator-8 | New aggregator-9 |
| --- | --- | --- |
| Shared observation validation | Valid registration observation | Valid registration and replayed schedule observation |
| Registration | Open; deadline `2026-12-09T23:59:00+05:30` | Unchanged |
| Event evidence | Unverified; null dates | Replayed v3; `2026-12-11T18:00:00+05:30` through `2026-12-13T18:00:00+05:30` |
| Partner factual updates | Protected | Still protected; new channel changes metadata only |
| Evidence-only public result | Not supported | Registration Open; organizer-managed schedule remains unverified for lifecycle purposes |

The provider grammar accepts public enabled `App\Model\Rounds`, `NOT_STARTED`, numbered labels and plain list markup. The timed build statement must agree with the structured dates, India timezone, published weekdays and duration. Registration and linked finals can be excluded only with supported activity statements, complete boundaries, agreeing metadata and chronology relative to the build. Unknown siblings, contradictory parents/children, mixed building/finals, hidden markup and unsupported wording cannot supply event authority. Existing strict formats and v3 replay remain required; the marker alone is insufficient.

## Persistence boundary

`store_hackathon_source_evidence` is an additive, service-only, SECURITY INVOKER function in `supabase/migrations/20261103154847_verified_source_evidence.sql`. **This migration has never been executed by this change.** It changes neither table permissions nor existing factual functions/partner guards. Every UPDATE assigns only `source_metadata`; no relationship, participant, organizer, partner setting or editorial column is assigned. Stable identity locking, duplicate detection, URL binding, a complete typed factual/control comparison, attempt receipts and freshness checks apply. Existing conflicting registration fields are protected too, with India calendar-day normalization.

Initial metadata adoption requires an explicitly approved current observation bound to one UUID, provider ID, source hash and checked time. The server helper validates the same observation contract before invoking the metadata function. The operator tool has no default action, separates `--review` from `--apply-approved-evidence`, requires explicit project confirmation for apply, limits apply to 20 distinct reviewed entries and refuses stale/mismatched approvals. These are privileged operator controls, not cryptographic proof of provider authenticity. No HTTP adoption endpoint exists. Routine synchronization requires already adopted `evidence_only: true` metadata and cannot initialize legacy metadata. Missing functions fail closed without a factual-writer fallback.

Evidence-only projection permits only validated registration fields to overlay physical columns. Organizer descriptions, tags, names, dates, links, team sizes and all other editorial fields remain unchanged. A protected editorial field no longer invalidates independently validated registration. Registration locks, failures, checking, expiry, invalid identity or contradictory evidence still remove registration authority. Evidence-only source metadata cannot generate factual patches. The synthetic SDK end-to-end path preserves an existing participant registration and partner configuration and produces `registration_open`; it does not execute SQL.

## Legacy review and population accounting

`preview-legacy` is a read-only admin review mode, also available through the operator tool's `--review`. It reads the complete bounded catalog for duplicate checks and selects a stable UUID cursor page of 1–50 null-metadata records (default 20). Provider URLs and stable Unstop IDs match legacy aliases; names are never identity. Partner/organizer-linked external records are eligible for evidence review, while native, unsupported and duplicate identities are held. Provider checks remain bounded by the existing transport budget. Every result has empty actionable `changes`, and `approvedWrites` is zero. A failed/budget-exhausted row is unresolved and must be retried/reviewed; advancing the cursor is not approval of it.

The previously observed **410** is a historical catalog population, not 410 verified opportunities or approvals. The regression uses **410 synthetic records** to prove complete cursor coverage and stable-identity duplicate holds; it does not requery or mutate the historical population. Existing audit JSON and source evidence are unchanged. All historical/derived count distinctions from PR #99 continue to apply. Routine cron still cannot adopt any of those records automatically.

## Finite acceptance matrix

| Scope | Result and evidence |
| --- | --- |
| Captured Rack round and registration fields | PASS: exact retained inventory hash, v3 replay, exact instants and independent registration |
| Alternate valid typed/numbered build format | PASS |
| Duration/prose/structured-date conflicts, missing end, private build, contradictory detail/parent, ambiguous sibling, overlapping registration, finals also building, unsafe HTML, overdue NOT_STARTED | PASS: no event authority or date patch |
| Prior sibling/judging/presentation/orientation exploits; malformed identities/caches and both resume modes | PASS in the complete existing offline regression selection |
| Native, Unstop, Devfolio, Hack2Skill; India calendar-day/UTC and expiry boundaries | PASS in focused and existing offline suites |
| Editorial versus registration locks; checking/failure/expiry | PASS: field-aware authority remains fail closed |
| Initial approval missing/mismatched/stale | PASS: no RPC reached |
| Adopted partner refresh success/failure | PASS: actual SDK transport reaches metadata lease/apply/failure only; no factual patch |
| Partner/participant preservation | PASS in synthetic end-to-end path; no production writer invoked |
| Legacy batches and duplicate identities | PASS: all 410 synthetic UUIDs covered once, duplicates held, zero preview writes |
| Empty verified directory | PASS: accessible Browse all listings action; existing links/unverified labels; no fabricated Active status |
| New migration SQL | Static assignment/permission/guard review only; NOT EXECUTED or runtime-qualified |

Final local qualification:

- `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-aggregator-partner-evidence.cjs`: 25/25 passed (also included in the full selection).
- `node scripts/qualify-aggregator.cjs`: 1,913/1,913 passed; zero failures, skips or cancellations.
- `npx tsc --noEmit`: passed.
- `node scripts/lint-aggregator.cjs`: 41 scoped files, zero new errors/warnings; exact existing detail/outreach diagnostics retained.
- `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-mission20-discovery-hotfix-browser.cjs`: 3/3 width groups passed. Actual components at 390, 768 and 1440px exercise guest/member paths, registration evidence, preserved editorial details and empty verified-directory browsing, with external requests/mutations denied.
- `node qa/rack-qualification.cjs build`: passed, three synthetic reads, zero mutations. Uses a synthetic loopback-only database, offline fonts and the existing network guard. The first Windows attempt failed creating `.next` output with EPERM; the same isolated build passed after granting output-directory permission. Existing Next/Sentry configuration warnings remain unrelated.
- `git diff --check`: passed.

No local PostgreSQL or hosted test was run. New SQL is static-reviewed only. The existing GitHub PostgreSQL 17.6 fixture remains unchanged and executes only its explicitly selected original migration.

## Release holds

No SQL, production synchronization, adoption, migration, settings change, deployment or promotion was performed. Production migration state remains **UNVERIFIED** because earlier owner statements and the committed historical runbook conflict. A separately approved read-only preflight must establish installed schema/functions before any database operation. The new function requires later SQL review/approval and runtime qualification; GitHub's existing disposable PG17.6 suite executes only the original migration and does not qualify this new one. Tests passing do not establish production readiness.

Keep ignored-build `node -e "process.exit(0)"`, cron disabled and both scraper endpoints blocked. Both public domains were checked against the existing production deployment before publication. A fresh authorized provider observation, per-record approval, migration approval and release approval remain separate gates. No captured historical fixture is eligible for adoption. Conservative unknown schedules remain an accepted false negative; they never invent Active/Ongoing/Ended status.
