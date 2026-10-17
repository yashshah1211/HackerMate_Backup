# Hustle Carnival 2026 × HackerMate — local handoff

Implemented locally on 17 October 2026. Target route: `/partners/hustle-carnival`. **No commit, push, merge, deployment, publication, production database read/write, migration or production configuration change was performed.** The owned local Next server was stopped after QA.

## Workspace and preservation

- Isolated worktree: `/workspace/work/hustle-carnival`.
- Branch: `feat/hustle-carnival-portal`.
- Base: `bd2e402bd23a1c7dd0227e6ce294d2c2f142ec84`, independently confirmed as latest GitHub `main` through its API. The shell fetch initially could not reach its proxy; the verified commit already existed locally. No existing ref was replaced or merged.
- Paused checkout: `/workspace/HackerMate_Backup`, branch `work`, same HEAD. It was clean at inspection and remains clean. Existing branches and files were left in place. Nothing was discarded or stashed.
- All 14 source changes are additions. No existing tracked file, dependency manifest, lockfile, migration, partner config, public Builders/Teams implementation or global style was edited. Dependencies used for QA were copied/restored in separate scratch storage.

## Implemented behavior

The portal reuses the existing app/partner shell, `Logo`, `PartnerImage` and `eventDiscoveryHref`. A narrow static route provides the two-phase experience without changing shared partner presentation or relying on a missing production partner configuration. Both supplied JPEGs are unchanged. The gold-and-charcoal layout includes official Unstop registration, hybrid format, open innovation, 1–2 members, Mathura venue, separate online/onsite cards, IST deadlines, shortlisted-team finale guidance, accessible native FAQs and official organizer contact links.

No prizes, registration totals, fees, sponsorship terms or endorsement claims were invented. Registration, submissions, results, selection, attendance confirmation and any payment instructions remain under Unstop/organizer control. HackerMate participation is explicitly separate from official registration and does not secure a finale place.

The incorrect database metadata never supplies displayed event facts. A server-only, anonymous exact-ID public projection checks community readiness, with approved/non-archived database filters and repeated identity/status/type checks. Session persistence is off, fetch caching is disabled, and each fetch has a four-second timeout. This resolver reads no identity, registration, private profile, metrics or partner config data and performs no writes.

The reported stale row suppresses native participation links and shows a pending message. A corrected fixture enables the existing event-specific destination `/hackathons/0da43cba-90dc-449c-a126-a2fc8be8a379?tab=looking_for_teams`. An unavailable lookup leaves the official event facts and Unstop registration usable. The gate is a display safeguard, not proof of database team-size enforcement.

