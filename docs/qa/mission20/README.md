# Mission 20 — implementation and review evidence

Branch: `fix/mission20-hackathon-discovery-quality`. Verified starting main: `64aa18786f7035b830cd9d8f1095a533b5b2ac7b` (tree `bf7cbc4d39f1274e4332f2f6700e0fd946ab5f3e`). This isolated checkout had no pre-existing changes.

## Result

Independent lifecycle/application states now drive ordinary discovery and guest/member details. Known-closed applications are excluded from default active discovery and remain explicitly inspectable, saved and directly readable. Unknown native applications use Review registration with an uncertainty notice. The authenticated submission endpoint verifies identity/account, event visibility, deadlines, team ownership/size, capacity and a fresh event snapshot before insertion. Client account switching cannot silently submit for a replacement account.

Organizer descriptions retain numeric requirements, paragraphs, lists and links in order. The allowlisted React renderer and shared directory excerpts omit executable content. New ingestion separates application/event dates and supports idempotent, source-owned deadline refreshes guarded against manual/concurrent changes. Native creation and organizer controls support application dates without a schema change.

The one shared component change beyond the original file inventory is `src/components/system/Overlay.tsx`: the existing Dialog heading now supplies its accessible name through aria-labelledby. The actual browser flow found this accessibility defect; the change does not alter authorization or overlay behavior.

## Qualification

- TypeScript: **passed**, full no-emit check, incremental output disabled, run after the final build.
- Scoped ESLint: zero new normalized diagnostics against the exact base tree. The base has 33 existing diagnostics; this scope currently has 32. Diagnostics are compared by file/rule/severity/first message line to avoid counting shifted source excerpts as new violations. No rule was disabled to obtain the result.
- Applicable unit/component regressions: **815 passed, zero failed/skipped**. Existing assertions for authorization, private-read scoping, pagination, waitlisting, community membership, saved events, partner identity, invitations and data preservation remain. Intentional contract updates assert closed-event exclusion plus explicit historical inclusion and changed CTA wording; dependency failures now additionally assert zero writes.
- Browser qualification: **14 checks passed serially**, including actual Chrome guest/member checks at 390, 768 and 1440px; the three lifecycle viewport checks were also rerun on the final client implementation and passed. Coverage includes open/closed/unknown, native review/confirmation, safe content/links, no guest private reads/writes and no external requests. HTTP success is an intercepted fixture; the real HTTP handler/service is separately exercised with in-memory auth/database fixtures.
- Existing shell/navigation/dropdown browser coverage is retained. A keyboard-focus assertion failed during a heavily parallel run, passed unchanged in isolation, and the complete browser group subsequently passed serially. It was not removed or weakened.
- Production build qualification: `node qa/rack-qualification.cjs build`, using the existing loopback-only network guard, a scrubbed child-process environment, local synthetic data and mocked fonts. Windows sandbox output creation initially failed with EPERM; the isolated rerun with filesystem permission succeeded. No .env/configuration file was created or changed. **Final frozen-source build passed**, with **4 synthetic reads and 0 mutations**. Existing Sentry instrumentation and middleware deprecation warnings remain baseline issues.
- `git diff --check` passes. No migrations, RLS/GRANT changes, production writes, live provider operations, deployment or merge were performed. The founder separately authorized staging, committing and pushing the listed files for the Draft PR.

## Final verification record

The complete file inventory below contains 57 files, including 18 matched screenshots. No files outside this task were included. The source was frozen before the last production build and sequential TypeScript run. Final external audit logs are stored under the workspace `audit-artifacts/mission20/`: `regressions-publish.log`, `browser-review.log`, `browser-release.log`, `build-publish.log`, `typecheck-publish.log`, and `lint-publish.json`. Lint comparison: base 33 diagnostics, current 32, zero new diagnostics. The standalone ESLint exit remains 1 because existing violations are retained.

## Reproduction commands

