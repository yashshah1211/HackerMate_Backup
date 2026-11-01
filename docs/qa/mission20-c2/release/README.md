# Mission 20 release-readiness gate

**Decision: NO-GO for production/staging migration, merge, deployment or unfreeze.** Candidate documentation/acceptance package is ready for independent review; it is not an execution-ready, live-compatible migration certification. Founder confirms new RPCs/policies are absent in production. C2 cannot safely be deployed there yet. All three PRs remain Draft.

Baseline: #92 e2e3643, #93 541ed46, #96 f918ee0. Baseline CI has 1,613 application cases, 51 SDK/writer cases, native PG17.6 SQL/concurrency and 32 Rack checks, TypeScript/scoped lint/build passed. Current follow-up qualification and exact commit/job outcomes are recorded in PR #96; the receipt file records the immutable source run rather than predicting a green result.

Atomic candidate qualification passed on PG17.6 at [e566788 / run 41327981723](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41327981723): 12 new atomic groups and 231 privacy assertions; full run 1,620 application cases / 51 SDK cases / 100 orchestration checks / 32 Rack checks, TypeScript/scoped lint/build passed. This is isolated acceptance, not execution approval.

New catalog reconciliation and atomic candidate: [confirmed/unresolved/mismatched facts](CATALOG-RECONCILIATION.md) and [review-only final transaction/version plan](atomic/README.md). The latest production main SHA is 17b78d0; no Vercel hold is verified.

## Package

- [SCHEMA-COMPATIBILITY.md](SCHEMA-COMPATIBILITY.md): exact required contracts, documented facts versus unconfirmed live assumptions, policies/grants, owners/helpers/trigger graph, ledger and packaging blockers.
- [CATALOG-REQUESTS.select-only.sql](CATALOG-REQUESTS.select-only.sql): exact SELECT-only requests for independent authorized execution. Codex makes no production connection. Full live definitions are private audit evidence.
- [SQL-MANIFEST.json](SQL-MANIFEST.json): normalized source hashes for every proposed C1/C2 SQL artifact, stage order and fixtures excluded from promotion. Review filenames are not migration versions.
- [DEPLOYMENT-RUNBOOK.md](DEPLOYMENT-RUNBOOK.md): eight explicit future approval boundaries, Vercel automatic-deployment hold, native/community freeze scope, old clients, contract ordering, acceptance, unfreeze and fail-closed recovery.
- [ACCEPTANCE-EVIDENCE.json](ACCEPTANCE-EVIDENCE.json): exact observed qualification and limitations. No hosted-service acceptance is inferred from mocks.
- `scripts/qualify-mission20-release-postgrest.cjs`: all existing C1/C2 tests, then real native PostgREST 16.5 â†’ fresh PG17.6 (CI), short-lived locally signed JWTs, unprivileged authenticator role switching and real database transactions. Existing native runner owns allocation/cleanup; no host/URL/project/credential CLI overrides.

## Concise go/no-go matrix

| Gate | Status / reason |
| --- | --- |
| Independent-review package / source traceability | Candidate complete; source-hashed SQL order, tests and operational prerequisites supplied. No active migrations created. |
| Existing application/SDK/build/browser baseline | PASS at f918ee0. Existing full-file lint debt 17 errors / 7 warnings remains separately recorded; scoped checks clean. |
| Native PG17.6 SQL/concurrency | PASS in the [qualified source run](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41323221862): 279 baseline/security assertions per variant, 88 total orchestration checks, two owned clusters cleaned. |
| Real PostgREST JWT/role/RLS/database boundary | PASS in that fixture run: 15 real HTTP groups plus one catalog-syntax group. Production PostgREST version/config parity remains unsigned. |
| Hosted Supabase Auth + actual gateway/session lifecycle | **BLOCKED / NOT ESTABLISHED.** No hosted/local GoTrue stack, real login/email/SSO/MFA/revocation or production gateway acceptance. Existing SDK Auth transport is synthetic; local fixture JWTs only prove PostgREST validation/role switching. |
| Exact live schema/ACL/body/dependency/ledger parity | **BLOCKED.** Confirmed types/default contracts, junction + six CASCADE edges, ledger 147/latest 20261025081515 and four normalized bodies are reconciled. Full raw-body/ACL/dependency/ledger receipts and hardened add-member parity remain absent. |
| Execution-ready migration packaging | **BLOCKED.** Atomic review candidate and tentative versions now produced; execution approval, raw fingerprint parity, final allocation and matching-schema qualification still required. Comparator intermediates are absent from the candidate. |
| Freeze scope / recovery ACL decision | **BLOCKED pending founder approval.** Current freeze pauses community joins too. Contract must follow the last freeze; policy-only unfreeze does not restore revoked INSERT columns. |
| Safe deployed ordering / Vercel hold / client convergence | **BLOCKED.** No verified production automation hold, writer drain, signed deployed SHA/cache or compatible rollback receipt. Main merges can deploy automatically. |
| Independent release approval | **NO-GO.** Green CI never authorizes a production operation. |