Eligibility was verified against the [official listing](https://unstop.com/hackathons/hustle-carnival-gl-bajaj-group-of-institutions-1763514), retrieved through its [indexed API-domain page](https://api.unstop.com/hackathons/hustle-carnival-gl-bajaj-group-of-institutions-1763514). Its summary says “All”, while detailed rules include B.Tech undergraduates and MBA students. The FAQ exposes the ambiguity and directs entrants to confirm course/college eligibility with Club Ellusion. Registration is shown as 20 October without an unverified cutoff hour.

## Exact changed files

All paths below are relative to `/workspace/work/hustle-carnival`:

- `docs/hustle-carnival-handoff.md`
- `docs/hustle-carnival-local-validation.md`
- `docs/hustle-carnival-metadata-correction-plan.md`
- `public/partners/hustle-carnival/hustle-carnival-gold-brand-poster.jpeg`
- `public/partners/hustle-carnival/hustle-carnival-official-event-poster.jpeg`
- `scripts/hustle-carnival-harness.cjs`
- `scripts/test-hustle-carnival-browser.cjs`
- `scripts/test-hustle-carnival-next-browser.cjs`
- `scripts/test-hustle-carnival.cjs`
- `src/app/partners/hustle-carnival/page.tsx`
- `src/components/partners/HustleCarnivalPage.module.css`
- `src/components/partners/HustleCarnivalPage.tsx`
- `src/lib/partners/hustleCarnival.ts`
- `src/lib/partners/hustleCarnivalPublic.ts`

## Screenshots and saved evidence

Actual local Next.js screenshots, including the real shell, compiled CSS, fonts and hydrated page, are in `scratch/hustle-carnival-qa/`:

- `next-portal-1440.png`, `next-hero-1440.png`: desktop.
- `next-portal-390.png`, `next-hero-390.png`: mobile.
- `next-portal-320.png`, `next-hero-320.png`: narrow mobile.
- `next-community-ready-390.png`: community action after reviewed corrections, using synthetic data.
- `next-browser-evidence.json`, `next-axe-*.json`: actual Next route evidence.
- `browser-evidence.json`, `axe-pending-*.json`, `axe-ready-*.json`: offline SSR accessibility evidence.

Screenshots show the safe pending-metadata state except the explicitly named ready fixture. No real participant data or live database was used.

A review copy, source ZIP, screenshots and logs are preserved under `/workspace/work/hustle-review/`. The chat's designated `/codex/.../output` directory does not exist in this managed environment and cannot be created by its user; normal/escalated filesystem attempts failed and `sudo` is unavailable. Consequently downloadable chat links could not be exported. No files were claimed to exist at that inaccessible path.

## Validation

| Check | Final result |
| --- | --- |
| Node partner/hackathon/event/portal suites | **862 passed across 17 scripts**, including 19 new portal tests |
| Existing directory browser suite | **57 passed**: 13 policy/safety plus 44 desktop/mobile fixture tests |
| Existing guest hackathon/shell and partner-series browser run | **12 passed**; partner-series script separately recorded **238 assertions** at 1440/390/320px |
| New offline portal browser suite | **104 assertions passed** at 1440/390/320px; pending/ready/unavailable states, keyboard FAQ, skip links, focus, target sizes, overflow and safe links; zero external HTTP requests |
| Actual Next.js route and hydration | **30 checks passed**; HTTP 200, real shell/fonts/images, fresh pending/ready/error responses; zero page errors; synthetic loopback database only |
| axe accessibility | **0 violations, 0 incomplete checks** for offline pending/ready and actual Next portal scans at all three widths |
| TypeScript | `npm run typecheck` **passed** |
| Scoped ESLint for every new code file | **Passed**, including final behavior-test revision |
| Full repository ESLint | **Failed: 326 errors, 116 warnings in unchanged existing files** |
| Partner access/projection SQL suites | **BLOCKED**: both fail with `initdb failed: spawnSync initdb ENOENT` |
| Whitespace / credential-pattern checks / poster integrity | **Passed**; copied poster hashes match upload |
| Production build / authenticated staging / real RLS and team-size enforcement | **Not verified** |

Declared QA packages `@playwright/test`, `jsdom` and `esbuild` were missing from the supplied node_modules and restored only in scratch dependencies. The existing browser suite used the restored Playwright Node CLI because the global command was Python's CLI. Existing custom browser scripts hardcode Chrome's channel; a scratch-only launcher override selected installed `/usr/bin/chromium` without modifying their sources. `axe-core` is already supplied by the locked ESLint dependency tree. Reproduction commands and fixture boundaries are documented in `docs/hustle-carnival-local-validation.md`.

Early environment/dependency failures were resolved before final passes. One development-browser attempt encountered a transient script parse error during iteration; the final stable-source run passed all 30 checks with no page errors. Existing signed-out shell auth diagnostics and blocked analytics/dev-overlay requests can appear in the development console. Fixture checks do not constitute live authentication or production sign-off. Unrelated shell and lint code was preserved.

| Node script | Result |
| --- | --- |
| `scripts/test-admin-hackathon-approval.cjs` | 8 passed |
| `scripts/test-event-compatibility.cjs` | 58 passed |
| `scripts/test-event-series.cjs` | 53 passed |
| `scripts/test-hackathon-discovery-page.cjs` | 8 passed |
| `scripts/test-hackathon-discovery.cjs` | 47 passed |
| `scripts/test-hackathon-run-mode.cjs` | 30 passed |
| `scripts/test-hustle-carnival.cjs` | 19 passed |
| `scripts/test-partner-admin.cjs` | 183 passed |
| `scripts/test-partner-authorization.cjs` | 50 passed |
| `scripts/test-partner-csv.cjs` | 50 passed |
| `scripts/test-partner-discovery-navigation.cjs` | 22 passed |
| `scripts/test-partner-organizer-api.cjs` | 163 passed |
| `scripts/test-partner-presentation.cjs` | 57 passed |
| `scripts/test-public-hackathon-browsing.cjs` | 63 passed |
| `scripts/test-public-hackathon-data.cjs` | 21 passed |
| `scripts/test-public-hackathon-shell.cjs` | 11 passed |
| `scripts/test-team-discovery.cjs` | 19 passed |

## Release blockers

1. **Metadata correction review.** See `docs/hustle-carnival-metadata-correction-plan.md`. Confirm date semantics: 22 October is a verified submission deadline, not a verified opening date. Its proposed use as `start_date` is provisional. If another convention is approved, update the local readiness gate and tests together. Review hybrid mode, Mathura venue, finale end date and 1–2 team limits on the existing event ID, plus active rosters and all creation/joining enforcement. No correction was executed.
2. **Organizer confirmation.** Confirm public co-branding, artwork-use permission and community-hub relationship; this local implementation is not evidence of a signed partnership. Clarify B.Tech/MBA/other-course and college eligibility and the precise registration cutoff. Do not add prize/fee/endorsement claims without verified instructions.
3. **Verification gaps.** Resolve or explicitly accept existing repository lint failures; provide PostgreSQL binaries for the blocked SQL suites. Complete a production build and authorized staging checks for normal authentication return paths, public visibility/RLS and corrected team-size enforcement. No authorized staging target/session was available.
4. **Release authorization.** The page remains deliberately `noindex, nofollow` as a review draft. Review indexing before public launch. Commit/push/merge/deployment and production database/configuration operations require further authorization.

## Release-only correction following original handoff

After founder approval for an **information-only** release, the portal was explicitly changed to keep HackerMate participation links **disabled for every metadata state, including `ready`**. The earlier handoff results and screenshot paths document the original implementation and must not be represented as new post-change test results. `hustlePublicParticipationEnabled()` remains hard-off until a separately reviewed and authorized release. The official Unstop registration and static portal content are unaffected. This change adds no database mutations.
