# Copy filtered hackathon link

Base: latest `main`, `fb3fd3df89836cc782f3123ef296cbc5600a1768` (includes merged #35, #37 and #38). Branch: `feat/copy-hackathon-link`. The Draft PR records the final commit SHA. This change is isolated in its own worktree; Desktop Codex's branch and team-detail files are untouched.

## Existing functionality and minimal change

The audit found complete URL synchronization already implemented in `src/app/hackathons/page.tsx` and `src/lib/hackathons/discovery.ts`. Search/filter changes use the existing `readDiscoverySettings`, `discoveryQuery` and native `history.replaceState` integration with Next's `useSearchParams`. Public listing uses the existing complete keyset traversal; discovery filters operate on that completed dataset. None of that code or its parameter contract is rebuilt or refactored.

The page adds one `CopyDiscoveryLink` beside the results/filters through one import and one render. The component uses existing Button/Input styling, a Lucide Link2 icon and the existing notification provider. Its accessible name is **Copy link to filtered hackathons**; visible text is **Copy link**. The description is linked through `aria-describedby`, and the mobile button is at least 44px high. Success/error notifications retain existing live-region semantics.

A small pure helper reads the existing validated settings and serializes them into a fresh, empty query using the existing serializer. The destination is always **`https://www.hackermate.in/hackathons`**, with no incoming host, pathname, fragment, unrelated tracking/context parameters, account identifiers, tokens or duplicate keys. Input params and the current page URL/history are never mutated. The supported keys remain `tab`, `q`, `mode`, `platform`, `topic`, `sort`, `from`, `to`, `participation`, `registration`.

Existing enum/date validation, 200-character search limit, exact normalized topic matching and compact defaults remain authoritative. Encoded Unicode, punctuation, ampersands, slashes, plus signs and spaces round-trip through URLSearchParams. Duplicate supported values are ignored according to the existing contract, rather than choosing an ambiguous value. Unknown listed-topic strings retain the existing “not listed”/empty-result behavior. If individually valid dates form a reversed interval, Copy is disabled with “Fix the date range before copying a link”; other filtering behavior is unchanged.

## Personalization is explained before copying

| Current selection | Shared selection | Visible explanation |
| --- | --- | --- |
| Saved, any non-personal sort | Public Discover, same filters and sort | “Copies public discovery with these filters, not your saved list.” |
| Saved + relevance | Public Discover, same filters, date order | “Copies public discovery with date order, not your saved list.” |
| Relevance on any other tab | Same public tab/filters, date order | “Copies these filters with date order. Personal recommendations aren’t shared.” |
| Other public tab/sort | Same public tab/filters/sort | “Copies these filters as a public discovery link.” |

“Recommended” is the existing internal tab value for guest Discover/member For you. It does not encode a person's identity. A shared relevance order is explicitly converted to date order, so the recipient's skill profile cannot silently change the intended ordering. Saved membership is never serialized. Non-personal date/recent/INR/USD sorting remains intact. Sharing is a live filtered view, not a frozen event snapshot.

## Clipboard behavior and privacy

`navigator.clipboard.writeText` is invoked directly from the user gesture, only in a secure context with API support. The existing success toast appears only after that promise resolves. A pending operation marks the button busy/disabled and a ref prevents duplicate submissions. Rejection, a synchronous browser exception, absent API support or an insecure context produces an error toast and a read-only clean-link input that selects its contents on focus. No legacy execCommand fallback, permission prompt API, automatic navigation or automatic messaging is introduced. A stale manual link disappears when selections change; retry success removes it.

The feature makes **zero database queries, network requests or analytics calls**. It does not inspect profiles, cookies, saved IDs, auth tokens or local storage. Search/topic text is intentionally shared and remains visible in the copied URL; this cannot strip personal information deliberately typed into a search field. Unrelated existing parameters and fragments are discarded, including any tokens or email parameters attached to the original URL.

Public listing approval/archive restrictions, guest authorization boundaries, PR #35 metadata, existing bookmarks, routing and Back/Forward behavior are unchanged. Copying does not create a history entry or reset filters. Filter edits still replace the current entry; existing entries restore through Back/Forward. No schema, RLS, RPC, policy, configuration, authentication, onboarding, organizer, Hustle, team-detail or analytics source changes. No dependencies or paid services.

## Screenshots

Actual production Next UI with synthetic events, read-only intercepted public responses and offline font responses; no production profiles or sessions. The baseline production build was made from the exact base commit above before application changes. The changed build uses the same viewport/data. Original system/font fallbacks are identical in both builds.

| View | Before | After |
| --- | --- | --- |
| Desktop 1440px | [before-1440.png](before-1440.png) | [after-1440.png](after-1440.png) |
| Mobile 390px | [before-390.png](before-390.png) | [after-390.png](after-390.png) |

Additional: [Saved explanation, desktop](saved-1440.png), [Saved explanation, mobile](saved-390.png), [clipboard failure/manual fallback, mobile](clipboard-failure-390.png), [browser results](browser-results.json).

## Verification

- **26 new focused tests passed:** canonical origin/path, strict allowlist, context/token removal, supported filters/sorts, encoded search/Unicode, query limit, duplicate/invalid inputs, personalized tabs/sorts, reversed ranges, result restoration, nonmutation, screen-reader labels/descriptions, real shared Button/Input rendering, Clipboard success/denial/synchronous rejection/missing API/insecure context, pending promises/double clicks, retry and stale-fallback suppression.
- **209 existing regressions passed:** discovery 47; real discovery page 8; public event data/pagination 21; browsing/auth lifecycle 63; public shell 11; metadata 29; metadata/organizer compatibility 8; partner discovery navigation 22. Total focused/existing tests: **235 passed**.
- Production build (`next build --webpack`) and `next start`: passed through the existing read-only metadata harness. **44 production HTML checks passed**, with 39 synthetic anonymous event reads. No live Supabase access or production credentials. Existing middleware/Sentry/Edge/cache warnings remain outside scope.
- Actual production Next Chromium checks passed at **1440px and 390px**, exercising the real router and real browser Clipboard API. Keyboard Enter activation copies successfully; accessible descriptions precede conversion; mobile target size is checked. The copied link restores event results and controls in a separate fresh guest context. Additional cases cover query changes, refresh, real Back/Forward, approval/archive defenses, invalid/duplicate inputs, encoded search, Saved conversion, denial/unsupported/insecure fallback, manual text selection and no overflow.
- Browser assertions verify that copying preserves the current URL and adds **zero database reads or document navigations**. Existing public reads require `status=approved`, `archived=false` and an explicit projection. All database writes and unknown remote requests are rejected by fixtures. Existing Simple Analytics/Sentry attempts receive test-only local responses; no telemetry is sent, and analytics configuration/source is unchanged.
- TypeScript, scoped ESLint (zero warnings) and whitespace checks: passed. Initial new-harness syntax/global-adapter issues were corrected before successful checks; no application workaround was needed.

Reproduction with existing installed dependencies and a local Chromium executable (`QA_CHROMIUM_PATH` overrides `/usr/bin/chromium`):

```sh
node scripts/test-copy-discovery-link.cjs
node scripts/test-hackathon-discovery.cjs
node scripts/test-hackathon-discovery-page.cjs
node scripts/test-public-hackathon-data.cjs
node scripts/test-public-hackathon-browsing.cjs
node scripts/test-public-hackathon-shell.cjs
node scripts/test-public-hackathon-metadata.cjs
node scripts/test-public-hackathon-metadata-organizer.cjs
node scripts/test-partner-discovery-navigation.cjs
node scripts/test-public-hackathon-metadata-production.cjs
node scripts/test-copy-discovery-link-browser.cjs
npx tsc --noEmit --incremental false
npx eslint src/app/hackathons/page.tsx src/components/hackathons/CopyDiscoveryLink.tsx src/lib/hackathons/shareDiscovery.ts scripts/test-copy-discovery-link.cjs scripts/test-copy-discovery-link-browser.cjs
git diff --check
```

The production browser suite requires the preceding production build. `--baseline` captures the before UI when run against a base-commit build. Test logs stay under `work/`; only the review artifacts below are committed. The cloud runtime needs its network capability for loopback servers and browser subprocesses, while fixtures prevent outbound application requests.

## Manual founder verification

1. On the feature build, open `/hackathons?tab=upcoming&q=AI%2FML&mode=online&sort=date&utm_source=college&token=example#extra` and choose any listed topic. Confirm one Copy link action near results on desktop/mobile.
2. Focus it with Tab and activate with Enter. Wait for the success toast, then paste into a plain-text field. Verify the `https://www.hackermate.in/hackathons` origin, supported selections, and absence of `utm_source`, `token` and the hash. The current page address/history should remain unchanged.
3. Open the copied link in incognito. Confirm controls restore. Results depend on current approved/non-archived listings and exact topic tags. Local fixture tests rewrite only the pasted origin to loopback; real shared links intentionally point to production.
4. Select Saved and/or relevance. Read the explanation before copying; confirm the recipient gets public discovery/date ordering rather than another person's saved list or recommendations.
5. Deny clipboard access in browser site permissions. Confirm an error, no false success, and a selectable clean manual link. Change a filter and verify an old manual link is no longer shown. Retry after allowing access.
6. Try duplicate/invalid parameters and a reversed date range. Duplicates/invalid values use existing defaults; reversed dates disable Copy with a fix-date explanation. Check Back/Forward and guest browsing still behave as before.

## Exact changed files

1. `src/app/hackathons/page.tsx` — import and render one action only.
2. `src/components/hackathons/CopyDiscoveryLink.tsx`
3. `src/lib/hackathons/shareDiscovery.ts`
4. `scripts/test-copy-discovery-link.cjs`
5. `scripts/test-copy-discovery-link-browser.cjs`
6. `docs/qa/copy-discovery-link/README.md`
7. `docs/qa/copy-discovery-link/browser-results.json`
8. `docs/qa/copy-discovery-link/before-1440.png`
9. `docs/qa/copy-discovery-link/after-1440.png`
10. `docs/qa/copy-discovery-link/before-390.png`
11. `docs/qa/copy-discovery-link/after-390.png`
12. `docs/qa/copy-discovery-link/saved-1440.png`
13. `docs/qa/copy-discovery-link/saved-390.png`
14. `docs/qa/copy-discovery-link/clipboard-failure-390.png`

## Remaining limits and release

Clipboard access remains subject to browser permissions, embedding policy and secure-context support; the manual fallback is the supported alternative. Explicit non-personal sorting makes ordering portable, but listings, moderation, deadlines and time-dependent tabs can change after sharing. Exact topic labels and existing matching semantics are unchanged. The manual input remains tied to the current sanitized selections.

No merge or production deployment is authorized. This remains a Draft PR for independent founder review; no implementation blocker requires permission expansion. A preview/member smoke check on a founder-authorized environment can supplement the offline guest checks without new credentials or policies.

## Three follow-ups from the code audit — proposals only

1. **Carry event-specific intent through signup to team discovery.** `PublicHackathonDetail.tsx` currently offers generic participation/save sign-in links, both returning to the same event destination. It lacks a prominent event-specific “Find a team” path for a student arriving from a college-group link. Reuse existing validated event-discovery tab destinations and safe auth return handling to land an interested newcomer on the relevant team-building action after signup, without auto-registering or auto-requesting. This addresses guest-to-first-team activation rather than adding another generic dashboard CTA.
2. **Rank invite candidates by a team's unmet skills/roles.** `TeamOverviewView.tsx` lines 298–328 load profile `skills` but present invite candidates through name/college/skill text filtering, without team-needs ranking. Team creation already records wanted skills/roles. An explainable shortlist based on the existing authorized candidate payload and missing roster skills would help owners send useful first invites; keep explicit owner choice and existing invite RPCs. This is separate future work and must be coordinated with Desktop Codex before touching shared team components.
3. **Give recruiting-team links useful public previews.** Unlike `/hackathons/[id]/layout.tsx`, there is no team-specific metadata layout/image route under `src/app/teams`; links inherit generic root title/description/homepage Open Graph URL. A privacy-reviewed preview using only already-public recruiting information (team name, event and needed skills) could turn college-group shares into qualified team-discovery visits. Reuse PR #35's fail-closed visibility principles; expose no owner/contact/request data. Coordinate after Desktop Codex's team-detail reliability work, with separate approval and tests.

These are code-backed gaps, not measured conversion claims. None is implemented in this PR; no new analytics or data collection is added to evaluate them.
