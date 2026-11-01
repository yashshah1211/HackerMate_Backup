# PR #93 — independent review corrections

Review input: `09641f28c2efe4fdc55fd2de448b1503d070f8e0`, stacked on PR #92 at `4818052a944451c74ae0a7d7c4572f3e7c3d0f8e`. These are design/local-test corrections under the new authorization. **NO-GO for production/staging migration execution or rollout remains.** All proposed SQL stays outside the migration loader. No existing project was contacted or modified.

**Final locking follow-up from f7845bc:** [LOCKING-QUALIFICATION.md](LOCKING-QUALIFICATION.md) is the current protocol/evidence. The founder confirms membership and conversation CASCADE in production (17.6), supplies conversation trigger behaviors, and current 07/08 writer prototypes bound the previously residual schedule. Sections describing 05 alone below are historical comparator analysis, not the release recommendation. Current counts are in README.

## 1. Correct foreign-key contract

The founder's live read-only finding is authoritative:

```sql
CONSTRAINT hackathon_registrations_team_id_fkey
FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
```

The corrected fixture installs this exact named, validated CASCADE constraint. Expansion asserts its name, target and delete action, and preflight exposes the action/validation flag. Expansion/contract/per-team SQL does **not** change the FK. The old SET NULL assumption and special immutability exception were removed. Local tests prove team deletion removes linked registration rows, leaves unrelated registrations intact and releases the legacy confirmed-row capacity slot.

| Choice | Records / capacity / access effects | Recommendation |
|---|---|---|
| Retain CASCADE | Deleting a team deletes its linked registrations, removes their discovery/track-record entries and membership-based announcement access, and frees confirmed row slots. No automatic waitlist promotion. Existing independently stored badges/certificates are not registration rows. | Retain for this remediation; accurately preserve the existing behavior. Surface this consequence in future team-deletion UX/acceptance. No deletion of a real team is part of C1. |
| Change to SET NULL | Retains registration identity/status/history and its consumed slot, but loses team association. A formerly team-eligible native registration can become a solo-looking row below minimum size while retaining participant access. Cancellation and public-track-record semantics change. The current immutability guard would also need a reviewed exception. | Separate FK migration proposal and product/security review required, including eligibility/disbandment states, old record treatment, lock/cascade tests and rollback. No such production change is implemented or bundled here. |

The founder now confirms live team_members.team_id CASCADE, team_members.user_id→profiles CASCADE and the conversation/participant CASCADE graph. The original privacy fixture is unchanged; the C1 fixture corrects its NO ACTION membership-team FK **before all comparator schedules**. This models confirmed production behavior, without proposing any production FK migration.

## 2. Roster writer and trigger review

The immutable full registration/hackathon inventory remains unchanged. Additional roster dependencies reviewed for the locking alternative:

| Writer / dependency | Relevant behavior |
|---|---|
| `create_team_with_owner` — core migration and `202607080007_team_multiple_hackathons.sql`; `src/app/teams/create/page.tsx` | Inserts owner membership (`team_id,user_id,role`); parent team already exists in the transaction. |
| `add_user_to_team` — current `20260928100000_phase1a_definer_function_privileges.sql` (supersedes 202607100005/core) | Owner/capacity checks then membership insert. Invitation acceptance, join-request acceptance and instant join delegate through membership-writing RPC paths. |
| `accept_team_invite`, `accept_team_join_request`, `join_team_instantly`; team/profile invitations | Existing permission checks and notifications remain; the new BEFORE trigger adds serialization, not authorization or new grants. |
| `src/app/teams/[id]/page.tsx:297` | Member/owner-authorized DELETE by membership ID and team. |
| `src/components/TeamOverviewView.tsx:227` | UPDATE project_role; existing cache trigger observes it. |
| `delete_user_completely` — `202610060001_restore_safe_user_deletion.sql` | Original locks profile/user then owned teams/member rows, transfers roles or deletes teams, then Auth cascade. Final review-only 08 additionally pre-locks non-owned memberships/linked teams and events; original authorization/audit/storage checks remain. No deployed body is changed. |
| Direct privileged/bulk roster writes and FK cascades | BEFORE trigger must cover all INSERT/UPDATE/DELETE, including OLD and NEW team on transfers. Multi-team batches must pre-lock their complete parent set in sorted order before DML; row-level sorting alone is not a universal multi-statement ordering guarantee. External writers must be catalogued before release. |
| `matchmaking.member_changed` — `20260925221500_matchmaking_v2_engine.sql:347` | AFTER INSERT/DELETE/UPDATE of team_id/user_id/project_role, visits distinct affected parent IDs in sorted order and calls refresh_team. |
| `matchmaking.refresh_team` (`:266` onward), team_changed/profile_changed | refresh_team takes parent FOR NO KEY UPDATE, rebuilds feature/feed records and reads roster/profile skills. Profile changes refresh related teams; these parent/feature locks must be included in the deployed graph. The local suite loads the **real migration**, not a mocked cache trigger. |

### Measured global-lock failure

