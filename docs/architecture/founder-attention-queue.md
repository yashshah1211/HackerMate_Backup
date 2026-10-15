# Founder Attention Queue

Standalone `/admin/attention` uses GET `/api/admin/attention`. No admin-root
navigation, moderation, email, analytics or scraper code is changed. No writes,
RPCs, jobs, polling, migrations, external integrations or new dependencies. The
page initially requires its URL. Recurring cost remains ₹0.

## Sources and semantics

Fields are supported by committed database types, migrations and existing reads;
production schema/data has not been probed as part of this implementation.

- `profiles`: `id`, `full_name`, `onboarding_completed`, `is_banned`, `created_at`.
  Only explicit `onboarding_completed=false` enters the queue. Null completion
  states have a separate exact count and never enter incomplete totals/lists.
  Suspended profiles remain included and labelled. Recent incomplete
  registrations are created in the inclusive last 24 hours and still false.
  Account age is registration age. No timestamp establishes when onboarding
  became incomplete; newly-incomplete transitions/duration remain unmeasured.
- `team_join_requests`: `id`, `team_id`, `user_id`, `status`, `created_at`.
  Only `status=pending`. Age buckets: under 24 hours; 24 hours through exactly
  seven days; strictly over seven days; unknown (null/future creation time).
- `team_invites`: `id`, `team_id`, `invited_user_id`, `status`, `created_at`.
  Only `status=pending`. Old invitations have creation time strictly before the
  seven-day cutoff. Age measures record creation, not a documented state change.
- Page-only enrichment: `teams(id,name,owner_id)` and
  `profiles(id,full_name,is_banned)`. Missing relations never remove queue rows;
  failed enrichment is flagged and cannot grant an owner workflow link.
- `user_reports` is deferred: committed schema has no resolution state; current
  dismissal deletes reports. Existing rows do not establish unresolved cases.

Server time determines rolling windows and `generatedAt`; display uses IST.
Null, invalid and future row timestamps have unknown age, never a clamped zero.
Database timestamp columns are expected to be PostgreSQL timestamps; malformed
text is handled defensively in returned rows. Unknown SQL age buckets cover null
and future timestamps. Invalid timestamp text cannot be stored in those columns.
Exact aggregate counts are independent of filters, cursors and page lengths.
Reads are independent, not a transactional snapshot: concurrent resolutions can
change counts/pages, and buckets must not be treated as an atomic reconciliation.

## Authorization and privacy

`requireAdmin` verifies Auth identity and protected role/ban state before service
access. Its verified founder/admin rules are unchanged. API failure paths return
no private data or raw database errors. Service-role configuration and a distinct
privileged client are required; the helper's RLS-limited user-client fallback
cannot establish global totals and returns 503 without queue reads.

`AuthGuard adminOnly` controls page mounting; the API independently enforces
access on every request. Server-only privileged reads return explicit DTOs: IDs,
names, necessary suspension flag, creation/age information and legitimate links.
No emails, report details, tokens, invitation tokens, biography, contact data or
unrestricted profile objects. Responses use `Cache-Control: private, no-store`.

The page offers context links to existing profiles/teams. Suspended/unknown-state
profiles have no profile link. Team request review links appear only when the
verified actor is that team's actual owner. A recipient's `/invites` link appears
only for that actor's own invitations. Others see responsibility text. There are
no inline approve/reject/accept/send actions, and existing workflows retain their
own authorization. No impersonation or new privileges are introduced.

## Query and API bounds

Parameters: `category=onboarding|join-requests|invitations`, `filter=all|recent`
for onboarding or `all|over7d` otherwise, `limit=1..50` (default 25), and `cursor`.
Unknown/repeated parameters, invalid enums, sizes and cursors return 400 after
authorization. Cursors are bounded base64url JSON tied to category/filter, with a
validated timestamp or null and UUID. No caller-controlled table/column names or
unvalidated PostgREST filter fragments are interpolated.

Order is `(created_at ASC NULLS LAST, id ASC)`. Keysets preserve original timestamp
precision, including microseconds, and use UUID tie-breakers. After dated rows,
null timestamps are paged by ID. Invalid timestamps cannot generate a continuation
cursor: preserve displayed rows and explicitly flag unavailable pagination.

A refresh executes ten exact head-count queries with at most four in flight,
then one selected-category page (limit+1, maximum 51 rows), at most one team batch
(50 IDs) and one profile batch (100 IDs). No offsets, N+1 lookups, all-row downloads
or browser-side full-table aggregation. One shared eight-second abort deadline
bounds outbound reads. There are no automatic retries.

These bounds do not guarantee the database planner avoids sequential scans for
exact filtered counts/global ordering. Existing indexes are documented in the
repository; production EXPLAIN was not run and no new indexes are added. Provider
statement limits remain relevant; query timeout/failure produces unavailable data
instead of switching to an unbounded application scan or an estimated count.

Each measurement is `verified` with an exact integer (including genuine zero),
or `unavailable` with null and a reason. Failed list reads have null `items`,
`hasMore` and cursor, rather than an empty list. Independent successful counts
survive. `coverage=partial` makes failed counts/lists/enrichment visible;
`coverage=unavailable` returns HTTP 503 when neither counts nor list are usable.
Missing privileged configuration also returns 503. Auth failures retain the shared
boundary's status. Only GET is exported; Next handles unsupported methods.

## UI lifecycle and validation

Manual refresh resets pagination. Category/filter/page changes abort older reads
and use a version plus selection key to prevent stale successes/errors applying.
No data is retained through a denied or failed refresh. Loading, verified empty,
partial failure, total failure and retry have distinct UI states. Generated time
belongs only to the displayed successful response; it is not a background refresh.

Offline tests execute real service queries against an in-memory read-only fixture,
real API/shared authorization with mocked clients, and real React effects in
JSDOM with mocked transport. No `.env`, production database, cron endpoints, email
or mutation RPCs are used. Run `node scripts/test-admin-attention.cjs`,
`npm run typecheck`, scoped ESLint and `git diff --check`. Git publication,
merging, deployment and live verification require separate authorization.
