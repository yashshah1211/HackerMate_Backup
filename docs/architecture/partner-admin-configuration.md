# Partner administration (Commit 8)

The existing `/admin` Partnering tab now includes one compact configuration
and event-organizer access surface. This commit implements administration;
it does not configure NexHack, add actual organizers, apply migrations or edit
event facts. No new authorization model, role hierarchy or dependency is added.

## Authorization and identity

Every operation in both new APIs calls `requireAdmin` before reading request
parameters, configuration, target accounts or assignments. Its existing
verified identity, protected role/ban checks and exact founder semantics are
unchanged. Missing profiles, unknown ban state, lookup failures, ordinary and
outreach-only users, spoofed metadata and banned callers are denied before
privileged client construction. Responses, including authorization failures,
are private/no-store and use nosniff headers. SQL/Auth details are logged on
the server and are not returned to the browser.

Configuration and exact-account verification use the existing authorized
admin client. Assignment reads, inserts and deletes use `supabaseUserClient`,
retaining the verified caller JWT and Commit 1's RLS policies. The foundation
explicitly revokes service-role access to `event_organizers`; it is not bypassed.

Organizer input is an existing account UUID only. There is no email lookup,
domain matching, partial account search, account directory or account creation.
The grant handler calls Auth `getUserById` and verifies the returned UUID/email,
then explicitly reads the target's protected profile ID, role and ban state.
Missing/banned/unknown profiles are ineligible. Exact-account verification
requires the existing service-role configuration; otherwise grants return 503.

Platform administrators and the verified founder already have independent
organizer authority; an unnecessary new assignment for them returns 409.
Existing assignments can still be revoked without changing their independent
admin/native-host authority. The UI states this distinction.

## Public configuration contract

`GET /api/admin/partner-config` returns `{partners, events}`. Partners contain
only normalized C6 public fields, ID and an opaque SHA-256 revision. Events
contain explicit ID/name/type/archive/date/mode/location/team-limit fields for
selection and read-only review. Raw feature objects and unrelated fields are
not returned. Lists use ordered 500-row reads to avoid the default row cap;
10,000 rows is an explicit management limit, not a silent truncation.

`POST` accepts `{config}` and creates a configuration for an existing event.
Name, slug and event UUID are required; it never creates an event. New rows
have no inherited branding or guessed copy, and remain legacy unless V1 is
explicitly chosen. Duplicate public slugs return 409.

`PATCH` accepts `{partnerId, expectedRevision, config}`. The revision must match
the freshly read record. The update also compares every selected stored
configuration column, including JSON features and updated_at, in the database
write predicate. A concurrent legacy writer that does not update the timestamp
still cannot lose its edit through a feature merge. Conflicts return 409 and
require reload; no automatic overwrite/retry is performed.

Both writes accept only:

- `slug`, `partner_name`, `hackathon_id`, `tagline`, `logo_url`, `banner_url`,
  `accent_color`;
- `portal_version` (`legacy` or `organizer-v1`), `official_website`,
  `public_contact` (`{label,url}` or null), `approved_links` (up to eight
  `{label,url}` objects), `registration_mode` (`external`, `native` or null).

Slug, UUID, public-text lengths/control characters, six-digit hex color and
safe HTTP/HTTPS or supported local image paths are validated. Unknown envelope,
configuration or nested-link fields, unsafe protocols, malformed JSON and
oversized request bodies are rejected. Public links require a label and URL.
No private organizer identity, notes, secret, permission or arbitrary feature
object can be submitted through this contract.

Updates write only requested columns and merge only the approved feature keys
into the existing object. Unrelated legacy configuration is intentionally
preserved; this is not a destructive cleanup or bulk migration. Malformed
non-object feature payloads cannot be silently normalized during a merge.
The editor submits only deliberate field differences, so normalized legacy
values do not silently overwrite unrelated stored values. Existing legacy
brand-color fallback follows the C6 presentation contract.

Changing event association changes no organizer assignment and no event fact.
The UI states that access must be reviewed separately for the selected event.

## Organizer assignment contract

