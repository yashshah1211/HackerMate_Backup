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

Future release prerequisites, each requiring independent approval:

1. Verify live columns/constraints, partner configuration shape, service-role privileges, new-name absence and latest migration ledger against the review SQL. Verify the exact approved deployed/main SHA. Preserve backup/restore evidence and current row hashes/linked-record counts.
2. Establish and independently verify a Vercel production deployment hold before merging. Merges to main may automatically deploy: do not merge first and apply SQL afterward. Drain/freeze the old catalog cron/admin writer so the old upsert/outreach pipeline cannot race the new writer or send emails during transition. This package does not change those production controls.
3. Separately authorize and install the additive schema/functions atomically, with no application deployment in the incompatible interval. The existing app can read the added nullable column; the new app requires it. New schema/function absence fails closed with controlled errors and no raw-write fallback. PostgREST schema cache/function visibility must be accepted independently.
4. Deploy only the approved application SHA after schema/permissions acceptance. Keep catalog execution paused while verifying preview-only admin behavior, missing/invalid authorization denial, genuine new/adopted refresh, Saved/direct/community/Rack and builder/team counts. Native registration stays on its existing production path; this is not approval for C1/C2 migration.
5. Review the 410 per-field proposals, editorial conflicts, category uncertainty and withheld prize fields. Explicitly authorize only adopted fields after a fresh source check/current-row match; no bulk backfill is implied. Preserve approval/archive/type decisions and linked record counts.
6. Independently authorize scheduled source writes/unpause only after no-email acceptance, request budget/backlog monitoring and stale-client/writer checks. Existing daily Hobby schedule is unchanged. No paid plan or environment change is presumed.
7. On failure, keep cron/admin synchronization frozen and active evidence fail-closed. Roll back the application under the verified deployment hold, retaining the additive column/functions and source history until a separately reviewed rollback is accepted. Do not blindly drop provenance or replay updates. **The old cron includes automatic outreach: never resume it accidentally through rollback.** Any destructive schema rollback or data restoration needs independent approval.

Live SELECT-only verification examples for an authorized operator (not executed by this package): inspect `information_schema.columns` for hackathons/partner_configs; `pg_constraint` and `pg_indexes` for hackathons; `pg_policies`; `information_schema.role_table_grants`/`role_column_grants` for service_role, authenticated and anon; `pg_proc` plus `pg_get_functiondef`, owners/prosecdef/proconfig/proacl for proposed names and relevant hackathons triggers; and `supabase_migrations.schema_migrations ORDER BY version DESC`. Report discrepancies before authorizing any migration.

## Scheduling, residual risks and qualification limits

Daily existing Hobby cron: 03:30 UTC, scheduling jitter allowed; maxDuration 300s, complete synchronization deadline 240s, individual HTTP max10s/2MB, 1 request/sec/origin, database requests share the remaining deadline and SQL lock waits max2s. At most 150 source checks/invocation. Relevant adopted candidates precede historical backlog; refresh/discovery slots interleave 4:1 and new candidates round-robin providers. Reported remaining work and failures are observable, not treated as a completed full sweep.

Evidence expires after 26 hours and frontend status timers run every minute. A worker failure immediately leaves checking/failed and removes promotion. Daily polling cannot detect every provider change instantaneously. The bounded queue may not refresh the whole catalog inside 26 hours; unchecked/stale records disappear from active views rather than staying falsely open. Operational capacity/backlog thresholds need acceptance before unfreeze. Provider layout/robots/API changes can reduce coverage; unsupported short links and ambiguous category remain unresolved.

Tests use native disposable PG17.6, actual installed SDK with controlled Auth-free/PostgREST-shaped transport and real source writer SQL, plus actual React/browser components over synthetic data. This is not hosted Supabase Auth/gateway acceptance or an end-to-end test against a live provider registration. No production token is used. Local DB fixtures stop and delete their own temporary cluster in finally; external application requests are denied during regression/browser/build qualification.

Local final results: **1,651/1,651** offline application regressions (31 selected files), **17** actual PG17.6 boundary/transaction/pipeline checks (one node:test group), **3/3** guest/member browser journeys at 390/768/1440px, **32/32** exact Rack conversion checks, TypeScript, strict scoped lint and guarded production build passed. Zero skipped/cancelled application or browser tests. The build used 3 synthetic reads and 0 mutations. Existing Sentry instrumentation/deprecation/cache warnings remain; external requests were blocked and no deployment occurred.

Exact inventory, source/log/screenshot hashes and command results: [VERIFICATION.json](VERIFICATION.json). Linux CI must be reconciled at the published head; local success is not a green GitHub workflow. Earlier failure logs remain locally available. Existing metadata/XSS, visibility, authentication, membership, registration status/identity, email delivery accounting and Rack assertions remain strict. Changed historical expectations reflect the approved active OR ongoing contract, with explicit tests for each new rule. Scoped lint separately preserves existing detail (5 errors/5 warnings) and outreach tab (12 errors/4 warnings) diagnostics; no broad lint cleanup or rule weakening occurred.

Screenshots are actual synthetic component journeys, visually inspected for readable layouts and no horizontal overflow: [guest390](screenshots/guest-active-390.png), [guest768](screenshots/guest-active-768.png), [member1440](screenshots/member-active-1440.png), [AlgoRush detail390](screenshots/algorush-detail-390.png). They are not production screenshots.
