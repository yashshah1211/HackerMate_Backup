# Craft N Code national partner hub

Local implementation on `feat/craftncode-national-partner-hub`, based on
`32980ea483fc3043086d970242fcbc8023d88669`. Owner authorized limited Draft PR
publication after independent source review. No merge or rollout authorized.

## Architecture and public-data boundary

- `/partners/craftncode` is the national directory; `/partners/craftncode/[state]`
  presents one existing qualifier. Both are public server components, without
  an AuthGuard, identity lookup or participation mutation.
- `eventSeries.ts` contains the reviewed series identity, organizer rules and
  state-to-event mapping. The shared presentation and public resolvers accept
  an event-series configuration. Future states require an explicit reviewed
  configuration addition, not name matching or inferred registration URLs.
- The seven entries are **currently listed qualifiers**, not an exhaustive
  national roster, rankings or tracks under one event.
- Anonymous server queries read only `hackathons` with projection
  `id,name,website_url,mode,location,status,archived`. The hub makes one request
  limited to its seven mapped IDs and seven rows; state pages query exactly one
  mapped ID. Every query requires `status = approved` and `archived = false`.
  Normalization independently rechecks identity, approval and archive state.
- No cookies, service-role keys, auth reads, profiles, private contacts,
  registration metrics, team data, RPCs or writes are used by the feature.
  The existing site shell may perform its normal session handling; this change
  neither adds to it nor treats a failed session check as permission to act.
- Request-local React cache shares metadata/page resolution. Routes are forced
  dynamic and the anonymous client's fetch uses `no-store`; there is no new
  cross-request visibility cache. Database errors are logged and produce a
  generic unavailable state with Retry. Missing/hidden states use not-found,
  without leaking the hidden event title. Empty listings are distinct from errors.
  Both failed and successfully empty hub responses produce noindex/nofollow
  metadata; a populated public listing retains normal indexing behavior.
- This application projection is not an RLS change or a comprehensive database
  privacy fix. Existing anonymous table permissions remain outside scope.

## Reviewed mapping and link provenance

| State slug | Existing event ID |
| --- | --- |
| karnataka | `48578e2f-0012-4357-b610-d6a4af17f961` |
| west-bengal | `52d447ef-f574-4538-b6c1-2e5d9a2e33d6` |
| chhattisgarh | `7050f4bd-df55-49d0-a399-1c4393a140f7` |
| delhi | `bd07369c-ff56-4cff-953b-6d550372f415` |
| haryana | `2f8e6f49-fcbf-422d-b572-81be3d0197ea` |
| telangana | `7df25627-896f-404b-8fa0-a8925ecc5aa2` |
| tamil-nadu | `5fef2bf8-ceb5-4ec8-b037-4a8a9b41f231` |

The owner provided these verified mappings and the existing rows' approved,
non-archived status. At Draft PR authorization, the owner reported independent
read-only production verification of all seven IDs, approved statuses and stored
Unstop registration URLs, plus external-search confirmation of six listings.
This implementation did not query production to reverify those findings.

Spandan Hota's October 15 organizer correspondence, supplied by the owner, gives
the official **2026** festival hub:

<https://unstop.com/college-fests/d3-2026-tech-fest-iiit-bhubaneswar-international-institute-of-information-technology-iiit-bhubaneswar-496201>

The public Unstop page required JavaScript/cookies during read-only inspection;
its detailed contents were not independently verified. The supplied exact URL
is used without substituting an older festival page.

Each registration CTA uses only its resolved row's `website_url`, validated as
HTTPS, without credentials/custom port, on exactly `unstop.com` or
`www.unstop.com`, with a `/hackathons/<event>` path. Missing or unsafe URLs omit
registration and explain where to check. URLs are never inferred from titles,
IDs or other qualifiers. Offline fixtures use deliberately synthetic Unstop
paths; these are not claims about the real seven registration URLs.

The owner-supplied Tamil Nadu listing is:

<https://unstop.com/hackathons/craft-n-code-tamil-nadu-d3-2026-tech-fest-iiit-bhubaneswar-international-institute-of-information-technology--1746234>

During the final read-only check, the web tool reported that this exact URL was
inaccessible; an exact URL-slug/ID search returned no results. Its external page
identity/content therefore remains unverified by this agent. This does not
contradict the reviewer's verification of the stored URL. Manual confirmation
remains a release checklist item; no substitute URL or record change was made.

Teammate CTAs use `eventDiscoveryHref(event.id)`:
`/hackathons/<exact-id>?tab=looking_for_teams`. They do not merge state feeds,
create registrations, join teams or replay an action after authentication.
Official Unstop registration and HackerMate community participation are
explicitly separate. No public builder/team access is broadened.

## Eligibility, dates and branding

Organizer-confirmed rules are displayed as rules, not enforcement:

- 2–4 members per team.
- Inter-college teams are allowed only when all participating colleges are
  within the same qualifier state.

The owner reports stored minimum sizes of **1**. This remains inconsistent with
the organizer's **2** minimum. No rows were changed. It blocks any claim of
enforced team eligibility; displaying accurate rules does not resolve it.
HackerMate does not verify college locations, registration or attendance here.

Unverified event schedules/stages, local hosts, prize distributions and finale
details are not invented. Imported start dates are not assumed to be event
dates. The page explicitly directs users to the qualifier listing for dates,
deadlines and rounds. Format is explicitly labeled **Listed qualifier format**:
an `online` row describes that qualifier's listed format, not the entire national
competition or finale. No finale arrangement is inferred. Location is listed
metadata; generic
locations such as “Venue in India” are replaced by “Not confirmed — check Unstop”.
No physical venue is certified. Real schedules and venue accuracy need organizer
confirmation before being advertised as confirmed facts.

