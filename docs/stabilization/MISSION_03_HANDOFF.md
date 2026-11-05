# Mission 03 — security boundaries and persistence integrity

## Baseline and interrupted-work recovery

Repository: yashshah1211/HackerMate_Backup. Worktree: `stabilization-mission03-20261105`; branch: `stabilize/security-integrity-20261105`. Pinned production/main baseline: `7fc7acc83dc4585c2624ec047f2c34c1dff312a6`. A fresh fetch after recovery confirmed main remains at that commit, containing PR #116 (`6e6b0e3`), #117 (`cad50fa`) and #118 (`7fc7acc`). No rebase, merge, reset, clean, stash or new worktree was used during recovery.

Recovered ten unstaged/untracked mission files and ignored evidence; no staged changes or Mission 03 commits existed. These were the permission sweep, STAB-006 plan, native helper/RLS tests, shared synthetic UI adapter, state tests, two production components, history helper and generated migration. Reviewed the full diff and logs before editing. Original UI evidence was 1 pass / 7 fail; original native evidence was 3 pass / 11 fail, including the parent test and ten failed subtests. An interrupted after-run passed 26/27 UI checks: the last failure compared structurally identical cross-VM objects. Normalizing that assertion's object realm preserved its exact expected query. Native after-runs initially encountered sandbox initdb/localhost restrictions, not policy failures.

## Five confirmed defects corrected in code

| ID | Severity | Original reproduction / root cause | Correction and evidence |
| --- | --- | --- | --- |
| STAB-021 | P1 | Remove a creator from team_members, then run minimal-return DELETE: task/link row is deleted although SELECT sees zero. DELETE policy checked creator/owner without current membership | Require current owner/member and active profile in DELETE. Native SQL uses PostgREST-style DELETE RETURNING constant, so SELECT-policy filtering cannot conceal the bypass |
| STAB-022 | P1 | Member cannot delete another creator's task/link, but UPDATE created_by=self followed by DELETE succeeds. Table-wide UPDATE exposes identity fields | Revoke table UPDATE and independent immutable-column grants from PUBLIC/anon/authenticated; grant existing mutable fields. Native tests seed inherited column grants, then prove immutable fields denied, mutable updates/nullable creator inserts/owner and creator deletion/service maintenance/FK cleanup remain compatible |
| STAB-023 | P1 | Suspended roster member reads/updates tasks and links; independent review also proved document read plus save_team_document commits. Membership helper does not inspect suspension | Task/link policies require caller's current protected profile with is_banned=false. Additional restrictive document policy applies the same current-account boundary without changing revision RPC/trigger. New document denial failed before policy addition. Native tests deny read/save/create/delete for banned document actor and preserve active owner/member saved/conflict behavior |
| STAB-024 | P1 | Offset page shifts under concurrent insertion, duplicating boundary row; pending initial snapshot drops a realtime insert or restores updated/deleted content | Exact (created_at,id) keyset, deterministic ordering, ID merge and bounded pending-read realtime overlay/tombstones. Cursor advances from raw page, independent of visible/deleted count. Clear invalidates reads; stale errors still log. Mounted-component and actual SDK query tests plus Chromium exercise those paths |
| STAB-025 | P1 | Two status mutations dispatch concurrently; newer completed write commits first, older in_progress commits last, reverting both stored and visible state. Zero-row UPDATE is shown as success | Per-task serialization across status/drag/assignee/due-date writes, exact id/team scope and returned-row acknowledgment. Refresh authoritative data after commit; shared read sequence rejects old reloads and avoids replaying an old patch over another user's newer edit. Error/zero-row/throw/retry, both ack/read races and route-unmount queue cancellation covered |

These are code/local-fixture corrections, **not deployed closures**. The permission migration is prepared for review and has not been applied to Supabase. Existing installed policy drift is unverified. STAB-023 covers the three inventoried tables and their tested operations, not every workspace table or an exhaustive suspension audit.

## Storage: STAB-006 remains open

Preserved POST `/api/upload/presign` and successful uploadUrl/publicUrl/key behavior. Repository callers, upload authentication/suspension, direct byte/signature/moderation checks, real SDK signing structure, publication, browser rendering, overwrite/replay, ownership, expiry, quotas and cleanup were examined. The synthetic SDK signs an exact PUT bucket/key for 900 seconds with unsigned payload and host signed header; checksum metadata does not establish moderation. No real R2 upload/provider request was made. One retained hour without requests does not exclude external consumers.

See [the blocked remediation plan](STAB_006_REMEDIATION_PLAN.md) for private staging, exact inspected-byte publication, replacement/copy races, compatibility options and acceptance tests. Founder authorization is needed for consumer migration/controlled gateway, private storage/serving, publication/revocation semantics, ownership/quota/finalization persistence, cleanup and verification cost budget. No claims-only fix or silent endpoint removal was introduced.

STAB-011 remains separately blocked on safe, non-disclosing application-side equality verification. No credentials were retrieved, decrypted, printed, hashed, rotated or changed during this mission. Historical database-side evidence does not establish current application agreement or rotation.

## Security, compatibility and production gates

[Permission inventory](MISSION_03_PERMISSION_SWEEP.md) was recorded before each permission change, including the document follow-up. Migration `20261105121307_workspace_actor_boundaries.sql` was generated by the local CLI. No new schema fields/tables, idempotency ledger, paid provider or dependency was added. Profile grants and SELECT grants are unchanged; task/link SELECT wildcards do not acquire column restrictions. Current first-party UPDATE fields remain allowed; identity forgery and revoked/suspended operations are intentionally denied. Document RPC signature, success/conflict payload, revision checks and author FK cleanup remain intact. A banned document save is unable to see/write the row and retains the existing missing response rather than claiming saved.

