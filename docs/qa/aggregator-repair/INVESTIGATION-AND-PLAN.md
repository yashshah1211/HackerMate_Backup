# Hackathon aggregator repair — investigation and implementation proposal

Status: awaiting implementation-plan approval. No implementation, migration, production mutation, synchronization endpoint, outreach, merge or deployment has been performed.

## Baseline and evidence

- Repository main and current READY production deployment both identify `3a0b4d0488128fe730607ae1ef024a3bf52992e1` (merged PR #98). New isolated worktree/branch: `hackathon-aggregator-repair`, `fix/hackathon-aggregator-sync`. Earlier Mission 20 checkouts and private evidence are untouched.
- Four SELECT-only Supabase queries inspected hackathon columns, policies/grants, aggregate counts and public catalog facts. The private ignored snapshot contains 410 approved/non-archived records: 0 native, 8 official, 402 external; provider URLs: 403 Unstop, 5 Devfolio, 2 Hack2Skill. 400 lack registration_end. These are observed counts, not activity classifications.
- `hackathons` has event DATE columns, registration TIMESTAMPTZ columns and factual display fields, but no stable provider identity, source verification/check time, failure state, category authority or field-ownership baseline.
- Existing ai_feedback JSON is editable by authenticated event owners. Reusing it as verification authority would permit client-authored verification. No existing grants or policies have been changed.
- Public provider requests used truthful catalog-audit identification, normal TLS, manual redirects and bounded timeouts. Robots policies were checked. No login, registration, private API, provider restriction bypass or organizer email was used. Private scratch files retain response hashes and selected facts; full public page bodies are not committed.

## Confirmed root causes

1. `scrape-unstop/route.ts` excludes existing URLs/names before fetching details, so it cannot refresh old records. Dedup also conflates annual/name variants.
2. Unstop registration end replaces event end; Hack2Skill registration dates take precedence over event dates. Listing/publication/approval status is conflated with event/admission status.
3. Registration dates/status, provider identity, category proof and team sizes are omitted from the database payload; table defaults can supply 1–4 to an individual event.
4. Detail handling copies long descriptions and extracts contacts, while imports and the daily cron invoke automatic pitch/Gmail/CRM side effects. A catalog run is currently not isolated from outreach.
5. No durable source-check freshness or failure state exists. Main's conservative UI cannot establish verified active imported events from these records.

## Real AlgoRush evidence and preliminary correction preview

Public API: `https://unstop.com/api/public/competition/1737089`, checked November 2, 2026. Response SHA-256 `17536df011e5240886b318111df6f37d4f728d656e6586525d2ddf5c0042aec5`.

| Field | Stored | Published source |
| --- | --- | --- |
| Event start | 2026-08-15 | 2026-08-15T00:00:00+05:30 |
| Event end | 2026-12-18 | 2026-08-30T07:05:00+05:30 |
| Registration start | NULL | 2026-08-15T00:00:00+05:30 |
| Registration end | NULL | 2026-08-15T22:51:56+05:30 |
| Registration status | NULL | FINISHED |
| Team size | 1–4 | 1–1 |

The source separately provides an August 16–30 assessment stage. Stage times must not replace the event window. The published type is hackathons but subtype is online_coding_challenge: category evidence must be interpreted conservatively, not inferred from its URL or title alone. Irrespective of category qualification, the published event window has ended, so AlgoRush must not be active. This is a proposed, unapplied correction; the exact historical origin of December 18 remains unknown.

The remaining 409 records have a baseline snapshot, not yet a full per-record provider reconciliation. No active/ended count is invented before that pass. Build with AI: Bootcamps is separately flagged by founder review as educational; a bounded registration window alone is not category proof.

## Minimal schema proposal — explain before introducing

Recommend one nullable, **server-owned `source_metadata` JSONB column** on hackathons rather than a parallel catalog or new service. Existing factual columns remain the display data. Metadata holds validated provider identity, category/status evidence, checked/verified/expiry times, last check outcome, parser/evidence hashes, field-ownership hashes/protection flags and a bounded attempt identifier. It must not contain credentials, organizer emails, full copyrighted bodies or private audit notes.

A migration would also add write-protection/invalidation logic, provider-identity uniqueness and a narrowly granted service-only transactional synchronization function. Ordinary clients must be unable to INSERT/UPDATE forged source verification. Authorized editorial edits must remain allowed, become protected, and invalidate conflicting source verification. The sync transaction locks/rechecks current values and applies only source-owned approved fields, preserving manual changes and record identity.

This schema work is proposed only. Before any migration is written, inventory every hackathons query/join and requested column across the repository, inspect dependencies and qualify privilege/trigger behavior on disposable PostgreSQL 17. No production/staging migration will be applied. If the column design cannot satisfy those checks without broad existing permission changes, stop and present the narrower alternative before expanding scope.

## Approved-future implementation sequence

1. **Provider contracts.** Extract typed source-specific adapters from the existing scraper. Read only compliant public listings/details with provider-host allowlists, robots checks, bounded bodies/timeouts, rate limits and no authentication bypass. Pin factual fixtures to real observed schemas. Keep event, registration and stage dates separate, preserve timezone/precision, use explicit provider closure over a future deadline, and leave missing/contradictory facts unresolved. Category proof requires documented source evidence; publication LIVE/APPROVED and names/URLs alone are insufficient. Generate concise original factual summaries with official links rather than copied page bodies.
2. **Discovery versus refresh.** Match stable provider identity, not fuzzy names. Create new genuine listings; refresh adopted source-owned existing rows idempotently under an atomic recheck. Keep UUIDs, registrations, teams, approval/archive/type controls and manual/partner/organizer fields. Do not delete records or treat source disappearance as closure. Use verified ended state to suppress active discovery while retaining Saved/direct/history; propose archive decisions in the dry run without silently changing manual archival controls.
3. **Outreach separation.** Make catalog synchronization and its existing daily route incapable of invoking Gmail, organizer lead creation/cleanup or pitch sending. Preserve separately authorized manual outreach controls. Update admin catalog action/result wording and regression contracts explicitly; do not silently reinterpret a send-email action as sync or vice versa.
4. **Shared public lifecycle.** Directory, landing and details consume the same synchronized facts plus protected source freshness. Active means verified hackathon category AND not ended AND (registration currently open OR event currently ongoing). Closed registration can coexist with ongoing event visibility, with an honest badge and official action destination. Unavailable/expired/conflicting evidence is not active. Recalculate deadline/event boundaries in the existing frontend timer. Replace core tabs with All Active / Registration Open / Ongoing; retain Saved/direct and legacy URL compatibility separately.
5. **Read-only reconciliation.** Process all 410 snapshot identities against allowed source reads. Produce per-field proposed before/after values, source paths/response hashes/times, protected-field conflicts, active/open/ongoing-closed/ended/unresolved groups and proposed archive/suppression decisions. Mandatory AlgoRush real fixture; no guessed missing values. Existing records without ownership provenance require explicit adoption/field approval in the dry-run plan. The scheduled writer must not silently adopt or bulk-correct this legacy catalog. Any production application of that plan requires separate founder approval.
6. **Qualification and one Draft PR.** Test adapters, refresh identity/idempotence, manual/partner preservation, source failure/expiry, closure override, ongoing-closed events, ended suppression, category conflicts, timezone/date-only boundaries, spoofed metadata, concurrent editorial updates and zero outreach calls. Use the existing native disposable PG17 infrastructure for database behavior; no Docker or new project. Run TypeScript, scoped lint, relevant existing regressions, guarded build and real browser/Rack journeys. Produce exact file inventory, evidence, limits and release ordering in one new Draft PR against main.

## Scheduling and freshness assumptions for approval

- Vercel team inspection reports **Hobby**. Keep the existing daily schedule; no paid dependency, plan upgrade, new hosting service or environment changes.
- Implement a complete wall-clock/request budget, provider rate limits and resumable batches. Do not promise a 410-detail request sweep fits one invocation. Prioritize adopted active/expiring records and report coverage/backlog explicitly.
- Proposed maximum source-evidence age: **26 hours**, allowing daily cron scheduling jitter. A failed check immediately removes active eligibility while retaining last known factual values; a missed job expires evidence automatically. Exact deadlines/end dates still expire in the browser without waiting for cron. Provider-side changes that precede a published boundary cannot be guaranteed real-time on daily polling.
- The initial full reconciliation may run locally in read-only mode outside the serverless invocation limit. Unchecked/blocked/missing/conflicting records remain unresolved, not guessed active or ended.
- No source refresh, migration or legacy backfill is executed in production from this work. The proposed schema and application changes are reviewed together, but eventual migration/backfill/deployment approvals remain separate.

## Decisions requiring confirmation now

Approve this implementation scope, including preparing (not applying) the minimal protected source-metadata migration and daily bounded/fail-closed freshness model. No production data write or rollout approval is requested. Complete per-provider field mappings, exact SQL and isolated verification remain implementation deliverables, not claims already qualified by this investigation.

References: [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing), [function duration limits](https://vercel.com/docs/functions/configuring-functions/duration), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Unstop public-access policy](https://unstop.com/robots.txt).


## Resume boundary and final implementation notes

The founder approved the implementation plan, but the subsequent resume instruction explicitly prohibits active migrations. The prepared additive SQL therefore lives only under `docs/qa/aggregator-repair/sql/`, not `supabase/migrations`. No schema or production mutation was executed. The final qualified implementation/results supersede preliminary research counts: see README.md and VERIFICATION.json.
