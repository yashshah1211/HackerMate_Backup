# Conflict-safe shared workspace documents

Status: implementation prepared; **DEPLOYMENT BLOCKED pending controlled migration approval**.
Base: `origin/main` at `d2322ff014d068ba350a90a581ec87e24afca3fa`.
No production migrations or database writes were performed for this task.

## Investigation and risk analysis

This is an identified code-level lost-update risk, not evidence of production data loss.

Before this change `TeamWorkspaceView` loaded `team_documents` after authentication
and chat initialization. A missing row caused an INSERT of the starter Markdown.
The unique `team_id` constraint resolved concurrent creation; a `23505` retried SELECT.
Local text and a last-saved-content ref tracked dirty state. Save captured the text,
then issued an ID-only UPDATE with browser-provided `updated_at` and `updated_by`.
Even a successful request returning zero rows cleared conflict state and displayed
success. Realtime compared local text with the last-saved ref, but ignored updates
by the same user (including another browser tab). Dirty editors got a warning;
clean editors adopted incoming content. There was no revision ordering.
Load theirs discarded local edits. Keep mine launched another unconditional UPDATE
and immediately dismissed the warning. Initial loads/refetches replaced local text,
and pending async work had no per-document lifecycle guard.

Concrete failure timelines:

1. A and B load N. A saves A-text. B's realtime is delayed. B saves B-text by ID;
   A-text is overwritten with no concurrency check.
2. A and B click Save together. Both UPDATEs succeed in sequence; the second wins,
   regardless of when either editor receives realtime.
3. B reviews A-text; C saves C-text. B chooses Keep mine, overwriting C-text that B
   never reviewed.
4. A's save of text S is pending. A types T. A realtime event/refetch or an older
   response changes the apparent saved baseline; an unguarded handler can erase T
   or report a save despite no returned row.
5. A pending load for team X resolves after switching to Y; shared component state
   can receive X's document. Reordered realtime can also replace newer snapshots.

Repository-wide `team_documents` inventory (searched before migration authoring):

| File | Queries / columns before change |
| --- | --- |
| `src/components/TeamWorkspaceView.tsx` | Initial SELECT `*`; INSERT `team_id,content` returning `*`; duplicate-creation retry SELECT `*`; UPDATE `content,updated_by,updated_at` by `id` returning `*`; UPDATE realtime subscription |
| `src/lib/admin/databaseActivityReport.ts` | Read-only SELECT `id,team_id,updated_by,updated_at,teams(name)` |
| `src/types/supabase.ts` | Generated-style type declarations; no query |
| `supabase/migrations/202607050001_team_workspace.sql` | Table, unique team FK, author FK, member RLS, realtime publication |

No other document writers or embedded document joins were found. The table's
`FOR ALL TO authenticated` policy uses `is_team_member(team_id)` in USING and
WITH CHECK. That helper includes both the owner and roster members. The document
table has no column SELECT whitelist. There was no timestamp or revision trigger.
Live schema drift was not inspected; controlled staging verification is required.

## Design and decision log

Scope: manual Markdown saves for authenticated teammates, with existing preview,
workspace tabs, membership rules and visual components retained. Assume ordinary
hackathon team sizes and one modest text document per team, not keystroke streaming.
One indexed row UPDATE per Save; no new service, paid API, dependency or background
worker. Fail closed during backend rollout, retain local work on ambiguous failures,
and keep maintenance in a narrow module and component.

Chosen: integer `revision`, initially 1 for existing/new rows; a SECURITY INVOKER
`save_team_document` RPC performs `UPDATE ... WHERE id = ... AND team_id = ... AND
revision = expected RETURNING ...`. The write sets `revision = expected + 1`.
PostgreSQL waits for conflicting writers and rechecks the WHERE predicate against
the committed row ([PostgreSQL transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html)).
Thus two saves of N cannot both commit. A trigger rejects unchanged/skipped
revisions, including writes from the old editor; it sets author/time on the server.
Document identity cannot be changed. Author-FK `ON DELETE SET NULL` still works.

