# Hackathon aggregator repair — review package

Base/current `main`: `3a0b4d0488128fe730607ae1ef024a3bf52992e1`, independently rechecked on GitHub November 2, 2026. Isolated worktree/branch: `hackathon-aggregator-repair` / `fix/hackathon-aggregator-sync`. The pre-interruption work and private audit material are preserved. Mission 20 #92/#93/#96 are untouched. This package introduces no native registration or C1/C2 adapter dependency.

**GO for independent Draft review; NO-GO for production release.** The application requires an additive source-evidence schema that is not installed. There are no active migration files in this change. The SQL is review-only under `sql/`; no production/staging SQL, backfill, outreach, environment change, merge or deployment occurred.

## Root cause and final behavior

The old importer substituted registration opening dates when event dates were missing, classified provider listing buckets as hackathon proof, applied default 1–4 team sizes, skipped existing URLs, and coupled catalog ingestion to lead creation, Gmail handling and automatic pitch dispatch. A future imported end date could consequently establish a false ongoing event indefinitely. Earlier presentation patches correctly rejected unverified imports but did not repair those writers.

The replacement separates public provider discovery, detail parsing, synchronization and lifecycle evaluation. Stable provider identity plus canonical URL replaces name matching. Existing source-owned events are refreshed under a committed pre-fetch lease and an atomic compare/apply transaction; no database lock spans HTTP. A lost worker leaves `checking`, immediately ineligible for active discovery. Failure/expiry preserves last-known factual details and direct/Saved access. Unsupported or contradictory provider evidence is unresolved, never guessed open or ended.

The shared public projection retains exact source instants separately from coarse existing DATE columns. It cannot overwrite identity, type, owner, approval, archival or participation fields from JSON. Calendar-only deadlines include the full India day. Explicit closure takes precedence over future deadlines. Provider “unknown” or unrecognized registration status cannot be reopened by a date window. Ended or cancelled/conflicting events cannot be promoted.

The core directory tabs are **All Active / Registration Open / Ongoing**. Active means a currently checked hackathon category plus open registration OR an actual ongoing event, excluding ended events. Ongoing does not promise admission. Separate registration deadline and event-date range filters, registration-state filters, search, share URLs and browser history remain available. Saved, explicit All listings / Unverified, Past and legacy tab URLs retain browsing access. Guest and member details use the same source snapshot and keep official registration separate from community participation. The homepage retains builder/team totals and the neutral directory link; its active strip uses the same eligibility logic and frontend clock.

Both catalog entry points are incapable of creating leads, reading Gmail, removing leads or dispatching email. The existing admin action is explicitly a **preview**, with explicit `mode=sync` available only to the existing authorized admin boundary. Daily cron requires CRON_SECRET even in development and performs source synchronization only. Manual outreach routes and their delivery/accounting regressions remain separate.

## Provider coverage and factual boundaries

| Provider | Identity / supported public surface | Mapping and conservative limits |
|---|---|---|
| Unstop | Numeric competition ID from canonical long URL or numeric `/o/ID`; public listing/detail API | Event dates, `regnRequirements`, team bounds and round details are distinct. LIVE is publication status, not ongoing proof. Hackathon taxonomy also needs organizer-description evidence; contradictory workshop/case/contest formats remain unresolved. Awards remain labeled tiers, never the first award represented as a total. |
| Devfolio | UUID bound to published slug; listing's named `fetchAllHackathonTypes` query and detail `__NEXT_DATA__` | Event `starts_at/ends_at`; registration from `hackathon.settings.reg_starts_at/reg_ends_at`; team bounds and HACKATHON category. An official external application URL is preserved safely. Missing currency/organizer/eligibility stays unknown. |
| Hack2Skill | Published listing `_id` bound to canonical event slug; public `/event/{slug}/event-details` | Registration and submission timestamps are never event dates. EVENT is insufficient hackathon proof. Team/mode use published tags. Missing confirmed identity, restricted robots path, registration override and absent actual event dates remain conservative. |

All requests use truthful `HackerMate-Catalog/1.0`, ordinary TLS, GET, per-origin rate limiting, robots checks for canonical event AND API paths, manual redirect refusal, bounded response sizes and timeouts. No authenticated provider/private API, login bypass, paid API or new dependency was added. Missing facts are null; no synthetic 1–4 defaults, invented dates or title/ID exclusion exists. Descriptions are concise original factual summaries linking to the full official rules. Private source bodies, contacts and private function audits are outside Git and CI artifacts.

