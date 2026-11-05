# Mission 03 permission change inventory

Recorded before writing each proposed permission change. Baseline: `7fc7acc83dc4585c2624ec047f2c34c1dff312a6`. Scope: `team_tasks`, `team_links` and the separately inventoried document suspension follow-up below; no profile permissions change. All changes are review artifacts and local-fixture verification only, not applied to production.

Search: entire tracked repository for `team_tasks|team_links`, literal `.from` calls, embedded relations, SQL references and dynamic table fixtures. No embedded `team_tasks(...)` or `team_links(...)` application selection was found. Generated types/SQL snapshots are distinguished from executable queries below. Ignored scratch contains disposable investigation fixtures and is not a production query surface.

## Application query and write columns

| File / query | Table | Columns read or written |
| --- | --- | --- |
| src/components/TeamWorkspaceView.tsx fetchTasks | team_tasks | SELECT *: id, team_id, title, description, status, priority, assignee_id, created_at, created_by, due_date; team_id predicate; created_at order |
| Same file task creation | team_tasks | INSERT team_id, title, description, priority, assignee_id, due_date; created_by omitted and defaults to auth.uid() |
| Same file drag/drop and status select | team_tasks | UPDATE status; originally id predicate; final persistTask adds team_id and SELECT returned id, then existing fetchTasks |
| Same file assignee select | team_tasks | UPDATE assignee_id; originally id predicate; final persistTask adds team_id and SELECT returned id |
| Same file due date | team_tasks | UPDATE due_date; originally id predicate; final persistTask adds team_id and SELECT returned id |
| Same file task deletion | team_tasks | DELETE by id/team_id; SELECT returned id |
| Same file realtime task reload | team_tasks | SELECT * (same columns as fetchTasks); team_id predicate; created_at order; table-scoped subscription |
| src/lib/hackathonRunMode.ts loadRunMode | team_tasks | SELECT id, team_id, title, status, assignee_id, due_date with exact count; team_id predicate; created_at order |
| src/components/TeamWorkspaceView.tsx fetchLinks | team_links | SELECT *: id, team_id, title, url, category, created_by, created_at, hackathon_id; team_id predicate; created_at order; client filters hackathon_id |
| Same file link creation | team_links | INSERT team_id, title, url, category, created_by, hackathon_id |
| Same file link deletion | team_links | DELETE by id; no returned projection |
| Same file realtime link reload | team_links | SELECT * (same columns as fetchLinks); team_id predicate; created_at order; table-scoped subscription |

No application query updates id, team_id, created_by or created_at. Existing SELECT grants are not narrowed, so these tables do not acquire restricted SELECT columns and existing wildcards remain compatible. Proposed UPDATE grants retain title/description/status/priority/assignee_id/due_date for tasks and title/url/category/hackathon_id for links; immutable identity/creator fields must not be writable by API callers. Nullable created_by INSERT remains accepted for compatibility, subject to current active membership.

## Other tracked files matching either table

- src/types/supabase.ts: generated row/insert/update declarations and FK metadata, not an executed query. Describes all columns listed above.
- scripts/mission02-ui-fixture.cjs: synthetic dynamic query adapter returning task columns listed above; no live database client.
- scripts/test-mission02-workspace.cjs: exercises real task DELETE, verifies id/team_id predicates and returned id; synthetic adapter only.
- scripts/test-mission02-browser.cjs: synthetic task fixture rows id/team_id/title/status/priority/assignee_id/due_date/created_at; no live query.
- scripts/test-hackathon-run-mode.cjs: synthetic dynamic client for the loadRunMode SELECT projection above; checks team scope, failures and stale responses.
- scripts/test-scraper-data-preservation.cjs: preserved linked-table name in a mocked set; no new task/link write or projected columns.
- docs/architecture/admin-moderation-controls.md: security investigation reference, no query.
- docs/qa/aggregator-repair/HACKATHON-ACCESS-INVENTORY.json: historical schema SQL snapshot (team_links hackathon_id ALTER and FK references), not executed by application.
- Existing docs/stabilization files: historical findings/plans/test descriptions; no application query. New Mission 03 regression files will use fake IDs and disposable native clusters; their projections/mutations are intentionally negative authorization tests, not new production callers.

## All migration references and embedded SQL columns