Global candidate A holds a team SHARE row lock and then requests SHARE on all team_members. Concurrent membership writer B holds team_members ROW EXCLUSIVE and, in the actual AFTER hook, requests NO KEY UPDATE on A's team. A waits for B's table lock while B waits for A's row lock. The local barrier schedule reproduces **40P01**; the victim rolls back. An unrelated-team INSERT also waits behind the global SHARE lock. Team/user cascades acquire membership DML/table locks too, expanding this graph.

This is not just a throughput concern. The global candidate is retained as an explicit **rejected release comparator**. A passing test which detects its deadlock does not make it deployable.

### Per-team alternative and recommendation

`sql/05-per-team-roster.alternative.sql` supplies an executable review prototype:

1. A private BEFORE membership trigger locks affected OLD/NEW parent team rows FOR UPDATE in UUID order. It adds no membership INSERT/UPDATE/DELETE privileges.
2. Mutating admission locks account rows, selected parent team FOR UPDATE, then the event FOR UPDATE. It counts the complete distinct roster UNION owner; no team_members table SHARE lock. Subsequent membership hooks take reentrant parent locks.
3. Team deletion already locks its parent row; member/registration cascades execute in that transaction. A deleted parent may be invisible to the member hook, but the deleting transaction already owns its lock. Registration CASCADE remains deletion, not preservation.
4. An existing-registration retry uses an event-locked read branch that never later takes a parent lock. A cancellation race can return participation_changed_retry; a fresh retry reauthorizes. No raw-INSERT fallback.

**Recommend per-team locking for further independent review**, subject to target-catalog and full-writer qualification. In the tested schedule same-team departure waits, unrelated-team insertion completes while admission stays open, and the global/matchmaking cycle disappears. All baseline SQL behavior assertions also pass with this variant. It still serializes writes/admission on one team and can encounter normal multi-entity deadlocks; do not claim zero deadlocks or production-scale qualification. Translate 40P01/55P03/retry conditions to bounded retryable failures, roll back all work, and recheck eligibility/deadline on retry.

### Measured residual per-team cycle — release gate

A row-level BEFORE DELETE trigger runs **after PostgreSQL locks the target membership tuple**. Sorting parent IDs inside that trigger cannot retroactively impose parent-before-child ordering. The now production-confirmed member/conversation CASCADE graph demonstrates this: A holds parent FOR UPDATE; B DELETE holds membership tuple and waits for parent; A's cascading DELETE waits for B's tuple. The old blocking variant reproduces **40P01**, victim rollback/no orphan. The new writer protocol plus NOWAIT backstop returns explicit 55P03 or serializes before child DML; see current qualification. No hypothetical-FK caveat remains.

The recommendation is conditional, not deployment approval. C2 must inventory and, where needed, adapt roster RPCs to lock the complete parent set **before issuing membership DML**; cover direct client deletion, owner transfer, user deletion, bulk transfer and privileged writers. Decide and test bounded retries for remaining database deadlocks; the trigger is an eligibility-serialization backstop, not proof of a universal lock order. If the required writer protocol/controlled retry behavior cannot be qualified, leave admission frozen and return for review. No such application/permission changes are bundled into C1.

## 3. Capacity semantics and compatible recommendation

The physical column name and native create form say **max_participants**. They do not define a trustworthy human-count contract. The migration adds a nullable integer; current participation counts use count(*) filtered by status=confirmed, and a team registration inserts only the owner's one registration row. `(hackathon_id,user_id)` uniqueness is not a unique-team or unique-roster-human quota.

| Quantity | Same as current limit? |
|---|---|
| All registration rows | No: waitlisted rows do not consume confirmed capacity. |
| Confirmed registration rows | **Observed current algorithm** and recommended compatibility interpretation. |
| Distinct teams | No: solo rows consume slots, and team association is not the unique registration key. |
| Distinct human participants | No: a four-person team can consume one owner row, and rosters may overlap. External/official community rows do not prove official attendance. |

For example, two disjoint four-person teams can fill a legacy limit of 2 with two confirmed owner rows and eight roster humans, plus any waitlisted rows. Treating the same stored value as two humans would silently reject or demote existing intended participation.

Recommendation: preserve stored values/statuses and enforce an explicitly documented **legacy confirmed-registration-row slot cap**. NULL means unlimited; zero allows waitlist only; negative values fail configuration checks. Team-size eligibility remains separate. Rename future UI/API descriptions to registration/community slots and explain the legacy field; do not promise a human or team quota. Founder approval and assessment of existing configured limits are release gates. A real human/unique-team limit needs an explicit future unit/schema and roster/duplicate/snapshot/cancellation policy, with a separately reviewed migration. Do not infer or backfill it in C1.

## 4. Freeze → expand → adapter → contract → unfreeze