The RPC returns `saved`, `conflict` with a current snapshot, or `missing`.
Membership/SQL privilege failures use `42501`. No matching UPDATE with an unchanged
visible revision is treated as denial, not conflict. Transport errors remain errors.
There is no unconditional update fallback. RLS/table grants are unchanged; only the
new function's EXECUTE privilege is scoped to authenticated users. No definer RPC.

Alternatives considered:

- Timestamp CAS: rejected because timestamps are browser-controlled today and
  require exact timestamp round-tripping, distinct values, and another ordering
  strategy for realtime. A revision makes those invariants explicit.
- Browser-only conditional UPDATE: atomic, but a zero-row result alone cannot
  distinguish stale revision, removal, and denied access. The invoker RPC supplies
  that classification without exposing extra data or bypassing RLS.
- CRDT/OT, locks spanning user editing sessions: unnecessary for manual Save and
  introduce substantially more state and operational complexity.

The trigger is a compatibility guard, not a security boundary against intentionally
destructive authorized teammates or privileged SQL. Existing member DELETE access
is unchanged. New future writers must use the RPC or an explicit expected-revision
CAS, never `revision = revision + 1` with an unconditional content update.

## Editor state and lifecycle

`TeamDocumentEditor` owns separate base, latest observed row, draft, conflict,
recovery text, loading/saving state, and messages. A save snapshots both expected
revision and submitted text before starting. A synchronous in-flight guard prevents
double clicks. Confirmed success updates the base but never replaces text typed
after Save. A newer remote row arriving before the response stays a conflict.
Every revision is considered, including another tab with the same user ID. Older
or duplicate realtime messages are ignored; reconnect refetches use the same safe
receive path. The gateway rejects invalid/empty/unconfirmed responses.

The review area shows the saved version beside the existing local editor. Ordinary
Save is disabled during conflict. Keep mine carries the exact reviewed snapshot;
a stale click handler cannot accept a replacement snapshot, and the server CAS
still detects a third save even with no realtime delivery. Load theirs retains a
recoverable local copy. Restore swaps that copy with the current draft.

The extracted component stays mounted (hidden) across workspace/brainstorm tab
changes. Team/user changes remount it. Cleanup invalidates pending request epochs
and realtime callbacks; old responses cannot populate another workspace. Only
confirmed metadata flows back into the Activity tab. Browser unload warns about
pending/dirty work. No document content is written to browser persistent storage.

## Release and recovery

1. Review/approve `202610120002_team_document_revisions.sql` and test in isolated
   staging. Back up documents using the normal controlled database process.
2. Apply the migration **before** the application release; wait for PostgREST
   schema-cache reload. It is transactional, additive and rerunnable. Existing
   content, IDs, teams, authors and timestamps are retained; revisions start at 1.
3. Deploy the application only after migration verification. Ask users with old
   open editors to copy unsaved text before reloading. During the gap, old bundles
   can read but their old UPDATE fails closed with a reload message. This temporary
   save interruption is intentional; mixed old writers must not erase new saves.
4. Run the two-user QA below and read logs before approving rollout completion.

If code goes out early, missing column/RPC errors leave the editor unavailable and
must never fall back to ID-only writes. If application rollback is needed, leave the
revision/trigger/RPC in place and treat old document saves as unavailable; forward-fix
the editor. Do not drop the guard to restore unsafe saving. Do not reset revisions
or down-migrate away the column: stale browsers may still hold old tokens. Any
emergency SQL recovery must preserve content and advance revisions in a reviewed
migration, with editors quiesced. Other workspace features remain independent.

## Validation commands and evidence

- `node --test scripts/test-team-document.cjs`: deterministic actual controller,
  gateway and rendered-component/event-handler tests. These are offline tests, not
  evidence of PostgreSQL locking or hosted Supabase integration.
- `python scripts/test-team-document-local.py`: actual original table migration and
  new migration (twice) in a fresh local PostgreSQL cluster; fake UUIDs only; cleanup
  in `finally`. Real simultaneous sessions block on the same row/unique key.
  Covers A/B saves, C during review, legacy writer rejection, data preservation,
  owner/member/nonmember/anonymous access, denied zero-row updates, missing rows,
  membership removal, initial-creation races and author FK cleanup. It accepts no
  external connection URL and removes inherited PostgreSQL environment settings.
