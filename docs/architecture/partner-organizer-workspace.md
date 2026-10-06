# Private partner organizer workspace (Commit 7)

`/partners/[slug]/organizer` is the canonical private Partner V1 workspace.
Overview, Participants and Teams share this route through the `tab` query
parameter. It consumes the existing Commit 5 API and export contracts. There is
no migration, provisioning UI, production configuration or registration write.

## Server access and rendering

The dynamic server page copies Next's server cookie store into a NextRequest
for the existing access boundary. `requireVerifiedProfile` verifies the caller
before configuration/setup states are resolved. The caller-bound client reads
only the explicit partner identity/association fields. `requirePartnerAccess`
then independently verifies the profile and authoritative event access RPC.
The two configuration resolutions must agree on partner and event IDs.

Only successful authorization and an explicit `organizer-v1` configuration
permit the explicit event-header read and dashboard render. Initial client
props contain normalized event identity/facts, not participant data, counts,
role/ban state or roster data. Banned, revoked and wrong-event callers cannot
render that dashboard. Administrators and the verified founder use the same
existing authoritative boundary. No service-role client is created.

Unauthenticated callers use `/login?next=...` with an encoded local workspace
path and allowlisted URL state. Unknown slugs invoke the local not-found page;
access denial, unconfigured event and lookup failure have distinct private
states. API failures do not become zero counts. The organizer API and export
continue to authorize independently with caller-bound database projections.

Scoped middleware refreshes browser session cookies on the page and APIs; it
does not grant event access. Existing API bearer transport passes through to
the route's authoritative token verification, including invalid tokens that
the route must reject. Cookie API authentication failures return private,
no-store JSON. Public partner routes retain their existing classification.

## Reads and operational views

Every workspace render requests the API's overview section. One divided
summary presents its four exact values: HackerMate registrations, linked teams,
registered participants in linked teams, and registered participants without
a linked team. Overview attention links use the existing unteamed, looking,
and looking-plus-unteamed counts, clearing unrelated participant filters.
The five most recent HackerMate registrations come from the existing newest
participant query. Skill and college aggregates are omitted because the API
does not expose those aggregates.

Both positive, ordered event team limits must be confirmed to show compliance
filters or below/above-limit totals. Those totals use filtered team API counts,
not a count of the visible page. Otherwise the page explicitly says team-size
checks are unavailable. Team rows can also report current members who have
not joined this event on HackerMate using the safe member counts.

Participant columns are name, college, declared skills, recorded HackerMate
status, event-linked teams, looking preference and join time. Team columns are
name, current and event-registered member counts, recruiting, declared needs,
attention and the minimal current roster. Links lead only to ordinary public
`/profile/[id]` and `/teams/[id]` pages. No email, phone, metadata, administrative
state, private team workspace, chat, task, file or evaluation is displayed.

The client decoder verifies expected event/section, dates, field types and
pagination and reconstructs only approved fields. Invalid payloads are
unavailable. Requests are no-store, bounded by timeouts and cancelled on
effect cleanup; stale query results cannot replace current results. Any
section/export 401 or 403 replaces the private dashboard with an access state
and prevents a pending download from being released in that mounted view.

## Filters, pagination, refresh and export

URL state has separate participant (`p...`) and team (`t...`) allowlists.
Participant search, exact college, declared skill, status, event-linked team
state, looking preference and supported sort map to existing API parameters.
Teams support name search, recruiting, confirmed compliance conditions and
supported sort. Filter submission resets the relevant page. The page size is
25, and pagination uses the API totals/hasNext contract. Out-of-range pages
offer a return to page one instead of claiming that the event is empty.

There is no browser-wide row fetch or local filtering. Tabs retain the other
tab's saved state. Unknown/duplicate/invalid query parameters are dropped;
compliance parameters are suppressed without confirmed event bounds. Manual
Refresh re-fetches the active reads and calls `router.refresh()` to reauthorize
server identity/facts. No polling or realtime subscription is introduced.

Export requests the protected Commit 5 route with saved participant filters
and sort only, including when the Teams tab is active. Pagination/team filters
are excluded. Copy describes the all-matching-pages scope and the click-time
filter snapshot during an in-flight download. The browser saves the returned
CSV Blob; it never serializes CSV itself. Server resource limits, drift checks,
formula protection, privacy and final authorization remain unchanged. Limits
or drift return an actionable error, not a partial file. The existing export
is a bounded retrieval window, not an atomic database snapshot.

## Empty states, shell and legacy routing

True zero data produces four real zero values and a finished community empty
state with public-page/copy-link actions. Participant and team empty states
describe HackerMate participation separately from external organizer
registrations. Filtered no-results and fetch failures remain distinct.

Only the exact partner organizer route is classified as bare, avoiding the
public header and ordinary builder navigation. The existing layout already
suppresses the footer on partner routes. There is no organizer sidebar.

The new server layout at `/hackathons/[id]/organizer` redirects only after a
single unambiguous, valid V1 association and fresh event authorization. Missing,
ambiguous, malformed, legacy or unauthorized associations fall through to the
unchanged existing native organizer page. It grants no new native authority.

## Presentation and validation

The scoped CSS continues Commit 6's pinned dark palette and Bricolage
Grotesque, Instrument Sans and JetBrains Mono fonts. Desktop uses full semantic
tables and inline filters; tablet filters wrap. Narrow screens use two-column
summary values, native collapsible filters and expandable participant/team
rows with meaningful primary information. Extremely narrow reflow uses one
summary column. All interactive controls have visible keyboard focus.

Validated on isolated synthetic fixtures, with no production access:

- 65 new real-module workspace tests: server access/rendering, middleware,
  legacy redirect/fallback, safe rows, API query filters/sort/pagination,
  zero/error states, limits, manual refresh, stale requests and CSV downloads
  beyond the visible page, including late 401/403 failures.
- 443 combined Node tests, including the existing 163 organizer API, 50 CSV,
  50 partner authorization, 56 public presentation, 35 public compatibility
  and 24 private/native broadcast regressions.
- 379 existing local PostgreSQL assertions: 209 registration privacy,
  42 event authorization and 128 partner projections; representative 500-row
  query plan inspected. Isolated test databases cleaned by their runners.
- Type checking, targeted lint and whitespace checks pass.
- Headless Chrome checked 32 isolated component/CSS layouts: zero, 5, 20 and
  500 participants, teams and errors at 360/390/768/1024/1440 CSS pixels, plus
  equivalent 200% zoom/reflow widths. No page/body horizontal overflow or
  injected private fixture fields; ten keyboard stops had visible outlines.
  Screenshots reviewed for long names/colleges, many skills, roster expansion,
  filters, pagination and errors. Native filter collapse verified in Chrome;
  mobile initial-collapse behavior verified with the component effect test.

The browser previews render actual component output and scoped CSS using
offline API fixtures; they are not full Next/Supabase integration or a real
browser zoom session. The known missing-public-Supabase-environment prerender
failure was previously reproduced on the untouched base; full production
build/runtime validation remains unavailable in this environment. No unrelated
environment fixes, production migrations or configuration changes were made.
