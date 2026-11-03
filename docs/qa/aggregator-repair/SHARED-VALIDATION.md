# Shared lifecycle validation boundary

Baseline: `9ef49c631011de7034613c27d04b7fb7ff66b5a3`. Work performed November 3, 2026, against the explicitly approved six-step plan and finite acceptance matrix. These changes are local and uncommitted. PR #99 remains Draft; no Git, deployment, production or adoption operation was performed.

## Root cause and implemented contract

Previously, structural decoding of `SourceMetadata` was treated as validation. Provider labels, stage provenance, date conversion and cached lifecycle claims could independently authorize recommendations. The three confirmed failures were reproduced before implementation, including both actual resume modes with output intercepted in memory.

`validateSourceObservation` now returns an independently validated source identity, usable metadata, a supported schedule and rejection reasons. The structural decoder is private. Identity may permit a fresh lower-priority check even when cached schedule facts cannot authorize anything. Identity conflicts cannot authorize a request, lease or apply operation.

The pure `sourceEvidence.ts` module owns provider URL/identity rules, strict calendar/timestamp parsing and the existing conservative Unstop stage reconciliation. Unstop long URLs, renamed URLs and `/o/ID` aliases are compared by stable numeric identity. Devfolio URL slugs are not confused with detail/listing UUIDs. Hack2Skill authoritative identity requires its listing ID and compatible event slug. Source facts and the consuming record's available URL must agree with canonical identity.

Parser `aggregator-8` retains only relevant Unstop parent/detail fields. Evidence is bounded to 40 parents, 200 detail entries and 65,536 serialized UTF-16 code units; oversized evidence is withheld, never truncated into a complete inventory. Private/draft exclusions remain replayable. The unchanged v3 marker is necessary but insufficient: the same reconciler must reproduce the projected event window from retained inventory. Historical v3 observations without that inventory require a fresh check. No new schema or dependency is introduced.

All supplied event, registration and projected stage dates are validated before conversion. Authoritative event windows require complete, ordered boundaries. Registration windows cannot reverse; open/not-yet-open claims need supporting boundaries at the observation time. Known lifecycle claims must agree with the validated schedule at `checked_at`; runtime lifecycle is calculated at the caller's current clock. Provider publication status remains separate from Unstop event lifecycle. Registration remains independent of event schedule.

Parser completion, transport identity checks, metadata readers, projection, source-information presentation, lifecycle/Active selection, synchronization, reconciliation and patch generation use the shared rules. Invalid or unresolved observations cannot emit a source patch. Synchronization requires validated observations before apply; invalid fresh evidence is retained in the unresolved result and only the existing failure-receipt path is available for a leased record.

Both report resume modes isolate retained interpretation per row. Unsupported current recommendations become `unresolved` with empty `changes` and validation reasons. `original_classification`, `original_changes` and original `evidence` survive serialization and reload. Retained interpretations are historical, explicitly require fresh verification, and never grant adoption approval or reset observation times. They are not a current source check.

## Before/after reproduction

Test clock: November 3, 2026, 12:00 IST. Each fixture begins with a synthetic parsed Unstop observation.

| Fixture mutation | Before | After |
|---|---|---|
| `provider="devfolio"` while canonical/source URLs remain Unstop; remove marker | Ended, date patches and confirmed-ended suppression | Unknown, excluded from Active, empty patch and unresolved reconciliation |
| Keep v3; set start November 5 and end November 1 | Reversed date patches and confirmed-ended suppression | Unresolved with `contradictory_event_window` / `unsupported_build_schedule`; empty recommendations |
| `registration_end="abcdefghij"` | `RangeError` aborts either resume mode | Invalid row unresolved with `invalid_registration_end`; healthy rows complete |

Both resume modes and a second serialized reload are asserted. Original evidence and claims remain available in every corrupt-row case. Additional tests cover missing proof, changed replay evidence, missing boundaries, malformed event strings and contradictory lifecycle/issues.

## Finite acceptance matrix

| Approved area | Result / evidence |
|---|---|
| Three confirmed findings | PASS; direct consumers plus both actual resume modes |
| Provider identity conflicts and supported URL/ID relationships | PASS; aliases, UUID/slug differences, listing IDs, record/source URL conflicts and no-request/no-RPC controls |
| Missing/malformed/reversed event and registration dates | PASS; rejected before conversion or promotion |
| V3 alone, missing or contradictory replay evidence | PASS; cannot authorize schedules or event-date proposals |
| Lifecycle consistency and advancing clocks | PASS; claim checked at observation time, runtime state at current time |
| Evidence-less cache and repeated reload | PASS; withdrawn proposals remain withdrawn; original claims preserved |
| Both resume modes with mixed corrupt/healthy rows | PASS; no whole-report abort, healthy row survives |
| Earlier future-sibling and misleading activity exploits | PASS; existing lifecycle/source regressions retained |
| Valid single/linked/identical-window Unstop schedules | PASS; existing positive schedules retained |
| Valid Native, Devfolio and Hack2Skill schedules | PASS; positive compatibility controls retained |
| Registration independent of schedule | PASS; existing independent open/closed-registration behavior retained |
| India final calendar day, UTC equivalence and expiry | PASS; calendar, instant and freshness regressions |
| Bounded evidence and irrelevant private/draft stages | PASS; no truncation into authority; private exclusion retained |
| Historical audit | PASS; 410 unique records, exact derived artifacts and zero approved writes |

