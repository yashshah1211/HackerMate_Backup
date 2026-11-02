# Mission 20 C2 — safe writer adapters

The [final release-readiness package](release/README.md) audits schema/ledger/ACL compatibility, supplies independent SELECT-only catalog requests, adds real disposable PostgREST acceptance, and defines the future freeze/deploy/rollback gates. **Production release remains NO-GO** until live parity, atomic migration packaging, hosted Auth/gateway acceptance and independent operational approvals are complete. Nothing here installs the missing production RPCs or authorizes main merges/deployment.

The [independent-review follow-up](REVIEW-FOLLOWUP.md) verifies actual Actions results at a797869 and adds 20 installed-Supabase-SDK/full native HTTP flow tests. That snapshot had three historical metadata failures; the approved Phase B test correction and safe forward synchronization are now recorded in [BASELINE-METADATA.md](BASELINE-METADATA.md). SQL and freeze-first release requirements below remain unchanged.

**Draft implementation for independent review. NO-GO for migration execution, deployment or merge.**

Base: reviewed C1 `ac618ea003055c9c03495344234e32a1ed8dd07a` (Draft #93), containing application baseline `4818052a944451c74ae0a7d7c4572f3e7c3d0f8e` (Draft #92). C2 is a separate stacked branch, `fix/mission20-c2-safe-writer-adapters`. The original reviewed baselines remain recorded; the approved metadata-only Phase B correction is now inherited through C1 at 541ed46. C1's [locking qualification](../mission20-c1/LOCKING-QUALIFICATION.md) and review-only 00–09 SQL remain the database specification. This branch does not promote SQL into active migrations.

## Adapter contract

All mutation adapters in `src/lib/writers.ts` bind the expected actor to a verified token, pin the Authorization header on the RPC, disable SDK retries and require an exact result. Browser callers recheck the current session before reporting success. Neither mutable user metadata nor a privileged browser credential grants authority. Existing UI owner/member checks and confirmations remain; SQL ACL/RLS is authoritative.

| Operation | RPC arguments | Required result |
| --- | --- | --- |
| Native registration | `register_native_hackathon(p_hackathon_id,p_team_id,p_reviewed_unknown)` | Object with `status: confirmed\|waitlisted` and boolean `alreadyRegistered` |
| Remove/leave membership | `mission20_remove_team_member(p_team_id,p_member_id)` | Exact membership row UUID |
| Project role | `mission20_set_project_role(p_team_id,p_member_id,p_role)` | Exact membership row UUID |
| Delete team | `mission20_delete_team(p_team_id)` | Exact team UUID |
| Accept invitation | `accept_team_invite(p_invite_id)` | Exact invitation's team UUID |
| Accept request | `accept_team_join_request(p_request_id)` | Exact request's team UUID |
| Ensure conversation | `ensure_team_conversation(p_team_id)` | Valid conversation UUID |
| Account deletion | `delete_user_completely(p_target_user_id)` | Canonical SQL void, decoded as JSON null |
| Cancel participation | `mission20_cancel_registration(p_event_id,p_registration_id)` | Exact own registration UUID |

The native endpoint keeps authentication, profile, lifecycle, unknown-availability consent, owner and complete/distinct roster checks. The database makes the final atomic admission/deadline/capacity decision, including idempotency. The application sends neither caller identity nor requested registration status. There is **no raw native INSERT fallback**. External and legacy `official` community joins retain the existing community INSERT path and meaning; they do not call native admission or promise official registration. Legacy official records are not converted.

Invite/request identity, pending scopes, explicit handoff, owner review, confirmation and returned-ID checks remain. Existing signed instant-join behavior is unchanged. Workspace initialization ignores late conversation results after team change/unmount. Member/team/cancellation/account mutations never replay automatically. Read-only reconciliation after a failure is permitted.

### Atomic cancellation addition (review-only dependency)

`sql/01-cancel.proposed.sql` closes the old two-REST-call unlink/cancel partial-failure gap. Its SECURITY INVOKER public function retains existing base ACL/RLS, exact self/event/registration scope and owner-only team-link deletion. A private helper checks own participation, locks sorted team parents then the event parent using C1's protocol. Installation requires C1's admission-freeze marker. There are no base-table grants, FK changes or new RLS policies in this proposal.

If ownership has transferred, cancellation can remove the caller's own registration without deleting a link now controlled by a different owner. Missing permission or an exception after unlinking rolls back the whole transaction. Confirmed registration/member/team/conversation CASCADE behavior is retained. Review this additional function before any later migration promotion; C1 alone does not provide it.

### Failures and timeout budget

One absolute **12,000 ms** application budget includes authentication, registration preflight reads, RPC/HTTP transport and confirmation; native/admin HTTP handlers also budget params/body parsing and server preflight. A browser native request has its own 12-second outer budget, so individual nested server budgets do not add unbounded browser waiting. SDK mutation retry is disabled. Tests shorten the same budget to exercise authentication, route/body and transport stalls, abort propagation, no late mutation and no late success. UI list refreshes are separate reads and do not replay admission.

| Failure | HTTP/status class | Meaning/action |
| --- | --- | --- |
| `55P03`, `40P01`, `40001` | 503, retryable | Database rollback known. Refresh; a new explicit attempt rechecks identity, authorization and deadlines. |
| `57014` | 504, retryable | Database statement canceled/transaction rolled back. No automatic repetition. |
| `42501` / `PGRST301` | 403 / 401 | Permission denied / authenticate again. |
| `22023`, `22P02` / `P0002` | 400 / 404 | Invalid input / unavailable record. |
| Known `P0001` business rejection / admission freeze | 409 / 503 retryable | Controlled deadline, eligibility, uncertainty consent or freeze message. |
| `23503`, `23505` | 409 | Dependency/conflict; refresh. |
| Connection class `08`, `40003`, shutdown/session-loss `57P01`–`57P05` | 503, `outcomeUnknown=true`, no automatic retry | Reconcile the outcome before another explicit action. |
| Missing/incompatible function or column (`PGRST202`, `PGRST203`, `42883`, `42703`) | 503 | Unsupported database version; no fallback. |
| Other SQLSTATE | 500 | Database rejection; no private error detail shown. |
| Transport loss, local deadline/abort, malformed confirmation, account switch after request | 503/504/409, `outcomeUnknown=true` | Commit may already have happened. Reconcile by reads; never automatically repeat destructive actions. |

`retryable` means a later explicit attempt may succeed, not permission for an automatic retry loop. Server routes return controlled status and flags; UI uses controlled messages and logs original errors. A local abort bounds application waiting but **does not prove remote rollback or forcibly stop a committed PostgreSQL transaction**. Underlying auth reads can finish late; no mutation is started after their budget expires. Database transactions guarantee no partial membership/conversation/registration/team state on SQL failure. Lost network responses can hide complete commits. PostgREST/gateway/request-disconnect behavior and database-side outer statement limits remain acceptance gates; no production timeout configuration is changed here.

The browser adapter rechecks the session after asynchronous token verification and before submitting, then checks again before success feedback. Regressions model an old token still verifying as its original user after a local account switch, and ambiguous database connection/completion responses. The latter remain unknown outcomes using the [PostgreSQL 17 error classifications](https://www.postgresql.org/docs/17/errcodes-appendix.html), rather than claiming rollback from an error code alone.

## Confirmed permission correction and isolated qualification

The C1 local fixture now models the founder-confirmed authenticated owner policy `team_members_update USING/WITH CHECK is_team_owner(team_id)`, authenticated column UPDATE on `project_role`, and `teams_delete_owner` for owner **or administrator**. Owner positive, nonowner negative, identity-column denial and nonowner-admin full-cascade deletion are exercised. These are fixture corrections, not live permission changes.

The C1 artifact test still checks that C1 changed no application/migration/environment files, pinned to its reviewed historical tree. C2 separately checks its active migrations, packages and environment against that tree. This preserves the C1 invariant while allowing the explicitly approved C2 application/workflow scope. CI must fetch history for both immutable-base assertions; the first shallow-checkout run failed those assertions before PG17 SQL qualification, and the workflow now fetches full history.

`scripts/qualify-mission20-c2-writers.cjs` reuses all C1 security/concurrency tests, real repository matchmaking/user-deletion definitions, supplied conversation hooks and actual CASCADE graph. An SDK-shaped adapter bridge invokes independent authenticated-role psql transactions in a freshly allocated loopback cluster. It tests native confirmed/waitlisted/idempotency, role authorization, remove-member chat cleanup, admin team deletion, canonical account denial/success, injected cancellation failure rollback, exact cancellation scope and cancellation versus simultaneous last-seat admission. C1's explicit historical `40P01` diagnostics remain visible; revised schedules require their specific bounded outcomes. No expected deadlock is hidden or counted as a revised success.

The bridge is not a live JWT/PostgREST environment. Separately, a real installed Supabase SDK with synthetic fetch proves the exact pinned RPC POST, payload and one mutation attempt, including a retry-like 520 response. Neither test substitutes for later approved end-to-end identity/workflow acceptance.

### Reproduction

From this worktree, with no `.env*` files:

```powershell
npm run typecheck
node --test scripts/test-mission20-c2-writers.cjs
node scripts/qualify-mission20-c2-writers.cjs --local-only
node scripts/qualify-mission20-c2-writers.cjs --local-pg17-only
node qa/rack-qualification.cjs build
node qa/rack-qualification.cjs funnel-browser
```

The PG runners accept no connection URL, project, credentials or remote host. They initialize two owned temporary clusters, use synthetic IDs, run assertions and stop/delete only the allocated cluster roots in cleanup. `--local-only` selects installed PG18; it does not qualify PG17. PG17-only refuses a missing binary before SQL. Linux CI builds official native **17.6**, verifies the pinned archive SHA256, installs under `scratch/pg17`, and creates disposable clusters. No Docker, service database or Supabase project is used.

Exact commands, changed-file inventory, counts, lint reconciliation and CI evidence are in [VERIFICATION.json](VERIFICATION.json). Browser output is `scratch/rack-funnel/{portal,guest,member-next-action,incomplete-next-action}-{390,1440}.png`, with report `scratch/rack-funnel/results.json`; paths are local ignored evidence, not production screenshots. Exact Rack assertions are unchanged. Build uses the repository's synthetic read-only provider/font/network guard, not production services.

**Observed results:** [Linux qualification at e8a84ee](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/41303782153) passed native **17.6** C1+C2 qualification: **279 baseline/security assertions per variant, 72 orchestration checks**, two fresh clusters cleaned. Native **18.4** passed the same SQL/orchestration counts locally at the initial C2 snapshot. All **31 adapter tests**, TypeScript, scoped adapter/route lint, guarded production build and **32 unchanged Rack browser cases** passed on the final source revision. Linux broad application selection passed **1,585/1,588**; the prior Windows full selection passed **1,584/1,587**, before the additional unknown-outcome case (all 31 latest adapter cases also passed locally). The three metadata preview failures reproduce on reviewed C1 (26/29 in that file). Full modified-source lint retains **17 errors / 7 warnings**, identical by file/rule/source fingerprint to C1, with zero new diagnostics. These baseline failures are preserved and separately actionable, not waived or rewritten to make C2 green. The Linux application job is correctly red; its build/browser steps still ran and passed, and uploaded **mission20-c2-rack-browser**. The documentation-only a797869 rerun has now completed. Its actual job results and the subsequent installed-SDK test additions are recorded in [REVIEW-FOLLOWUP.md](REVIEW-FOLLOWUP.md).

## Unsupported mixed versions and freeze-first release gates

1. **Independent review first.** Approve C1 SQL, C2 adapters and cancellation proposal separately. Complete PG17.6 CI and deployed dependency/permission inventory review; no approval is inferred from this Draft PR.
2. **Freeze native admission before expansion.** A separately authorized release must install C1's restrictive freeze and verify both old direct native INSERT and new RPC admission are denied, while community participation and safe reads remain available. Drain in-flight transactions. Freeze-first is required; an unguarded expansion→adapter interval leaves the confirmed unsafe direct-write exposure open.
3. **Install reviewed expansion, C1 07/08 writer protocol and C2 cancellation function while frozen.** Preserve actual column grants and owner/admin policies; never broaden them to make RPC tests pass. Confirm schema-cache availability, function ownership/search paths/EXECUTE and all trigger bodies. Existing direct child-first writers can now fail fast; fail-fast compatibility is intentional, not guaranteed old-client success. A native-only admission freeze does not stop destructive team/account writes: separately authorize a maintenance/drain window for affected old writers and verify the full graph before enabling them.
4. **Deploy adapters only after SQL contracts exist, then contract unsafe direct native writes.** This branch against today's database is unsupported: missing new RPCs fail closed with 503 and no raw fallback. Existing names with old return/locking behavior are also unqualified; no capability inference from an RPC name alone. Mixed old browser bundles may get denied/conflict results on membership mutations. Drain/retire them, then validate all routes and anonymous/user/owner/admin roles on the same release candidate. Never unfreeze merely because the new UI looks healthy.
5. **Contract and acceptance before unfreeze.** Verify table AND column INSERT revokes, native/community RLS separation, approval protection, per-team parent ordering, full legacy-writer NOWAIT protocol, atomic capacity and cancellation, exact production CASCADE/conversation/matchmaking/storage/audit graph, real JWT/PostgREST results and full request budget/disconnect behavior. Run core pages/runtime/smoke checks only in a separately approved isolated acceptance environment. Stress invite/request/role/owner-transfer/user-delete/cancellation/last-seat schedules on PG17.6. Review operational error rates and rollback readiness. Unfreeze requires independent acceptance, never this PR.
6. **Rollback keeps admission frozen.** Roll back the application while retaining compatible secure database functions and denying unsafe native direct writes. Do not restore vulnerable grants to accommodate old bundles. If SQL rollback is necessary, use C1's reviewed rollback under freeze, quiesce affected writers and verify all dependent functions first. Avoid `DROP ... CASCADE` and destructive data reconstruction. A rollback that restores old native INSERTs without a freeze is prohibited.

Remaining gates: independent code/SQL review; actual deployed grant/RLS/trigger/deletion/storage graph parity; approved isolated PostgREST/JWT and complete browser writer workflow qualification; wider concurrency/load/fault-injection; release/drain/rollback runbook approval. Existing confirmed-registration-row capacity remains backward compatible: `max_participants` limits confirmed registration rows, not distinct humans/team seats. Partner/Rack/certificate workflows and external/official community behavior remain covered by existing regressions. No migration, RLS, privilege, schema, production data, environment or deployment change is executed by this work.
