# Mission 04 — First-team conversion QA

Baseline: remote `main`, independently verified on October 23, 2026 at `873b117406110e373f48c37a85082c738d52cae9`. Branch: `feat/first-team-conversion`. Frontend-only change; no database, Auth, RLS, recruitment, concluded-event, invitation or membership mutation changes. PR #58 is excluded.

## Discovery behavior

Eligible teams now sort by confirmed recent owner activity, then existing listed-skill overlap, then creation date and ID. Eligibility always takes precedence. Non-eligible teams retain skill/date ordering in All teams. Unknown, missing, malformed, outdated or inaccessible activity is never described as inactivity and does not filter a team out. When there are no confirmed recent owners, existing skill/date ordering remains. Partial activity-read failures retain known positive signals and display the existing unavailable-activity notice.

The exact **Owner recently active** label and definition (recorded app activity within 30 days) remain, along with the response disclaimer. Matched skill names and no-overlap/missing-skill explanations remain visible. A recently active owner with fewer shared skills can appear ahead of an unknown owner with more overlap; the explanations make that tradeoff visible. Existing filters, open/all scopes and Show more preserve access to all teams.

For nonempty filtered results without an eligible recent-owner team sharing at least one listed viewer skill, one inline paragraph offers **Create a team** and **Discover builders**, while explicitly allowing continued browsing. Without viewer skills, the paragraph explains that skill relevance cannot be assessed and appears only when no eligible recent owner is identified. It is suppressed during team loading and team-read errors. Empty results reuse their existing alternatives. The dashboard already has join/create paths and is unchanged. Optional activity still loads progressively, as before, so ordering and contextual text can update after the base team list appears.

Only an explicit click on either new inline link emits `team_discovery_alternative_selected`, with exactly `{ source: "team_discovery", path: "create" | "builders" }`. There is no automatic request, new impression event, identifying field, team name, skill value or timestamp in this payload. Analytics errors are logged and cannot block navigation. Existing global analytics configuration and existing event payloads are unchanged; this is not a claim that all existing analytics traffic is anonymous.

## Verification

- Baseline audit: 87 existing offline tests passed before implementation.
- Final focused suites: **99 tests passed**, including 12 additional discovery regressions. Discovery-only rerun after the final pagination regression: **45 passed**. Commands:
  - `node --test scripts/test-team-discovery.cjs scripts/test-team-activity.cjs scripts/test-team-creation.cjs scripts/test-first-team-request-analytics.cjs`
  - `node --test scripts/test-team-discovery.cjs`
- `npx tsc --noEmit`: passed.
- `npx eslint src/app/teams/useTeamsData.ts src/app/teams/TeamsView.tsx scripts/test-team-discovery.cjs scripts/test-first-team-conversion-browser.cjs`: passed, no warnings.
- `git diff --check`: passed.
- `node scripts/test-first-team-conversion-browser.cjs`: passed with installed Edge at **320, 390, 768 and 1440 pixels**. Real `TeamsView`, `useTeamsData` and application CSS; synthetic read adapters, loopback-only network. See [machine-readable browser evidence](browser-results.json).
- `node scripts/test-public-hackathon-metadata-production.cjs`: actual Next production build passed (`next build --webpack`), followed by **44 production HTML checks**, 39 anonymous fixture reads and zero writes/external data. This existing script uses synthetic local configuration and offline fonts, not deployed credentials. Existing middleware-convention, Sentry instrumentation and Edge Runtime dependency warnings remain; no framework/security configuration was changed.

Regressions cover eligible-first ordering, lower-overlap recent owners, skill ordering within activity groups, deterministic ties, unknown/outdated parity, pagination retaining all 35 synthetic eligible teams, capacity/recruitment/event closure, primary/junction events, filters, missing viewer/team skills, partial activity failure, denied/network/missing activity, unchanged empty states, error/loading suppression, fixed analytics payloads and analytics failure isolation. Existing request and create suites retain explicit request submission, confirmed success analytics, session/duplicate/failure protections, workspace handoff and invitation behavior.

