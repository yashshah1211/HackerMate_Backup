# Commit 4: registration privacy and announcement isolation

Migration: `supabase/migrations/202610060004_partner_registration_privacy.sql`.
Implementation base: `5503e85` on `feature/nexhack-partner-portal`.

## Production-effective audit (SELECT only, 2026-10-06)

Production's newest ledger entry remains `202610060001 restore_safe_user_deletion`;
`202610060004` is unused. Commit 1–3 migrations are unchanged. No production
migration, seed, data write, deployment, email or notification was performed.

All five live registration policies were permissive:

| Old policy | Effective access | Replacement |
| --- | --- | --- |
| `registrations_read` | authenticated SELECT `true` | `registrations_read_scoped` |
| `registrations_read_anon` | anon SELECT `true` | removed, no anon raw grant |
| `registrations_create_self` | own user, null team or `is_team_owner` | same self/team rule plus protected verified identity |
| `registrations_update_self` | own user; new team null/owned | self preferences only, protected identity and field restrictions |
| `registrations_delete_self` | own user | verified self only, retained for explicit unregister |

The repository's effective definitions come from core security, July 15 broad
read, July 26 anon read, and August 23 self-write policies. July 18 UPDATE checks
were superseded by August 23. All registration policies are replaced atomically,
including unexpected policy drift; no old permissive SELECT/ALL can OR into the
new boundary. The fixture includes an extra permissive ALL policy to verify this.

Live table ACLs granted SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER to
anon, authenticated and service_role. There were no registration triggers or
views referencing registrations. Both table and explicit column grants are
cleared for PUBLIC/anon/authenticated before granting the permitted operations.
Service-role ACLs remain unchanged for existing verified server consumers.

## Effective read and write model

| Caller | Raw registration reads | Registration writes |
| --- | --- | --- |
| anon | none, including column SELECT | none |
| ordinary verified participant | own rows | own INSERT, preference UPDATE, explicit own DELETE |
| assigned event organizer | own rows plus assigned event rows | own participation only, no participant management |
| native organizer | own rows plus native events owned by caller | own participation only |
| authoritative admin / exact verified founder | all existing events via Commit 1 predicate | existing verified service consumer privileges; caller-JWT self writes only |
| banned, unknown ban, missing profile/auth user/email/JWT | none | none |

The no-argument `has_verified_event_identity()` reads protected `profiles` and
`auth.users`, binds to `auth.uid()`, and requires `is_banned IS FALSE` and an auth
email. It adds ordinary self-identity verification; admin/event authority remains
in the unchanged Commit 1 helpers. Lookup errors abort rather than granting.
The helper is SECURITY DEFINER with qualified objects and pinned search_path;
only authenticated gets EXECUTE.

INSERT preserves the existing join payload (`hackathon_id`, `user_id`, owned or
null `team_id`, initial confirmed/waitlisted `status`, discovery, track preferences,
visibility). Clients cannot supply row ID or creation time. Initial status remains
the existing client-selected join status; capacity admission is not redesigned.
UPDATE grants only `looking_for_team`, `metadata`, `is_hidden`. Event/user/row
identity, created time, status and team are immutable to client UPDATE. The
SECURITY INVOKER trigger allows only existing participant `event_track` and
`event_name` metadata preferences to change; other keys must be preserved and
cannot be injected on INSERT. Legacy non-object metadata can stay unchanged but
cannot be overwritten. Trigger EXECUTE is not exposed as an RPC.

Disabling discovery leaves registration, status, team, timestamps and metadata in
place. Explicit event-page cancellation/community departure can still DELETE the
verified caller's own registration. Organizer authority does not grant another
participant's UPDATE/DELETE. Scoped raw reads are private authorized access;
private metadata remains available to self/event authorities at that boundary,
and is absent from all public projections and organizer projection DTOs.

## Announcements

Before: the live SELECT predicate contained `hr.hackathon_id = hr.hackathon_id`,
so a registration in any event authorized all announcements. The fixture first
reproduces that behavior, then proves it disappears after Commit 4.

After: verified participant reads require
`hr.hackathon_id = hackathon_announcements.hackathon_id` and their own user ID.
The unchanged Commit 1 predicate permits assigned organizers for their events,
native owners for native events, and authoritative admins/founder. The live table
has no public flag/state; anon receives no announcement privileges.

All four old announcement policies are replaced. Native owners and authoritative
admins/founder can retain event-scoped announcement writes. Partner read
assignments do not acquire broadcast writes. Client INSERT binds organizer ID to
JWT identity, and UPDATE cannot move the event or spoof the author. PUBLIC/anon
and surplus authenticated grants (including TRUNCATE, which bypasses RLS) are
removed. Existing service grants are preserved.

## Private consumer compatibility and final static classification

