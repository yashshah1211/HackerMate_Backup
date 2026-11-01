# Mission 20 — independent review corrections

Review baseline: `a480b13822bf1c5134505e0b7b237af368c8a72d`. Existing isolated branch: `fix/mission20-hackathon-discovery-quality`; clean before this follow-up. [PR #92](https://github.com/yashshah1211/HackerMate_Backup/pull/92) remains Draft for independent review.

## Findings and corrections

1. **Rack heading contract:** the original Linux Rack qualification failed at `qa/browser/rack-conversion-funnel.cjs:67` because the guest section heading had changed. Public details again expose **About this hackathon**. Registration-first placement, the structured organizer renderer, safe links and source order are unchanged. The exact failed browser assertion is untouched. The component-level Rack expectations now also enforce the original heading.
2. **Independent date validation:** the create handler previously checked registration dates only as a pair. Invalid standalone values could become the Unix epoch through `new Date(null)`, and an invalid start could pass a paired comparison. Both values are now parsed once and independently rejected when nonempty and invalid, before authentication, timestamp conversion or insertion. Empty and valid single-ended windows remain supported. Date-only ends retain the exclusive next India midnight cutoff, so the final day is inclusive.
3. **Legacy owner count:** native registration used the raw number of membership rows, rejecting legacy owner-only teams and undercounting other teams missing an owner row. Matchmaking's documented contract explicitly uses distinct roster users UNION owner (`docs/architecture/matchmaking-v2/blueprint.sql:558`). Native registration now uses that same definition after verifying ownership. An explicit `user_id` projection and exact total verify that the roster response is complete; query failures, unavailable totals, truncation and malformed identities fail closed. The repository's existing authenticated `team_members_read` policy permits the read; no policy or privilege was changed or queried live.

New regression coverage exercises each invalid start/end alone and with the other end set, impossible calendar dates, unsupported naive timestamps, valid start-only/end-only/unset/same-day windows and reversed ordering. Native tests exercise missing/present owner rows, distinct duplicate users, owner-only teams, maximum-size enforcement and unavailable/incomplete roster reads. Existing ownership, eligibility, deadlines, capacity, unknown-review and account-switch coverage remains.

## Verification and reconciliation

- Before implementation, the new form/legacy-roster cases and restored component heading expectations reproduced the defects. The intentional red run is retained outside the checkout as `audit-artifacts/mission20/follow-up-red.log`.
- **841 applicable Mission 20 and compatibility regressions passed**, zero failed/skipped. The strengthened duplicate-roster case was subsequently rerun in the complete **26-test native registration suite**, all passing.
- **Exact previously failed journey passed:** `node qa/rack-qualification.cjs funnel-browser`; **32 checks**, widths 390/1440, synthetic-only, zero external requests and zero database mutations. `qa/browser/rack-conversion-funnel.cjs` is unchanged. Its initial local attempt failed before page execution because Windows sandboxed Chrome could not launch; the same command passed outside that filesystem sandbox with its scrubbed environment, network guard and synthetic fixtures retained. This launch failure was not an assertion failure and no browser assertion was relaxed.
- **14 Mission 20 browser checks passed serially**, including actual guest/member lifecycle and content at **390, 768 and 1440px**, keyboard/dropdown/sheet focus, safe content and no horizontal overflow. The three refreshed guest screenshots were visually inspected: readable registration-first information, original heading, preserved age/year/list content and safe link. No application layout change was required.
- **Full TypeScript passed:** `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`.
- **Scoped ESLint passed:** all six changed source/test files, **zero errors and zero warnings**, with the existing CommonJS test-file conventions retained.
- `git diff --check` passed. React review found no new hook, accessibility, rendering or data-fetching issue in the two small TSX changes.
- **Current-head Linux CI:** both existing workflows are required for the published follow-up. The date-form and native-registration suites were added to the existing Node 22 PR workflow. The Rack workflow runs the exact conversion journey, other partner/PPT browser checks, and network-isolated production-build/retired-route qualification. Immutable run URLs, exact head SHA and actual outcomes are recorded in [PR #92's description](https://github.com/yashshah1211/HackerMate_Backup/pull/92); the local results above do not substitute for hosted results.

Local logs are in the parent workspace's `audit-artifacts/mission20/`: `follow-up-targeted.log`, `follow-up-regressions.log`, `follow-up-native-final.log`, `follow-up-rack-browser.log`, `follow-up-mission20-browser.log`, `follow-up-typecheck.log` and `follow-up-lint.json`. Rack journey screenshots/results are reproducible under ignored `scratch/rack-funnel/`; hosted CI uploads its qualification evidence.

## Reproduction

```text
node --test scripts/test-hackathon-create-dates.cjs scripts/test-native-registration.cjs scripts/test-rack-conversion-funnel.cjs
node qa/rack-qualification.cjs funnel-browser
node --test --test-concurrency=1 scripts/test-public-hackathon-browser.cjs scripts/test-hackathon-lifecycle-browser.cjs scripts/test-public-hackathon-shell-browser.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js src/components/hackathons/PublicHackathonDetail.tsx src/app/hackathons/create/page.tsx src/lib/hackathons/nativeRegistration.ts scripts/test-hackathon-create-dates.cjs scripts/test-native-registration.cjs scripts/test-rack-conversion-funnel.cjs
```

The [original qualification](README.md#reproduction-commands) lists the broad regression command; add `scripts/test-hackathon-create-dates.cjs` to that selection to reproduce the 841-test follow-up run.

## Exact follow-up file inventory

- `.github/workflows/pr-validation.yml` — run the new date/native regressions in Linux CI.
- `src/components/hackathons/PublicHackathonDetail.tsx` — restore the accessible heading.
- `src/app/hackathons/create/page.tsx` — validate each nonempty registration date before conversion.
- `src/lib/hackathons/nativeRegistration.ts` — distinct roster users plus verified owner, complete-response guard.
- `scripts/test-hackathon-create-dates.cjs` — actual form-handler regression tests with in-memory hooks/database.
- `scripts/test-native-registration.cjs` — legacy roster, deduplication and fail-closed regressions.
- `scripts/test-rack-conversion-funnel.cjs` — restore original component heading expectations.
- `docs/qa/mission20/README.md` — point original evidence to this follow-up.
- `docs/qa/mission20/FOLLOW-UP.md` — findings, exact inventory, results and limits.
- [390px guest screenshot](guest-detail-closed-390.png).
- [768px guest screenshot](guest-detail-closed-768.png).
- [1440px guest screenshot](guest-detail-closed-1440.png).

## Unchanged limits and acceptance

Existing **direct database INSERT privileges can bypass application endpoint checks**. Capacity/deadline reads, roster checks and insertion are **not transactional**; concurrent changes can race. This follow-up does not claim atomic or database-level enforcement. Closing these gaps requires separate authorization for database work.

No migrations, schema/RLS/privilege changes, production reads/writes, environment changes, live provider operations, deployments or merges were performed. Authentication, partner flows, editorial/approval/archive controls and existing registration records are preserved. Remaining production acceptance described in the original qualification still applies, including actual deployed RLS/projection compatibility and legacy-team native registration using real accounts only after separately authorized rollout. These synthetic browser and server tests do not replace that acceptance.
