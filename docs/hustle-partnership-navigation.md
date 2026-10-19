# Hustle Carnival partnership and public navigation review

Base: `6aaa4caaf33241c71b55f15987ec881e1f58ecfe`. Branch: `feat/hustle-partnership-navigation`.

The authenticated dashboard now shows a responsive HackerMate × Club Ellusion banner below its greeting. It links only to the public carnival portal and public workshops. The existing six-section rail and five mobile tabs remain unchanged. The portal's journey and workshop navigation remain visible on mobile.

Both workshop cards, their shared schedule, FAQ, social metadata and dashboard copy use the organizer-confirmed **24 October 2026, 2:00–4:00 PM IST (UTC+05:30)**. The workshops run simultaneously. Their official YouTube and Google Forms links remain unconfigured, with disabled controls. No URLs, speakers or certificate requirements were invented.

Public copy states that both buildathon rounds are free. Round 2 remains invitation-only; private invitations follow verification of the official shortlist. No invitation delivery at 10 AM is promised. The portal's existing 10 AM results listing describes organizer results, not invitation issuance.

## Boundaries

- No changes to authentication, shell navigation, Phase 2 implementation, release flags, ordinary participation guard, API routes, SQL, dependencies or hosting configuration.
- No databases, accounts, participants, messages or invitations are involved.
- The four proposed Round 2 improvements remain separate: generated-versus-sent wording; mobile table scrolling cues; search empty states; manual statistics refresh. None is implemented here.
- Screenshots and runtime evidence stay in ignored `test-results/` directories, outside the Git diff. The prior 19-screen Round 2 walkthrough is separate.

## Reproduce verification

Use the lockfile dependencies and local Chromium, with no real `.env` files or credentials:

```sh
npm run typecheck
node scripts/test-hustle-partnership-navigation.cjs
node scripts/test-hustle-carnival.cjs
node scripts/test-hustle-carnival-workshops.cjs
node scripts/test-dashboard-join-requests.cjs
node scripts/test-hustle-phase2-release.cjs
node scripts/test-hustle-phase2-production.cjs
node scripts/test-hustle-partnership-browser.cjs
```

The production harness builds the actual Next application with synthetic loopback configuration and offline font responses, then checks private unavailable responses and public pages. It never deploys. The browser harness runs after it, owns an ephemeral loopback Next development server and read-only event fixture, strips inherited service/release configuration from its child, and explicitly disables both Round 2 flags. It blocks external browser requests and writes.

Dashboard screenshots use the existing `/dev/v2/dashboard` gallery, rendering the actual `DashboardView` and `ShellFrame` with their existing synthetic fixtures. This is a component journey with a mock signed-in shell, not proof of a real authenticated session. The actual guest `/dashboard` redirect is tested separately. The gallery remains development-only; its production 404 guard is unchanged. Public portal/workshop captures use their real Next routes and client navigation. Offline font fixtures use a local font fallback; production typography may differ slightly.

The browser run captures dashboard, portal and workshops at **1440, 768, 390 and 320px**, plus a light-theme dashboard. It checks keyboard focus, 44px banner links, overflow, public destinations, mobile navigation visibility, confirmed workshop times, disabled organizer links, guest authentication and private disabled responses. Axe scans cover the new banner and both public main landmarks; they do not establish manual screen-reader coverage or full-app accessibility.

Outputs: `test-results/hustle-partnership/` and `test-results/hustle-phase2-production/`. Neither directory is published or committed. Existing dashboard request tests receive only a CSS-module fixture adapter so their 25 lifecycle and authorization assertions continue to run.

Verified locally on 18 October 2026:

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Scoped ESLint | No errors; four existing unused-import warnings in `DashboardView.tsx` |
| Partnership / portal / workshop tests | 4 / 19 / 7 passed |
| Existing dashboard request tests | 25 passed |
| Existing release-gate and emergency-shutdown tests | 18 passed |
| Production build and HTTP checks | Build passed; 8 HTTP checks passed; 0 Round 2 database requests |
| Partnership browser journey | 149 checks passed across all four widths; 0 page errors and 0 scoped axe violations |

One earlier development-server run returned a 500 with `Unexpected end of JSON input` while reloading the existing gallery. The full run passed after clearing the generated `.next/dev` cache, without application changes. This was a local development observation; no production configuration was involved. The existing Next middleware deprecation and Sentry instrumentation warnings remain outside this presentation change.

## Publication and release

This is a presentation change for independent review. No release flag needs to change for it. Publishing a branch can automatically create a Vercel Preview; obtain explicit approval for that side effect under the current no-deployment instruction before pushing. Do not merge, change environment settings or activate Round 2 as part of this work.

The official livestream and certificate-form URLs remain organizer dependencies. Any future Round 2 activation remains a separate security, integration and operational approval decision.