The browser run checks 14 behavior groups at each viewport: before/after ordering, accurate skills/activity copy, no overflow, all teams retained, event closure/filtering, mobile/tablet sheet, no duplicated empty-state links, failure fallback, filtered/missing-skill suggestions, keyboard navigation with exact analytics payloads, navigation despite analytics exceptions, signed-out read restrictions, team-read errors and zero mutations/external requests. The signed-out fixture exercises the hook defensively; it does not bypass or replace the unchanged production AuthGuard. Create and builder destinations are route sentinels, not real accounts or live pages. Both route source files were verified to exist.

One initial browser assertion expected only one React skill explanation, although three fixture teams legitimately display it. Corrected that fixture count; the complete run then passed. No application change was needed for that correction.

## Screenshots

Pinned main and changed source use identical synthetic data and local font fallbacks. Manually inspected the generated mobile fallback and desktop ranking screenshots in addition to automated checks.

| Width | Before | After | Activity unavailable with alternatives |
| --- | --- | --- | --- |
| 320 | [Before](before-320.png) | [After](after-320.png) | [Fallback](fallback-320.png) |
| 390 | [Before](before-390.png) | [After](after-390.png) | [Fallback](fallback-390.png) |
| 768 | [Before](before-768.png) | [After](after-768.png) | [Fallback](fallback-768.png) |
| 1440 | [Before](before-1440.png) | [After](after-1440.png) | [Fallback](fallback-1440.png) |

## Exact changed-file inventory

1. `src/app/teams/useTeamsData.ts`
2. `src/app/teams/TeamsView.tsx`
3. `scripts/test-team-discovery.cjs`
4. `scripts/test-first-team-conversion-browser.cjs`
5. `docs/plans/2026-10-23-first-team-conversion.md`
6. `docs/qa/first-team-conversion/README.md`
7. `docs/qa/first-team-conversion/browser-results.json`
8. `docs/qa/first-team-conversion/before-320.png`
9. `docs/qa/first-team-conversion/after-320.png`
10. `docs/qa/first-team-conversion/fallback-320.png`
11. `docs/qa/first-team-conversion/before-390.png`
12. `docs/qa/first-team-conversion/after-390.png`
13. `docs/qa/first-team-conversion/fallback-390.png`
14. `docs/qa/first-team-conversion/before-768.png`
15. `docs/qa/first-team-conversion/after-768.png`
16. `docs/qa/first-team-conversion/fallback-768.png`
17. `docs/qa/first-team-conversion/before-1440.png`
18. `docs/qa/first-team-conversion/after-1440.png`
19. `docs/qa/first-team-conversion/fallback-1440.png`

`scripts/test-team-activity.cjs` required no changes; its existing hook/failure tests were rerun. No package manifest or lockfile changes. Generated build diagnostics are local artifacts and excluded from the PR.

## Expected outcome and limitations

Hypothesis: emphasizing recorded recent owner activity among eligible teams increases useful team-detail reviews and deliberate requests, while the contextual alternatives help builders choose creation or builder discovery. New alternative-click counts and existing dashboard-choice/request/create events can indicate movement after collection and attribution are verified. A click is not a created team, an accepted request or a confirmed membership. This patch neither measures durable first-team activation nor introduces the Mission 02 journal.

**Actual GA4 funnel events have not been independently retrieved.** No causal conversion claim is supported by the supplied production aggregates, and none of those counts are hardcoded. Recent signups are not classified as abandoned. Existing analytics need verified delivery, cohort definitions and deduplication before calculating funnel rates; this new event has no teamless-user or outcome attribution. Owner activity coverage can be incomplete, and recency does not establish availability, responsiveness or willingness to accept.

Tests use the repository's existing local tooling, not demo/staging Supabase, accounts or credentials. No live Auth/RLS, production database behavior, actual GA ingestion, PostgreSQL 17/Supabase integration or real membership formation was exercised. Build and fixture success do not substitute for those operational release gates or authorize PR #58's release. No merge, deployment, migrations, production writes, outreach or scheduling occurred.

## Rollback and review prerequisites

Revert this PR to restore skill-first discovery and remove the inline suggestion/event. No schema, data, service, credentials or configuration rollback is needed. Before a future release, founder review should confirm the deliberate activity-versus-skill tradeoff and acknowledge the measurement limits. Normal release authorization remains separate; this PR is draft only.
