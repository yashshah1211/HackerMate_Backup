# Active team discovery — audit and review evidence

Base: latest `main` at `9c857b27e6b1d335ee381831743696103acc16ee`, containing merged PRs #35 and #36. Branch: `feat/active-team-discovery`. Verified October 19, 2026. The draft PR records the final commit SHA.

## Result and ranking

`/teams` adds a muted **Owner recently active** label when the owner has recorded application activity within the preceding 30 × 24 hours, inclusive of the cutoff and current instant. It does not expose exact timestamps or imply online status or a likely response. The explanation explicitly says activity does not guarantee a response. Missing, inaccessible, malformed, timezone-less and future activity values produce no label, not an inactivity verdict.

Ranking is lexicographic: joinable teams first; existing normalized skill-overlap score descending; recent owner activity among equally relevant joinable teams; creation date descending; stable ID ascending. Without viewer skills, activity precedes creation date among joinable teams. Non-joinable peers retain the previous skill/date/ID order. Activity never filters teams or changes recruitment flags. Older open teams remain in the default view; full, closed and event-closed teams remain available under **All teams**. Existing search, college, event and any-of skill filters remain in effect across scopes.

The empty state now links to **Create a team** (`/teams/create`) and **Discover builders** (`/developers`) alongside existing all-teams access. Mobile sheet filters have separate control IDs from the hidden desktop controls, fixing the duplicated label targets encountered during browser testing.

## Independent query and authorization audit

- `src/app/teams/page.tsx` retains its existing `AuthGuard`. No authentication, onboarding, middleware, request, invite or membership code is changed.
- The existing browser Supabase client and its current session perform every discovery read. No service-role client, new server endpoint, SECURITY DEFINER RPC, public projection or anonymous activity fallback is introduced.
- The existing `teams` projection already returns `owner_id` through `*`. The optional activity query selects only **`profiles.id, last_seen_at`**, restricted to distinct owner IDs from the authorized team result, in batches of at most 100. It runs only after `getUser()` yields a user without an auth error. No other owners or profile fields are requested.
- Repository authorization evidence: `20260808182000_fix_profiles_email_privacy_leak.sql` revokes table-wide profile SELECT and grants named columns including `id` and `last_seen_at`; `202607100006_restrict_profiles_read_to_authenticated.sql` defines the authenticated SELECT policy permitting self, non-banned profiles or existing admin authorization. The later anonymous-read policy/grants also exist in the repository, but this change does not add to or use anonymous activity discovery. The builder directory already consumes activity through existing authorized profile reads and search (`profileColumns.ts`, `202610120001_builder_profile_search.sql`). Existing RLS decides which owner rows this viewer can read; no returned row is treated as proof of universal visibility.
- Activity is a **separate optional read**, rather than a profile embed that can fail the base query or an inner join that can remove teams. The team list renders before activity resolves. Denied reads (42501), rejected transport promises and malformed response containers set a non-blocking message; successful batches can still contribute labels. Omitted rows remain unknown. A failed base team read remains a visible team-load error with Retry.
- Only a derived boolean is attached to team state. Exact activity timestamps are not rendered, persisted, logged, added to analytics, or included in screenshots. Authorized network responses necessarily contain the two selected columns; their existing database grants/RLS are unchanged.
- Abort signals and generation checks prevent cancelled, unmounted or older reloads from replacing newer results. A reload rechecks activity and drops previously positive signals when access fails. Viewer skills are reset before reload to avoid retaining a prior viewer's relevance data.

**Authorization limit:** no authenticated production session or database credentials were supplied. Grant/RLS conclusions are based on repository migrations, existing readers and relationship definitions, with denial behavior verified offline. Actual deployed policy parity and a member-session smoke check are not claimed. No production database reads or writes were needed; the supplied 31/22/3/35 production findings were not recounted or changed.

## Event closure and primary associations

The old discovery query only embedded `team_hackathons`; `teams.hackathon_id` was not resolved for closure or facets. It also checked `status === 'archived'` but omitted the actual `hackathons.archived` boolean introduced by `20261002160000_add_hackathon_archival.sql`.

Discovery now includes both the explicit primary `teams_hackathon_id_fkey` relationship (defined in `202607080001_security_and_schema_fixes.sql` and generated types) and junction relationships, selecting `id, name, end_date, status, archived`. These are ordinary non-inner embeds subject to existing event RLS. Primary-only event names participate in filters and card descriptions; duplicate names are deduplicated. No association records are rewritten and no junction ordering or team-detail/workspace event-selection behavior changes.

A known archived flag, legacy archived status or end before today's UTC calendar date closes the team in discovery. Both SQL date strings and timezone-qualified timestamp strings are validated; impossible/malformed values and null/inaccessible relations do not invent a closure. An event ending today stays joinable through today, preserving `/teams`' existing calendar-day rule. The existing **any known closed linked event closes the team** behavior is deliberately retained for multi-event teams; a per-event recruitment redesign is outside this change.

## Screenshots and browser evidence

All screenshots use synthetic teams and the real `TeamsView`, `useTeamsData`, shared components and application CSS. Next navigation and Supabase are replaced by explicit offline adapters. Baseline source comes from the exact base commit above. These are component fixtures, not production screenshots, and use system font fallbacks. No production profiles, sessions or personal data are included.

| View | Before | After |
| --- | --- | --- |
| Desktop, 1440px | [Before](before-desktop.png) | [After](after-desktop.png) |
| Mobile, 390px | [Before](before-mobile.png) | [After](after-mobile.png) |

Additional evidence: [desktop empty state](empty-desktop.png), [mobile empty state](empty-mobile.png), [optional activity unavailable](activity-unavailable-desktop.png), [browser result manifest](browser-results.json).

