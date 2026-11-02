# Future deployment / rollback runbook — not authorization

**Do not merge, deploy, change configuration or run production/staging SQL from this package.** The founder must authorize each future release boundary. Current production lacks the new RPCs/policies, so deploying C2 now is unsafe/unsupported even though missing RPCs fail closed. Never merge the three PRs and apply SQL afterward.

Every step needs a named operator, independent reviewer, exact commit + normalized SQL manifest hashes, timestamp and saved receipt. A failed or missing receipt means STOP, keep admission frozen and affected writers drained; do not advance because CI is green.

**Latest offline qualification / proposed mechanism:** [OFFLINE-REHEARSAL.md](OFFLINE-REHEARSAL.md) and `loader/LOADER-MANIFEST.json` specify Supabase CLI 2.75.0-owned transactions including ledger recording, one separately gated stage per invocation. Do **not** feed the original explicit-COMMIT candidate to that CLI: an injected ledger failure demonstrably leaves its DDL committed without a receipt. The loader files preserve all nontransaction SQL and strict guards. [VERCEL-HOLD.md](VERCEL-HOLD.md) adds the concrete future containment/verification procedure; no actual hold/configuration change is authorized or verified. [CATALOG-COMPARISON.md](CATALOG-COMPARISON.md) enumerates missing live evidence. These qualify the mechanism on a synthetic fixture only.

## 1. Preflight, backup and deployed-version receipt

1. Record current production Git SHA, deployment ID/build, production branch, Supabase project/database version, PostgREST/gateway version/config, applied migration ledger and all schema/ACL/function/trigger evidence from SCHEMA-COMPATIBILITY.md. Do not print keys or user data into GitHub.
2. Resolve all drift before packaging. Compare complete deployed function bodies for 08 and the latest hardened add-member dependency; require exact authorized preservation of auth/storage/admin/audit checks. Verify indexes/defaults/constraints and invalid/over-capacity aggregate readiness. Do not run a blanket `supabase db push` of this historical checkout: reconcile the full ledger and explicitly approved pending versions first. No record conversion/correction under this authorization.
3. Obtain backup/PITR health, retention and recovery-point receipts, plus an independently authorized isolated restore rehearsal and measured RTO/RPO. Do not take an unverified backup or assume SQL rollback reconstructs deleted team/account data. The tests allocate their own fake database, not a production restore.
4. Prepare newly versioned reviewed migrations from the manifest AFTER catalog/ledger signoff; keep test fixtures excluded. Rehearse clean install, partial-install failure, recovery and post-contract HTTP acceptance on a matching isolated restored schema. The atomic review candidate now exists under atomic/; its approval, raw-body parity, version allocation and matching-schema rehearsal receipts remain gates. It is not concatenated BEGIN/COMMIT files.

### Vercel / main automatic deployment gate