| Consumer / reference | Compatibility | Final classification |
| --- | --- | --- |
| `src/lib/hackathons/eventParticipation.ts` SELECT/UPDATE/INSERT | compatible: verified self read and approved discovery/track payload | SELF-SCOPED |
| event page native/external INSERT and explicit unregister DELETE | compatible: original owned-team rule and self identity; no status UPDATE | SELF-SCOPED |
| `/hackathons/[id]/organizer` registration query | narrow change: verify Commit 1 predicate before native owner portal loads; existing selected profile/team fields and registration query retained | AUTHORIZED ORGANIZER/ADMIN |
| admin partner composition | compatible: existing `requireAdmin` protected profile/founder boundary and service client; explicit event filter; no registration metadata selected | AUTHORIZED ORGANIZER/ADMIN |
| admin hackathon deletion | compatible: same existing `requireAdmin` and service cleanup; service DELETE grant retained | AUTHORIZED ORGANIZER/ADMIN |
| existing organizer broadcast route | narrow change: shared verified identity plus caller-JWT event predicate before existing service client; native/admin/founder only; linked stage must belong to event | AUTHORIZED ORGANIZER/ADMIN |
| public partner/event discovery and capacity UI | compatible: Commit 3 safe helpers, no broad raw SELECT | PUBLIC SAFE PROJECTION |
| profile history API / `get_public_builder_profile` | narrow registration privacy correction described below, minimal UI handles absent self-only fields | PUBLIC SAFE PROJECTION / SAFE RPC INTERNAL |
| Commit 2 five projection functions | compatible SECURITY DEFINER internals; authorization independent of client table SELECT | SAFE RPC INTERNAL |
| `get_pending_deadline_reminders()` | compatible: existing service-role-only EXECUTE, qualified internal anti-join; no anon/authenticated privilege | SAFE RPC INTERNAL |
| admin activity reports | unrelated: query `team_hackathons`, not participant registration table | AUTHORIZED ORGANIZER/ADMIN |
| badges/certificate verification | unrelated: `user_badges` and event/profile relations, no participant registration lookup | UNRELATED, no raw consumer |
| stages/resources/native posting | compatible/unrelated: live policies do not consult registrations; existing event owner writes and public content reads retained | UNRELATED, no raw consumer |
| `src/types/supabase.ts` | schema references, unchanged | SCHEMA/MIGRATION ONLY |
| old migrations / commented rollback / isolated test fixtures | historical/fixture references, never production runtime or applied backlog | SCHEMA/MIGRATION ONLY |

The existing native portal will later be replaced but its legitimate native-owner
reads, resource/stage management and broadcast flow continue to work. This commit
does not open that existing native management UI to partner read assignments or
build the future organizer dashboard/API/export.

Historical native-post SQL also contains an unqualified registration predicate.
The audited LIVE `hackathon_posts_insert` is different: it permits self-authored
ordinary posts, and announcements only for the event owner; it has no registration
subquery. It is not an active registration privacy path. No historical migration
is edited or replayed to reconcile that drift. The separate public native-post
content model is unchanged by private broadcast-table isolation.

## Alternate RPC privacy paths

The only two live pre-Commit-4 functions referencing registrations were
`get_public_builder_profile(text,uuid)` and `get_pending_deadline_reminders()`.
No registration view or other live definer/invoker function was found. The
profile function's Phase 1A live body already ignores `p_caller_id` and obtains
identity from `auth.uid()`; no caller-ID authority is reintroduced.

Its registration history now requires explicit true profile visibility and
explicit false registration hiding, plus the same public-event gate as Commit 2
for other viewers. Banned/unknown-ban targets are omitted. Authenticated callers
with invalid protected identity are denied; anonymous public history remains.
Only the verified target receives registration ID, status, discovery preference
and registration timestamp. Other viewers get public event card fields only.
Metadata and registration user IDs are never included. Existing self/legitimate
teammate email semantics are retained, with the verified-caller guard; unrelated
team/submission payloads and the Phase 1A empty projects compatibility key are
unchanged. `BuilderTrackRecord` keys cards by event and omits the private
registration date when absent; no public portal redesign.

## Validation

The privacy runner creates a fresh local PostgreSQL cluster, scrubs database and
Supabase environment credentials, refuses non-local fixture databases, and never
loads `.env` or accepts a connection URL. Its production-effective synthetic base
schema is written directly; only NexHack Commit 1/2/4 SQL migrations are applied
(Commit 3 contains no SQL). All data uses synthetic IDs and invalid-domain email.

- 209 direct SQL/RLS assertions: SELECT/INSERT/UPDATE/DELETE across anon, ordinary,
  assigned/wrong/revoked/banned organizers, native owner, admin/founder, ban/profile/
  email/JWT unknown states, protected fields/metadata, same-event announcements,
  multiple registrations, lookup failure, public/private projections and RPC ACLs.
- 24 private-flow tests execute actual broadcast route, shared identity helper and
  native portal
  with offline mocks; denied broadcasts create no service client, read no recipients,
  mutate nothing; authorized empty-recipient cases send no email.
- Existing compatibility: 35 tests passed.
- Existing projection: 128 SQL assertions passed, including representative 500-row plan.
- Original authorization: 42 SQL assertions passed.
- Existing partner helper: 50 tests passed.
- Admin authorization/deletion: 198 combined tests passed (156 + 42).
- Typecheck passed.
- Targeted lint: zero new diagnostics versus `5503e85`; existing counts and final
  build/whitespace outcomes are recorded in the final validation addendum below.

No production migration is applied. Changes must eventually be deployed with the
reviewed NexHack foundation/projection/privacy migrations in order. No later
NexHack implementation is included.

### Final validation addendum

Targeted lint on changed sources/scripts reproduces the exact base diagnostics:
broadcast route 6 errors / 1 warning; native organizer page 2 errors / 1 warning;
track-record component 0 errors / 2 warnings. Both new scripts are clean. No new
lint diagnostics; inherited React effect source excerpts have different paths/
line numbers but identical rule, message and offending source on base 5503e85.

The requested standard production build compiled successfully and passed its
TypeScript stage, then failed prerendering because this checkout has no public
Supabase URL/API key (FeedbackWidget imports the shared client). The untouched
5503e85 baseline, extracted locally and using the same dependencies/environment,
reproduced the same prerender failures for /_not-found, /invites and /dashboard.
This inherited configuration limitation is documented rather than changing
unrelated application setup. The initial sandbox-only SWC canonicalization error
was resolved by running the build with local process permissions.

No unresolved new registration privacy failure or private-consumer breakage was
found. Build completion requires the existing public Supabase environment setup;
inherited lint cleanup is outside Commit 4. Baseline/audit artifacts were removed
before staging. Whitespace checks pass. Final source TypeScript checking passes.