```text
npx tsc --noEmit --incremental false
node --test scripts/test-native-registration.cjs scripts/test-hackathon-description.cjs scripts/test-hackathon-lifecycle.cjs scripts/test-hackathon-discovery.cjs scripts/test-hackathon-discovery-page.cjs scripts/test-public-hackathon-browsing.cjs scripts/test-public-hackathon-data.cjs scripts/test-event-compatibility.cjs scripts/test-scraper-data-preservation.cjs scripts/test-rack-it-up-2026.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-authorization.cjs scripts/test-admin-hackathon-approval.cjs scripts/test-auth-return-paths.cjs scripts/test-auth-return-ui.cjs scripts/test-onboarding-submission.cjs scripts/test-invite-handoff.cjs
node --test --test-concurrency=1 scripts/test-public-hackathon-browser.cjs scripts/test-hackathon-lifecycle-browser.cjs scripts/test-public-hackathon-shell-browser.cjs
node qa/rack-qualification.cjs build
node scripts/capture-mission20-baseline.cjs <verified-baseline-checkout>
```

To lint, pass the exact changed .ts/.tsx/.js/.jsx/.cjs paths in the inventory below to the installed ESLint binary, emit JSON, and compare the base checkout with the same package/configuration. Do not lint from another checkout's base directory, which causes ESLint to ignore outside paths.

## Screenshot evidence

The baseline checkout has the exact current-main tree at task start. The capture script uses the same synthetic data, clock (31 October 2026, noon IST), viewport, motion preference and CSS pipeline as the current browser suite. Native titles, source content and deadlines match. All screenshots were captured without live data or provider operations. Browser font rendering uses local fallbacks in both sets; these images are not full production-shell or real-account acceptance.

| Width | Listing before / after | Guest detail before / after | Member detail before / after |
|---|---|---|---|
| 390px | [Before](before/listing-closed-390.png) / [After](listing-closed-390.png) | [Before](before/guest-detail-closed-390.png) / [After](guest-detail-closed-390.png) | [Before](before/member-detail-closed-390.png) / [After](member-detail-closed-390.png) |
| 768px | [Before](before/listing-closed-768.png) / [After](listing-closed-768.png) | [Before](before/guest-detail-closed-768.png) / [After](guest-detail-closed-768.png) | [Before](before/member-detail-closed-768.png) / [After](member-detail-closed-768.png) |
| 1440px | [Before](before/listing-closed-1440.png) / [After](listing-closed-1440.png) | [Before](before/guest-detail-closed-1440.png) / [After](guest-detail-closed-1440.png) | [Before](before/member-detail-closed-1440.png) / [After](member-detail-closed-1440.png) |

## Limits and production acceptance

1. The new server endpoint enforces the application path. Existing direct database INSERT privileges are unchanged and can bypass it. Capacity/deadline reads and insertion are not transactional. Authoritative database enforcement and race elimination require separately approved database work; this Draft PR must not claim those guarantees.
2. Legacy records lacking a source-ownership snapshot are intentionally not auto-corrected. Existing corrupted dates/descriptions need a separately authorized, verified correction inventory. The frontend cannot recover previously deleted source structure/links. No production record inventory was read.
3. Date-only registration inputs are converted to the next India midnight exclusive when written into existing timestamp columns. Their stored cutoff may display as the following day at midnight; it is the precise exclusive boundary, not a shortened final day. Unsupported/naive source timestamps stay unknown.
4. General plain-text rendering supports explicit headings, lists and basic Markdown links/emphasis, not every Markdown extension. Unsafe content is omitted, image alternative text retained without remote image loading, and relative hyperlinks need a safe organizer website base.
5. Display clocks can lag a boundary by up to 30 seconds, especially in background tabs. Focus/visibility refresh and fresh server checks prevent relying on the stale display for submission. No new polling of providers or per-event browsing requests was introduced.
6. Partner portals, dashboard spotlight, homepage hydration, generic calendar export behavior and retired features were kept outside the implementation. Existing partner compatibility tests pass; partner portal CTA modernization remains separate.
7. Live production acceptance remains needed after independent review and separately authorized rollout: actual public schema/projection compatibility; a real native open/closed/unknown flow and ownership/capacity behavior; representative existing imported records and organizer edits; production fonts/full-shell hydration and navigation; and deployment/provider scheduling behavior. Do not run live scraper/cron/outreach as a smoke test.

