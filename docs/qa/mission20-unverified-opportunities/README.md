# Imported opportunity uncertainty — immediate presentation correction

Base: latest `origin/main` **afcc0da97b8d39cc7a9f202431e19c39d4f4bc69**, the deployed #97 correction. New isolated branch `hotfix/mission20-unverified-opportunities`. This PR contains presentation/read filtering and its qualification only. No importer, outreach, registration writer/API, migration, privilege, schema, environment, dependency or production data changes.

## Reproduce the actual failure first

`qa/fixtures/mission20-unverified/algorush.json` retains the exact supplied public ID, URL, name, August 15 / December 18 stored dates, NULL registration fields and 1–4 team size. It adds only the synthetic public-record shape needed to replay the imported external event. It is an in-memory fixture, never a live test entity or a one-off runtime exception.

Against unchanged main, the initial six acceptance cases produced **four failures**: AlgoRush was `ongoing` and appeared in default recommendations; other imported providers behaved the same way. Two preservation cases passed. The before-fix log/hash is retained in VERIFICATION.json. The earlier hotfix only excluded confirmed closure; it admitted unknown registration availability and treated stored dates as authoritative. Its positive synthetic fixtures did not cover this production ambiguity.

## Conservative immediate behavior

- Homepage removes the event total from the hero, its client props/server data and the count query. Registered-builder and team-record counts remain. Numeric “All N listed” becomes **Browse hackathons**, available even when the opportunity strip is empty.
- `listedEventState` performs only raw calendar classification for explicit historical browsing. `eventState` no longer treats imported/null/unknown origins as verified upcoming/ongoing/ended schedules. Only native events retain their hosted schedule behavior. Official is a legacy non-native classification, not a verification signal; no stored type is changed and official remains community participation.
- Opportunities / For you excludes **every non-native listing**, including official and bounded imported registration windows. The deployed schema does not establish independent source freshness or a verified hackathon category. Organizer IDs, source URLs, keywords, recent row timestamps and dates do not resolve that gap. No missing value is converted to a guessed closed status or invented event end.
- **All / Unverified** is the default Explore listings view for `/hackathons` with no tab, retaining open, closed and uncertain public records. Explicit `tab=all` also remains valid; **Opportunities / For you** is separately addressable with `tab=recommended`. Saved, direct links and explicit registration filters still work. Past uses listed past dates as a browsing filter, while imported cards continue to say their schedule is unverified.
- Cards and both detail views label imported schedules and listed dates unverified; team-size defaults are also marked unverified on details. Positive imported registration metadata says **Registration listed as open**, not provider verification. Unknown availability remains unverified. Official URLs, the existing community actions, identity/authorization, privacy, partner portals, saved records and confirmation behavior are unchanged.
- The landing strip is limited to native upcoming schedules with eligible admission metadata. It does not promote unverified external date windows as upcoming. Its existing bounded eight-candidate query/Unstop exception remains; it may show fewer or no event cards while the neutral browse link remains visible.

Native denotes events hosted here; it is not a guarantee of independently verified registration success. Official/imported classifications supply no independent schedule or category trust. No website substring, college string, event name, organizer ID or AlgoRush UUID establishes verification. Dedicated partner portal facts/identity/navigation and community flows are unchanged. Provider freshness and field-level authority cannot be established from this schema; that remains a separate source-observation design, not an invented verified timestamp.

## Qualification

Exact current inventory, source/log/screenshot hashes and publication-time results: [VERIFICATION.json](VERIFICATION.json). Final-head CI results are recorded in the new Draft PR rather than predicted from local success.

Local application selection: **465/465** passed, zero failed/skipped. It includes the exact record, all three provider origins, null origin, positive bounded registration, confirmed closure, missing-provider metadata, the synthetic 132-record cohort, native behavior and unverified official imports, raw-calendar history, public direct lookup, hero count/footer removal, existing metadata/visibility/auth/navigation/bookmark/community cases and India deadline boundaries.

Existing calendar/ranking/auth fixtures now explicitly identify their native calendar contract. New imported-provider cases assert uncertainty and exclusion instead of preserving the erroneous assumption that external dates are trusted. No assertion is deleted/relaxed to hide a failure; existing native/community identity/status/capacity/record-preservation assertions remain strict.

