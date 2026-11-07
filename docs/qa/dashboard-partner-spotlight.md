# Mission 19 — Dashboard partner spotlight

Base: `64aa18786f7035b830cd9d8f1095a533b5b2ac7b`, verified against GitHub main before creating the isolated worktree `/workspace/work/mission19` on `feat/mission19-dashboard-partner-spotlight`. Implementation and subsequent nine-file staging, commit, normal push and one Draft PR were explicitly founder-approved. Publication evidence and the exact commit SHA belong in the Draft PR. No merge or deployment is authorized.

## Result

Partner events now sit immediately below the dashboard greeting/actions and above the existing two-column layout. The old sidebar instance is removed. A single event has a compact full-width identity and lime Explore event action. Two events use a responsive grid. Three use three desktop columns, a full-width first card plus two secondary tablet cards, and a vertical mobile list. Full titles wrap; no carousel, countdown, gradient or new animation is introduced. Existing Pending, teams, recommendations, profile completion, streaks, statistics and activity remain.

Rack uses the unchanged approved `/partners/rack-it-up-2026/RackItUp-mark.png`, organizer from `rackItUp2026.ts`, its verified schedule and a shortened excerpt of its existing introduction. Its note distinguishes HackerMate teammates from official Unstop registration. Other partners show their existing configured identity, linked event name and end date only; no organizer or description is inferred. Missing/broken logos restore text identity. Explore event links target `/partners/[slug]`, with prefetch disabled to avoid speculative portal requests. No dashboard impressions/clicks are added to analytics; actual Rack portal measurement is untouched.

## Data and field availability boundary

The partner query remains byte-for-byte unchanged:

```ts
supabase.from("partner_configs")
  .select("slug, partner_name, logo_url, hackathons(id, name, end_date)");
```

It retains the existing authenticated client, RLS, parallel load and request count. No public/service-role resolver or new backend is introduced. The original query and repository migrations establish these existing field contracts; production schema/data were not accessed. Historical migrations also describe start/status/archival columns, but their live availability is not independently established here. Therefore this change adds no dependency or filter on those columns, nor an invented published field. Missing linked event metadata does not disqualify a configured partner.

Selection runs on the existing load's UTC calendar-day snapshot: validate slugs/dates, exclude known expired end dates, sort earliest known end first, put undated entries last, break ties by slug, deduplicate slugs and select three. End-day equality remains eligible, preserving the existing date semantics. Rack's verified final date (14 December 2026) supplies an expiry only when its linked end date is absent/invalid. The results date is not used as a participation date. Generic undated entries say Dates to be confirmed; this does not establish that they are ongoing. Selection is refreshed with the existing dashboard load, not a new polling service. A partner read error logs the original error and suppresses partial promotional rows without changing core dashboard data.

No database, grants/RLS, migration, production configuration, dependencies, lockfile, auth, organizer access or portal runtime files changed. PR #89 and the retired Idea/Weekly Challenge features are untouched.

## Verification

All application network qualification used the existing loopback-only guard and synthetic props/adapters. No live user records, provider requests or real mutations occurred. Existing installed dependencies were reused locally through hardlinks with the unchanged lockfile; no package installation or lifecycle scripts were used.

| Check | Final result |
| --- | --- |
| Focused selection/component contracts | 14/14 passed (also included below) |
| Dashboard, team creation/invitation, applications, realtime and retirement regressions | 151/151 passed; no failures, cancellations or skips |
| Rack/partner/auth/onboarding/discovery regressions | 849/849 passed; no failures, cancellations or skips |
| Real DashboardView/CSS browser scenarios | 21/21 passed: seven states at 390, 768 and 1440px; zero external requests |
| TypeScript | Passed with `--noEmit --incremental false --pretty false` |
| Scoped lint | Existing DashboardView: 0 errors/4 warnings; data hook: 1 error/0 warnings. Exact base has the same counts/rules. New files and updated dashboard regression harness: clean. This is not a blanket lint pass. |
| Synthetic webpack production build | Passed; 89/89 static pages, four synthetic reads, zero mutations |
| Synthetic default Turbopack production build | Passed; 89/89 static pages, four synthetic reads, zero mutations |
| Whitespace/scope | Working and staged diff checks passed; exactly the nine approved files |

The existing lint debt is unused ArrowUpRight/Chip/SeatMeter/Segmented imports and `prefer-const` on `finalCampus`. It is preserved rather than mixed into the redesign. Existing framework/Sentry/Edge/cache warnings remain unsuppressed.