Not every provider event publishes every requested field. Supported structured values are extracted; absent or unvalidated venue, organizer, eligibility, currency and stages remain missing rather than inferred from submission dates, contacts or promotional text. Hack2Skill EVENT workshops such as Bootcamps remain browsable but excluded from active hackathons.

## Existing-catalog read-only reconciliation

Full per-record proposals and evidence: [RECONCILIATION-PREVIEW.json](RECONCILIATION-PREVIEW.json). Snapshot: 410 approved/unarchived records, **403 Unstop URLs / 5 Devfolio / 2 Hack2Skill**, 0 native / 8 official / 402 external. Snapshot SHA-256 and individual response hashes/check times are in the report. No database writer exists in the preview CLI.

| Classification at source-check time | Count |
|---|---:|
| Confirmed active (open OR ongoing) | 116 |
| Registration open | 85 |
| Ongoing (overlaps registration-open) | 115 |
| Ongoing, registration closed | 31 |
| Confirmed ended, suppression proposed | 208 |
| Unresolved | 86 |
| Total mutually exclusive open / ongoing-closed / ended / unresolved groups | 410 |

The report preserves the completed 410-record collection. Of the 85 registration-open records, 84 are also ongoing; the mutually exclusive totals are 85 open + 31 ongoing/closed + 208 confirmed ended + 86 unresolved. Only previously active candidates were rechecked where final category/raw-status/award evidence was missing. A separate targeted AlgoRush check then established the real Unstop FINISHED publication status, omitted by the initial parser. Only the saved observations rejected for that status were rechecked with the corrected parser. Blocked/unsupported and previously qualified active results were retained; no general provider collection was repeated. Each observation retains its actual parser version/check time. Earlier incomplete first-award proposals are explicitly withheld, not invented or silently adopted. These are historical read-only proposals, not a current production active count or an executable backfill. Every eventual write needs fresh evidence (SQL requires checks within five minutes), a current complete row comparison and separately approved field adoption. Unresolved is neither closed nor active.

**AlgoRush:** source event August 15–30, 2026; registration deadline August 15, 22:51:56 IST; closed; individual 1–1; the Code Contest stage has its own August 16–30 window. The stored December 18 end is proposed for correction, not used as ongoing proof. Its UUID, original URL, Saved, direct and community access remain intact. The regression fixture contains public facts with synthetic descriptions, never a runtime name/UUID exception.

No legacy record is silently adopted by routine cron. A report cannot establish which historical field was edited manually: unproven ownership requires explicit per-field approval. Current production legacy records remain unverified until such adoption or new evidence installation is independently authorized. The preview's 116 proposals do not mean the deployed catalog has already changed.

## Database proposal and release gates

[Pre-change access inventory](HACKATHON-ACCESS-INVENTORY.json): 72 files / 190 direct, joined or SQL dependency expressions, including existing wildcard/spread expressions. Existing SELECT privileges and RLS policies remain unchanged. The only additive column proposed is nullable `hackathons.source_metadata` JSONB, with a shape/size constraint and unique provider identity index.

A BEFORE guard prevents authenticated/anonymous callers from forging source evidence even where table-wide privileges encompass new columns. Existing owner edits remain permitted; changing source fields immediately invalidates promotion and records protected fields. The two source-writer functions are SECURITY INVOKER, fixed search_path/timezone, service-role EXECUTE only, with row/per-source advisory locks, lock_timeout, complete typed expected snapshots and field whitelists. They preserve official/native classification and approval/archive/owner controls, reject identity conflicts, protect partner/organizer/native rows and never delete an event. No existing function body, team schema, registration privilege, RLS predicate or FK is replaced.

The prepared SQL is **not** in `supabase/migrations`. `20261102123742` is a proposal identifier, not an installed ledger version. If authorized later, an operator must reconcile the live ledger and package a separately reviewed active migration. No schema execution is authorized by this PR or its isolated tests.

