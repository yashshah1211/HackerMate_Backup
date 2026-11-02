# Imported opportunity uncertainty — immediate presentation correction

Base: latest `origin/main` **afcc0da97b8d39cc7a9f202431e19c39d4f4bc69**, the deployed #97 correction. New isolated branch `hotfix/mission20-unverified-opportunities`. This PR contains presentation/read filtering and its qualification only. No importer, outreach, registration writer/API, migration, privilege, schema, environment, dependency or production data changes.

## Reproduce the actual failure first

`qa/fixtures/mission20-unverified/algorush.json` retains the exact supplied public ID, URL, name, August 15 / December 18 stored dates, NULL registration fields and 1–4 team size. It adds only the synthetic public-record shape needed to replay the imported external event. It is an in-memory fixture, never a live test entity or a one-off runtime exception.

Against unchanged main, the initial six acceptance cases produced **four failures**: AlgoRush was `ongoing` and appeared in default recommendations; other imported providers behaved the same way. Two preservation cases passed. The before-fix log/hash is retained in VERIFICATION.json. The earlier hotfix only excluded confirmed closure; it admitted unknown registration availability and treated stored dates as authoritative. Its positive synthetic fixtures did not cover this production ambiguity.

## Conservative immediate behavior

- Homepage removes the event total from the hero, its client props/server data and the count query. Registered-builder and team-record counts remain. Numeric “All N listed” becomes **Browse hackathons**, available even when the opportunity strip is empty.
- `listedEventState` performs only raw calendar classification for explicit historical browsing. `eventState` no longer treats imported/null/unknown origins as verified upcoming/ongoing/ended schedules. Existing native/official classifications retain their curated schedule behavior; no stored type is changed and legacy official remains community participation.
- Default external recommendations require positive recorded registration evidence **and a valid future registration deadline**. An unbounded imported `open` string is insufficient. All 132 synthetic missing-deadline entries are excluded even when half claim open. No missing value is converted to a guessed closed status or invented event end.
- **All / Unverified** is an explicit, shareable tab (`tab=all`), retaining open, closed and uncertain public records. Saved, direct links and explicit registration filters still work. Past uses listed past dates as a browsing filter, while imported cards continue to say their schedule is unverified.
- Cards and both detail views label imported schedules and listed dates unverified; team-size defaults are also marked unverified on details. Positive imported registration metadata says **Registration listed as open**, not provider verification. Unknown availability remains unverified. Official URLs, the existing community actions, identity/authorization, privacy, partner portals, saved records and confirmation behavior are unchanged.
- The landing strip is limited to curated upcoming schedules with eligible admission metadata. It does not promote unverified external date windows as upcoming. Its existing bounded eight-candidate query/Unstop exception remains; it may show fewer or no event cards while the neutral browse link remains visible.

Trust here is the existing native/official classification, not a website substring, college string, event name or the AlgoRush UUID. Dedicated partner portal facts/identity/navigation and community flows are unchanged. Provider freshness and field-level authority cannot be established from this schema; that remains a separate source-observation design, not an invented verified timestamp.

## Qualification

Exact current inventory, source/log/screenshot hashes and publication-time results: [VERIFICATION.json](VERIFICATION.json). Final-head CI results are recorded in the new Draft PR rather than predicted from local success.

Local application selection: **397/397** passed, zero failed/skipped. It includes the exact record, all three provider origins, null origin, positive bounded registration, confirmed closure, missing-provider metadata, the synthetic 132-record cohort, trusted official/native behavior, raw-calendar history, public direct lookup, hero count/footer removal, existing metadata/visibility/auth/navigation/bookmark/community cases and India deadline boundaries.

Existing calendar/ranking/auth fixtures now explicitly identify their curated official contract. New imported-provider cases assert uncertainty and exclusion instead of preserving the erroneous assumption that external dates are trusted. No assertion is deleted/relaxed to hide a failure; existing native/community identity/status/capacity/record-preservation assertions remain strict.

Browser journeys use actual hero/directory/detail components, sandboxed Chrome, the existing process network guard and synthetic transport at **390, 768 and 1440px**. Each guest/member journey proves default omission, an actual All / Unverified tab click, explicit unknown filtering, direct AlgoRush access and official URL preservation, Saved preservation, no “Ongoing” label for AlgoRush, unverified date/team labels, no private guest reads, zero mutations and no horizontal overflow. Hero browser checks retain builder/team figures, remove the event total/numeric footer, and click Browse back to discovery. Existing Rack conversion browser: **32/32** with unchanged assertions. Screenshots are visually inspected and retained only as synthetic browser artifacts.

TypeScript, guarded production build and scoped lint pass. The lint runner checks 12 clean source/test files and compares the complete changed legacy detail page with the exact new main base: **5 existing errors / 5 warnings remain**, with no new, removed or altered diagnostics. Other changed legacy tests/fixture passed direct lint. No lint rule is weakened. Existing build warnings remain unrelated to this correction.

## Separately scoped source-refresh work

The read-only importer report, source hashes, **4/4** offline diagnostics, SELECT-only independent reconciliation request and review-only proposed AlgoRush correction set are retained separately in the workspace directory `audit-artifacts/mission20-source-refresh-afcc0da/`. They are **not** importer implementation and are not included in this presentation PR. No source refresh endpoint, live scraper, Gmail or email operation was run.

Confirmed source-code issues: Unstop registration dates can become event dates; Hack2Skill prefers registration dates as event dates; registration/team/provenance fields are omitted; database defaults supply 1–4; existing URL/name dedup skips detail refresh; no evidence-expiry protocol exists; importer/cron are coupled to outreach. The historical response/edit that produced AlgoRush's December end date is unproven. The supplied official-site findings are founder audit evidence; the independent web view had no readable provider body. Backfill requires raw source/editorial reconciliation and separate approval.

## Release decision and limits

**GO for independent review of this immediate presentation correction after final-head CI passes.** Founder approval is still required for any merge/deployment. This patch requires no migration or new RPC. It intentionally reduces active recommendations when imported evidence is insufficient; All / Unverified is the review route. Already open tabs retain the existing 60-second classification refresh, and external metadata edits need the existing reload. No new hosted-service acceptance is claimed.

**NO-GO for importer implementation, production correction/backfill or source-refresh endpoint execution.** The separately proposed registration/team corrections must not be applied from this PR. Source snapshots, field ownership/precedence, persistence of verified timestamps, freshness limits, protected/manual/partner handling, deterministic dry-run review and an independently authorized writer/recovery plan remain decisions for that scope. No registration/team/event identity is rewritten or deleted.
