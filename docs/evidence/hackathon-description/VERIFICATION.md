# Organizer description verification

Date: 2026-11-04 (Asia/Kolkata). Branch: `feat/hackathon-description-guide`. Base: `c0a7da5` including Devfolio PR #111.

**GO for Draft PR review.** Implementation and local qualification are complete. Do not merge or deploy. The owner subsequently authorized a one-time exception for task-scoped Git operations and Draft PR creation. No permanent repository-rule change is included.

## Resulting experience

The shared About renderer preserves source order instead of collecting paragraphs, lists and metadata into separate buckets. It recognizes exact source labels, explicit HTML/Markdown headings, genuine lists and known information rows. Heading-prefix sentences, repeated sections, C++/C#, years, unusual numbering and malformed content survive. Ambiguous content stays readable as text.

NASA Raipur's mandatory dual registration has a restrained warning border and heading. Its official NASA link, Unstop-only warning, eligibility language, dates, venue and community links remain visible without disclosure. Original capitalization and wording are retained. Introduction paragraphs have comfortable line height and a maximum reading width; information rows stack on mobile.

Only genuinely long secondary sections from a narrow heading allowlist can collapse, independently and in their original positions. Critical language, links, lists, explicit facts, numbers, unsupported-language content and uncertain markup prevent collapse. Registration, deadlines, eligibility and warnings never qualify by heading. NASA's critical/ambiguous copy intentionally remains fully visible; there is no fabricated shorter summary.

The decoder requires valid terminated entities, handles common double encoding and preserves unknown/incomplete entity strings. Known transport markup is converted to text/structure; malformed and unknown markup remains text. React renders all organizer content without `dangerouslySetInnerHTML`. Only validated HTTP(S) destinations become links; credentials, control characters and backslashes are rejected. Links announce new tabs, use `noopener noreferrer`, and have theme-aware keyboard focus rings.

## Completed checks

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Strict ESLint on the component, parser, two scripts and two JS fixtures | PASS: zero errors/warnings |
| `node scripts/lint-aggregator.cjs` | PASS: 45 scoped files; zero new diagnostics; exact legacy diagnostics preserved |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-hackathon-description.cjs` | PASS: 16 tests |
| Source/public/partner regression selection below | PASS: 338 tests |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-hackathon-description-browser.cjs` | PASS: six configurations, 132 guest/member journeys |
| `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-mission20-discovery-hotfix-browser.cjs` | PASS: 390/768/1440px existing source/discovery/registration journeys |
| `node qa/rack-qualification.cjs funnel-browser` | PASS: 32 existing Rack It Up journey checks |
| `npm run test:browser` with installed Chrome selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` | PASS: 57 safety/desktop/mobile fixture tests |
| `node qa/rack-qualification.cjs build` | PASS: isolated production build; synthetic loopback reads, zero mutations |
| `git diff --check` | PASS |

Adjacent selection (no production connections):

```powershell
node --import ./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-aggregator-sources.cjs scripts/test-aggregator-partner-evidence.cjs scripts/test-public-hackathon-data.cjs scripts/test-public-hackathon-browsing.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-rack-conversion-funnel.cjs scripts/test-rack-it-up-2026.cjs
```

The presentation tests compare every NASA word/number in order with the decoded captured source, not a hand-authored summary. They also verify interleaved block order, repeated headings, ordinal values, link destinations, punctuation, malformed-tag fallback, quoted HTML attributes, unknown entities and 300KB input. The large plain-text and repeated-unclosed-anchor cases completed comfortably below the generous three-second guard.

Browser checks render the actual authenticated detail route and its actual public fallback. They inspect DOM source order, mandatory instruction visibility, safe anchors, absent organizer scripts/images/frames, independent native disclosures, Enter/Space activation, Tab navigation, focus styles and zero horizontal overflow. They also check the existing hero region, official destination, login return path, member community controls, native numbering and Rack discovery placement. Every attempted description-fixture write throws; guest reads stay public; page errors, console errors and unexpected outbound requests must be empty.

## Visual evidence

All 36 PNGs are real Chrome screenshots of actual application components at 390, 768 and 1440px in both themes, with guest/member variants. `SCREENSHOTS.json` records dimensions, sizes and SHA-256 hashes.

| View | Mobile | Desktop |
| --- | --- | --- |
| Public page | [390px dark](nasa-guest-dark-390.png) | [1440px light](nasa-guest-light-1440.png) |
| Authenticated page | [390px dark](nasa-member-dark-390.png) | [1440px light](nasa-member-light-1440.png) |
| About close-up | [390px dark](nasa-about-guest-dark-390.png) | [1440px light](nasa-about-guest-light-1440.png) |
| Secondary disclosure | [390px dark](secondary-guest-dark-390.png) | [1440px light](secondary-guest-light-1440.png) |

The mobile and desktop About screenshots were visually inspected for line length, spacing, fact-row alignment, link wrapping and restrained emphasis. Full-page screenshots retain the existing hero, registration panel and community presentation.

## Provenance and limits

- The NASA fixture is the exact public description returned by a read-only anonymous `hackathons` query selecting only `id,name,description,website_url`; the committed fixture omits the production ID. Source: the Unstop URL stored in `qa/fixtures/descriptions/nasa-raipur.json`. No production records were inserted, updated or deleted.
- Other content cases are clearly synthetic fixtures. Browser identity, event fields and provider transport are synthetic; these are application-component runtime checks, not a live production account/OAuth test. No production signup, registration, team change or partner operation was performed.
- Offline screenshots use Arial in place of the production Next font. The production build uses the repository's existing offline font fixture. Exact production font metrics and a live OAuth handoff remain outside this validation.
- Arbitrary organizer HTML is intentionally not rendered. Complex/unrecognized markup and unsupported Markdown can remain literal readable text. Deeply encoded/invalid entities beyond the bounded decoding passes are preserved rather than interpreted repeatedly.
- Disclosure is deliberately conservative: it can leave more content visible when classification is uncertain. This favors source fidelity and participant instructions over aggressive page shortening.
- Native keyboard behavior was tested in Chrome; no claim is made about a full screen-reader certification or cross-browser conformance audit.
- Existing middleware/Sentry configuration warnings remain in the build. Baseline lint retains five errors/five warnings in the unchanged authenticated detail file and twelve errors/four warnings in unchanged admin outreach code. No new diagnostics were introduced.
- Windows restricted-process Chrome launch and an initial filesystem-restricted build failed before normal qualification. The isolated browser/build commands succeeded outside those restrictions. The focus test waits for Chrome's author-style recalculation instead of asserting a transient native outline.
- Existing GitHub qualification workflows remain unchanged. The proposed `.github/workflows/hackathon-description.yml` is excluded from staging under the owner’s explicit no-workflow-change constraint. New description tests passed locally; existing GitHub checks run after push/PR creation. Live CI status is reported on the Draft PR.

## Scope audit

Production edits are limited to the shared renderer, its pure presentation parser and the direct decoder dependency declaration. Both detail-page files, hero, source synchronization/verification, registration logic, community/team controls, Rack integration, source parsers and database files are unchanged. Added files are the approved plan, regression fixtures/scripts and review evidence. The pre-existing `.kiro/` in the separate `frontend` worktree is excluded.
