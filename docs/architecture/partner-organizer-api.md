# Partner organizer API and participant export (Commit 5)

Base: `38d9e80` on `feature/nexhack-partner-portal`. Commit 5 adds no SQL migration,
production data change, dashboard, public-page redesign, provisioning or service
client. Commit 1–4 migrations and their SQL contracts are unchanged.

## Authorization and event resolution

Both GET routes invoke the same `requirePartnerAccess` with `{partnerSlug: slug}`.
It verifies the bearer/cookie user with `getUser`, checks the protected current
profile, resolves `partner_configs(id,hackathon_id)` by slug, verifies the event,
then calls `can_access_partner_event` with the authenticated caller's client.
Every projection RPC independently repeats database authorization. Routes never
accept a client identity, event ID or admin/partner-access flag. All unknown and
duplicate query parameters are rejected. No raw registration or team query, no
service-role credential/client and no duplicated role/founder logic is added.

A narrow opt-in detailed-error mode was added to the shared helper. Its default
behavior, including generic 403 responses for existing partner callers and the
existing admin/founder authorization behavior, is preserved. Only the new routes
opt into distinct errors. The shared identity helper's optional response statuses
do not change identity/profile requirements. API operational logs contain
operation/RPC names, status/code rather than SQL messages or private payloads.

| Status | Meaning |
| --- | --- |
| 401 | no verifiable signed-in session |
| 403 | valid session but missing/unknown protected profile, ban/email state, wrong/revoked assignment, or SQL authorization denial |
| 404 | unknown/invalid slug, absent event association, or nonexistent configured event |
| 400 | invalid section, filter, sort, pagination, unknown/duplicate parameter |
| 500 | lookup/RPC failure, missing RPC, malformed projection/envelope, unexpected read error |
| 504 | projection/export request deadline exceeded |
| 409 (export) | observed changing total or duplicate participant during pagination |
| 413 (export) | matching set exceeds 10,000 rows or generated CSV exceeds 8 MiB |

Authorization and slug resolution precede query validation. Denied callers never
invoke a data projection. Lookup failure does not become 404; RPC failure does not
become a successful empty list, zero metric or CSV. Unexpected/private error
messages are never returned. No fallback raw read exists.

## GET /api/partners/[slug]/organizer

Default `section=overview`. Success returns `eventId`, `section`, `retrievedAt`
(UTC ISO timestamp) and either `metrics` or `rows` plus `pagination`.

Overview accepts only `section=overview`. Metrics are exactly the eight Commit 2
fields: `registration_count`, `confirmed_count`, `waitlisted_count`, `team_count`,
`participants_in_team`, `participants_without_team`, `looking_for_team_count`,
`looking_without_team_count`. These describe recorded HackerMate participation,
current event-linked teams/memberships and explicit looking preferences. They do
not measure official external registration, attendance, engagement, conversion,
results or successful teams.

Lists default to `page=1&pageSize=50`; page size is 1..100. Numbers must be canonical
decimal integers (no signs, fractions, exponent, padding, Infinity). Offset is
`(page-1)*pageSize` and must stay within the SQL 0..1,000,000 bound. Empty pages
past the filtered total are valid and retain that total. Pagination contains
`page`, `pageSize`, `total`, `totalPages`, `hasNext`; total comes from SQL before
pagination, never from array length. Projection requests have a 10-second abort
signal deadline.

### Participants

`section=participants` accepts:

| Query | Contract |
| --- | --- |
| `search` | trimmed literal substring in name/college; max 200 characters |
| `college` | normalized exact college match in SQL; max 200 characters |
| `skill` | normalized exact declared skill in SQL; max 100 characters |
| `status` | `confirmed`, `waitlisted` |
| `teamState` | `any` (default), `in_team`, `without_team` based on current event-linked teams |
| `lookingForTeam` | exact `true` or `false`; absent means either |
| `sort` | `newest` (default), `oldest`, `name_asc`, `name_desc` |
| `page`, `pageSize` | bounded pagination above |

Empty/whitespace text filters normalize to null. Enum/boolean values are rejected
if invalid, including empty enum/boolean input. Text limits are checked before
trimming. Sort/filter values are typed RPC parameters, never SQL expressions.
Rows explicitly project only `user_id`, nullable `full_name`/`college`, normalized
`skills`, recorded `status`, `looking_for_team`, `created_at` and `event_teams`
(`team_id`, `team_name`). Email, phone, metadata, role and ban fields are omitted,
including unexpected extra properties returned by a future RPC implementation.

### Teams

`section=teams` accepts:

| Query | Contract |
| --- | --- |
| `search` | literal team-name substring, trimmed, max 200 characters |
| `recruiting` | exact `true` or `false`; absent means either |
| `minMembers`, `maxMembers` | nonnegative SQL integers, <=2,147,483,647; min <= max |
| `sizeState` | `any` (default), `below_min`, `above_max`, `within_limits`, `unknown_limits` |
| `sort` | `name_asc` (default), `name_desc`, `newest`, `oldest`, `size_asc`, `size_desc` |
| `page`, `pageSize` | bounded pagination above |