Vercel documents automatic deployments on pushes/merges to the configured production branch and preview builds on branch pushes: [Git deployments](https://vercel.com/docs/git). Founder inspection reports READY production from main SHA 17b78d031e0cc4ee5ace15ab92ca8039e00a4413; no hold is verified. This task has not changed project settings. GitHub comparison shows README-only drift, not permission to merge/deploy. Founder/operator must independently capture actual production branch, Git deployment rules/hooks, preview environment scoping, protected-deployment settings and any CI/deploy automation.

Before merging any release code into main, separately authorize and verify an operator-controlled deployment hold/promotion procedure. A Draft PR or paused GitHub workflow does NOT stop the Vercel Git integration; a main merge may immediately publish C2 against missing DB RPCs. A preview can also inherit a production database unless independently scoped. Never trigger an unsafe preview/live registration to test the hold. Prove the chosen control in a safe nonproduction rehearsal. No configuration change is authorized now.

Release alternatives require explicit approval: hold automatic production deployment until DB readiness and promote an immutable qualified build, or keep code unmerged until a separately reviewed compatible bridge release and controlled cutover exist. If a verified hold/promotion path is unavailable, STOP; do not rely on Draft status or GitHub CI pause. There is no bridge implementation in this task. Do not assume old/native raw INSERT fallback is acceptable. Code merges remain independently approved actions, never an implicit consequence of this runbook.

## 2. Commit admission freeze; drain affected writers

1. Obtain founder approval for freeze scope and customer messaging. **Existing 00 freeze blocks ALL new authenticated registration INSERTs: native and external/official community joins.** Reads/preferences/cancellation remain. This is not a native-only availability promise. Keeping community joins open during maintenance would need a separate reviewed SQL design; do not silently narrow the current security gate.
2. Under later DB authorization, commit 00 as its own migration boundary. Verify effective table AND column INSERT revokes, restrictive freeze policy and rejection of all new admission attempts. Do not claim confirmation until in-flight pre-freeze transactions are drained and their final outcomes reconciled. Use throwaway identities only in an independently approved acceptance target; no live test registrations under this task.
3. Quiesce team membership/role/invite/request/owner-transfer/conversation/account/team-deletion writers, event creation/edit/approval writers, service/admin jobs and direct API callers relevant to the graph. A Vercel route maintenance page alone does not drain old tabs or direct Supabase REST clients. Capture active transaction/lock/queue evidence, define a bounded drain deadline, and STOP if direct-writer exposure cannot be controlled. Do not kill unrelated sessions or disable protections ad hoc.

## 3. Install final expansion/protocol atomically while frozen

After separate approval install the source-hashed final definitions from **01 → 05 → 07 → 08 → C2 cancellation** through the exact **loader-specific expansion** artifact; its raw-body/ledger/type guard must pass without ad hoc edits. The original `atomic/` file remains the standalone psql transaction specification, not the CLI migration payload. Keep the freeze committed throughout. The global SHARE and blocking row-hook variants are comparators, not an exposed production intermediate. An outer transaction around the unmodified proposal files is insufficient because they contain COMMIT. The pinned CLI instead owns the transaction around the packaged statements and its own ledger INSERT.

On success capture new function owner/security/search_path/EXECUTE, trigger/policy states and exact body fingerprints. Verify no global SHARE remains in final lock_context, complete sorted parent-before-child ordering and NOWAIT legacy backstops, cancellation atomicity and preserved six-edge CASCADE behavior. Any lock/statement failure aborts this boundary; inspect actual object/ledger state rather than assuming all statements applied or rerunning CREATE blindly.

The candidate explicitly excludes the unused private transfer test prototype from 07 and its shared REVOKE entry. No client transfer capability is added. Comparator suites retain the prototype for their existing tests; candidate inclusion/exclusion is documented in its manifest and independently reviewed.

## 4. Adapter ordering and mixed-version convergence

Only after exact public RPC contracts exist and schema-cache refresh is independently verified, release the approved C2 build using the controlled promotion mechanism. Keep admission frozen and affected destructive writers controlled until acceptance. A missing/ambiguous RPC returns a controlled failure; there is no direct native INSERT fallback.

Old clients can continue raw native INSERT attempts; the freeze/contract must deny them at the DB regardless of UI. Old member writers may now fail fast with 55P03; old invite/request/user-delete RPC names must have the reviewed preserved contracts and returned values. Do not count a function name or HTTP 200 without an exact result as version convergence. Track version/intent telemetry without tokens/user payloads, expire old sessions/bundles only under separate authorization, and require explicit refresh guidance. Browser sign-out alone is not proof that an existing JWT cannot reach REST.

No automatic replay of account/team deletion or an ambiguous timeout/network result. Reconcile by reads and require a new deliberate action; every safe retry rechecks identity/authorization/deadline. Direct clients bypass application timeout logic, so enforce and test approved effective DB/request budgets before unfreeze.

## 5. Permission contract after last freeze

Under later approval apply 02 while frozen, checking its exact existing-policy preconditions. Revoke table and ALL explicit column INSERT first; restore only the seven reviewed community payload columns, retain the restrictive native gate, guarded preferences and approval protection. No broad base-table grants, BYPASSRLS or helper EXECUTE additions.

Important: any later 00/03 freeze revokes these column grants again. 06 does NOT restore them. Recovery requires an independently reviewed exact ACL reconciliation while freeze remains, validated native denial/community compatibility, then marker removal under approval. Do not blindly reapply first-contract 02 against its post-contract policy set, or mistake a successful DROP POLICY for restored community service.

## 6. Post-migration acceptance — isolated first, real deployment separately authorized

Required receipts cover: anonymous/no-JWT/invalid/expired/audience/role forgery denial; verified self identity; active/completed eligibility; open/upcoming/closed/unknown native review; timezone/date-only deadlines; approved/unarchived approval controls; one last-seat winner; owner-inclusive roster; private reads; raw native INSERT denied under column grants; external/official community joins and returned status; atomic cancellation/unlink/slot release; owner/nonowner role edits; member/team/account deletion with conversation/matchmaking/storage/audit/protected-admin graph; exact invitation/request identity; stale/missing RPC/cache; effective statement/lock/client budgets and lost committed responses; retained partner/Rack/certificate/team workflows and core pages.

The new test provides REAL native PostgREST+PG JWT/role/RLS/transaction checks, but local signed fixture JWTs do not establish hosted Supabase Auth issuance, revocation, MFA/SSO/email identity semantics, API gateway, RLS schema parity or production scale. These remain independent isolated acceptance and parity gates. Never relabel synthetic SDK Auth transport or a psql SET ROLE bridge as hosted-service acceptance. Do not conduct production data writes as an implied post-migration smoke test; agree a separately authorized validation target/throwaway cleanup plan first.

Record authentic effect/outcome, not only status: unknown transport completion may hide a fully committed transaction; SQL failure must leave no partial child/participant/registration/link state. Keep both historic deadlock diagnostics visible and require exact bounded results for revised schedules.

## 7. Independently authorized unfreeze

Founder + independent DB reviewer must sign: schema/ledger/ownership/ACL/body parity; atomic final-protocol package; backup/restore; writer drain; compatible deployed build and cache; all isolated acceptance receipts; agreed community outage scope and restoration; production HTTP timeout/monitoring budgets; controlled rollback. Only then consider 06 in a separately authorized operation.

Its structural marker checks do NOT verify all function bodies/ACLs, C2 cancellation presence, ledger correctness, cache convergence or hosted workflows. Require the stronger acceptance receipts first. Confirm the applicable rollback freeze marker is absent only after reviewed recovery; removing release_freeze while admission_frozen remains must not be reported as reopened service.

## 8. Monitoring and fail-closed rollback

Suggested initial thresholds below require founder/SRE approval; they are not installed alerts or proven production SLOs.

| Signal | Hold/freeze response |
| --- | --- |
| Any unauthorized native/approval write, oversubscription or partial transaction | Immediate STOP / freeze new admission and affected writers; security incident review. |
| Any unexpected 40P01/permission drift/contract mismatch during controlled acceptance | Do not unfreeze. Preserve SQLSTATE and complete rollback proof; no hidden expected failure. |
| SQLSTATE 55P03/40P01/57014 >1% of legitimate writer intents for 5 min, or p95 writer latency >8s for 5 min | Proposed hold/freeze threshold below 12s application budget; compare pre-release baseline and refine per operation. Do not count anonymous probes as legitimate-intent failures. |
| Unknown-outcome/lost-response cases, error loops or stale-build/RPC mismatch | Stop automatic retries, read-only reconciliation; freeze if correctness cannot be established. |
| Community INSERT still denied after unfreeze, role/owner/account/certificate regression | Hold release; check exact column grants, policies, trigger/body/cache version and preserved workflow, not a raw bypass fallback. |

Fail closed with 03 under separate emergency approval; it preserves records/read/preference/cancellation/approval protection while denying new admission. It also pauses community INSERT. Keep tightened native RLS/ACLs; never restore the vulnerable native direct-write grants to accommodate an old build. Hold Vercel promotion, roll back only to a qualified compatible application or remain in maintenance. A prior application build that raw-inserts native registrations is not a functional rollback against the new boundary.

Restore function versions only from a reviewed snapshot while writers are quiesced, preserving final security/locking invariants or fix forward. Do not DROP CASCADE, rewrite ledger rows, backfill statuses/types, change FK actions or restore an entire database over newer writes without separate incident/data-recovery approval. Requalification + explicit ACL restoration + independent unfreeze are required before reopening. All operator actions in this section are future proposals, not performed work.
