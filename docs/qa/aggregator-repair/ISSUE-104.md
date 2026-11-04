# Issue 104 — verified ongoing discovery

## Read-only investigation (2026-11-04 10:03 UTC)

Base: `303f485` (latest main when fetched). No production writes, backups,
deployment, infrastructure changes or paid API calls are part of this work.

Public PostgREST SELECT, filtered to approved, unarchived external/official
listings, returned 420 records. Counts are an observation, never application constants:

| Provider | Listings | Fresh verified metadata | Verified schedules | Verified ongoing |
| --- | ---: | ---: | ---: | ---: |
| Unstop | 408 | 51 | 1 | 0 |
| Devfolio | 9 | 4 | 4 | 0 |
| Hack2Skill | 2 | 0 | 0 | 0 |
| Other | 1 | 0 | 0 | 0 |

These counts describe catalog coverage, not the number of real-world events.
Uninspected records remain unknown; no reason is inferred from imported dates.

Reproduce sample evidence with `SourceTransport.detail(identifySource(url))`;
all requests used HackerMate-Catalog/1.0, robots checks, manual redirect denial,
one-second origin pacing, response-size and timeout limits. Inspect only public
competition `details`, `rounds[].details[]`, status and registration fields.

| Public competition endpoint | Evidence gap | Disposition |
| --- | --- | --- |
| `https://unstop.com/api/public/competition/1777958` (Aegython) | No rounds; organizer explicitly says dates/deadlines pending | Missing build stages; unknown exact schedule |
| `https://unstop.com/api/public/competition/1786809` (Hack-a-Sol) | Organizer says November 22–24, 2026 and 36 hours; rounds concern screening/shortlisting | Date-only ambiguity and mixed inventory; not current build proof |
| `https://unstop.com/api/public/competition/1783775` (CodeNova) | November 11–22 prose; PDF submission, November 13–16 development, November 19–22 improvement | Disjoint/mixed rounds; never use overall envelope |
| `https://unstop.com/api/public/competition/1764747` (CodeNexus) | November 4–7 development and November 10–13 improvement, with earlier PDF qualifier; generic dates lack explicit timezone | Current build candidate, but unresolved full schedule; no envelope across gap |

No contradictory exact organizer instants were established in these four samples.
Contradictions are covered by adversarial fixtures rather than invented live examples.

Discovery probe: `/api/public/opportunity/search-result?opportunity=hackathons&per_page=30&page=1&oppstatus=closed`
returned 29 rows, total 76, including closed-registration opportunities. `open`
returned 30/168. `upcoming` and an exploratory unsupported `recent` value both
returned total 6920, so these status labels must not be interpreted as lifecycle
proof; `recent` will not be used. The closed query is a bounded candidate source.
`https://devfolio.co/hackathons` exposed open=9, upcoming=4, past=4, featured=0
under `fetchAllHackathonTypes`. The finite past bucket can supply closed candidates;
only the individual hackathon detail can verify its actual schedule.
Hack2Skill's public list endpoint responded successfully; detail availability,
robots restrictions and absent event dates must be reported individually.

## Implementation decisions

- Extend deterministic, exact-time organizer assertions and replay their evidence
  through the same validator. Preserve the old vetted stage basis. Unknown markup,
  timezone, dates, conflicting text and incomplete/disjoint inventory stay held.
- Add closed/past candidate discovery within existing transport budgets and dedupe.
  Feed labels never establish ongoing or reopen registrations.
- Keep reviewed RPCs and metadata-only legacy/partner adoption; no schema change
  is planned. Improve run coverage and hold reasons without changing scheduling.
- Test fixed clocks, parser/validator agreement, false positives, worker admission,
  native PostgreSQL preservation and Chrome at 390/768/1440.

## Implemented contract and limits

`aggregator-10` emits `reconciled_hackathon_organizer_instants_v4` for new
Unstop schedules. The validator replays both the retained original organizer
text (maximum 20,000 characters) and complete retained round inventory. It
continues replaying the existing vetted v3 basis. New calendar-only event
boundaries are held across all three parsers; registration calendar semantics
and native event behavior are unchanged.

The new, deliberately narrow grammar accepts a complete statement such as
`The actual hackathon build takes place from 5 Nov 2026, 12:30 AM IST to 5 Nov 2026, 2:30 AM IST.`
or `Hackathon Build Dates:` followed by the same complete range. Both endpoints
require year, time, and explicit India timezone. The activity title, structured
stage instants, visibility, parent fields, status and complete inventory must
corroborate it. Simple emphasis/paragraph/list markup is allowed; links, hidden
markup, unsupported timezones, additional clauses and truncation are not parsed
as proof. This is not general prose understanding. Generic organizer dates,
dates without build-stage corroboration and disjoint qualifier/final envelopes
remain unverified. No target count is imposed.

Discovery adds at most three 30-item Unstop closed pages alongside the existing
open/upcoming pages (nine feed requests maximum). Devfolio uses at most 90 open,
90 upcoming and 30 public past candidates from its single directory response.
Hack2Skill retains its existing public list request. All still share the existing
transport deadline, one-second origin pacing, 10-second request timeout, 2 MiB
response cap, allowlists, robots checks and redirect denial. Identity collisions
are held instead of overwritten. Closed-feed failure does not drop other feeds.
The existing worker limits remain 145 refresh / 24 legacy / 18 discovery checks
and 230 seconds per phase; provider rotation is unchanged. The sync endpoint
now also requires open registration or a verified ongoing schedule for new rows.