The [controlled release checklist below](#controlled-legacy-adoption-before-public-cutover) is the single ordered operator sequence. Every production step needs separate authorization; review approval is not execution approval.

Live SELECT-only verification examples for an authorized operator (not executed by this package): inspect `information_schema.columns` for hackathons/partner_configs; `pg_constraint` and `pg_indexes` for hackathons; `pg_policies`; `information_schema.role_table_grants`/`role_column_grants` for service_role, authenticated and anon; `pg_proc` plus `pg_get_functiondef`, owners/prosecdef/proconfig/proacl for proposed names and relevant hackathons triggers; and `supabase_migrations.schema_migrations ORDER BY version DESC`. Report discrepancies before authorizing any migration.

## Scheduling, residual risks and qualification limits

Daily existing Hobby cron: 03:30 UTC, scheduling jitter allowed; maxDuration 300s, complete synchronization deadline 240s, individual HTTP max10s/2MB, 1 request/sec/origin, database requests share the remaining deadline and SQL lock waits max2s. At most 150 source checks/invocation. Relevant adopted candidates precede historical backlog; refresh/discovery slots interleave 4:1 and new candidates round-robin providers. Reported remaining work and failures are observable, not treated as a completed full sweep.

Evidence expires after 26 hours and frontend status timers run every minute. A worker failure immediately leaves checking/failed and removes promotion. Daily polling cannot detect every provider change instantaneously. The bounded queue may not refresh the whole catalog inside 26 hours; unchecked/stale records disappear from active views rather than staying falsely open. Operational capacity/backlog thresholds need acceptance before unfreeze. Provider layout/robots/API changes can reduce coverage; unsupported short links and ambiguous category remain unresolved.

Tests use native disposable PG17.6, actual installed SDK with controlled Auth-free/PostgREST-shaped transport and real source writer SQL, plus actual React/browser components over synthetic data. This is not hosted Supabase Auth/gateway acceptance or an end-to-end test against a live provider registration. No production token is used. Local DB fixtures stop and delete their own temporary cluster in finally; external application requests are denied during regression/browser/build qualification.

Previously qualified results at `5a340874`: **1,668/1,668** offline application regressions (31 selected files), **18** actual PG17.6 boundary/transaction/pipeline checks (one node:test group), **3/3** guest/member browser journeys at 390/768/1440px, **32/32** exact Rack conversion checks, TypeScript, strict scoped lint and guarded production build passed. Zero skipped/cancelled application or browser tests. The build used 3 synthetic reads and 0 mutations. Existing Sentry instrumentation/deprecation/cache warnings remain; external requests were blocked and no deployment occurred.

Exact inventory, source/log/screenshot hashes and command results: [VERIFICATION.json](VERIFICATION.json). Linux CI must be reconciled at the published head; local success is not a green GitHub workflow. Earlier failure logs remain locally available. Existing metadata/XSS, visibility, authentication, membership, registration status/identity, email delivery accounting and Rack assertions remain strict. Changed historical expectations reflect the approved active OR ongoing contract, with explicit tests for each new rule. Scoped lint separately preserves existing detail (5 errors/5 warnings) and outreach tab (12 errors/4 warnings) diagnostics; no broad lint cleanup or rule weakening occurred.

Screenshots are actual synthetic component journeys, visually inspected for readable layouts and no horizontal overflow: [guest390](screenshots/guest-active-390.png), [guest768](screenshots/guest-active-768.png), [member1440](screenshots/member-active-1440.png), [AlgoRush detail390](screenshots/algorush-detail-390.png). They are not production screenshots.


## Publication follow-up

At initial head `9ab2c43`, GitHub Pull Request Validation, Rack and discovery qualification succeeded. Aggregator qualification reported 1650 passed, 0 failed, 1 cancelled: Linux exited the timeout fixture's event loop because AbortSignal.timeout is unreferenced. The fixture now retains a bounded referenced timer until the simulated request finishes, clears it in finally, and preserves the exact abort/no-provider/no-writer/one-request/under-one-second assertions. No application timeout was extended.

Final review also reproduced a legacy canonical-URL alias defect in disposable PostgreSQL: an unadopted Unstop record could be duplicated when a listing's slug changed. The failing regression returned `created` where `requires_adoption` was required. Both orchestration and the atomic SQL boundary now match the numeric provider identity in supported legacy Unstop URLs, including `/o/ID`, and hold legacy rows for adoption instead of inserting an alias. The SQL also binds the canonical URL's numeric ID to the supplied provider ID. No fuzzy name matching, metadata adoption or existing-record conversion is introduced. The read-only 410 snapshot has 0 duplicate supported Unstop identities; no production repair is proposed. Existing owner/native/partner protection, expected snapshots and linked-record preservation remain strict. The final 18 PG checks include the original failed alias schedule and full pipeline.


## Focused independent-review follow-up at ce82618

### Robots precedence evidence

The immutable GitHub file and local `git show ce82618:src/lib/hackathons/sourceTransport.ts` both contain `b.pattern...length - a.pattern...length`, not self-subtraction. The requested new regression cases pass on that reviewed implementation. The comparison is now explicit: compute right-minus-left specificity first, then consider Allow only when that difference is zero. Existing wildcard scoring and matching are retained; source-origin/path restrictions, per-origin pacing, redirect refusal, size limits and all timeout controls are unchanged.

Seventeen added synthetic tests exercise shorter Allow/longer Disallow, the converse, wildcard specificity, equal-specificity ties, both rule orders and an actual detail request stopped at robots before reaching the provider API. All 37 transport tests pass. An in-memory mutation replacing the comparison with right-minus-right fails 7 tests, including the request-level denial; the working source is never mutated. This establishes regression sensitivity without misreporting a defect reproduced at the reviewed SHA. Longest applicable rules and Allow on a tie follow the intended [RFC9309 precedence](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.2.2); this follow-up does not claim broader URI-normalization changes.

### Daily capacity: conditional, not an availability guarantee

The saved report at November 2, 2026, 19:22:27.990 India time contains 116 historically eligible candidates. The old queue predicate checked cached ongoing/open/soon-opening dates without requiring a confirmed hackathon category or successful source check. If all 408 supported observations were hypothetically adopted, 82 unresolved/non-hackathon observations also qualified for priority (198 total). Older unresolved checks could outrank the 116. This was a queue-order defect, not evidence that those 82 were active. No production query, adoption or provider collection was repeated.

The focused guard requires category=hackathon, check_status=ok, no protected fields and neither a reported nor date-derived ended event before considering ongoing/open/registration-opening-within-24h facts. Previously confirmed but expired evidence keeps refresh priority so it can recover; it remains ineligible for public promotion until a successful fresh check. Every excluded priority row remains in the oldest-check-first lower queue. Four refreshes then one discovery, provider round-robin discovery, the 150-check cap, rate limits, robots and all failure/no-outreach controls are unchanged.

| Sustained-backlog capacity | Limit / result |
|---|---|
| Full invocation | 150 checks = 120 refreshes + 30 discoveries |
| Eligible cohort / remaining refresh headroom | 116 / 4; the 116th refresh is scheduled check 144 |
| Complete deadline / stop-starting reserve | 240s / 15s; initial work consumes part of that budget |
| Required prefix budget | Initial overhead + full durations of checks 1–144 <=225s is a conservative release gate |
| Fixed 116-priority cohort with 294 other catalog rows | Only 4 lower refreshes/day: at least 74 invocations for that backlog, before failures/growth; unresolved recovery is slow |

Six new controlled-clock regressions exercise the actual synchronization module, installed Supabase SDK and real SourceTransport with synthetic transports. They seed 116 eligible records and 82 older unresolved/non-hackathon records plus 180 new discovery candidates, keeping discovery backlogged. Initial catalog/discovery/robots/pacing work consumes 15 virtual seconds; each check includes 200ms of database work. Per-origin one-second start spacing remains enabled. The measurements below are **simulated budget behavior, not hosted/provider latency or availability measurements**.

| Detail duration | Total checks | Eligible attempts / successes | Lower rechecks | New discoveries | Virtual elapsed / last eligible finish |
|---|---:|---:|---:|---:|---|
| 1.2s, old guard (reproduced failure) | 150 | 38 / 38 | 82 | 30 | 225s / 223.6s |
| 1.2s, corrected guard | 150 | 116 / 116 | 4 | 30 | 225s / 216.6s |
| 1.6s, corrected guard | 117 | 94 / 94 | 0 | 23 | 225.6s / 225.6s |
| 9.8s, corrected guard | 22 | 18 / 18 | 0 | 4 | 235s / 235s |
| 1.2s, one eligible provider failure | 150 | 116 / 115 | 4 | 30 | 225s / 216.6s |

All scenarios preserve the 150-check/240s boundaries and stop starting work below the existing 15s reserve. The failed eligible check commits failed evidence and cannot count as successful coverage; stale evidence is not served before recovery. Separate assertions cover both reported and factually ended records retaining lower-priority rechecks despite cached open registration. Before the guard change, all five initial new coverage/failure regressions failed (38, 12 or 0 eligible attempts); existing assertions were preserved. The final focused suite passes 17/17 (11 existing +6 new).

**Measured limitation:** successful complete coverage depends on provider/RPC durations, the initial overhead, failures and future eligible growth. More than 120 eligible refreshes with sustained discovery cannot fit. New discoveries can themselves grow tomorrow's cohort. A 10s detail timeout plus database/robots work is not a throughput promise. The daily `30 3 * * *` cron (09:00 India nominal time), Hobby invocation jitter/missed runs and actual function duration allowance still require hosted acceptance. The 26-hour evidence limit remains unchanged; failure/expiry removes promotion. Before unfreeze, independently accept peak cohort size, successful-ID coverage, oldest evidence age and first-refresh margin, or separately approve a capacity change. This follow-up neither changes the schedule nor establishes consistent freshness.

### Controlled legacy adoption before public cutover

This checklist is for a separately authorized operator. **Do not execute it under this PR approval.** There is no bulk adoption executor; the old public general-listings application stays available until the candidate is accepted. Record operator, time, approved SHA/artifact hash and evidence for each gate; stop on any mismatch.

- [ ] **Pin and hold:** approve exact application/SQL hashes from VERIFICATION.json and independently verify backup/recovery. Verify the deployed/main SHA, Vercel automatic-production-deployment hold and rollback target **before any merge**. Freeze/drain the old cron/admin scraper, including its bundled outreach; confirm no in-flight old writer. Keep the hold through acceptance. Never let a merge deploy the new Active view before adoption.
- [ ] **Preflight then separately authorized SQL installation:** reconcile live columns, constraints, indexes, RLS/grants, owners/EXECUTE, triggers/outbound hooks, service-role access and migration ledger against the SQL proposal. Require evidence that catalog DML cannot send email. Only after separate authorization, package the exact reviewed SQL as a ledgered migration and execute with stop-on-error/atomic semantics through the approved loader. Verify the installed definition/hash, column, guards, writer ACL denials and PostgREST schema-cache visibility. The proposal is not an active migration and this checklist does not choose or run a production loader.
- [ ] **Review 410 adopt/hold decisions:** obtain a fresh read-only catalog/control/linked-record snapshot. Record per existing UUID: stable provider identity, adopt/hold, approved source fields, protected fields, current complete row snapshot and approver. Preserve native/partner/organizer protections, official classification, approval/archive and all participation identities. Historical 116/208/86 counts are not current evidence. Held records remain All/Saved/direct browsable.
- [ ] **Execute only individually approved adoption:** from an approved server-side context, collect fresh robots-permitted evidence using the pinned parser/`sourcePatch`; no old scraper, table-wide UPDATE/upsert or NULL legacy ID. Call `apply_hackathon_source_check` with existing `p_id`, verified `p_identity`, `p_observation` checked within five minutes, complete factual `p_patch`, complete current `p_expected` excluding source_metadata, new `p_attempt` UUID and only approved `p_adopt_fields`. Do not omit conflicting facts to evade protection. First adoption does not call begin (it returns requires_adoption); subsequent refreshes use begin/lease/apply. Stage approved historical work before the final fresh eligible-cohort pass.
- [ ] **Read back and stop on ambiguity:** require the same UUID, controls and linked-record counts. Only successful unprotected fresh metadata can qualify. `protected_fields` may persist approved facts but stays unresolved. Conflict/protected/requires_adoption/superseded/failed, or a lost response, requires read-back/reconciliation and renewed review when the approved snapshot changed; never blind replay. Keep unresolved decisions held, not guessed open.
- [ ] **Hosted candidate acceptance before cutover:** with old app still public and writers paused, use an independently authorized protected preview/read-only acceptance. Check exact expected fresh active IDs, registration/event windows, source links, unauthorized writer denial, admin preview-only behavior, no-email behavior, guest/member/Saved/direct/community/Rack and retained UUID/link counts. Fixtures and disposable PG do not establish hosted Supabase/gateway parity. If a genuine positive cohort exists, require nonzero Active; if zero, retain the hold or obtain explicit founder acceptance of empty Active with All accessible.
- [ ] **Capacity and first-refresh signoff, then promote last:** record eligible-priority count, measured complete runtime and successful coverage. Require each eligible record's latest planned first successful refresh + accepted margin < checked_at +26h, accounting for jitter, review delay and within-run position. If inadequate, hold or separately authorize another fresh controlled pass/capacity change. Only then obtain founder approval to promote the pinned SHA and separately unfreeze the new catalog-only cron; observe the first complete successful eligible refresh and age/failure metrics. No paid plan or scheduling change is presumed.
- [ ] **Failure recovery:** keep/freeze writers and deployment hold; retain the old public app before cutover or use the approved application rollback afterward. Preserve additive provenance, existing registrations/teams/Saved and protections. Do not resume the old outreach cron, drop schema/history, extend expiry, fabricate success or bulk-replay corrections. Destructive schema rollback/data restore requires separate authorization.