Rows contain only the approved event-linked team summary, member/registered-member
counts, recruiting, recorded roles/capacity/event limits and minimal roster
(`user_id`, nullable `full_name`, `registered_for_event`). Null role-array entries
are omitted, without inferring any role. Size conditions compare recorded valid
limits; unknown limits remain unknown. No chat, tasks, resources, workspace,
evaluation or guessed success/compliance field is serialized.

Every response shape is validated before serialization. Lists require the exact
requested offset/limit and expected page length; counts must be safe nonnegative
integers. Extra top-level, row and nested fields are discarded by explicit mapping.
A malformed or capped RPC page is an error rather than silent truncation.

## GET /api/partners/[slug]/organizer/export

Exports **all matching participant filters**, not a currently visible page. Accepts
exactly the same participant filter/sort keys as above. `section`, `page`,
`pageSize`, team filters and unknown/duplicate keys are rejected. An export with
no filters covers all current event registrations, including hidden public
participation that authorized organizers can legitimately read.

The response uses a fixed safe filename
`partner-participants-filtered-YYYY-MM-DD.csv`; no slug/filter/user text enters
Content-Disposition. Headers:

- `Content-Type: text/csv; charset=utf-8`
- `Content-Disposition: attachment; filename="..."`
- `Cache-Control: private, no-store`
- `X-Content-Type-Options: nosniff`
- `X-Export-Scope: all-matching-filters`
- `X-Export-Row-Count: <validated matching total>`

CSV is UTF-8 with a BOM for spreadsheet Unicode support, seven fixed columns:
participant name, college, declared skills, recorded HackerMate status,
looking-for-team preference, event-linked team names and HackerMate join time.
Missing names/college are empty cells. Skills/team names use `; ` summaries.
No email, phone, metadata, user/team IDs or other private/profile/workspace fields
are enumerated into the file. An apostrophe neutralizes cells beginning with
`=`, `+`, `-`, `@`, including after whitespace/control characters; leading tab,
CR or LF is also neutralized. Every cell is quoted and embedded quotes doubled;
commas, CR/LF, multiline values and Unicode round-trip correctly.

Export fetches sequential SQL pages of 100, bounded to 10,000 matching rows, 8 MiB
of generated CSV and a 25-second projection deadline (route maxDuration=30).
Rows are serialized as each page arrives; only bounded CSV chunks and a participant
ID set are retained, rather than accumulating all original database payloads.
More than 1,000 rows is supported. No background job, service-role fetch, capped
single-response completeness assumption or partial-file success is used.

Each chunk's total must match the first, IDs must not repeat, and a final one-row
caller-bound RPC rechecks authority/total before the buffered file is released.
Any failure, observed drift or revocation returns a private JSON error with no
CSV disposition. Zero matching rows is a successful header-only CSV only after
successful empty projection and final authority/completeness checks.

The existing offset RPCs do not provide a cross-request transaction snapshot.
Exports describe a bounded retrieval window; total changes and duplicate IDs are
detected, while concurrent edits/replacements that preserve count and produce no
duplicate can still alter that window's content. No atomic snapshot is claimed.
A snapshot export would require later SQL contract work; this commit does not
change migrations to add it.

## Validation

New tests execute the actual TypeScript routes and shared helpers using real
NextRequest/NextResponse with offline mocked authentication/database dependencies.
The shared harness rejects service-role construction, raw registration/team table
reads and all real network/email access. Fixtures use synthetic UUIDs and invalid
domains. Existing PostgreSQL runners create/clean isolated local databases only.

- 163 API/authorization/filter tests, including BOTH API and export authorization,
  assigned/native/admin/founder callers, bans/revocation/unknown identity, cookie
  sessions, wrong events, malformed/unknown/unlinked slugs, forged scope flags,
  SQL/lookup failures, private headers, approved projections and pagination.
- 50 CSV/export tests, including 0/1/101/500/1,005 rows, matching-filter scope,
  Unicode/quotes/commas/newlines, formula/control prefixes, explicit PII exclusion,
  partial/final RPC failures, resource bounds and concurrent total/duplicate drift.
- 209 Commit 4 SQL privacy/announcement assertions passed.
- 128 projection assertions and the representative 500-row plan passed.
- 42 original SQL authorization assertions passed.
- 35 public compatibility, 50 partner helper and 24 existing private-flow tests passed.
- 156 admin authorization and 42 deletion regressions passed; shared default
  authorization behavior remains unchanged.
- Typecheck, targeted lint and whitespace checks passed.

No build rerun: Commit 4 already reproduced missing-Supabase-environment prerender
failure on its untouched base. This commit does not change that configuration.
No production changes or real emails/notifications were performed. No Commit 6
UI or configuration work is included.