## Complete file inventory and staging audit

Every modified/untracked file in this isolated checkout is listed here. The pre-staging audit found an empty index. All files serve Mission 20; no pre-existing or unrelated changes were found. The shared Dialog accessible-name fix is explicitly called out above. After reviewing this inventory, the founder explicitly authorized Codex to stage these listed files, commit and push this branch, then open the approved Draft PR. That authorization is limited to this inventory.

- `docs/architecture/hackathon-lifecycle.md`
- `docs/qa/mission20/DRAFT-PR.md`
- `docs/qa/mission20/README.md`
- `docs/qa/mission20/before/guest-detail-closed-1440.png`
- `docs/qa/mission20/before/guest-detail-closed-390.png`
- `docs/qa/mission20/before/guest-detail-closed-768.png`
- `docs/qa/mission20/before/listing-closed-1440.png`
- `docs/qa/mission20/before/listing-closed-390.png`
- `docs/qa/mission20/before/listing-closed-768.png`
- `docs/qa/mission20/before/member-detail-closed-1440.png`
- `docs/qa/mission20/before/member-detail-closed-390.png`
- `docs/qa/mission20/before/member-detail-closed-768.png`
- `docs/qa/mission20/guest-detail-closed-1440.png`
- `docs/qa/mission20/guest-detail-closed-390.png`
- `docs/qa/mission20/guest-detail-closed-768.png`
- `docs/qa/mission20/listing-closed-1440.png`
- `docs/qa/mission20/listing-closed-390.png`
- `docs/qa/mission20/listing-closed-768.png`
- `docs/qa/mission20/member-detail-closed-1440.png`
- `docs/qa/mission20/member-detail-closed-390.png`
- `docs/qa/mission20/member-detail-closed-768.png`
- `package-lock.json`
- `package.json`
- `qa/fixtures/mission20-browser.jsx`
- `scripts/capture-mission20-baseline.cjs`
- `scripts/test-event-compatibility.cjs`
- `scripts/test-hackathon-description.cjs`
- `scripts/test-hackathon-discovery.cjs`
- `scripts/test-hackathon-lifecycle-browser.cjs`
- `scripts/test-hackathon-lifecycle.cjs`
- `scripts/test-native-registration.cjs`
- `scripts/test-public-hackathon-browser.cjs`
- `scripts/test-public-hackathon-browsing.cjs`
- `scripts/test-rack-conversion-funnel.cjs`
- `scripts/test-scraper-data-preservation.cjs`
- `src/app/api/admin/create-partner-portal/route.ts`
- `src/app/api/admin/scrape-unstop/route.ts`
- `src/app/api/hackathons/[id]/register/route.ts`
- `src/app/hackathons/[id]/organizer/page.tsx`
- `src/app/hackathons/[id]/page.tsx`
- `src/app/hackathons/create/page.tsx`
- `src/app/hackathons/page.tsx`
- `src/components/StructuredHackathonDescription.tsx`
- `src/components/hackathons/PublicHackathonDetail.tsx`
- `src/components/hackathons/RegistrationSummary.tsx`
- `src/components/hackathons/useHackathonClock.ts`
- `src/components/system/Overlay.tsx`
- `src/lib/hackathons/description.ts`
- `src/lib/hackathons/discovery.ts`
- `src/lib/hackathons/eventParticipation.ts`
- `src/lib/hackathons/ingestion.ts`
- `src/lib/hackathons/lifecycle.ts`
- `src/lib/hackathons/nativeRegistration.ts`
- `src/lib/hackathons/prizeDisplay.ts`
- `src/lib/hackathons/publicBrowsing.ts`
- `src/lib/hackathons/registrationClient.ts`
- `src/lib/hackathons/urls.ts`