The reviewed RPC writers are unchanged. No migration, grants, RLS changes or
production adoption were performed. In particular, the metadata-only writer's
protected event fields remain protected: legacy/partner rows with those locks
cannot acquire public ongoing authority merely from this parser update. Any
change to that policy needs separate review; no lock is removed here.

Worker reports separate `observed_evidence` from `catalog_evidence`: dry-run
candidate checks are not presented as persisted catalog improvements. Each
includes verified schedule/ongoing totals, per-provider totals, primary missing
schedule reasons, held conflicts and a coverage explanation. Source failures
and discovery feed failures preserve provider/reason information.
`accepted_closed_registration_ongoing` counts admitted new candidates in dry-run
and successfully created ones in apply. Existing `created` dry-run semantics
are preserved; `dry_run_no_writes` makes that distinction explicit.

## Follow-up provider findings (2026-11-04 10:17 UTC)

See `ISSUE-104-EVIDENCE.json` for timestamped URLs, hashes and before/after
sample results. The four issue examples still have no verified whole build
window after replay; this is an explicit limitation, not a fabricated success.

- Eight closed-feed Unstop detail checks: four mixed/unsupported stage
  inventories and four missing build stages. Five of these eight also failed
  hackathon category verification. The feed includes non-hackathon competitions.
- All four Devfolio past-bucket detail pages were accessible and confirmed
  **ended**, closed-registration hackathons. They are discovery candidates but
  correctly fail new ongoing admission.
- Four Hack2Skill details (`startupbuildathon2026`,
  `watchfacedesignchallenge2026`, `codeverse2025`,
  `fit_fest-hackathon-2026`) were accessible but published no actual event
  start/end fields. Two had closed registrations. Submission or registration
  dates were not substituted.
- No robots refusal or missing detail endpoint occurred in this bounded live
  sample. This is not a guarantee of provider-wide access. Existing transport
  tests cover 301/302/307, 401/403/429/500, robots refusal/unavailability, size
  limits and budget exhaustion; new tests cover isolated closed-feed failure.
- Unsupported Unstop `recent` and unreliable `upcoming` bucket semantics were
  investigated; only the observed public `closed` query was added. There is no
  unrestricted crawling, login bypass, guessed endpoint or alternate transport.

## Verification

- Baseline: 176 source/validation/worker tests passed before changes. The initial
  new suite reproduced missing organizer extraction and date-only acceptance.
- `node scripts/qualify-aggregator.cjs`: **1,949 passed**, zero failures. Includes
  the new worker/parser suite and existing unattended tests. Final additional
  split-markup and non-string evidence-marker regressions passed with the targeted suite below.
- Targeted source, evidence, validation, transport and ongoing suites:
  **313 passed**, including worker dry-run with zero writes and simulated apply,
  closed ongoing admission, imported overlap rejection, freshness, protected
  fields, UUID collision and exact IST/UTC transitions.
- `tsc --noEmit --incremental false --pretty false`: passed.
- `node scripts/lint-aggregator.cjs`: 45 scoped files clean; the two deliberately
  grandfathered legacy UI files match their exact established diagnostics.
- Full `eslint .`: **196 errors / 92 warnings**, exactly matching base
  `303f485` by rule, severity, message and source line; zero new diagnostics.
  Full lint therefore remains nonzero due to existing repository debt.
- Native PostgreSQL **17.6**, disposable loopback cluster: **38 grouped checks
  passed**, including the new organizer-instant parser → SDK → orchestrator →
  SQL writer → public reader case with closed registration, plus original
  relationship/partner preservation, concurrency, failure and rollback checks.
  Zero production connections/writes; cleanup runs in `finally`.
- Real sandboxed Chrome, fixture transport: guest/member journeys passed at
  **390, 768 and 1440 px**, no unexpected requests or writes. The closed ongoing
  case uses the new organizer grammar through the actual parser, appears in
  Available now/Happening now, and stays out of Registration Open. Mobile
  screenshot inspected; no horizontal overflow.

Windows initially blocked Chrome process startup and PostgreSQL WAL rename
inside the execution sandbox. Reruns outside that process sandbox passed with
Chrome's own sandbox, fixture network denial, and loopback-only PG isolation
still enabled. No Docker or hosted test project was used.

## Production rollout plan — not executed

1. Keep the PR Draft. Obtain independent review of the grammar, persisted v3/v4
   compatibility, admission, protection semantics and provider coverage limits.
2. Require explicit production authorization before merge/release. Main's
   unattended worker is already enabled: merging changes its next scheduled
   run. Coordinate the application reader release before v4 writer execution;
   do not merge speculatively or alter current infrastructure to test this PR.
3. With that authorization, run an existing-workflow read-only dry-run on the
   reviewed code. Compare fresh source coverage, conflicts, proposed creations,
   registration states, protected fields and relationship counts. Do not replay
   this report's historical payloads as fresh evidence or export a backup.
4. Separately authorize controlled production adoption/apply. Verify exact
   UUIDs, organizer fields, partner configs, registrations, saved/team links and
   actual page filters before/after. A new closed-registration listing requires
   fresh verified ongoing evidence; zero new ongoing events is a valid outcome.
5. Observe the next existing scheduled runs, freshness expiry and failure/backlog
   reports. If rollback is authorized, revert application/worker code without
   deleting rows or relationships. An older reader does not understand v4 and
   will withhold its event authority; validate that conservative fallback. No
   migration rollback or infrastructure change is required by this PR.
