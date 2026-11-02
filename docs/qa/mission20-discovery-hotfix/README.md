# Migration-free discovery accuracy hotfix

Base: latest fetched `origin/main` **17b78d031e0cc4ee5ace15ab92ca8039e00a4413**. Isolated branch `hotfix/mission20-discovery-accuracy`; no cherry-pick/merge of the stacked Mission 20 branches. #92, #93 and #96 remain unchanged, Draft and unmerged. Private audit material is not read or copied by this hotfix.

## Result and scope

Default Discover/For you, Upcoming and Ongoing exclude confirmed closed registrations. Their active-tab counts use the same filters. Saved, Past and explicit registration filters retain the appropriate public records and event navigation. The landing upcoming strip also omits confirmed closed registrations while keeping public event totals unchanged.

Event schedule and registration availability are separate states. An upcoming/ongoing event is never evidence that registration is open. Only a valid active registration window or explicit recorded `open` status supplies positive evidence; missing/invalid/inconsistent information remains **Registration availability unverified**. Explicit closure and passed deadlines override an `open` claim. Calendar-only deadlines cover the complete India calendar day; zoned timestamps keep their exact instant. Naive/impossible dates are not guessed.

Directory cards and public/authenticated details expose the registration status. Official links are retained; authenticated details say **View official event site**, with an explicit availability/community distinction. Existing native UI hides Register for known closed/not-yet-open/ended cases and says **Review registration** with an uncertainty notice for unknown availability. Existing native/community registration handlers, identity checks, confirmation dialogs, records and RPCs are unchanged. This is presentation/discovery correction, not new database admission enforcement.

Seven application files change: pure `lifecycle.ts` extracted from proven #92 logic without its native-enforcement function; discovery filters/sorting; directory presentation/counts; public read projection; public and authenticated detail presentation; landing-strip filtering. No description parser/rendering overhaul, ingestion work, API route, adapter, schema, migration, privilege, dependency, lockfile or environment change is included.

## Production compatibility

- Reads only existing `hackathons` columns. The two added projection fields `registration_start` and `registration_status`, together with existing `registration_end`, are present in main's generated Supabase schema (`src/types/supabase.ts`). Repository migration `202608110003_hackathon_team_sizes_and_status.sql` retains table SELECT for anon/authenticated. The independent production audit already confirmed registration start/end TIMESTAMPTZ and event start/end DATE. No new function or policy must be installed first.
- Retains approved/unarchived visibility, guest boundary, verification of authenticated identity and user-scoped bookmarks. Existing counts/discovery RPCs are unchanged; no `register_native_hackathon`, Mission20 writer/cancellation RPC or new native HTTP route is referenced.
- Community membership is independent of the external registration deadline. Existing join/leave, discovery opt-in/out, team links and registration ID/status/metadata preservation remain covered by strict regressions. Partner portal implementation/official URL and exact Rack browser assertions are unchanged, including **About this hackathon**.
- No live database query, registration or provider operation was performed. Schema/read compatibility is based on the documented deployed contract and current-main repository contracts, not a newly executed live catalog probe. Synthetic browser/transport checks are not hosted-service acceptance.

## Verification and screenshots

Exact task inventory, normalized UTF-8 source hashes and observed test results: [VERIFICATION.json](VERIFICATION.json). Current-head GitHub run/job results are recorded in the Draft PR; a local pass does not imply a green workflow.

Local relevant suite: **273/273**, including strict metadata, public visibility/auth/bookmarks, membership/writer compatibility, lifecycle/discovery, date/timezone and deadline-clock regressions. No assertions were deleted or relaxed. Necessary existing harness corrections load the new real pure module, retain the existing native positive-open fixture contract, update the exact neutral external label, and fix a time-dependent browsing fixture clock. Added tests cover unknown/closed native UI, landing-strip closure, explicit historical access and no future RPC dependency.

Actual browser components run in sandboxed Chrome with all page requests fulfilled locally, external requests/mutations denied, and the existing process network guard. **3/3** viewport journeys at **390 / 768 / 1440px**, each covering guest/member directory/detail, unverified status, closed exclusion, explicit closed/Past/Saved access, official URL preservation, no private guest reads, no writes, no horizontal overflow and exact last-millisecond/midnight India boundary route loads. The existing display timer is separately tested on the real React page without another DB read. Existing Rack conversion browser: **32/32**. Source screenshots were visually inspected for readable mobile/tablet/desktop layouts.

Screenshots remain in ignored `scratch/hotfix-browser/` and `scratch/rack-funnel/`; CI retains them as browser evidence. For each width, the hotfix artifact contains `guest-discovery`, `member-discovery`, `guest-closed-detail`, `member-closed-detail` PNGs (12 screenshots). No real accounts, private body, token or production data enters screenshots/artifacts.

Scoped lint rejects all diagnostics in the nine clean source/new-test files and compares the entire edited legacy detail page against the exact main base, preserving all **5 existing errors / 5 warnings** with no new, removed or altered diagnostics. Changed older tests/fixture also pass direct ESLint. No lint rule or browser assertion is weakened. TypeScript and guarded production build are separately required.

Failed local qualification trials remain disclosed: sandboxed Windows execution could not launch Chrome's crash-server pipe, so native local execution was used while Chrome's sandbox and outbound guards remained enabled. New boundary test development initially froze/advanced the virtual clock incorrectly and then selected a heading that the unchanged paragraph-based empty state does not render. Final tests explicitly load both exact boundary instants, verify the clock and absence of the event, and retain strict page-timer regression coverage. These were test harness corrections, not product-assertion suppression.

## Risks and recommendation

Metadata can be stale or absent; the patch cannot verify a third-party provider is accepting applications. It therefore preserves links and labels uncertainty. Explicit timestamp values remain timestamps; historical ingestion errors and a lost original date-only meaning are not reconstructed. Existing already-open tabs refresh classification on their existing 60-second display clock; metadata edits still require the existing data reload. New page loads classify immediately.

The landing strip still considers its existing bounded eight candidates and retains its existing Unstop-date exception. Filtering closed candidates can yield fewer than eight visible cards; the full directory retains complete keyset loading. No ingestion or listing-pagination redesign is included.

Recommendation after final current-head CI and independent review: **GO for this standalone, migration-free discovery hotfix under founder-approved release control.** Do not merge or deploy automatically. This PR does not authorize any C1/C2 migration or change their release state. No database rollout is a prerequisite for this patch. If the existing read contract unexpectedly differs in production, stop and surface the actual error; do not add privileges or hide the error.