Initial new acceptance suite: **18 tests, 16 failed and 2 passed** against unchanged implementation. Three integration/bounds tests completed the agreed matrix; final shared-boundary suite: **21 passed, 0 failed**. Assertions were not removed to accommodate a defect. Earlier fixtures were corrected where they paired metadata with a different record URL, moved observation times without adjusting claims, omitted confirmed transport identity, or hand-minted marker-only browser evidence. Queue tests retain corrupt claimed/date-based ends and add an independently parsed genuine end.

## Qualification results

- `node scripts/qualify-aggregator.cjs`: **1,888 passed, 0 failed, 0 skipped**. Network guard enabled; SDK/RPC integration uses synthetic in-memory responses.
- `node --test scripts/test-aggregator-validation.cjs`: **21 passed** independently in both bounded final reviews.
- `node --test scripts/test-mission20-discovery-hotfix-browser.cjs`: **3 passed, 0 failed, 0 skipped** on the final source (66.7 seconds); guests/members at 390/768/1440px, earlier exploits plus all three corrupt-cache fixtures, navigation, All/Saved/direct access, expiry and zero writes. External network denied by the fixture. Chrome's Windows sandbox crash-handler launch failure required running this synthetic browser process outside the process sandbox, without changing browser security settings.
- Scoped lint: **0 new errors, 0 new warnings**; exact legacy diagnostics preserved.
- TypeScript: `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed.
- Historical reassessment/adoption were recomputed in memory and matched checked-in artifacts exactly: **410 unique records; 322 require fresh evidence, 84 historical registration candidates, 4 historical supported non-Unstop ends; 0 approved writes**. All **401 historical Unstop observations** lack authoritative schedule evidence under the new contract. Historical JSON artifacts were not rewritten.
- Final diff review: two bounded independent reviewers found no remaining release-relevant defect within the approved matrix. This was not an unrestricted vulnerability audit.

## Limits and risk classification

- **Demonstrated production-path reachability:** parser output, projection, selection, synchronization and patch/reconciliation paths are exercised with synthetic provider-shaped data and mocked SDK responses. A contradictory explicit provider lifecycle status is rejected through the fresh parser path. No real provider occurrence or unauthorized production write is claimed.
- **Malformed trusted-data risks:** the three confirmed cached-data failures are reproduced and covered. Invalid records are isolated, historical evidence preserved, and actionable authority withdrawn.
- **Out-of-contract threat:** a fully coherent forgery made through privileged source-metadata access is not authenticated by consistency checks. This boundary does not introduce signing or independently reconstruct a response from its hash.
- **Conservative false negatives:** historical v3 without replay evidence, oversized inventories, unfamiliar stage wording, incomplete windows and conflicting provider claims remain unverified until fresh supported evidence exists. No uncertainty is converted into Ended or Ongoing.
- **Not run:** PostgreSQL/adoption suite, as explicitly prohibited even for synthetic adoption operations; live-provider checks; hosted auth/gateway acceptance; production reads/writes; deployment or GitHub CI. No schema or permission changes were made. Local test results do not establish production readiness.

## Changed-file inventory

- `src/lib/hackathons/sourceEvidence.ts` — new pure identity/date/inventory helpers and shared stage reconciler.
- `src/lib/hackathons/source.ts` — validation contract, metadata/projection/freshness/registration-destination integration.
- `src/lib/hackathons/providers.ts` — bounded evidence, shared validation and confirmed Devfolio UUID binding.
- `src/lib/hackathons/sourceTransport.ts` — validate identity before requests.
- `src/lib/hackathons/lifecycle.ts` — contextual validation and current-clock schedule calculation.
- `src/lib/hackathons/synchronize.ts` — contract-based patches/reconciliation, validated identity recovery and pre-apply checks.
- `src/components/hackathons/SourceInformation.tsx` — validate against the consuming event URL.
- `scripts/reconcile-hackathon-catalog.cjs` — per-record cached validation, diagnostics, history and isolation.
- `scripts/test-aggregator-validation.cjs` — new finite acceptance suite.
- `scripts/test-aggregator-sources.cjs` — consistent identity/time fixtures; prior behavior assertions retained.
- `scripts/test-aggregator-transport.cjs` — confirmed Hack2Skill IDs in robots fixtures.
- `scripts/test-scraper-data-preservation.cjs` — corrupt/verified end backlog recovery cases.
- `qa/fixtures/mission20-hotfix-browser.jsx` — parser-derived source evidence and three new corrupt-cache rows.
- `scripts/test-mission20-discovery-hotfix-browser.cjs` — guest/member assertions for those rows.
- `scripts/qualify-aggregator.cjs` — include finite acceptance suite.
- `scripts/lint-aggregator.cjs` — include pure evidence module in lint scope.
- `docs/qa/aggregator-repair/SHARED-VALIDATION.md` — this decision/result record.
- `docs/qa/aggregator-repair/README.md` — link to this local follow-up.