Browser journeys use actual hero/directory/detail components, sandboxed Chrome, the existing process network guard and synthetic transport at **390, 768 and 1440px**. Each guest/member journey proves default omission, an actual All / Unverified tab click, explicit unknown filtering, direct AlgoRush access and official URL preservation, Saved preservation, no “Ongoing” label for AlgoRush, unverified date/team labels, no private guest reads, zero mutations and no horizontal overflow. Official imports and Bootcamps also retain direct access, Saved and community entry controls. Hero browser checks retain builder/team figures, remove the event total/numeric footer, and click Browse back to discovery. Existing Rack conversion browser: **32/32** with unchanged assertions. Screenshots are visually inspected and retained only as synthetic browser artifacts. A Windows sandbox build initially failed with EPERM while creating .next/types/app/api; its log is retained separately from the permitted guarded-build retry.

TypeScript, guarded production build and scoped lint pass. The lint runner checks 12 clean source/test files and compares the complete changed legacy detail page with the exact new main base: **5 existing errors / 5 warnings remain**, with no new, removed or altered diagnostics. Other changed legacy tests/fixture passed direct lint. No lint rule is weakened. Existing build warnings remain unrelated to this correction.

## Independent-review follow-up: official and workshop ambiguity

Reviewed head before this correction: `5a9808e5cbb05e7a03d2ccdb592dbd055c12bb20`. Three added acceptance cases fail against it (13 cases: 10 pass / 3 fail): eight official-pattern imports are trusted, a bounded workshop is promoted, and a synthetic cohort matching the production aggregate has ten unsupported recommendations. The fixture bodies/dates are synthetic patterns, not a fabricated live catalog or provider snapshot.

The founder supplied a fresh independent read-only production snapshot on **November 2, 2026**: **410 approved, non-archived public listings; 0 native, 8 official, 402 external**. All eight official records are Unstop-linked with no organizer ID. Only two external records have bounded registration evidence; the provider categorizes Build with AI: Bootcamps as an educational workshop. That evidence cannot establish current hackathon admission. No production query or provider fetch was performed for this follow-up.

Expected counts from that snapshot after this correction (before search/user filters):

| View / metric | Exact expected count |
| --- | ---: |
| Default `/hackathons` Explore listings | 410 |
| Opportunities / For you (`tab=recommended`) | 0 |
| Upcoming | 0 |
| Ongoing | 0 |
| Homepage opportunity strip | 0 |
| All / Unverified public listings | 410 |
| Unverified/unclear schedules | 410 |
| Official records retained, unverified | 8 |
| External records retained, unverified | 402 |

Saved remains the user's existing public saved subset, not a fabricated global count. Past remains an explicit listed-calendar filter; its exact production count is not supplied. Direct access to all 410 public records remains permitted. These are deterministic policy consequences of the founder snapshot, not new live observations; counts may change if the underlying catalog changes.

The trust-policy tests cover all eight official metadata patterns, both official/external workshop ambiguity, renamed titles, misleading Hackathon tags, bounded registration fields, organizer IDs and recent row timestamps. A 410-row synthetic aggregate proves zero default/upcoming/ongoing and 410 All listings. Existing native calendar/filter/auth/bookmark assertions remain strict; provider-hostname tests explicitly use external records in All. Browser tests use an all-non-native default dataset, preserve eight official imports and Bootcamps in All, Saved and guest/member direct access, and retain community entry controls. A separate native fixture retains open admission and India final-day boundaries. No name-based runtime exclusion is used.

Current final-head CI is reported on PR #98 after publication; earlier green results at 5a9808e do not qualify the follow-up.

## Homepage-to-directory UX follow-up

Reviewed head: `b7bb9dc225a39297eeccec497ac5a9cfcf19bc3b`. The hero's neutral Browse hackathons URL remains `/hackathons`. The shared settings parser now defaults missing/invalid tabs to `all` instead of `recommended`; URL serialization uses the same default so switching to Opportunities emits `tab=recommended` rather than accidentally losing it. All / Unverified is first in the tab order. Guest Opportunities and member For you remain separate, with their existing trust/eligibility logic unchanged.

The page explicitly warns that imported schedules, categories **and registration availability** are unverified and that browsing a listing/date does not confirm open registration. General browsing intentionally includes closed, ended and uncertain public records. The previous policy qualification at b7bb9dc remains valid for Opportunities; it no longer describes the default directory view.

Expected homepage journey for the founder's November 2 snapshot: **Browse hackathons → /hackathons → All / Unverified selected → 410 public listings (8 official + 402 external)**. Opportunities / For you remains **0**; Upcoming, Ongoing and the landing opportunity strip remain **0**. All 410 schedules remain unverified. Saved and direct visibility are unchanged. This is a prediction from the supplied catalog aggregate, not a production query or deployment result.