Co-branding is text-only. `D3_Logo.png` was not available in the worktree. The
shared `Branding` block is the single place to integrate a subsequently supplied,
verified logo asset; no unrelated image or unofficial emblem is substituted.
The CSS uses existing HackerMate colors/type variables, with offline font
fallbacks, keyboard outlines and mobile tap targets. No animation or new library.

## Compatibility and remaining integration work

The static Craft namespace takes precedence over `/partners/[slug]`. Existing
legacy configurations, partner pages, organizer middleware, administration and
authorization code are untouched. Next's installed route sorter/matchers verify
precedence and continued matching of other partners' organizer pages.
`craftncode/organizer` is not an implemented dashboard or a valid qualifier;
there is no Craft partner_config today. Any future seven-event organizer
workspace requires its own explicit design/authorization.

Base main still guards event details with AuthGuard. PR #21 changes guest event
browsing; Cloud owns shared return-path hardening and suspension enforcement.
This feature links to the supported discovery route and relies on the target's
existing deliberate sign-in/onboarding gates. It adds no authentication
validator. The full combined authentication flow is **not** proven by these
offline tests and remains a launch dependency.

After PR #21 and Cloud changes are combined, verify in an authorized isolated
environment:

1. Guest hub and all seven state pages remain readable without login/private
   participation queries, including under mobile navigation.
2. Each CTA opens its exact event's discovery tab; no other state is mixed in.
3. Guest action -> sign-in -> intended same-origin event destination; incomplete
   onboarding -> onboarding -> intended destination. No action executes until
   deliberately confirmed. Test invitation flows remain intact separately.
4. Verified active users retain existing actions. Suspended, missing-profile,
   expired and unverifiable sessions fail closed for protected actions; none
   are downgraded to guest authorization.
5. Pending/rejected/archived direct event access is excluded in both the portal
   and PR #21 detail contract. Generic legacy partner/organizer routes still work.
6. Retain the independent reviewer's seven-row URL/identity verification as
   source evidence; check for drift if records change. Manually confirm Tamil
   Nadu's external page and test outgoing links without registering or modifying
   live records.

## Validation (offline)

All source-module fixtures deny network and real Supabase client creation. They
never load `.env`. Browser requests are fulfilled from the real server page
modules' rendered output using synthetic query fixtures; all other origins and
non-GET requests are blocked. No live endpoint, database or email was exercised.

Commands:

```text
node --test --test-reporter=spec scripts/test-event-series.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-event-compatibility.cjs scripts/test-partner-organizer-api.cjs scripts/test-partner-authorization.cjs scripts/test-organizer-workspace.cjs scripts/test-partner-admin.cjs scripts/test-partner-csv.cjs scripts/test-hackathon-discovery.cjs scripts/test-hackathon-discovery-page.cjs
node scripts/test-event-series-browser.cjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js src/lib/partners/eventSeries.ts src/lib/partners/eventSeriesPublic.ts src/components/partners/EventSeriesPage.tsx src/app/partners/craftncode scripts/event-series-harness.cjs scripts/test-event-series.cjs scripts/test-event-series-browser.cjs
git diff --check
```

Results: 752 Node tests passed (53 new, 699 existing partner/hackathon regressions),
238 browser assertions passed across 1440×1000, 390×844 and 320×740. Typecheck and
scoped lint passed with no diagnostics. No new dependencies or lockfile changes.
Diff/whitespace and credential checks cover untracked source files too.

Browser evidence is ignored under `scratch/craftncode-qa`: hub and Tamil Nadu
screenshots at all three widths, plus `browser-evidence.json` and regression log.
Checks cover every state's navigation, exact discovery/registration links,
keyboard focus, 44px controls, no overflow, empty/missing/error/Retry states,
zero external requests and zero page errors. Screenshots use available system
font fallbacks; this is not full Next shell hydration, production-font validation
or authenticated end-to-end QA. Unit tests execute the actual page/resolver
modules; route compatibility tests use Next's real routing utilities.

## Launch and rollback checklist

- Independent source review and limited Draft PR publication approval obtained.
  Separate final merge/release approval remains required.
- Complete PR #21/Cloud integration checks above before public rollout.
- All seven mapped IDs/statuses/stored URLs were independently verified as
  reported by the owner. Manually confirm Tamil Nadu's external page before
  release. Confirm future roster additions, dates/stages/venues and any finale
  details before advertising additional facts. Obtain the genuine logo if used.
- Resolve the stored 1-vs-2 minimum through a separately approved data/security
  task before claiming enforcement; do not imply college verification exists.
- Verify actual deployed guest hub/state pages, safe links, error states and
  other partner routes in an approved preview environment before promotion.
- No migration, partner_config update, environment change or billable service
  is required by this feature. One bounded public read per route; no polling.
- Rollback by reverting this additive feature commit through the usual reviewed
  release process. There is no feature-written data to delete or migrate back.
  Existing event records, discovery and other partner implementations remain.

## Changed-file manifest

1. `src/lib/partners/eventSeries.ts`
2. `src/lib/partners/eventSeriesPublic.ts`
3. `src/components/partners/EventSeriesPage.tsx`
4. `src/components/partners/EventSeriesPage.module.css`
5. `src/app/partners/craftncode/page.tsx`
6. `src/app/partners/craftncode/[state]/page.tsx`
7. `src/app/partners/craftncode/loading.tsx`
8. `src/app/partners/craftncode/not-found.tsx`
9. `scripts/event-series-harness.cjs`
10. `scripts/test-event-series.cjs`
11. `scripts/test-event-series-browser.cjs`
12. `docs/architecture/craftncode-national-partner-hub.md`
