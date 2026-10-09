# Smart Squad Matcher implementation

Implemented locally on develop, October 9, 2026. No production migrations or user-data writes.

## Existing functionality and deployment evidence

The existing V2 SQL supplies the private skill/role vocabulary, exact alias normalization,
seven-domain evidence vectors, indexed rotating builder pool, feature maintenance, and
public person-to-person and person-to-team RPCs. These are reused rather than replaced.
Developers and Dashboard both request `get_recommended_teammates_v3`, with an explicit
missing-function fallback to the same V2 `get_recommended_teammates` implementation.
Their duplicated fetch logic now shares one V3-to-V2 adapter and the same 50-result
limit. Developers retains the RPC's order instead of breaking rounded-score ties by
activity; Dashboard already retains that order. Explicit Active/New discovery sorts
are unchanged. Team discovery's `get_recommended_teams` consumer is unchanged.

A read-only production PostgREST schema inspection confirmed the V2 three-argument
teammate RPC, team RPC and `send_team_invite` are exposed. `get_recommended_teammates_v3`
is absent from the exposed production schema despite its local migration. This verifies
the API surface, not the complete migration ledger or private-schema contents. The new
migration checks its V2 function dependencies before installing. No V3 rollout is required.

The old Squad Matcher independently fetched 100 profiles, used substring matching,
gender/college bonuses, invented verification claims, rejected sparse profiles, assumed
six seats and attempted direct invite inserts. It now uses the new team-scoped RPC.

## Scope, assumptions and decisions

- Squad recommendations answer who fits this team's open roles; teammate discovery
  continues to answer compatibility with an individual. There is no universal score;
  both individual-recommendation surfaces preserve the same server ranking.
- Only owners/members may read squad suggestions; only the owner may invite, matching
  the existing `send_team_invite` permission. Supabase authentication is authoritative.
- Onboarding-complete profiles may have no skills or availability recorded; that is
  limited evidence, not incompatibility. Explicitly unavailable profiles are excluded.
- Skills and hackathon counts are self-reported. Experience contributes only when
  the builder enables `show_track_record`. No verified-expertise claim is made.
- Performance uses the existing <=96-per-bucket pool and returns 8 cards (hard cap 20).
  Retrieval is approximate, rotating daily by team ID, with deterministic UUID ties.
  This is not a globally exhaustive search or a prediction of collaboration success.
- Reliability favors explicit unavailable/error states over insecure local fallbacks.
  Permission failures and missing migration states do not trigger a profile scan.
- No paid AI, dependency, environment variable, new branch or worktree is needed.

| Decision | Alternative | Reason |
|---|---|---|
| Add a team-to-builder RPC using V2 primitives | Rank the owner’s V3 suggestions again in the browser | A roster and its open roles differ from one person’s compatibility. |
| Recompute actual roster skill coverage | Use `team_feature.skills` directly | That feature combines member skills with requested team skills, which would hide real gaps. |
| Guard and delegate squad invitations | Insert directly or rewrite all invitation flows | Preserve existing authorization, notification and acceptance workflows while rechecking current squad exclusions. |
| Coarse labels and concrete reasons | Print an uncalibrated match percentage | Recorded profile evidence does not establish a probability of successful teamwork. |
| Prepare an additive migration without applying it | Change production during development | A controlled release requires separate approval. |

## Ranking and explanations

Actual coverage is the distinct roster (including a legacy owner missing a membership
row), with known aliases canonicalized and unknown skills preserved for exact matching.
Requested team skills are kept separate. Gaps are requested skills absent from that
recorded coverage. Missing profile fields never imply that a member lacks a skill.

The internal ordering index consists of 40 points for relevant open-role domain evidence,
25 for required gap coverage, 10 for requested-skill coverage, 15 for directional
candidate-to-roster domain novelty, 5 for declared availability and up to 5 for public
self-reported hackathon experience. Full Stack requires both frontend and backend;
Python alone is not AI/ML evidence. Unknown roles are not guessed. Missing signals
contribute no positive evidence and produce exploration/availability disclosures.
Gender and college are neither scored nor returned by this RPC.

The server returns matching roles, requested skills, additions, limited-evidence flags
and factual explanation strings. The client preserves server order and displays no
numeric fit score. Suggested capabilities remain self-reported, including wording such
as “Lists skills relevant to your open Backend role.” The UI retains the existing
Instrument Sans/JetBrains type system, canvas/raised/ink tokens, lime-accent gap chips,
Avatar, Panel, Tape, SeatMeter and Button primitives. Candidate actions are full-width
within cards; needs move into a side rail on desktop and precede cards on mobile.

## Eligibility, capacity and invitations

Current checks exclude the owner, existing members, pending invites/requests, banned or
incomplete profiles, explicit unavailability and either direction of a block involving
any roster member. The effective capacity is the minimum positive team capacity and
recorded maximum of linked events. Multiple event links use their strictest supplied
maximum. Unknown capacity disables suggestions/invites; recruiting must be explicitly
open. No gender, college or other eligibility restriction is inferred from event names
or free text. Pending invites do not reserve seats, consistent with existing workflows.

`send_squad_invite` authorizes the owner, locks the team, rechecks current capacity,
recruiting, candidate and pending status, then calls existing `send_team_invite`.
Existing invite notifications, acceptance and join request handling are unchanged.
Client double-click guards avoid duplicate requests; server checks remain authoritative.
Rejected invites remove stale actionable cards and offer Refresh. Superseded load
responses cannot replace fresher recommendations.

The SECURITY DEFINER RPCs use an empty search path, explicit projections, auth-bound
team membership and authenticated-only EXECUTE. Private helpers remain inaccessible.
No RLS policy or base-table permission is changed. Client parsing also drops unexpected
fields. No profile email, gender, hidden track record or private account data is returned.

## Validation and release requirements

Permanent commands:

```
npm run test:matching
npm run test:matching:sql
npm run test:ppt
npm run typecheck
npm run build
```

The SQL runner requires PostgreSQL binaries and Python and executes the actual V2,
existing invitation and new squad migrations in a throwaway localhost cluster with
fictitious profiles. Production connection variables and psql startup scripts are
excluded. It stops and removes only its explicitly allocated temporary directory.
The client/UI suite uses mocked RPCs and exercises truthful states, projections,
invitation success/failure, duplicate actions and superseded response handling.

Completed validation: all 22 matching/discovery client and UI tests, all local SQL
behavior assertions and the real SQL-to-client JSON contract, all 49 existing PPT
tests, TypeScript, scoped lint and the production build passed. Offline previews
used real design-system components and fictitious profiles; desktop and mobile
layouts were inspected, with no horizontal overflow at 390px or 320px. Temporary
preview services and database clusters were stopped and removed. Read-only schema
metadata also confirmed that every existing column required by the migration is
present in production. No authenticated production matching/invite request was run.

Apply `202610090001_squad_matcher.sql` only after approval, before releasing this client.
It adds two private helpers and two public RPCs, without backfill, table/RLS changes
or new environment configuration. Until then the new UI truthfully offers builder
discovery when the RPC is missing. Production remains on the previously deployed main.

Remaining limitations: real authenticated Supabase runtime verification and production
latency measurements await the controlled migration/release; the existing candidate pool
is bounded; availability and skills may be stale/self-reported; custom role meanings and
unstructured event eligibility rules need human confirmation. No production invite or
Gemini request is used for development validation.
