# Mission 04 — First-team conversion

Status: explicitly approved by the user on October 23, 2026; implementation and local validation complete. See `docs/qa/first-team-conversion/README.md` for the exact 19-file inventory, results, screenshots, limitations and rollback. One separate draft PR is authorized. No merge, deployment or production changes.

## Verified starting point and audit

- Repository: yashshah1211/HackerMate_Backup. Remote main independently verified and fetched on October 23, 2026: `873b117406110e373f48c37a85082c738d52cae9`.
- Isolated branch/worktree: `feat/first-team-conversion`, based on that commit. PR #58 and its branch are excluded.
- `src/app/dashboard/DashboardView.tsx`: the verified, onboarded, teamless state already offers Find a team and Create a team. Header offers Find builders. Reuse these; no additional dashboard banner.
- `src/app/teams/page.tsx`: existing AuthGuard wraps discovery. `useTeamsData.ts` reads viewer skills, teams, then optional owner activity using the existing session and explicit profile columns. Activity reads are separate so inaccessible activity does not hide teams.
- `useTeamsData.ts`: existing comparator orders joinability, skill overlap, recent owner activity among eligible peers, creation date, ID. Existing 30-day timestamp validation rejects missing, malformed and future activity. Existing recruitment, capacity, primary/junction event closure rules are authoritative for discovery and remain unchanged.
- `TeamsView.tsx`: default open-to-join scope, All teams, filters, pagination, named skill overlap, honest activity label and response disclaimer already exist. Create-team and builder-discovery alternatives currently appear together only when the result list is empty.
- `src/app/teams/[id]/page.tsx` and `src/components/TeamOverviewView.tsx`: discovery navigates to detail. Explicit request submission checks session, existing membership/pending state, validates the request RPC UUID, and emits `team_join_request_sent` only after confirmation. No request is submitted by ordinary discovery navigation.
- `src/app/teams/create/page.tsx`: existing AuthGuard, required fields/profile checks, explicit create RPC, workspace handoff and invitation handling. Leave unchanged.
- `/teams/create` and `/developers` route files exist. Analytics imports use the existing `@/lib/posthog` bridge to GA4. Existing create-team analytics include personal/content-linked properties; this task does not extend or duplicate those payloads or refactor that separate flow.

## Recommended minimal change

1. In `useTeamsData.ts`, order eligible teams by confirmed recent owner activity first, then existing skill overlap, then newest/ID. Eligibility always wins. Non-eligible peers retain their existing skill/date ordering. Keep all eligible teams visible, all existing filters, All teams and pagination. With no confirmed activity, ordering naturally remains skill/date based.
2. In `TeamsView.tsx`, update the ordering explanation to match the comparator. Keep the exact **Owner recently active** label, 30-day definition, disclaimer and actual matched skill names.
3. For nonempty filtered results with no eligible, recently active team sharing a listed viewer skill, add a short inline sentence beside the existing explanatory text with links to Create a team and Discover builders. With no viewer skills, explain that skill relevance cannot be assessed and offer the same choices when no eligible recent owner is identified. Do not call other owners inactive. Preserve the existing empty-state alternatives rather than adding a second callout there. Suppress this suggestion during team loading or a team-read error. Activity unavailable text remains explicit and is not an inactivity verdict.
4. Reuse the GA4 bridge for clicks on these new alternatives only: `team_discovery_alternative_selected`, with fixed `source: team_discovery` and `path: create | builders`. No identifiers, names, skill values or timestamps. Catch/log analytics errors so navigation remains available. No new impression event, automatic join action or backend instrumentation.
5. Extend existing offline discovery/activity tests and adapt the existing local browser fixture for this mission. Document behavior, evidence and rollback. No dependencies, query expansion, database or server changes.

An activity-only filter would hide eligible teams, and a second dashboard recommendation panel would duplicate existing choices. Neither is recommended.

## Validation and exact intended inventory

Implementation:
- `src/app/teams/useTeamsData.ts`
- `src/app/teams/TeamsView.tsx`

Regression evidence:
- `scripts/test-team-discovery.cjs`: active lower-overlap owner precedes unknown higher-overlap owner; skills order within activity groups; eligible first; deterministic ties; no hidden rows; unchanged scopes/filters/event closure; suggestion visibility, missing skills, unavailable activity and empty/error/loading states; privacy-safe click payloads and analytics failure isolation.
- `scripts/test-team-activity.cjs`: retain existing optional-read, timestamp, stale-load and permission-failure coverage; extend only if needed for changed behavior.
- `scripts/test-first-team-conversion-browser.cjs` (new): reuse current fixture tooling to run actual discovery components/CSS, synthetic authorized-read adapters and loopback-only browser requests. Verify ordering, keyboard navigation, filters, failure fallback, alternative routes, no automatic mutations, and no horizontal overflow at 320/390/768/1440 pixels. Capture before/after screenshots against the pinned main source.
- `docs/qa/first-team-conversion/README.md`, browser result JSON and before/after screenshots: exact final inventory and limitations after running validation.
- This plan file.

Run discovery/activity regressions, existing team-creation and first-team request-analytics regressions, typecheck, scoped lint and the local browser check. No live accounts, Supabase projects, production queries or mutation tests. A passing fixture is not proof of live Auth/RLS, GA ingestion or durable team formation.

Audit baseline: all 87 existing tests in `test-team-discovery.cjs`, `test-team-activity.cjs`, `test-team-creation.cjs` and `test-first-team-request-analytics.cjs` passed against the pinned main source. Dependencies were resolved read-only from the existing Stage A worktree via `NODE_PATH`; its source and branch were not changed. An initial run pointed at the older primary checkout and could not resolve jsdom; rerunning with the existing compatible installation resolved that tooling issue without installing dependencies or provisioning an environment.

## Outcome, risks and rollback

Expected outcome: more builders review eligible teams with recorded recent owner activity, or deliberately choose creation/builder discovery when no relevant recent-owner team is identified. Existing dashboard-choice and confirmed request events plus the new content-free alternative-click event can support a directional funnel after instrumentation is verified. Actual GA4 funnel events have not been independently retrieved; aggregate production counts are historical context, not causal evidence or hardcoded thresholds. Request sends and alternative clicks are leading indicators, not confirmed membership or first-team activation.

Tradeoff: a recently active owner with fewer shared skills can precede an unknown owner with more overlap. Existing named skills explain that difference. Activity is incomplete and delayed; it never guarantees availability, response or acceptance. No owner is labeled inactive. No extra query or vendor cost is introduced.

Rollback: revert only this PR's frontend/test/documentation changes; no migration, data repair, infrastructure or configuration rollback is required.

Approval checkpoints: the user explicitly approved this plan before source changes (AGENTS.md §5). After validation, audit every modified/untracked file before publication. AGENTS.md §8 separately reserves staging/commit/push to the user unless they explicitly authorize an exception for the audited inventory. Draft PR only; no merge, deployment or production changes.
