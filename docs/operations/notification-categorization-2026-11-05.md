# Notification categorization correction

Branch: fix/notification-categorization-20261105, from freshly fetched main5e99957.

## Evidence and decision

Read-only production catalog inspection found notifications columns id,user_id,message,is_read,created_at,link; no type/event column. Generated types agree. No notification records were read or changed. Installed producer code excerpts confirm send_connection_request, accept_connection_request, send_team_invite, request_to_join_team, accept_team_invite and accept_team_join_request emit message templates. Source workspace producers also emit task activity in team context; owner succession emits a team promotion. One unrelated broadcast producer attempts a type field absent from the installed schema; that is not a reliable structured categorization source and is outside this renderer correction. No schema change or producer/dispatch edit is included.

Both views previously classified a request badge as Connection but separately admitted its text into Teams whenever it contained team (including teammate), joined or invite. Real drawer/page Chromium with synthetic rows reproduced13Teams entries instead of9team events, at1440/390px: all4desired-category tests fail before correction. Initial full-page fixture lacked its existing fuzzy-link ilike adapter; that fixture failure was diagnosed and corrected before the final valid before-run. No live authenticated production reproduction or dispatch was performed.

## Correction

src/lib/notificationClassification.ts is a pure message-template classifier returning one category plus badge label/tone. Fixed event preambles are recognized before arbitrary team names or connection pitches. For actor-prefixed connection/task events, the first producer action selects the outer event and its complete envelope is validated. Quoted task titles do not become connection/invitation events; task-like text inside a connection pitch stays Connections. Incomplete/quoted action text is not admitted merely by a substring. Team invitations/join requests/membership updates retain their existing classifications. Hackathon/mention labels remain outside both category tabs; unmatched events remain Activity under All and, when unread, Unread.

Drawer and full page derive classification once for each displayed row; both pass that same result to the shared filter and the existing Tape badge. Queries/projections, link resolution, click handlers, optimistic/read reload behavior, date grouping/order, realtime subscriptions and loading/error components are unchanged. No category metadata is persisted or sent to Supabase.

## Verification

- 50 focused tests: 48 event examples plus unknown-word handling and shared-consumer wiring. Every example checks label/tone/category, exclusive team/connection admission and All/Unread for true/false/null read flags. Includes all original cases, 16 task-title combinations, five connection pitches containing complete task events, and four incomplete/quoted non-events. Team names containing Connection Labs or complete connection-event phrases stay Teams.
- 4 actual notification browser cases cover drawer/page at 1440/390px. Categories and badge CSS tones agree, ordered messages retained, connection/team links and read actions work, unknown realtime updates enter All/Unread, mark-all clears Unread, subscriptions are scoped/removed on unmount, loading/error states preserved. All provider/database/auth boundaries are synthetic and external HTTP is blocked.
- Existing account/workspace browser scenarios are retained alongside the new tests; six reported browser cases pass.
- New unit/browser tests are added to PR validation; all existing checks remain. Exact final offline/TypeScript/build/lint/hosted results are recorded in the Draft PR delivery metadata after completion.

Counts overlap. Windows locally excludes only the unchanged Linux-specific database-report shell suite; its30cases remain mandatory in hosted CI. The safe build uses scrubbed environment, offline fonts and synthetic database reads, not production services. Existing lint debt is compared by normalized diagnostic identity/multiplicity; no configuration or rules are weakened. No claim that synthetic UI verification is live authenticated production acceptance.

## Review follow-up — 2026-11-06 IST

[Independent review comment](https://github.com/yashshah1211/HackerMate_Backup/pull/126#issuecomment-6665794134) identified a genuine priority regression in the initial commit: `Ava assigned you to task "Bob sent you a connection request" in team "Kernel Builders"` became Connections. Invitation phrases in task titles also produced an Invite badge instead of Team.

Verified all four message envelopes directly in TeamWorkspaceView: assigned/commented use quoted title plus quoted team; moved additionally uses `to "status"`; updated uses `status to "status"`. Added every action with three connection/invitation titles and one title containing embedded quotes. Connection pitches embed the same complete task envelopes to prove that simply moving a broad task regex ahead of Connections would be wrong.

The expanded before-run reported 49 tests: 29 pass, 20 fail (16 task envelopes and four unknown/malformed messages). After correcting outer-event parsing and adding one legacy fixed-prefix connection pitch, the final focused suite passes 50/50 with no skips. The same 48 examples feed both real browser surfaces and stay below the drawer's existing 50-row limit. No UI component, query, producer, dispatch or database change in this follow-up. Final browser, TypeScript, safe-build and exact final-head hosted CI evidence is recorded in PR #126's delivery metadata; the original commit's green run is not substituted.

## Limits and release gate

The installed schema has no reliable structured type, so future producer wording may need another recognized event phrase; until then it stays under All/Unread. This is categorization, not authorization. Navigation still follows existing links/resolution. No database records, notifications/email dispatch, credentials, production settings, migrations, dependencies or schedules changed. Keep Draft/unmerged and do not deploy until founder approval. Final SHA and inspected final-head CI live in PR metadata to avoid a self-referential documentation commit.