| Migration | References |
| --- | --- |
| 202607050001_team_workspace.sql | CREATE task/link columns above except later created_by/due_date/hackathon_id; policy reads team_id; realtime publication |
| 202607080002_realtime_delete_replica_identity.sql | REPLICA IDENTITY FULL, no query projection |
| 202607100009_restrict_team_deletions.sql | Adds task created_by/default; SELECT/INSERT/UPDATE policy reads team_id, created_by; DELETE checks created_by or team owner |
| 202607120004_task_due_dates.sql | Adds task due_date |
| 202607120005_workspace_v2_features.sql | Comment/upvote policies embedded SELECT team_id FROM team_tasks WHERE id=task_id and team_links WHERE id=link_id; FK references id |
| 202607180006_add_missing_indexes.sql | Indexes task team_id/assignee_id and link team_id |
| 202607180008_restrict_policies_to_authenticated.sql | Latest comment/upvote policy embedded SELECT team_id using id; no task/link UPDATE grants |
| 202608080005_hackathon_scoped_github_and_links.sql | Adds link hackathon_id and index; no task/link write grant |

Helpers is_team_member/is_team_owner are defined in 202607020001_core_security.sql and include owner access. The proposed policies additionally inspect only the caller's profiles.id/is_banned, already included in existing profile SELECT grants. No profiles migration or wildcard profile selection is needed.

## Compatibility and rollout gates

### Document suspension follow-up inventory (before adding document policy)

Independent native review confirmed the same STAB-023 account-state omission in `team_documents`. Entire tracked repository searched for `team_documents`, embedded relations and RPC callers before changing that policy. No embedded document relation query exists in application code.

| File | All document reads/writes |
| --- | --- |
| src/lib/teamDocument.ts documentGateway | SELECT `id,team_id,content,revision,updated_at,updated_by` by team_id/maybeSingle; INSERT team_id/content returning the same explicit projection; duplicate-creation retry uses that SELECT; save calls save_team_document with team ID, document ID, expected revision and content |
| src/components/workspace/SharedTeamDocument.tsx | Table-scoped INSERT/UPDATE and DELETE realtime callbacks; payload metadata triggers gateway reads, not privileged writes |
| src/lib/admin/databaseActivityReport.ts | Service-role SELECT id,team_id,updated_by,updated_at,teams(name), updated_at predicate/order; no content or revision writes |
| src/types/supabase.ts | Generated table/RPC metadata; no query |
| supabase/migrations/202607050001_team_workspace.sql | CREATE id/team_id/content/updated_at/updated_by, member FOR ALL policy, publication |
| supabase/migrations/202610120002_team_document_revisions.sql | Adds revision; invoker RPC UPDATE content/revision by id/team_id/revision RETURNING all six columns; SELECT all six columns by id/team_id for conflict/missing; trigger checks id/team_id/content/revision and stamps updated_at/updated_by |
| scripts/test-team-document-local.py | Disposable native fixture; INSERT id/team_id/content/updated_by/updated_at; SELECT content/updated_by/updated_at/revision and counts; denied UPDATE content/revision by id and unauthorized INSERT; author FK cleanup and RPC conflict/creation tests |
| scripts/test-evaluator-maintenance.cjs | Synthetic administrative report rows id/team_id/updated_by/updated_at/teams(name), malformed updated_by checks; no live write |
| scripts/mission03-workspace-db.cjs and test-mission03-workspace-rls.cjs | Disposable synthetic document INSERT team_id/content/revision; SELECT id/content/revision/count; invoker save RPC, denied INSERT/DELETE and flag changes in fixture profiles |
| docs/architecture/workspace-document-concurrency.md, admin-moderation-controls.md, historical QA schema snapshot and stabilization documents | Historical inventory/policy descriptions and schema snapshots; not executable application queries |

Only document RLS is tightened to current active owner/member. No document column grants, revision trigger, RPC signature/success shape, service-role report query or existing conflict semantics change. Existing SELECT wildcard compatibility is unchanged. This inventory supplements the task/link sweep above and predates the document policy edit.

Preserve current owner/member access and creator-or-owner deletion while denying revoked/suspended actors. Explicitly revoke immutable-column UPDATE grants as well as table UPDATE grants, because independent column grants survive a table-level REVOKE. Retain service-role/table-owner maintenance and FK cleanup behavior; prove them locally. Do not apply this migration or any GRANT/RLS change to production without founder approval and the required native/smoke/browser verification. Public R2 URLs are outside these table policies and remain part of blocked STAB-006.