Cookie/bearer selection, account guards, admin permissions and public HTTP response contracts are unchanged; existing authorization/upload/notification regressions remain in the PR gate. Founder Brief retains one `37 3 * * *` schedule, serialized main/repository-only execution, zero curl retries and permanent single-send claims. No scheduled workflow was invoked. Production databases, RLS/grants, storage, credentials and deployment configuration were not changed; no real messages/emails/uploads, merge or deploy occurred.

Before production application, obtain founder approval and verify installed policies/grants match the reviewed migration. Apply only in an approved controlled release, then verify active owner/member, revoked/banned/unknown actor denials, document conflict/FK behavior, admin report compatibility and actual realtime transport with approved test identities. Native fixtures establish SQL behavior, not deployed Supabase policy equivalence. Run required core smoke and approved real page checks after any live permission application; current smoke is synthetic only.

## Validation

| Gate | Actual local result |
| --- | --- |
| Exact PR application selection, all old checks retained plus Mission 03 | 1,038 pass / 0 fail / 0 skipped |
| Linux-only database-report shell runner | Unchanged; 30 cases reserved for hosted Linux CI because local Windows lacks jq/Linux Node combination |
| Focused Mission 03 state/history SDK + Mission 02 | 36 pass / 0 fail / 0 skipped; independently reproduced same result |
| Native PostgreSQL actor boundaries | 19 pass / 0 fail / 0 skipped; independent reviewer also 19/19. Expanded original-policy replay: 5 pass / 14 fail including parent, expected exit 1 |
| Existing native document concurrency | Pass: real competing writers, stale save, reviewed overwrite/third writer, concurrent creation, FK cleanup, invoker/RLS protections |
| Related team/document/invite/moderation/run-mode selection | 326 pass / 0 fail / 0 skipped |
| Broader offline qualifier | 1,990 pass / 0 fail / 0 skipped |
| Desktop/mobile Chromium | 2 tests pass at 1440px and 390px; account guard, retained drafts, cursor/realtime races, serialized stored task state, honest deletion, membership gate and queued-write cancellation; zero external requests/page errors |
| Synthetic core query smoke | Pass, 10 reads / zero mutations; static safe profile projection audit passes |
| TypeScript and safe production build | Pass, sequential TypeScript after final safe build; build 3 synthetic reads / zero mutations, offline fonts/network guard |
| Full ESLint | 193 errors / 90 warnings baseline → 192 errors / 90 warnings; zero added diagnostic identities/multiplicities |

Counts overlap. ESLint identity comparison uses file/rule/severity/message header, with source frames/line shifts excluded and multiplicity retained. No configuration weakening or blanket suppression was introduced. Existing ping event callback was stabilized with useCallback; behavior is unchanged. Remaining lint debt is not represented as a clean lint pass.

Local environment: Node 24.17, PostgreSQL 18. Hosted CI uses Node 22 and installed native PostgreSQL with fresh disposable clusters; no Docker. Sandbox denied initdb file operations, loopback database/HTTP access and Chromium localhost navigation. Those checks were rerun with authorized localhost access; no failed test assertion was skipped or weakened. Two added test-fixture issues were corrected: restoring the deleted synthetic profile between cases and using the existing valid resource category `document`; Windows CRLF was normalized in the transaction output assertion. Node test workers did not forward a custom baseline CLI flag, so the replay now uses fixture-only `MISSION03_WORKSPACE_BASELINE=1`; it demonstrably fails on original policies, then an unset-flag corrected run passes. The initial failing-before evidence predates the migration file and is unaffected. Raw logs remain ignored in scratch/mission03; committed tests and hosted job logs are the durable reproducible evidence.

## Standards — independent security review

Reviewer independently demonstrated all three task/link authorization defects and flagged surviving column grants, owner-without-membership compatibility and nullable creators. Review of the partial implementation found document suspension still allowed read/save. Added the inventory and a failing native test before the restrictive document policy. Final independent execution: 19/19 native checks pass; no further security blocker. Profile/SELECT grants, invoker/CAS semantics and query compatibility are preserved. Original inventory scope wording was updated to include the document follow-up.

## Spec — independent correctness review

Reviewer reproduced an old realtime read undoing a committed task edit and an old acknowledgment undoing a newer remote edit. Also reproduced clear-history reads restoring removed history and stale query errors not being logged. Each has a regression and correction. Final independent execution: 36/36 focused checks pass; no further correctness blocker. The review does not certify provider delivery, deployed RLS or exactly-once sending. Recommendation is conditional GO pending final CI and production approval gates.

## Remaining limitations and delivery record

- STAB-006 is open, and STAB-011 is blocked separately.
- An ambiguous message commit followed by manual retry is an unverified idempotency risk. The frontend in-flight guard is not durable exactly-once delivery; adding a ledger/contract requires separate authorization.
- Per-task serialization orders one mounted client's writes; simultaneous clients retain existing database last-writer semantics. Read-after-write prevents stale local acknowledgments from misrepresenting current data, not a global compare-and-swap guarantee.
- Committed membership removal/suspension is enforced at the next READ COMMITTED statement in tested tables. This does not retroactively cancel writes already authorized/in flight before revocation, retract copied/public media or guarantee immediate browser cache erasure.
- Database realtime delete transport/policy behavior and deployed Supabase grants remain production acceptance limits. Table RLS and synthetic callbacks do not establish live subscription revocation.

Draft PR and hosted final-head results will be added after publishing the reviewed branch. **Do not merge or deploy.** Recommendation remains **CONDITIONAL GO for code review**, subject to actual final-head CI, founder approval and controlled migration acceptance; no unconditional production readiness claim is made.