Two new tests fail against b7bb9dc (15 cases: 13 pass / 2 fail), reproducing the wrong default and missing explicit recommended URL. Final focused selection is 402/402. Existing opportunity-only tests explicitly select tab=recommended rather than asserting their old rules against general browsing. New general tests use bare URLs and retain closed/uncertain records. Explicit all/recommended/upcoming/ongoing/saved/past, search/filter values, unrelated source context and invalid-tab fallback round-trip correctly. Real browser journeys at 390/768/1440px click the hero link, confirm a populated general view with the warning, switch to empty Opportunities/For you with an explicit URL, reload it, and use Back/Forward through a direct event link. Existing Saved, guest/member direct views, native cutoff and exact Rack checks are retained.

Only discovery defaults/labels, focused tests and this evidence change. The lifecycle trust helper, importer, event records, registration writers and partner implementation are unchanged. Current-head CI is recorded on PR #98 after publication.

## Registration-filter admission guard follow-up

Reviewed head: `d8a165095704ede34a3ac62f30bbaa278dad4625`. The opportunity guard previously ran only when no registration filter was selected. Explicit filters could therefore admit non-native unknown/open/closed metadata in recommended, or closed native registration in active tabs. The sole production change is the requested unconditional guard: `if (active && !activeOpportunity(event, now)) return false;`.

Admission is always required in recommended, upcoming and ongoing, before applying any explicit registration filter. All / Unverified, Saved and Past retain their explicit registration filters, including closed records. The existing default All browsing UX, homepage destination, native unknown/review semantics, lifecycle trust helper, database readers/writers and partner/community functionality remain unchanged.

A 63-case matrix covers all seven registration filters across three active tabs for non-native and genuine native rows, plus all seven filters in All/Saved/Past. It reproduces 16 failures before the guard fix (78 focused cases: 62 pass / 16 fail). Final relevant application selection is 465 cases. Legacy assertions that allowed closed native registrations in active views are corrected to reject them there and explicitly prove continued All access; no assertion is weakened or removed to mask a failure.

The actual browser journey additionally visits recommended with unknown/open/all/closed filters for guests and members at 390/768/1440px, expecting zero imported opportunities and zero writes. Existing homepage-to-All, explicit URLs, Saved, direct access, Back/Forward, native India boundary and exact Rack assertions remain intact. An initial new browser matrix left its final closed filter in the URL for the following general-browsing scenario; the test now explicitly resets the URL between independent scenarios, preserving filter persistence. Its failed log is retained separately from final qualification.

Expected founder-snapshot counts are unchanged: default general browsing / All **410**; Opportunities / For you **0**, now also with unknown/open/all/closed filters; Upcoming/Ongoing/landing strip **0**. No production query or write was performed. Final exact-head CI is recorded on PR #98 after publication.

## Separately scoped source-refresh work

The read-only importer report, source hashes, **4/4** offline diagnostics, SELECT-only independent reconciliation request and review-only proposed AlgoRush correction set are retained separately in the workspace directory `audit-artifacts/mission20-source-refresh-afcc0da/`. They are **not** importer implementation and are not included in this presentation PR. No source refresh endpoint, live scraper, Gmail or email operation was run.

Confirmed source-code issues: Unstop registration dates can become event dates; Hack2Skill prefers registration dates as event dates; registration/team/provenance fields are omitted; database defaults supply 1–4; existing URL/name dedup skips detail refresh; no evidence-expiry protocol exists; importer/cron are coupled to outreach. The historical response/edit that produced AlgoRush's December end date is unproven. The supplied official-site findings are founder audit evidence; the independent web view had no readable provider body. Backfill requires raw source/editorial reconciliation and separate approval.

## Release decision and limits

**GO for independent review of this immediate presentation correction after final-head CI passes.** Founder approval is still required for any merge/deployment. This patch requires no migration or new RPC. It intentionally reduces active recommendations when imported evidence is insufficient; All / Unverified is the review route. Already open tabs retain the existing 60-second classification refresh, and external metadata edits need the existing reload. No new hosted-service acceptance is claimed.

**NO-GO for importer implementation, production correction/backfill or source-refresh endpoint execution.** The separately proposed registration/team corrections must not be applied from this PR. Source snapshots, field ownership/precedence, persistence of verified timestamps, freshness limits, protected/manual/partner handling, deterministic dry-run review and an independently authorized writer/recovery plan remain decisions for that scope. No registration/team/event identity is rewritten or deleted.
