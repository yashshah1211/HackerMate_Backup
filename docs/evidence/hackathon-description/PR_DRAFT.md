## Organizer descriptions are easier to read without losing source information

Flattened Unstop descriptions previously became a wall of text; loose heading matches could discard sentences, and the global disclosure could hide mandatory registration instructions. The shared About renderer now preserves an ordered stream of organizer paragraphs, exact source headings, genuine lists and explicit information rows. NASA Raipur's dual registration instructions remain visible with a restrained warning accent, while dates, venue and communication links are easier to scan.

Entity decoding is deterministic on server and browser. Untrusted descriptions render as React text and validated HTTP(S) links, never organizer HTML. Source wording, repeated sections, link destinations and numbered-list values are retained. Long, confidently secondary sections can disclose independently in place; critical, ambiguous, numeric, linked and list content stays visible.

### Scope

- Presentation and tests only, based on main `c0a7da5` including PR #111.
- Hero, registration/source state, official application destinations, community/team actions and Rack It Up behavior are preserved.
- No production mutations, source-parser changes, migrations, summaries or paid services. `entities@6.0.1`, already present transitively, is declared as a direct runtime dependency.
- Existing repository qualification workflows remain unchanged. The prepared additional workflow is excluded under the owner’s explicit no-workflow-change constraint. The new description suites were run locally.

### Validation

- TypeScript and strict changed-file lint passed; existing aggregator scoped/baseline lint passed with no new diagnostics.
- 16 presentation regressions passed, including exact NASA source word/number sequence, malformed HTML, complete metadata labels, URL safety and large-input handling.
- 338 adjacent source, public-browsing and partner regressions passed, including Devfolio PR #111.
- 132 public/member description journeys passed across 11 cases, three widths (390/768/1440) and both themes; keyboard disclosures, link focus, URL safety, content order and overflow checked.
- Existing source-aware discovery browser suite passed at all three widths; Rack It Up browser journey passed 32 checks.
- Standard offline Playwright safety/fixture suite passed 57 tests.
- Synthetic-data production build passed with zero mutations. See the verification report for environment notes and final build details.

### Visual evidence

Screenshots use the actual public/authenticated page components with denied external requests and synthetic transport. NASA description text is the exact public copy captured read-only on 2026-11-04; no production account or participant data is included. Fonts use an explicit Arial fallback in the offline harness.

- [390px public, dark](https://github.com/yashshah1211/HackerMate_Backup/blob/feat/hackathon-description-guide/docs/evidence/hackathon-description/nasa-guest-dark-390.png)
- [1440px public, light](https://github.com/yashshah1211/HackerMate_Backup/blob/feat/hackathon-description-guide/docs/evidence/hackathon-description/nasa-guest-light-1440.png)
- [390px authenticated, dark](https://github.com/yashshah1211/HackerMate_Backup/blob/feat/hackathon-description-guide/docs/evidence/hackathon-description/nasa-member-dark-390.png)
- [1440px authenticated, light](https://github.com/yashshah1211/HackerMate_Backup/blob/feat/hackathon-description-guide/docs/evidence/hackathon-description/nasa-member-light-1440.png)

**Recommendation: GO for Draft PR review.** Keep this PR in Draft; do not merge or deploy. The owner granted a one-time exception for task-scoped staging, commit, push and Draft PR creation; the repository rules remain unchanged. Live OAuth and production writes were deliberately excluded from verification.
