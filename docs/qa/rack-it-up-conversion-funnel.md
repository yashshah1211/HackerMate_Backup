# Mission 09 — Rack It Up conversion funnel, Phase 1

Base: `d0ed42f8e88d88f6b4b2715f910ff89bfc86f979`. Existing worktrees/main and organizer assets are preserved. No production queries, account creation, migrations, deployments or provider calls.

## Journey findings and small changes

- The portal already links to the resolved event UUID with `tab=looking_for_teams`; unknown/mismatched event bindings remain disabled. Unstop is a separate outbound link.
- Guests previously reached public event facts and sign-in prompts, with no builder-discovery results even on that tab. The existing `list_event_discovery_builders` projection is granted to `anon` in `202610060003_partner_read_projections.sql`; its SQL filters opt-in, hidden, banned and public-profile state. Phase 1 reuses that projection only for a publicly approved Rack event matching the official registration URL, on the builders/discovery tabs. No raw profile or registration query is added. Missing/denied RPCs are logged and shown as errors, not empty lists.
- Rack-only reassurance explains public browsing and free signup. Empty means “No public builder listings yet,” not that nobody participates. Existing branding and all event facts remain unchanged.
- Existing login, consent, OAuth callback and onboarding already preserve the entire safe return path. Baseline synthetic journey tests passed **447/447** before edits; those auth rules are unchanged. On return, listing a profile still requires an explicit authenticated click. Team creation retains `?hackathon=<resolved event UUID>`.
- Vercel Analytics and Simple Analytics already load globally; GA4 and its existing bridge are optional. Existing pageviews do not establish either CTA clicks or registration completion. This patch uses the already-installed Vercel SDK only; existing Simple Analytics/GA4 behavior is unchanged.

## Event definitions

Every new custom event sends exactly `{event_slug: "rack-it-up-2026"}`. No user ID, name, email, certificate data, arbitrary URL or referrer is added to these payloads.

| Event | Observation |
|---|---|
| `rack_portal_view` | Client mount/navigation at the fixed portal path; repeated visits/refreshes may count again. |
| `rack_find_teammates_click` | Activation of the marked, valid event-discovery CTA. |
| `rack_unstop_click` | Activation of the marked, exact official Unstop URL; not a registration. |
| `rack_login_entry` | Login page entered with a matching, unexpired same-tab portal-click destination. |
| `rack_onboarding_entry` | Onboarding page entered with that matching destination; not profile completion. |

The optional session-storage record contains only a generated event destination and a 30-minute attribution expiry. It is never authorization or a profile/database field. No UTM propagation or query attribution is added. Modified/new-tab clicks do not create same-tab attribution. Storage or SDK failure cannot prevent navigation. SDK queue readiness is checked at most four times over one second; no second script is loaded. No delivery guarantee, unique-person count, cross-device attribution, completed-signup metric or verified Unstop conversion is claimed. Ordinary pre-existing vendor pageviews are unchanged.

## Verification and limits

New component tests cover payload allowlisting, delayed/absent SDK, corrupt/expired context, mismatched destinations, optional storage, safe navigation, public-only discovery, paging, error/retry/empty states and other-event isolation. Initial focused run passed 9/17: seven failures came from a missing test-harness barrel adapter and one exposed malformed-context cleanup. Corrected rerun passed **17/17** with assertions retained.

Local checks: `node qa/test-rack-network-guard.cjs` **8/8 PASS**; `node qa/rack-qualification.cjs tests` **839/839 PASS**; the extended Rack presentation assertions passed **27/27**; final new funnel assertions **17/17 PASS**; `node node_modules/typescript/bin/tsc --noEmit` **PASS**; focused ESLint on all changed TS/TSX/JS/JSX files **0 errors, 0 warnings**. The network-guarded browser `--prepare-only` bundle compiled successfully. No browser acceptance is claimed from that compile-only check.

The existing Rack regression snapshot is regenerated from the actual component/CSS. The isolated Linux workflow runs existing partner/auth/onboarding/participation tests, network-boundary checks, original Rack browser acceptance, the new actual-component guest/authenticated journey at 390px/1440px, and a production build with synthetic database responses/offline fonts. Its auth adapter simulates external OAuth/callback; actual callback and return-path code are separately exercised by offline tests. It neither proves live OAuth nor substitutes synthetic records for production evidence. Profile completion and discovery writes in browser tests affect in-memory synthetic state only.

Final commands/results, tested head and screenshots are recorded in the Draft PR. Live deployed RPC grants and analytics plan/receipt are not inspected. If the projection is unavailable in production, seek separate founder review rather than changing grants or falling back to raw reads. Known Windows browser/build restrictions are not retried.

## Independent review and Phase 2

Before any release, the founder should confirm existing-plan custom-event availability in **Vercel → hacker-mate-backup → Analytics → Events**; no paid upgrade or setting change is authorized. After a separately approved release, verify event receipt without sending personal metadata and check the existing public projection's availability. This PR does not enable a vendor or alter its plan.

Start Phase 2 by comparing observed portal visits, CTA activations and attributed entry events over one consistent reporting window. These can locate drop-off, but cannot establish acquisition lift or completed registrations. Consider separately scoped, authoritative completion instrumentation only after verifying event receipt and reviewing privacy, costs and data quality. Never infer Unstop registrations from outbound clicks. Revert the small UI/tracker change to roll back; no database cleanup is required.
