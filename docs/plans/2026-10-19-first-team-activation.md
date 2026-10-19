# First-team activation: join-first dashboard empty state

## Approved scope and assumptions

Approved in chat on October 19, 2026: improve a student's first voluntary team action using existing capabilities. Preserve OAuth destinations, established team workspaces and incomplete-onboarding guards. No production writes, Supabase changes, secrets/environment changes, additional dependencies or billed services. No changes to Hustle Carnival behavior. Current traffic needs no new infrastructure; reuse the existing design system, queries and GA4 bridge. Failures must remain visible and retryable.

## Audit

Baseline supplied by the owner (production read-only, October 19): 508 profiles, 356 onboarded; last 30 days: 78 new profiles, 1 team creation, 1 new membership, 0 invitations, 8 join requests and 13 connection requests. These are aggregate activity counts, not a signup-cohort conversion funnel; they do not prove a cause or a conversion rate.

Reviewed current main `432e76c`: onboarding saves a profile then follows `safeAuthReturnPath(next)`, defaulting to `/dashboard`. The dashboard already has Find builders/New team header actions, a Your teams empty state, builder recommendations and connection actions. Its empty state gives Create a team primary emphasis and Browse teams secondary emphasis.

`/teams` already defaults to recruiting teams with seats and non-concluded events, orders by listed skill overlap, and links to `/teams/[id]`. That page requires an explicit Request to join action. `/developers` already supports matching, filters, connection states and a Connect link to `/profile/[id]?connect=1`, where sending remains explicit. Team creation requires a name, description, skill and role before submission. Connection acceptance already offers a create/invite prompt. Another dashboard CTA or onboarding wizard would duplicate these capabilities.

The small, testable hypothesis is that the existing empty state steers students toward forming a team before they have an idea, although a lower-commitment recruiting-team path already exists. This is a prioritization hypothesis, not a demonstrated uplift.

## Decision log

- Chosen: re-prioritize and explain the existing teamless dashboard state. No new section, wizard, network read or navigation rule.
- Rejected: default post-onboarding redirect to discovery; changes destination intent and OAuth handoff semantics.
- Rejected: recommended-team cards on the dashboard; duplicates discovery and adds data/error handling.
- Keep Create a team available for students who already have an idea.
- Use existing loading/error state to avoid treating failed or in-flight membership reads as proof of no teams.
- Maintain the existing component styles and purposeful Users/ArrowRight/Plus icons.

## Implementation

Change the existing Your teams empty state to Find a hackathon team. Explain reviewing a team and explicitly requesting to join. Primary Find a team links to `/teams`; secondary Create a team links to `/teams/create`. Existing member/owner workspace links remain as they are.

Render this state and its analytics only after successful loading, with a completed-onboarding profile and no team-read error. An unverifiable empty state offers Retry using the existing dashboard reload handler. Track team refreshes separately so stale empty results do not produce prompts during refresh and pending request controls remain available. The existing development fixture receives the corresponding state field.

## Measurement

Reuse `trackEvent` from the existing GA4 bridge. No new SDK, destination, GA settings or user-property calls.

| Event | Trigger | Added properties |
| --- | --- | --- |
| `first_team_prompt_shown` | Eligible empty state renders; once per viewer per mounted dashboard, including React Strict Mode effect replay | `source: dashboard_empty_teams` |
| `first_team_prompt_selected` | Explicit click on either existing action | `source: dashboard_empty_teams`, `path: join` or `create` |
| `team_join_request_sent` | Existing join-request RPC returns success | `source: team_detail` |

Shown means rendered, not verified viewport visibility, a unique lifetime impression or a new signup. Returning users with no current teams are eligible too. Use distinct users/ordered funnels rather than raw event totals: shown → selected(join) → join request, or shown → selected(create) → existing `team_created`. Compare seven-day follow-through for recent-signup cohorts when available; separately report prompt click-through and existing `connection_request_sent`. Do not count a discovery click as activation or a request as accepted membership.

Existing `onboarding_completed`, `team_created`, `connection_request_sent`, acceptance and post-acceptance events remain unchanged. The audit found no existing join-request-sent analytics event. The new payloads contain no names, email, college, skills, messages, profile IDs, team IDs or URLs. Existing analytics availability/ad-blocking limitations apply; there is no collection fallback and no promise of delivery.

## Verification and risk

Use local, synthetic fixtures only; no test inserts or live OAuth/analytics calls. Check eligible new users, returning users with/without teams, loading/refresh/error/retry, incomplete onboarding, OAuth return destinations, explicit request success/failure/duplicate, and mobile keyboard/touch layout. Capture before/after desktop and mobile screenshots from real React components and application CSS. Run typecheck, scoped lint and relevant existing onboarding/auth/discovery/dashboard tests. Document fixture limits: local tests cannot prove a production OAuth exchange, deployed RLS or GA ingestion.

Risk is low and limited to empty-state prioritization, membership loading presentation and additive analytics. Uptake depends on recruiting inventory and team responses. Rollback is reverting the frontend change; no data migration or cleanup is needed. A Draft PR is for review only; no merge or deployment is authorized. Git staging/commit/push remain subject to workspace rules and an explicit file audit.