The synthetic baseline incorrectly classifies an archived primary-only team as open. The changed view moves it to All teams and promotes an older, equally skill-relevant team with a recently active owner. Lower-skill active teams still follow stronger skill matches.

Browser assertions cover 1440, 390 and 320px: baseline/changed ranking, coarse labels, no horizontal overflow, all eight fixture teams retained, primary-event filters and closure, mobile sheet control associations, empty-state links, keyboard builder navigation, optional authorization denial preserving teams, signed-out activity-query suppression and visible base-query errors. Requests are restricted to loopback; external requests and database writes are zero. AuthGuard is not bypassed in the application; the isolated component fixture does not exercise a live login.

## Verification

- **303 focused/existing tests passed:** discovery 33; activity/date/query/lifecycle 35; team creation 13; dashboard join requests 35; invite handoff 14; PR #36 request analytics 5; public hackathon metadata 29; nested metadata/organizer compatibility 8; public event data 21; browsing/auth lifecycle 63; hackathon discovery 47.
- Real-component Chromium browser checks passed at 1440/390/320px, including filter labels and network/write guards.
- Existing first-team activation browser regression: desktop/mobile dashboard prompt, team discovery/detail navigation and one explicit fixture join request; synthetic in-memory only. The runner uses installed Chromium instead of its hardcoded Edge channel and redirects evidence to `work/active-team-discovery/activation-browser`; application/test assertions remain unchanged.
- Actual production `next build --webpack`, `next start`, and **44 existing production HTML checks** passed against read-only loopback fixtures, including PR #35 metadata and nested organizer compatibility. The harness supplies synthetic public credentials, strips inherited provider credentials and mocks Google fonts; it performs no live Supabase access. Its 39 runtime reads are anonymous synthetic event reads, not team/activity production reads.
- `npx tsc --noEmit --incremental false`: passed. Scoped ESLint: passed with zero warnings. `git diff --check`: passed.
- The supplied checkout initially had malformed generated `.next/dev/types` and incomplete `node_modules`. Clearing that generated development cache and installing the existing lockfile (`npm ci --ignore-scripts`, workspace cache) resolved setup; no manifest/lockfile/dependency changes. Existing Next middleware, Sentry/Edge compatibility and webpack cache warnings are outside scope. The first browser runner attempts had harness permission/locator issues, corrected before the successful final run.

Reproduction (existing dependencies; installed Chromium or `QA_CHROMIUM_PATH`):

```sh
node scripts/test-team-discovery.cjs
node scripts/test-team-activity.cjs
node scripts/test-team-activity-browser.cjs
node scripts/test-team-creation.cjs
node scripts/test-dashboard-join-requests.cjs
node scripts/test-invite-handoff.cjs
node scripts/test-first-team-request-analytics.cjs
node scripts/test-public-hackathon-metadata.cjs
node scripts/test-public-hackathon-metadata-organizer.cjs
node scripts/test-public-hackathon-data.cjs
node scripts/test-public-hackathon-browsing.cjs
node scripts/test-hackathon-discovery.cjs
node scripts/test-public-hackathon-metadata-production.cjs
npx tsc --noEmit --incremental false
npx eslint src/app/teams/TeamsView.tsx src/app/teams/useTeamsData.ts src/app/teams/page.tsx scripts/test-team-discovery.cjs scripts/test-team-activity.cjs scripts/test-team-activity-browser.cjs
git diff --check
```

The cloud sandbox requires its network capability for loopback servers and browser subprocesses. Test logs/build artifacts stay in ignored-by-staging `work/` directories and are not shipped.

## Exact changed files

1. `src/app/teams/useTeamsData.ts`
2. `src/app/teams/TeamsView.tsx`
3. `src/app/teams/page.tsx`
4. `scripts/test-team-discovery.cjs`
5. `scripts/test-team-activity.cjs`
6. `scripts/test-team-activity-browser.cjs`
7. `docs/qa/active-team-discovery/README.md`
8. `docs/qa/active-team-discovery/before-desktop.png`
9. `docs/qa/active-team-discovery/after-desktop.png`
10. `docs/qa/active-team-discovery/before-mobile.png`
11. `docs/qa/active-team-discovery/after-mobile.png`
12. `docs/qa/active-team-discovery/empty-desktop.png`
13. `docs/qa/active-team-discovery/empty-mobile.png`
14. `docs/qa/active-team-discovery/activity-unavailable-desktop.png`
15. `docs/qa/active-team-discovery/browser-results.json`

## Limits and founder/reviewer handoff

Activity is application telemetry and never proof of responsiveness, availability, commitment or team health. It can be absent for legitimate owners. The browser clock sets the activity cutoff; activity is a snapshot per load, not a live subscription, and teams can reorder when the optional result arrives. No stale/unknown owner is negatively labelled. Same-score preference is intentional; active low-relevance teams do not displace stronger skill matches. All teams remains subject to the student's chosen filters.

Inaccessible event relations remain unknown; the client cannot infer closure from a record RLS does not reveal. Multi-event recruitment and the existing calendar-day event-end rule remain limitations. The current all-teams fetch and member counts retain their existing scaling/visibility characteristics; the new optional owner reads are bounded to 100 IDs per request.

No founder approval is needed to create this draft. Before release, independent review and an authenticated smoke check under the deployed policies remain outstanding; a founder/reviewer can use an existing member session without granting new permissions. Any proposal to broaden data access or change multi-event recruitment should be a separate approved task.

No Supabase writes, migrations/RLS changes, production deployment, merge, messaging automation, new dependencies or paid APIs. No edits to Hustle Carnival, sponsor outreach, authentication, onboarding or PR #36 analytics. Existing recruitment flags, requests and membership records are untouched. Leave the PR draft and unmerged.
