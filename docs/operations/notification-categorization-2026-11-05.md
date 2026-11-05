# Notification categorization correction

Branch: fix/notification-categorization-20261105, from freshly fetched main5e99957.

## Evidence and decision

Read-only production catalog inspection found notifications columns id,user_id,message,is_read,created_at,link; no type/event column. Generated types agree. No notification records were read or changed. Installed producer code excerpts confirm send_connection_request, accept_connection_request, send_team_invite, request_to_join_team, accept_team_invite and accept_team_join_request emit message templates. Source workspace producers also emit task activity in team context; owner succession emits a team promotion. One unrelated broadcast producer attempts a type field absent from the installed schema; that is not a reliable structured categorization source and is outside this renderer correction. No schema change or producer/dispatch edit is included.

Both views previously classified a request badge as Connection but separately admitted its text into Teams whenever it contained team (including teammate), joined or invite. Real drawer/page Chromium with synthetic rows reproduced13Teams entries instead of9team events, at1440/390px: all4desired-category tests fail before correction. Initial full-page fixture lacked its existing fuzzy-link ilike adapter; that fixture failure was diagnosed and corrected before the final valid before-run. No live authenticated production reproduction or dispatch was performed.

## Correction

src/lib/notificationClassification.ts is a pure message-template classifier returning one category plus badge label/tone. Fixed team-event preambles are recognized before arbitrary team names; otherwise connection events take precedence over team wording in their optional pitch. It also recognizes team invitations/join requests/membership updates and existing workspace task event phrases. Incidental team/connect/invite substrings do not establish an event. Hackathon/mention labels remain outside both category tabs; unmatched events remain Activity under All and, when unread, Unread. No future notification is silently assigned a category merely because its text contains team.

Drawer and full page derive classification once for each displayed row; both pass that same result to the shared filter and the existing Tape badge. Queries/projections, link resolution, click handlers, optimistic/read reload behavior, date grouping/order, realtime subscriptions and loading/error components are unchanged. No category metadata is persisted or sent to Supabase.

## Verification

- 25 focused tests: 23 event examples plus unknown-word handling and shared-consumer wiring. Every example checks label/tone/category, exclusive team/connection admission and All/Unread for true/false/null read flags. Ambiguous connection pitches mention teammate, team formation, invitations and hackathons. Team names containing Connection Labs or complete connection-event phrases stay Teams; three additional regressions failed before the fixed-preamble refinement and pass afterward.
- 4 actual notification browser cases cover drawer/page at 1440/390px. Categories and badge CSS tones agree, ordered messages retained, connection/team links and read actions work, unknown realtime updates enter All/Unread, mark-all clears Unread, subscriptions are scoped/removed on unmount, loading/error states preserved. All provider/database/auth boundaries are synthetic and external HTTP is blocked.
- Existing account/workspace browser scenarios are retained alongside the new tests; six reported browser cases pass.
- New unit/browser tests are added to PR validation; all existing checks remain. Exact final offline/TypeScript/build/lint/hosted results are recorded in the Draft PR delivery metadata after completion.

Counts overlap. Windows locally excludes only the unchanged Linux-specific database-report shell suite; its30cases remain mandatory in hosted CI. The safe build uses scrubbed environment, offline fonts and synthetic database reads, not production services. Existing lint debt is compared by normalized diagnostic identity/multiplicity; no configuration or rules are weakened. No claim that synthetic UI verification is live authenticated production acceptance.

## Limits and release gate

The installed schema has no reliable structured type, so future producer wording may need another recognized event phrase; until then it stays under All/Unread. This is categorization, not authorization. Navigation still follows existing links/resolution. No database records, notifications/email dispatch, credentials, production settings, migrations, dependencies or schedules changed. Keep Draft/unmerged and do not deploy until founder approval. Final SHA and inspected final-head CI live in PR metadata to avoid a self-referential documentation commit.
