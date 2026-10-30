# Mission 11 — Rack first-session activation

Base: `98fc344fd30846078e3d4992d832b943cfa466e9` (merged #86), verified through GitHub and fetched locally. Branch: `feat/rack-first-five-minutes`. Founder approved the two focused improvements on October 30, 2026.

## Journey and changes

| Step | Observed before | After |
| --- | --- | --- |
| Partner portal | Public, branded, separate Find teammates / Unstop destinations | Unchanged |
| Guest / incomplete-profile discovery | Requested builder listings followed About and rounds; header said Sign in to participate | Existing public discovery is first on Rack builder tabs; header names teammate matching |
| Login / onboarding | Safe encoded event/tab return, consent, explicit profile completion | Unchanged; exercised with synthetic adapters |
| Authenticated return | Listing controls followed About, tags, rounds and schedule | Rack Looking for teams tab offers a native jump to the existing controls |
| Listing / empty results | Member copy implied visibility and said nobody was looking, despite using a public opt-in projection | Explains opt-in/public visibility, existing stop control, truthful public-listing empty state and separate Unstop registration |

No lost event context or auth defect was established. No auth, RLS, query, mutation, visibility preference, team permission, onboarding requirement, analytics, asset or registration destination changed. The native anchor changes only the fragment; it does not list a profile or create a team. Other events and Rack overview/other member tabs keep their baseline presentation.

## File inventory

- `src/components/hackathons/PublicHackathonDetail.tsx`: Rack-only ordering and specific action label.
- `src/app/hackathons/[id]/page.tsx`: Rack-only jump target/link and accurate listing guidance/empty copy, using the existing official-event identity helper.
- `scripts/test-rack-conversion-funnel.cjs`: retains all 19 tests; adds 3 ordering/action/overview tests.
- `scripts/test-event-compatibility.cjs`: adds the real identity-helper adapter required by its explicit import map; preserves all assertions and adds 4 member/empty/error/isolation tests. This necessary test-only addition expands the original six-file estimate to seven files.
- `qa/fixtures/rack-funnel-browser.jsx`: opt-in synthetic long-description and other-event cases; in-memory adapters only.
- `qa/browser/rack-conversion-funnel.cjs`: retains the original 20 checks and adds 12; extends existing guest checks to verify ordering/action targets.
- This report.

## Fresh local verification

Existing installed dependencies were copied from the previous Rack worktree only after identical lockfile SHA-256 was verified (`7abcf0b3b57e907e64bcfc3a7250a264a41e0c2d55021e8b8537aa0d12b73d3f`). Installed Next is 16.4.3. No installation, lifecycle script, dependency or lockfile change. PowerShell used the approved command permission path; no OS elevation or security-setting change.

| Command | Result |
| --- | --- |
| `node qa/test-rack-network-guard.cjs` | 8/8 PASS |
| `node --import=./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-rack-conversion-funnel.cjs scripts/test-event-compatibility.cjs` | 84/84 PASS |
| `node qa/rack-qualification.cjs tests` | 848/848 PASS; external application traffic blocked |
| `node qa/rack-qualification.cjs funnel-browser` | 32/32 PASS; sandboxed Chrome 156, 390px / 1440px |
| `node qa/rack-qualification.cjs browser` | 19/19 PASS; original branding, CTAs, keyboard, missing-event and overflow checks |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS |
| Scoped ESLint on both TSX files and all four edited test/fixture files | FAIL: 5 errors / 5 warnings in member event page; exact main baseline reproduced below. All five other edited code/test files: 0 errors / 0 warnings |
| `node qa/rack-qualification.cjs build` | PASS; 96/96 static pages, 4 loopback synthetic reads, 0 network-fixture mutations |
| `git diff --check` | PASS before publication |

Scoped lint command:

```powershell
node node_modules/eslint/bin/eslint.js 'src/components/hackathons/PublicHackathonDetail.tsx' 'src/app/hackathons/[id]/page.tsx' scripts/test-rack-conversion-funnel.cjs scripts/test-event-compatibility.cjs qa/browser/rack-conversion-funnel.cjs qa/fixtures/rack-funnel-browser.jsx
```

Baseline independently checked without modifying source:

```powershell
git show '98fc344fd30846078e3d4992d832b943cfa466e9:src/app/hackathons/[id]/page.tsx' | node node_modules/eslint/bin/eslint.js --stdin --stdin-filename 'src/app/hackathons/[id]/page.tsx'
```

Both versions report the same five `no-explicit-any` errors and five unused-symbol warnings (`getTeamCategoryInfo`, `organizerSearch`, `setOrganizerSearch`, `isDescExpanded`, `setIsDescExpanded`). Existing findings are untouched and unsuppressed.

Build retains existing middleware-deprecation, Sentry/instrumentation, webpack cache and Supabase Edge-runtime warnings. No warning was suppressed; no release or source-map upload credential was supplied. The wrapper strips inherited application configuration and blocks external application requests.

Browser coverage includes guest/incomplete/member routes, consent, encoded OAuth/onboarding return, history/refresh, explicit listing, no automatic actions, truthful empty/error distinction, other-event isolation, unchanged analytics failure behavior and no horizontal overflow/external requests. Actual components run against in-memory adapters, not live OAuth, accounts or database policy execution. Synthetic onboarding and listing writes stay in memory; no production database connection exists. The wrapper's zero mutations refer to its network fixture, not a claim that the in-memory interaction tests never write fixture state.

Screenshots: `scratch/rack-funnel/guest-{390,1440}.png`, `incomplete-next-action-{390,1440}.png`, and `member-next-action-{390,1440}.png`. Visually inspected both member sizes and incomplete mobile. Existing isolated Linux CI retains these with its logs; current-head CI status belongs in the PR.

## Failed attempts and corrections

- Default command sandbox stalled the initial baseline run; only that launched command was stopped. A guarded focused run using the approved permission path passed 19/19 on unchanged source.
- Before dependency copy, `NODE_PATH` could run CJS tests but not ESM imports: initial broad run was 814/815 with the Rack test file unable to import React. Browser preparation likewise could not resolve local packages. Neither was browser acceptance evidence.
- New ordering tests reproduced the baseline issue: 20/22, failing specifically for guest and incomplete-profile ordering; after correction, 22/22.
- First candidate broad run: 812/844, with 32 compatibility tests unable to resolve the newly reused identity helper. Adding its real adapter (no weakened assertions) plus four new cases produced final 848/848.
- First extended browser run passed 22 checks before a new desktop assertion timed out: it incorrectly required the fragment target to reach the viewport top near the document end. The final assertion verifies exact document-bounded native scroll and requires the listing button fully within the viewport, while retaining event/hash and zero-additional-write checks. Final 32/32.

## Limits and release

GO for independent Draft review with the disclosed baseline lint debt. No claim of measured conversion improvement, real signup completion, production analytics receipt or live OAuth acceptance. Production policies and content were not inspected. No production changes, deployment, emails, paid calls, migrations, new services, promotional/social/certificate changes or merges.

Rollback is an application-only revert of this focused commit; no schema, record cleanup or analytics configuration rollback is needed. Founder review is required before merge/release.