`GET /api/admin/partner-organizers?eventId=<uuid>` verifies the event and lists
only its explicit assignments. Rows contain user UUID, public display name and
assignment timestamp, with no email, role, ban state or Auth internals. Reads
page through 500 assignments at a time; scoped display-name lookups use batches
of at most 100 IDs. The explicit limit is 10,000 assignments. Detected duplicate
rows during a changing list return a reload conflict.

`POST` accepts exactly `{eventId,userId}`. After event/account/profile checks,
it inserts one immutable assignment with `created_by = auth.user.id`.
Browser-supplied created_by/role/admin flags are rejected. Duplicate assignments
return 409. No profile role, registration, native organizer or other event is
modified.

`DELETE` accepts exactly `{eventId,userId}` and deletes only that composite
event/user assignment through the caller-bound client. It returns
`{eventId,userId,revoked}`; `revoked:false` explicitly means the assignment was
already absent. It never deletes an account, changes roles or registrations,
or affects another event. Assigned authority fails on the next independently
authorized request after deletion. An unrelated admin/native-host grant remains
independent. Database errors never appear as successful grants/revocations.

## Partnering UI and legacy flow

The new surface lets an admin select a configured partner or configure an
existing event, choose legacy/V1 deliberately, edit the approved public fields,
and open the ordinary public page and V1 organizer workspace. Approved links
use label/URL controls with add/remove actions. Event facts are visible only
for review; uncertain dates, venue, mode and limits are not decided here.

The event's assignment list has an exact UUID grant form, a meaningful zero
state, explicit errors/reload, and a scoped revoke confirmation naming the
account and event. Late configuration saves cannot switch away from a newly
selected editor. Reloading a failed organizer list clears pending confirmation.
The surface uses existing admin typography, zinc colors, lime action treatment,
compact spacing and responsive fields; the rest of the admin application is
not redesigned.

The lead-driven provisioner remains a legacy create/match flow and is labeled
accordingly. It accepts optional `existingEventId` explicitly; that path never
creates or edits an event. Without it, exact ID/name/website matches retain
the existing purpose, with ambiguous matches requiring explicit selection.
Database lookup failures cannot fall through to duplicate-event creation.
New legacy configurations no longer inherit the Axcentra logo or generic
introduction; already stored partner records are unchanged.

The provisioner rejects V1/private fields: V1 administration uses the new
existing-event configuration API, bypassing its historical event-creation
defaults. Legacy new-event creation still has its existing event defaults and
sequential event/config writes; it is not an atomic provisioning transaction.
This commit does not claim to replace that legacy workflow. Conflicting
NexHack facts and actual production provisioning remain future delivery work.

## Validation and limits

- 183 new offline actual-handler/component tests pass, covering every operation's
  authoritative admin/founder authorization and denials, browser cookie sessions,
  public allowlists, existing-event selection beyond 1,000 rows, merge preservation,
  stale/concurrent saves, eligible exact UUID grants, created_by spoofing, duplicate
  assignments, immediate helper denial after revoke, other-event isolation, lists
  beyond 1,000 rows, mutation failures, legacy matching/defaults and admin UI flows.
- All 641 existing runtime regressions pass: central admin authorization/deletion,
  partner helper, organizer API/CSV/workspace, public presentation/compatibility
  and private/native broadcast suites. The final combined run passes all 824
  tests, including the latest 183-test new suite.
- 379 partner/privacy SQL assertions and 80 admin-deletion SQL assertions pass
  in disposable localhost clusters with cleanup. The 500-row projection plan
  was inspected. No production connection or credentials are loaded by fixtures.
- Typecheck, targeted lint across every changed TypeScript/JavaScript file and
  whitespace checks pass. No migration, dependency or lockfile is changed.
- 24 headless Chrome layouts at 390/768/1024/1440 pixels show new, V1, legacy,
  missing-event, API-error and revoke-confirmation fixtures without horizontal
  overflow. Eight keyboard stops have visible focus. Screenshots were reviewed
  for labels, long account names, optional links, confirmation and failure states.

Browser previews use actual offline component output with freshly compiled
repository Tailwind CSS. They are not a full Next/Supabase session. The previously
documented missing-Supabase-environment build/prerender limitation remains;
full production build/integration was not rerun or claimed. Production event
facts, partner configuration, assignments and migrations remain unchanged.