| Phase | Old direct native writer | New native RPC | Community / readers |
|---|---|---|---|
| Before release | Existing unsafe exposure; PR #92 endpoint checks alone are insufficient | Not installed | Existing behavior |
| Commit 00 freeze | Table/column INSERT revoked + restrictive policy deny new admission | Not installed initially | New community admission paused; reads/preferences/cancellation retained |
| 01 expansion + reviewed 05 while frozen | Still denied | INSERT trigger detects freeze and denies new rows even through definer RPC | No re-opening through a grant or new RPC |
| Deploy adapter, then 02 contract while frozen | Denied permanently by native restrictive gate | Still frozen for new rows | Community columns restored under strict policies but freeze still denies INSERT |
| Independent receipts, then consider 06 | Old server versions raw-inserting native rows fail closed | New adapter can use atomic RPC | Guarded community writes reopen; readers/preferences remain |
| Failure / 03 rollback freeze | Denied | Both entry EXECUTEs revoked; trigger freeze sentinel also blocks new writes | New admission paused; records/readers/preferences/cancel retained |

A freeze **committed first** removes the client direct-write exposure window. Expansion without that freeze retains the original unsafe native INSERT interval and is not the recommended sequence. Quiesce privileged jobs; a client-facing freeze cannot constrain a database owner. Never use browser-supplied version headers as authorization or declare adapters converged merely because a function exists.

Release gates: independent approval of FK/capacity/owner/per-team decisions; fresh read-only catalog/ACL/function/trigger snapshot; exact target PostgreSQL qualification and all external writer discovery; validated adapters with no INSERT fallback; old server instances drained; known behavior for cached clients; workflow and rollback tests; operator-signed version/negative-test receipts. SQL 06 verifies structural per-team/contract markers, **not** deployment convergence or semantic function equivalence. Keep admission frozen if any gate fails.

Native browser HTTP shape stays `{teamId,reviewedUnknown}`. Old browser → new server can continue; new browser → old server cannot obtain a native row after contract and must show a controlled pause/error. Legacy community payloads still persist safely with DB-derived status, but cached old clients can display a stale pre-check toast; approve that transient limitation or enforce client refresh before reopening. C2 must use stored status, preserve uncertainty notices and map new_admission_frozen / participation_changed_retry / lock errors to controlled 503 responses. No adapters are implemented in this design correction.

Rollback does not restore the vulnerable policy. Uncommitted DDL rolls back atomically. After commit freeze admission, retain tightened access and data, restore only reviewed function definitions/fix forward, and requalify before reopening. An application rollback to raw native INSERT gives availability failures; it is not a reason to restore the bypass.

## 5. Portal harness repair

The five failures were missing dependency wiring, not failed authorization assertions. One added require-map entry loads the **real** lifecycle module through the existing offline harness. All 24 organizer/broadcast authorization tests pass. The artifact suite compares every pre-review assertion line against 09641f2; none was removed, changed or weakened. No application authorization logic changed.

## 6. Executable local qualification

Run **only** `node scripts/qualify-mission20-c1-postgres.cjs --local-only`. It rejects every alternate argument before allocating a cluster. It accepts no host/URL/user/database/SQL-path override; child environment is whitelisted and excludes connection credentials, NODE_OPTIONS and PG configuration. It uses installed native binaries, two separately allocated loopback-only PostgreSQL clusters, fake UUIDs/email addresses, fresh postgres ownership and finally-verified stop/removal of its exact temp roots. No Docker, environment file, existing cluster or Supabase project.

Each variant executes the unchanged original privacy fixture, corrected validated registration CASCADE FK, preflight, freeze/expansion/contract/release assertions and all new native/community/security tests. It loads the real matchmaking migration, then uses independent psql connections with explicit barriers and pg_stat_activity lock-wait evidence. JavaScript does not serialize competing requests to simulate atomicity. SQL syntax/privilege/function/trigger behavior is actually exercised by PostgreSQL.

Historical f7845bc qualification reported 279 SQL assertions per variant and 41 orchestration checks. The final extended runner retains these behavioral assertions, adds stronger unfreeze checks and confirmed conversation graph before comparators, then tests writer corrections. Current exact counts/logs are in README. Both expected old 40P01 diagnostics remain visible; corrected 55P03 paths must roll back and never count as rollout approval.

Limitations: installed local PostgreSQL major is not evidence of the target project's exact version/catalog; auth claim GUCs emulate RLS identities and do not test JWT transport/rotation; other live FKs/triggers are not inferred from fixture additions. Remaining load, bulk/transfer/user-deletion schedules, alternate isolation/timeout/disconnect variants, every deployed integration and full post-contract read replay require qualification before a later release. No production acceptance is claimed.

## 7. Legacy official classification

`official` remains non-native **community-only** until a separately authorized, source-verified classification decision. Closed official application dates do not imply closed HackerMate teammate discovery before event end. Native RPC rejects official events. No record conversion, automatic approval, provider verification or data repair occurs. NULL/unapproved exceptional records remain blocked for new participation pending review.

## 8. Stop and review

Keep both Draft PRs open and unmerged. Approve or revise the capacity interpretation, privileged worker and per-team prototype; verify remaining catalog/writer/performance/adapter gates. The confirmed registration CASCADE behavior is now modeled, not an unresolved SET NULL assumption. No FK change is proposed. Green local tests do not authorize production/staging SQL or rollout.
