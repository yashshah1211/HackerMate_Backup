# Hustle Carnival metadata correction — separate review required

Status: proposal only. No migration, SQL execution, partner configuration, production read or production write was performed for this implementation.

Target: existing `public.hackathons.id = 0da43cba-90dc-449c-a126-a2fc8be8a379`. Never create a duplicate event.

## Evidence and proposed changes

The supplied handoff reports the old values below from an earlier read-only lookup. They have **not** been freshly verified against production in this task. The owner supplied the schedule, mode, venue and team size. The official Unstop listing was independently retrieved on 17 October 2026 through its indexed API-domain page:

- [Canonical registration and rules](https://unstop.com/hackathons/hustle-carnival-gl-bajaj-group-of-institutions-1763514)
- [Retrieved official listing](https://api.unstop.com/hackathons/hustle-carnival-gl-bajaj-group-of-institutions-1763514)

| Field | Earlier snapshot from handoff | Proposal for owner review |
| --- | --- | --- |
| `name` | `Hustle Carnival ` | `Hustle Carnival 2026` (optional title cleanup) |
| `start_date` | `2026-10-12` | **Provisional:** `2026-10-22`, the first dated submission milestone, **not a verified opening date**. Confirm the field's intended meaning and actual Phase 1 opening before applying. |
| `end_date` | `2026-10-22` | `2026-10-24` |
| `mode` | `online` | `hybrid` (verify allowed schema values) |
| `location` | `Venue in India` | `Block A & B, G.L. Bajaj Group of Institutions, Mathura` |
| `min_team_size` | `1` | Keep `1` |
| `max_team_size` | `4` | `2` |
| `website_url` | Canonical Unstop URL | Keep unchanged; verify exact canonical URL |
| Registration closing day | Not supplied as a database field snapshot | 20 October 2026. Unstop displays 12:00 AM IST; confirm the actual cutoff before proposing a timestamp field update. |

Preserve `id`, `status=approved`, `archived=false`, `type=external`, organizer ownership and every unrelated field. Verify current schema types, enum/check constraints, triggers, update API and concurrency support before choosing an update mechanism. Do not assume an `updated_at` column or new timeline schema.

## Phase-specific presentation facts

The portal deliberately keeps these independent of the currently incorrect database dates:

- Online PPT and project-video deadline: 22 October, 2:00 PM IST (`2026-10-22T08:30:00Z`).
- Shortlisting results: 23 October, 10:00 AM IST (`2026-10-23T04:30:00Z`).
- Shortlisted-team attendance confirmation: 23 October, 11:00 PM IST (`2026-10-23T17:30:00Z`). Instructions remain with the organizer.
- On-campus finale: 24 October, 9:20 AM–4:30 PM IST (`03:50`–`11:00Z`). Only shortlisted Phase 1 teams qualify.

Unstop's summary says “All”; detailed rules include B.Tech undergraduates in CSE, IT, ECE and AI/ML, and MBA students. Do not change eligibility to “undergraduates only” or “anyone” without organizer clarification. Do not enter prizes, fees, sponsorship commitments, registration totals or endorsement claims.

## Review and eventual correction procedure

1. Obtain owner approval of the exact field diff, including `start_date` semantics. Obtain organizer clarification on eligibility and registration cutoff. A different approved date convention requires an accompanying change to the local community-readiness check and tests.
2. In a separately authorized session, read the exact current event row and schema. Save a restricted before-snapshot and identify conflicting concurrent edits. Review current teams and pending participation for rosters above two; an event max-size update alone does not prove those rosters or every joining path are compliant. Do not remove members or alter teams automatically.
3. Validate the proposed update and all affected creation/joining paths on an authorized non-production database with synthetic fixtures. Confirm date rendering, mode filtering, venue, external registration, approval/archive gating and team-size enforcement. Review triggers and any downstream notifications before execution.
4. Prepare a guarded, single-row transaction or the repository's reviewed admin operation. Match the exact ID and the reviewed before-values/revision. Abort on zero or multiple affected rows or changed preconditions. Update only explicitly approved fields; inspect the returned projection before completing the transaction. This document intentionally ships no executable production SQL.
5. After separate production authorization, apply that reviewed operation, verify the changed public projection, and retain the audit evidence. Reversal restores only the changed metadata from the approved before-snapshot and requires review if participation changed afterward.

## Portal behavior and release dependencies

The portal reads only an anonymous, explicit `hackathons` projection for the exact ID with approved/non-archived filters, plus matching checks in code. It does not read registrations, private profiles, partner configs or metrics, and never uses a service-role key. Errors fail closed for community links while the official schedule and Unstop links remain available.

The community CTA appears only for an external approved/non-archived row with reviewed dates, hybrid mode, Bajaj/Mathura venue, 1–2 team limits and the exact canonical Unstop URL. Until then, it shows a clear pending/unavailable message and has no native creation/joining link. A corrected fixture demonstrates the existing `/hackathons/0da43cba-90dc-449c-a126-a2fc8be8a379?tab=looking_for_teams` destination and existing authentication return-path behavior. The check is a display gate, not a replacement for database enforcement.

Public co-branding/asset-use approval and permission to present this community hub remain separate from event metadata approval. No production `partner_configs` entry is needed for the narrow route and none was created. The route is deliberately `noindex, nofollow` during review; removing that draft setting is a reviewed release change after approval. No commit, push, merge, deployment, migration or production config change is authorized by this plan.