The browser suite covers zero/one/two/three/expired/unavailable/loading states, long names, missing dates, missing/broken logos, 44px CTA targets, keyboard focus, overflow, portal destinations, no duplicate section, no analytics on render, Pending invitation callbacks, workspace links and core headings. It runs React renderToString/hydrateRoot with identical synthetic props, checks recoverable hydration errors and preserves the original main node. This is a client-side SSR/hydration simulation, not live Next auth/session qualification. Reduced motion is enabled; the new component has no automatic animation. This is not a full assistive-technology audit.

The browser uses an isolated Playwright fixture process. This cloud image's Chromium setuid helper is not root-owned, so the runner uses Playwright's default process sandbox setting; no host security settings were changed. Every browser request is restricted to the loopback fixture. No authenticated production browser session was opened.

Initial verification exposed a missing CSS-module adapter in the existing dashboard VM harness, a missing esbuild fixture resolve directory and pointer-versus-keyboard focus expectations. These test-only issues were corrected with assertions retained. Screenshot inspection also exposed unscoped CSS names in the synthetic harness; it now prefixes module classes to mirror CSS-module isolation, preserving real dashboard grid behavior. Tablet three-card spacing was tightened after inspection. Final results above are from corrected runs.

## Reproduction and evidence

```sh
node --import=./qa/fixtures/rack-network-guard.mjs scripts/test-dashboard-partners.cjs
node --import=./qa/fixtures/rack-network-guard.mjs scripts/test-dashboard-partners-browser.cjs
node --import=./qa/fixtures/rack-network-guard.mjs --test --test-isolation=none --test-concurrency=1 scripts/test-dashboard-join-requests.cjs scripts/test-team-creation.cjs scripts/test-invite-handoff.cjs scripts/test-my-teams-applications.cjs scripts/test-realtime-lifecycle.cjs scripts/test-feature-retirement.cjs scripts/test-dashboard-partners.cjs
node --import=./qa/fixtures/rack-network-guard.mjs --test --test-isolation=none --test-concurrency=1 scripts/test-rack-it-up-2026.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-admin.cjs scripts/test-partner-authorization.cjs scripts/test-auth-return-paths.cjs scripts/test-auth-return-ui.cjs scripts/test-onboarding-submission.cjs scripts/test-public-hackathon-browsing.cjs scripts/test-event-compatibility.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node qa/rack-qualification.cjs build
```

The default build reused the exact existing synthetic build harness in memory, replacing only its `['build', '--webpack']` selection with `['build']`. No source/configuration file was changed for this second build; the environment-file refusal, sanitized environment, synthetic server, offline fonts and external-network guard stayed active.

Logs/results: ignored `scratch/mission19/{unit,dashboard-regressions,rack-regressions,browser,build,default-build,typecheck,lint-new}.log`, `lint-baseline.json`, `browser-results.json`. The browser runner generates `before-390.png`, `before-768.png`, `before-1440.png`, matching `after-*` and `three-*` screenshots. All final after/multi-partner widths were visually inspected for branding proportions, wrapping, hierarchy and placement of Pending/teams. Before images use the exact base DashboardView and the same synthetic fixture data. Public font fallbacks and a real dashboard frame are used; the global authenticated shell is outside this fixture.

Screenshots and logs remain in the local ignored evidence directory and are not included in the staging inventory; they are reproducible with the browser script. GitHub evidence upload is blocked: the integration cannot create Gists (HTTP 403), and the Cloud network allowlist excludes `uploads.github.com`, which rejects release-asset uploads. The empty draft evidence release was removed; no tag was created. The Draft PR records this limitation rather than claiming accessible screenshots. The prepared `scratch/mission19/publication/mission19-review-evidence.zip` contains the nine original PNGs, a self-contained HTML comparison and synthetic verification evidence, without adding them to application source. The chat's configured `/codex/.../output` directory is not mounted in this cloud executor, whose root filesystem is read-only, so no downloadable copy at that location is claimed.

## Exact files ready for staging (nine)

1. `src/app/dashboard/DashboardView.tsx`
2. `src/app/dashboard/useDashboardData.ts`
3. `src/app/dashboard/FeaturedPartnerEvents.tsx`
4. `src/app/dashboard/FeaturedPartnerEvents.module.css`
5. `src/app/dashboard/partnerSpotlight.ts`
6. `scripts/test-dashboard-partners.cjs`
7. `scripts/test-dashboard-partners-browser.cjs`
8. `scripts/test-dashboard-join-requests.cjs`
9. `docs/qa/dashboard-partner-spotlight.md`

No known new failing checks remain. Production content/asset receipt, live RLS and full authenticated runtime acceptance remain unverified. Snapshot expiry cannot establish whether a generic undated historical partner has actually ended; no active-status claim is made. No conversion improvement is claimed.

Publication stops at a Draft PR for independent review. Merge and deployment require separate founder approval.
