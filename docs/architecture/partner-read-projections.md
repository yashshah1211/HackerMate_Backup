# Partner read projections (Commit 2)

Migration: `202610060003_partner_read_projections.sql`. The read-only production
ledger ended at `202610060001` during implementation; local `202610060002`
provides the prerequisite access predicate. Neither migration was applied here.
No API, UI, existing consumer, raw registration RLS or announcement policy changes.

## Authorization and failure behavior

The three private RPCs use `auth.uid()` and independently call Commit 1's
`can_access_partner_event` before querying. That predicate authorizes exact event
assignment, supported native ownership, or authoritative admin/founder access,
with a verified current non-banned profile. No caller identity parameter,
duplicated founder logic or service-role reads. Denial raises SQLSTATE `42501`.
Lookup/query errors propagate; an error never becomes a zero/empty success.
Definers pin `public, pg_temp`, qualify relations, and use explicit projections.
Only authenticated callers receive private EXECUTE; anon also receives the two
public RPCs. PUBLIC and service_role execution is revoked. No base grants change.

## RPC contracts

All functions take `p_hackathon_id uuid`, resolved against existing events. Scalar
aggregate RPCs return one table row. List RPCs return a JSON object with `total`,
`offset`, `limit`, `items`. A SQL aggregate computes total before pagination,
including for an empty/out-of-range page. Offset is 0..1,000,000; limit is 1..100
(default 50). Invalid parameters raise `22023`. Sorts have deterministic UUID
tie-breakers; no dynamic SQL.

| Function | Projection and parameters |
| --- | --- |
| `get_partner_organizer_overview` | Current registration rows, recorded confirmed/waitlisted counts, distinct linked teams, registered people in/without linked teams, explicit looking counts, looking people without linked teams. |
| `list_partner_organizer_participants` | User ID, name, college, normalized declared skills, recorded status, looking flag, registration timestamp, event team ID/name summaries. Filters: literal substring search in name/college, exact normalized college/skill, confirmed/waitlisted status, `any`/`in_team`/`without_team`, nullable looking boolean. Sort: `newest` (default), `oldest`, `name_asc`, `name_desc`. |
| `list_partner_organizer_teams` | Linked team ID/name, current and registered member counts, recruiting flag, recorded roles needed, valid positive team capacity, recorded event min/max, minimal roster (ID/name/event registration boolean). Filters: literal name substring, nullable recruiting boolean, nonnegative min/max member counts, size state. Sort: `name_asc` (default), `name_desc`, `newest`, `oldest`, `size_asc`, `size_desc`. |
| `list_event_discovery_builders` | Public builder ID/name/college/avatar/normalized declared skills only. Newest registration first. Pagination only. |
| `get_hackathon_registration_counts` | Registration, recorded confirmed and recorded waitlisted counts only; no identities. Hidden registrations remain part of safe aggregate totals. |

## Metric and privacy definitions

R is current event registration rows (the existing event/user unique constraint
prevents duplicates); T is distinct `team_hackathons.team_id` for that event; M is
current members of teams in T. A registrant is in a linked team exactly when its
user ID appears in M. Multiple team memberships count once for participant
metrics, but once per team in each team's size. Non-registered members affect
team size/rosters only. Legacy `teams.hackathon_id`, registration `team_id` and
unrelated event memberships confer no linked-team membership.

Confirmed/waitlisted are recorded statuses, not organizer validation or attendance.
Looking means exactly `looking_for_team IS TRUE`, including someone already in
a linked team. Missing registrant profiles stay in private counts/listings with
null name/college and empty skills. Skills are trimmed, lowercased, distinct and
sorted; empty/null entries are omitted. This describes declared skills only.

Private operational projections omit email, phone, metadata, admin/ban fields
and team workspace/chat/tasks/resources. Private lists include hidden event
registrations because hiding a public track record does not revoke registration.

Public discovery requires looking=true, is_hidden=false, show_track_record=true,
is_banned=false and an existing profile. Null privacy/ban state is excluded.
The event must be non-archived and satisfy the existing public listing rule:
external/no type, or effective approved status (status, then ai_feedback.status,
then approved for non-native events). Pending native/missing/archived events
raise `42501` in both public RPCs, rather than masquerading as empty events.
Native owners/admins can use private overview for non-public event counts.

Team size state is based only on recorded, internally consistent event limits:
positive min, max >= min. Invalid/missing limits yield null values, match
`unknown_limits`, and cannot match `within_limits`, `below_min` or `above_max`.
These states describe recorded size comparisons; they do not verify organizer
rules, successful participation, completion or official team status. Roles needed
are returned as stored; no inferred missing skills or compliance labels.

## Validation and performance

`node scripts/test-partner-metrics.cjs` creates and removes its own local cluster;
it strips database/Supabase environment variables and accepts no connection URL.
The SQL refuses non-local/non-fixture databases. Fixtures include 0, 5, 20, 500,
and 1,005 registrations, cross-event/multiple/shared team links, unregistered
members, missing profiles/college/skills and all privacy states. Tests cover RPC
authorization, filter totals, empty pages, allowlisted fields, query/access errors
and unchanged base grants/policies. The runner prints a representative 500-row
aggregate `EXPLAIN (ANALYZE, BUFFERS)` plan, not a production latency benchmark.

Existing production indexes already cover registration (event,user), event-team
links by event, and members (team,user). No additional indexes are needed for
approximately 500 registrations. Set joins/grouping compute membership/sizes;
team rosters are aggregated for the requested page only. Skill unnesting handles
each profile's declared array within the same SQL statement; no application N+1
reads. JSON envelopes avoid REST row caps truncating aggregate/page totals.

`src/types/supabase.ts` has a narrow manual update matching both intended
migrations, including Commit 1's table/predicates. Production generation would
omit unapplied schema, so it was not used. JSON RPCs retain the accurate `Json`
database return type; no future dashboard data contract was introduced.

Deferred: controlled migration application, consumer wiring, registration privacy
tightening and announcement-policy repair. Until application, missing RPC errors
fail closed. Existing broad raw registration access remains unchanged by request.