- `npm run typecheck`; scoped ESLint; `git diff --check`; `npm run build`.
- Existing invite-handoff, team-creation, squad-matching and organizer-workspace
  suites; core-pages smoke script attempted independently of typecheck.

Final run outcomes (2026-10-12):

| Check | Result |
| --- | --- |
| Focused document tests | 20/20 passed |
| Isolated PostgreSQL 18 integration | Passed all assertions, including blocked competing transactions and concurrent inserts; cluster removed in finally |
| Related regression suites | 114/114 passed |
| Typecheck | Passed |
| New document module/component/test ESLint | Passed with no findings |
| Existing TeamWorkspaceView ESLint | 10 errors / 1 warning, identical rules/counts to `origin/main`; pre-existing findings left unchanged |
| `git diff --check` | Passed |
| Default `npm run build` | Windows sandbox path access failure, then Turbopack rejected the worktree's external node_modules junction |
| `npm run build -- --webpack` | Passed with dummy localhost Supabase settings; existing middleware/Sentry/Edge warnings and expected unavailable localhost landing-page queries |
| Core-pages smoke script | Blocked: no Supabase URL/anon key in the isolated worktree; no production credentials were loaded |
| Browser runtime | Passed local fixture click-through using real React StrictMode, component, controller, Supabase HTTP client and local fake backend; realtime withheld |

Browser checks: both editors loaded revision 1; A saved; B's stale Save retained
B's draft and displayed A's text. A advanced the revision while B reviewed;
B's Keep mine produced a fresh conflict. Load theirs preserved B's recovery copy;
Restore recovered it. Typing during a delayed Save response remained unsaved after
confirmation. The fixture used temporary ignored scratch files and fake IDs only,
not hosted authentication/realtime or a visual-layout certification.

The first SQL test run exposed a fixture bug: a membership-removal assertion
removed B from both fake teams before the creation-race case. Scoping that deletion
to its own fake team fixed the harness; the complete suite then passed.

## Manual two-user QA after controlled migration

1. Sign A and B into separate browser profiles, same team; open Shared doc. Check
   owner access (including an owner absent from the roster), normal member access,
   and denial for a nonmember. Verify existing Markdown survives migration.
2. Both edit the same revision. A saves; B saves with realtime temporarily blocked.
   B must retain local text and see A's saved revision; the database must retain A.
3. B reviews both texts and chooses Keep mine. B's exact reviewed revision must
   advance once. Repeat while a third session saves before B's click; B must review
   the newer version, with B's text intact.
4. Choose Load theirs, then restore previous local edits. Check both versions are
   recoverable. Exercise an empty document as well as Markdown, long lines and links.
5. Throttle the network, Save, keep typing, and double-click Save. One request must
   run; only submitted text becomes the saved base; newer typing remains unsaved.
6. Interrupt the Save response and retry. No unconfirmed success or blind retry;
   an already-committed request may conservatively require conflict review.
7. Switch tabs and return; drafts remain. Switch teams with an outstanding load or
   save; old responses must not update the new editor. Reconnect after missing
   realtime; local text stays intact. Check two tabs signed in as the same user.
8. Recheck chat/presence, tasks/comments, brainstorm ideas, resources, GitHub,
   deployments and Activity on desktop/mobile. Save controls remain member-only.

## Known limits

- Manual whole-document conflict resolution; no automatic merge, revision history,
  autosave or CRDT. Intentional reviewed replacement replaces the prior saved text.
- Draft/recovery text is in memory for this workspace lifetime. Reload, browser
  crash or navigating to another team can lose it; copy before leaving. The native
  unload warning does not intercept every SPA navigation.
- Lost response after commit is conservatively treated as uncertain; retry may
  show conflict even when the saved content is yours. No idempotency-key service.
- Deletion/recreation is treated as replacement and asks users to copy and reload;
  document UUIDs are not interchangeable revision histories.
- Integer overflow fails closed after roughly 2.1 billion revisions; no wrapping.
- Local SQL fixtures reproduce the document table/policy and actual membership
  helper definitions, not every hosted Supabase default or deployment-specific
  policy. Hosted PostgREST/auth/realtime and two authenticated staging users still
  require controlled QA. Production deployment remains blocked.
