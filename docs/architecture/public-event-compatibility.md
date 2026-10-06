# Public event compatibility bridge (Commit 3)

Base: `f674659`. No migration/schema, RLS, production data or deployment changes.
Commit 1/2 migrations remain unchanged and unapplied. No new API, organizer UI,
CSV or NexHack presentation was added.

## Replaced public dependencies

- Partner builder discovery previously selected event registration/profile rows
  and metadata. It now uses `list_event_discovery_builders`, with an explicit
  public field mapping and 50-row pages. The SQL RPC exclusively decides who is
  discoverable; the client has no visibility reconstruction or raw fallback.
- Event discovery previously loaded all registration rows plus team member
  profiles, and inferred registration badges by intersecting those arrays.
  Both builder tabs now use the safe discovery RPC. Non-looking/hidden/private
  people are not shown merely because their team is linked. Public cards do not
  expose registration status or infer participation from team membership.
- The event registration total and native participation sidebar now use
  `get_hackathon_registration_counts`. The partner preference creation capacity
  check and both native/external join capacity checks use `confirmed_count` from
  that RPC, never raw selects or a fetched page length.
- The linked profile page's raw registration-count fallback was also removed.
  Its visible-event-community count uses the existing privacy-filtered, complete
  JSON history from the public builder profile API/RPC. Unavailable history has
  no raw-table/declared-participation fallback; private history reads "Private".
  That history is not a paginated raw-registration array or a capacity counter.

## Self state and preference writes

`loadOwnEventParticipation` verifies `auth.getUser()` and scopes every table query
to that identity AND event. It accepts no user ID argument and rejects a returned
row belonging to another identity. Only the self row's ID, user ID, team ID,
recorded status, looking flag and own metadata are selected. A missing session
performs no self query. Auth/query failure is unavailable, not "not joined".

`setOwnDiscoveryPreference` updates only the looking flag and an explicitly
selected private track metadata patch. It never deletes participation or
overwrites an existing status, team, timestamp, hidden flag or other metadata.
Turning off an absent row is a no-op. Turning on for an external community can
create one self row; native users must already participate. Repeated explicit
preferences are idempotent. A unique-conflict race re-reads the caller's existing
row once and updates its preference without upserting over other fields.

Explicit native cancellation/community departure remains a separate action.
It re-verifies the self row and reports read/write errors rather than pretending
cancellation succeeded. Team link/create/invitation/application paths and
multiple-event associations remain intact; dormant active-event guards were
removed from the two join actions. Linking a team never implies every member has
an individual registration.

For external events, joining/listing is HackerMate community participation.
Official registration stays at the external event website, whose CTA remains
available even after joining the community. Copy does not claim externally
verified registration. Recorded confirmed/waitlisted values are retained as
HackerMate status only. Existing capacity decisions are advisory client-side
checks; this commit does not add transactional reservations or verify official
external capacity/registration.

## Empty, error and legacy behavior

The shared helper validates aggregate/page envelopes and distinguishes denied
(`42501`) from unavailable/invalid results. Zero totals are valid; failures are
shown with retry controls and unavailable tallies, never empty-list/zero/self
absence fallbacks. Raw queries and service-role access are not fallback paths.
Paging totals come from SQL; page lengths only verify the page contract. Latest
discovery requests win when page requests overlap.

Legacy slug lookup, generic presentation, team track selection/filtering and
external CTAs remain. Public builder results are now labelled event-wide because
the approved projection intentionally omits private track metadata; skill
heuristics no longer pretend to provide track-specific participation totals.
The existing event AuthGuard remains; signed-out partner discovery is public.

## Remaining registration references (source audit)

| Location / operation | Classification | Boundary |
| --- | --- | --- |
| `src/lib/hackathons/eventParticipation.ts`: self select/update/insert and unique-conflict re-read | SAFE SELF-SCOPED | Verified current identity, exact event, explicit columns/payload. |
| `src/app/hackathons/[id]/page.tsx`: native/external insertion | SAFE SELF-SCOPED | Loaded current user; own-state gate; event scoped. No broad read. |
| `src/app/hackathons/[id]/page.tsx`: explicit departure DELETE returning ID | SAFE SELF-SCOPED | Fresh verified self/event filters; returned ID only verifies deletion. |
| `src/app/api/admin/partner-composition/route.ts` | ADMIN/PRIVATE | Existing admin endpoint, unchanged. |
| `src/app/api/admin/hackathons/route.ts`: deletion cleanup | ADMIN/PRIVATE | Existing admin mutation, unchanged. |
| `src/app/hackathons/[id]/organizer/page.tsx` | ADMIN/PRIVATE | Existing native organizer screen, unchanged; Commit 4 must preserve its legitimate access or migrate it under its private work. |
| `src/app/api/organizer/broadcast/route.ts` | ADMIN/PRIVATE | Existing private broadcast recipient read, unchanged. |
| `src/types/supabase.ts` and historical SQL/RPC references | UNRELATED | Schema declarations, existing policies and SQL projections; no public client loader. |

No remaining public raw-registration dependency is unknown or awaiting migration
in the audited partner/event/profile compatibility surface. The linked profile
counter identified as MUST BE MIGRATED BEFORE COMMIT 4 was migrated here.

## Validation

- 35 offline compatibility tests execute the actual helper and page components
  with mocked Supabase responses, including a self-only table-access fixture.
  They cover empty/error/denied states, PII allowlists, totals/pagination,
  preference preservation, creation/races, native and legacy page rendering,
  external CTAs and remaining-read checks. These are data/render tests, not a
  browser visual redesign audit.
- 128 real PostgreSQL projection assertions additionally verify looking/non-looking,
  hidden/private/banned and wrong-event eligibility against the unchanged SQL.
- 42 SQL authorization assertions, 50 partner helper tests and existing admin
  authorization regressions pass in isolated/offline fixtures.
- Typecheck passes. New helper/tests and the profile changes lint clean.
- Full targeted page lint reproduces inherited failures on `f674659`: event
  8 errors/5 warnings before, 5/5 after; partner 19/9 before, 16/9 after. Comparing
  rule/message/source-line signatures found zero introduced diagnostics. The
  existing `any`, unused-variable, image and dependency warnings were not repaired.
- Whitespace checks pass. No production build was needed for this client bridge;
  typecheck and actual component rendering cover the changed modules.

Runtime prerequisite: Commit 1/2 migrations must be applied in a later controlled
operation before the new public RPCs are available. Their absence remains visible
as unavailable data. Raw registration and announcement RLS remain unchanged.