## Decisions requiring founder + independent reviewer approval

1. Accept legacy **confirmed registration-row slots** as capacity, not humans/teams; retain existing max_participants values and no automatic waitlist promotion.
2. Accept the temporary **native AND external/official new-community-write pause**, or commission a separate reviewed native-only freeze design. Do not promise current 00 preserves new community joins.
3. Approve the explicit postgres-owned privileged worker/trigger boundary and actual deployed existing-function owners/ACLs; private workers stay out of exposed schemas. No broad grants or role escalation to make acceptance pass.
4. Confirm Asia/Kolkata as the date-only deadline default used by current application/SQL. Per-event timezones need a separately reviewed contract; do not invent one from a missing column.
5. Resolve every live catalog/body/ledger discrepancy and choose new migration versions/atomic packaging. Review the explicit exclusion of the unused private bulk-transfer test prototype from the candidate.
6. Approve a real isolated Auth/gateway/parity acceptance plan, effective DB/gateway/application timeout budgets, safe identity/test cleanup and realistic concurrency/load thresholds. No new Supabase project, Docker or live registrations are authorized here.
7. Approve and rehearse Vercel deployment hold/promotion, direct-writer drain, outage messaging, backup/restore, rollback capability and monitoring thresholds. All environment/platform changes need separate authority.
8. Authorize migration execution and unfreeze as separate future gates only after independent acceptance. No merge/deployment follows automatically from reviewing this package.

## Important qualification distinctions

The HTTP fixture uses real PostgREST JWT signature/audience/expiry checks and NOINHERIT role switching, real RLS/ACLs, triggers, native admission/capacity, community INSERT, cancellation rollback, role edits, invites/requests, conversation/matchmaking, lock/statement failure, lost committed response and deletion. It uses fake users in a freshly created database with only a modeled schema. It is not a production dump or hosted Supabase project.

**Actual qualified source evidence (ee4e342):** both GitHub jobs succeeded; 1,616/1,616 application/artifact cases, 51/51 SDK/writer cases, PG17.6/PostgREST boundary checks, TypeScript/scoped lint/build and 32 Rack checks passed. Failed development trials are retained with their exact causes/corrections in ACCEPTANCE-EVIDENCE.json. The final reporting-only follow-up separates the 15 HTTP groups from the one catalog SQL group; final current-head job results are recorded in PR #96. This is not production acceptance.

The old psql harness re-freezes after its original contract and thereby removes community column INSERT privileges. The first real HTTP trial correctly failed that positive case. The HTTP end-state fixture now restores **the exact seven-column statement read from reviewed 02**, with assertions that table-level/id INSERT are still denied; this models final contract AFTER the last freeze, not a production permission fix. Freeze/restore/unfreeze is explicitly tested. Rollback recovery cannot simply call 06.

Windows PG17 is unavailable and the checksum-verified Windows PostgREST startup probe exited unsuccessfully before allocating a cluster. No global install/system/environment change or existing/remote DB substitute was attempted. Linux CI uses checksum-pinned official native PG17.6 + PostgREST 16.5 in the workspace and owns temporary processes/config/JWT keys; cleanup removes only the allocated root. PG18 catalog syntax rehearsal is supplementary, never PG17 acceptance.

Reproduce in that isolated native environment after the pinned binaries are present:

```text
node --test scripts/test-mission20-release-package.cjs
node scripts/qualify-mission20-release-postgrest.cjs --local-pg17-only
```

No `.env` file or deployed configuration is used or changed. Do not run proposed SQL or tests against an existing database. SQL source remains review-only; no production/staging migration, data correction, registration, deployment or merge has been performed.
