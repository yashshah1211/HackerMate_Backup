# Mission 09 — Rack It Up conversion funnel, Phase 1

Base: `d0ed42f8e88d88f6b4b2715f910ff89bfc86f979`. Existing worktrees/main and organizer assets are preserved. No production queries, account creation, migrations, deployments or provider calls.

## Journey findings and small changes

- The portal already links to the resolved event UUID with `tab=looking_for_teams`; unknown/mismatched event bindings remain disabled. Unstop is a separate outbound link.
- Guests previously reached public event facts and sign-in prompts, with no builder-discovery results even on that tab. The existing `list_event_discovery_builders` projection is granted to `anon` in `202610060003_partner_read_projections.sql`; its SQL filters opt-in, hidden, banned and public-profile state. Phase 1 reuses that projection only for a publicly approved Rack event matching the official registration URL, on the builders/discovery tabs. No raw profile or registration query is added. Missing/denied RPCs are logged and shown as errors, not empty lists.
- Rack-only reassurance explains public browsing and free signup. Empty means “No public builder listings yet,” not that nobody participates. Existing branding and all event facts remain unchanged.
- Existing login, consent, OAuth callback and onboarding already preserve the entire safe return path. Baseline synthetic journey tests passed **447/447** before edits; those auth rules are unchanged. On return, listing a profile still requires an explicit authenticated click. Team creation retains `?hackathon=<resolved event UUID>`.
- Vercel Analytics and Simple Analytics already load globally; GA4 and its existing bridge are optional. Existing pageviews do not establish either CTA clicks or registration completion. The corrected Rack tracker uses the existing Simple Analytics browser API; Vercel Hobby pageviews and existing GA4 behavior are unchanged.

## Deployment-plan correction (October 30)

Independent review/founder evidence confirms `yashshah1211s-projects` is on Vercel Hobby. Vercel custom `track()` events require Pro/Enterprise; the earlier synthetic tests established code behavior, not plan compatibility. The production Rack tracker no longer imports or calls Vercel `track()`.

The founder subsequently confirmed Simple Analytics as the existing no-additional-cost option. The exact subscription tier/account settings were not independently inspected. Source audit: `layout.tsx` already loads `scripts.simpleanalyticscdn.com/latest.js`; the official vendor [event API](https://github.com/simpleanalytics/docs/blob/a5f813526c6169a28cb105d01e2b4967870796ba/_docs/55_events/01_introduction.md) and [metadata API](https://github.com/simpleanalytics/docs/blob/a5f813526c6169a28cb105d01e2b4967870796ba/_docs/55_events/15_metadata.md) document `sa_event(name, metadata)`. Vendor [browser source](https://github.com/simpleanalytics/scripts/blob/3b7312229dd740cb630f5a962aae85c156322d04/src/default.js) was reviewed, not executed. No new script, vendor, dependency, endpoint, plan upgrade or analytics-setting change is introduced.

GA4 is not selected: its configured presence/actual reporting was not independently verified, and its shared bridge includes user identity and URL handling. Rack events do not use that bridge or inherit its identity context. Simple Analytics can append global metadata/collectors; none are configured in repository source. The tracker additionally fails closed on non-empty `sa_metadata` or a collector attribute on the existing script, without modifying either. Normal vendor page/context collection is unchanged; only the new custom metadata is allowlisted here.

## Event definitions

The tracker calls the existing `window.sa_event` with exactly `{event_slug: "rack-it-up-2026"}` as custom metadata. No user ID, name, email, certificate data, arbitrary URL or referrer is added to it. There is no Vercel/GA4 fallback.

| Event | Observation |
|---|---|
| `rack_portal_view` | Client mount/navigation at the fixed portal path; repeated visits/refreshes may count again. |
| `rack_find_teammates_click` | Activation of the marked, valid event-discovery CTA. |
| `rack_unstop_click` | Activation of the marked, exact official Unstop URL; not a registration. |
| `rack_login_entry` | Login page entered with a matching, unexpired same-tab portal-click destination. |
| `rack_onboarding_entry` | Onboarding page entered with that matching destination; not profile completion. |

The optional session-storage record contains only a generated event destination and a 30-minute attribution expiry. It is never authorization or a profile/database field. No UTM propagation or query attribution is added. Modified/new-tab clicks do not create same-tab attribution. Storage or analytics failure cannot prevent navigation. Simple Analytics readiness is retried at most four times over one second; no second script is loaded. A blocked/late script, DNT/vendor opt-out, navigation loss or unsafe shared metadata can make CTA/entry tracking unavailable. No delivery guarantee, unique-person count, cross-device attribution, completed-signup metric or verified Unstop conversion is claimed. Ordinary pre-existing vendor pageviews are unchanged.

The pre-existing optional GA4 bridge has legacy identity and URL handling. These new events do not use that bridge. The fixed-slug guarantee applies to the five new custom payloads, not to every existing analytics flow across the site.

## Historical verification and limits

New component tests cover payload allowlisting, delayed/absent SDK, corrupt/expired context, mismatched destinations, optional storage, safe navigation, public-only discovery, paging, error/retry/empty states and other-event isolation. Initial focused run passed 9/17: seven failures came from a missing test-harness barrel adapter and one exposed malformed-context cleanup. Corrected rerun passed **17/17** with assertions retained.

Local checks: `node qa/test-rack-network-guard.cjs` **8/8 PASS**; `node qa/rack-qualification.cjs tests` **839/839 PASS**; the extended Rack presentation assertions passed **27/27**; final new funnel assertions **17/17 PASS**; `node node_modules/typescript/bin/tsc --noEmit` **PASS**; focused ESLint on all changed TS/TSX/JS/JSX files **0 errors, 0 warnings**. The network-guarded browser `--prepare-only` bundle compiled successfully. No browser acceptance is claimed from that compile-only check.

The existing Rack regression snapshot is regenerated from the actual component/CSS. The isolated Linux workflow runs existing partner/auth/onboarding/participation tests, network-boundary checks, original Rack browser acceptance, the new actual-component guest/authenticated journey at 390px/1440px, and a production build with synthetic database responses/offline fonts. Its auth adapter simulates external OAuth/callback; actual callback and return-path code are separately exercised by offline tests. It neither proves live OAuth nor substitutes synthetic records for production evidence. Profile completion and discovery writes in browser tests affect in-memory synthetic state only.

Final commands/results, tested head and screenshots are recorded in the Draft PR. Live deployed RPC grants and analytics plan/receipt are not inspected. If the projection is unavailable in production, seek separate founder review rather than changing grants or falling back to raw reads. Known Windows browser/build restrictions are not retried.

Initial Linux CI at `c224f57d8de0be1d6e81ae22092b8dabbf0aa72e` passed 839/839 regressions, 8/8 isolation checks, 19/19 existing Rack browser checks and the production build. The new journey passed five mobile checks through onboarding entry, then timed out waiting for member listing controls. Source tracing found the new synthetic adapter incorrectly rejecting the unchanged member page's `hackathon_stages` and `hackathon_resources` wildcard reads. The adapter now permits only those two existing member contracts; guest relation restrictions and explicit profile/registration projections remain enforced. No application code was changed for this correction. Bounded, synthetic-only diagnostics are retained for any further browser failure. Final rerun evidence is in the PR.

Final implementation/fixture qualification: `95e262d305de45594eb86ed57847c6f50505f391`, [Linux CI run](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/40929760282). Commands: `node qa/test-rack-network-guard.cjs` **8/8**; `node qa/rack-qualification.cjs tests` **839/839**; `node qa/rack-qualification.cjs browser` **19/19**; `node qa/rack-qualification.cjs funnel-browser` **20/20**; `node qa/rack-qualification.cjs build` **PASS**, 96/96 static pages, four loopback synthetic reads, zero mutations. Standard PR TypeScript/regression CI also passed. Build framework/Sentry/Edge-runtime warnings remain in the logs; none were suppressed. A missing UTF-8 declaration in the synthetic screenshot notice was corrected before this final run.

[Final screenshots/logs artifact](https://github.com/yashshah1211/HackerMate_Backup/actions/runs/40929760282/artifacts/12921539115): `rack-funnel/portal-390.png`, `portal-1440.png`, `guest-390.png`, `guest-1440.png`; seven-day CI retention. Any subsequent report-only commit changes no executable code or fixture.

## Correction verification

The follow-up changes only the Rack transport, its synthetic adapters/assertions and this report. Guest discovery, the public opt-in RPC boundary, branding, return paths and prior test assertions remain. All 17 focused cases are retained for the Simple Analytics transport; two additional cases reject Vercel/GA4 fallback and inherited metadata. Fresh local results: focused **19/19 PASS**, complete affected offline suite **841/841 PASS**, isolation **8/8 PASS**, TypeScript **PASS**, scoped lint **0 errors / 0 warnings**, isolated browser bundle preparation **PASS**. Dispatch is observed at the mocked `sa_event` boundary; this is not proof of receipt in a production account. The isolated browser journeys and CI/build are rerun; exact final results/head are recorded in PR #86 after completion.

## Independent review and Phase 2

Production verification is founder-operated and requires a separately approved deployment/test window; none is executed by Codex here:

1. In the existing Simple Analytics account, select `hackermate.in` and confirm Events Explorer/reporting remains included under the current subscription/allowance. No paid upgrade or settings change is authorized. Vercel Hobby custom-event reports must not be used.
2. On the approved deployed code, confirm only the boolean `typeof window.sa_event === "function"`; confirm `sa_metadata` is absent/empty and the existing script has no metadata collector. Do not print or share metadata values. If these checks fail, STOP: CTA/entry measurement is unavailable; normal pageviews may still work.
3. Use only an already approved synthetic session/account. Record the time window, open the Rack portal and exercise its two CTAs. Do not complete an Unstop registration. Check Simple Analytics **Events Explorer** for `rack_portal_view`, `rack_find_teammates_click`, `rack_unstop_click` with only the expected custom `event_slug`. A local call or network attempt alone is not confirmed reporting receipt.
4. Verify `rack_login_entry` / `rack_onboarding_entry` only if an existing approved synthetic account/setup allows that same-tab journey within 30 minutes. Otherwise leave those receipts UNVERIFIED; do not create production accounts or records without separate approval. These names establish entry only, never signup/onboarding completion.
5. Confirm regular portal pageviews continue, no unexpected custom metadata is present, and missing/blocked analytics does not affect navigation. Respect DNT/blockers; do not change collection settings to force events. Report event names, time window and receipt status only—no IDs, secrets, HAR files or personal data.

Start Phase 2 only after Simple Analytics receipt is verified. Compare observed portal visits, CTA activations and attributed entry events over one consistent reporting window. These can locate drop-off, but cannot establish acquisition lift or completed registrations. If receipt cannot be confirmed, use normal pageviews only and explicitly mark CTA-level tracking unavailable. Authoritative completion instrumentation needs separate privacy/cost/data-quality review. Never infer Unstop registrations from outbound clicks. Revert the transport correction or unmount the optional tracker to disable custom events; normal pageviews and guest discovery are independent, and no database cleanup is required.
