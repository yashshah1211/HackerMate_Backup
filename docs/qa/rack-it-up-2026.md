# Rack It Up 2026 — review and activation handoff

Proposed URL: `/partners/rack-it-up-2026`. Branch: `feat/rack-it-up-2026-portal`, based on verified main `1d34071effc1cfa5b01d219ae648c83db58caad2`.

The existing public partner renderer, anonymous resolver, metadata and event-discovery flow are reused. This slug adds founder-confirmed facts and Community Partner wording. The official Unstop CTA is distinct from matching. Matching requires a public event UUID whose external registration identity matches the official Unstop URL; missing, unpublished or mismatched events never fall back to another event. Rack cannot enter the legacy provisioner. Other portals, permissions and admin APIs are unchanged. No new attribution, registration-conversion claims, participant-data collection or registration totals are added.

Founder verification (reported, not queried by Codex): existing event `f8dd958a-bb3a-46e5-bd51-432ecf067203` has December 11–13 dates, Online location, Approved status, External type, team bounds 1–4 and the exact official Unstop URL. Reuse this event; **do not create another**. The founder also approved the visual preview. The production ID is documentation only, never a synthetic fixture or an activated configuration. No production activation is authorized.

## Linux qualification follow-up

The dedicated PR-only workflow runs on `ubuntu-24.04`/Node 22 with read-only repository permissions and no production environment/secrets. Dependency setup uses the unchanged lockfile with lifecycle scripts disabled. Linux uses the runner's installed Google Chrome through Playwright with Chromium sandboxing retained; no browser download, OS-security change or elevated command is needed. Application child processes receive an allowlisted environment, an external-network guard and generation explicitly disabled. The build uses a GET/HEAD-only loopback database fixture and Next's local-font fixture. Browser contexts block all page requests and service workers; screenshots/results/logs are retained for seven days. No deployment step exists.

CI evidence is recorded on the published PR/head, not inferred from the Windows results below. These checks qualify the production-mode build with synthetic data/offline fonts, and actual browser rendering of the real component/CSS fixture. They do not test production database access, real registrations, actual team creation or live authentication. Portal application code is unchanged by this qualification follow-up.

## Original Windows evidence (head 0b6928548b369b528ad000a1f8c4afd47a4fae95)

- Final relevant JavaScript run: **336/336 PASS**, including **24/24 Rack tests**, zero skipped/cancelled. This runs the five presentation/discovery/admin/authorization/Rack test files below, without the unrelated SQL runner.
- Earlier expanded run: **335/336 PASS**. Its failed item is the separate local PostgreSQL metrics runner; its SQL assertions are unqualified, and its root cause was not established. A read-only binary check reports PostgreSQL 18.4 with Windows error-1920 warnings. No SQL or metric query is changed or used by this page. The final run adds the checked-in preview assertion; the earlier SQL failure is not converted into a pass.
- TypeScript: **PASS**, `npm run typecheck -- --incremental false --pretty false`.
- Scoped ESLint: **PASS**, zero errors/warnings in the six changed TS/JS files. No rule suppressions.
- Browser acceptance: **BLOCKED before checks**. Installed Chromium headless shell exited with code `2147483651`; no viewport assertions or screenshots passed. Chromium sandboxing was retained; no security settings or installation changed.
- Offline build: **BLOCKED**, exit 1. Webpack compiled and build TypeScript passed, then static export hit Windows EPERM creating `.next/server/app/invites.segments/invites` and `contact.segments/contact`. Fixture counters: 0 reads, 0 mutations. No successful build is claimed. CI status is recorded in the PR handoff, not inferred from local tests.
- Initial assertions mistakenly searched all HTML for `/hackathons/` and therefore matched Unstop's external path. The corrected tests inspect internal anchor destinations and the actual matching CTA; no isolation requirement was removed.

Commands use the reviewed `scratch/run-maintenance-offline.cjs` sanitized environment/external-network guard:

```text
node --test --test-concurrency=1 scripts/test-rack-it-up-2026.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-admin.cjs scripts/test-partner-authorization.cjs scripts/test-partner-metrics.cjs
node --test --test-concurrency=1 scripts/test-rack-it-up-2026.cjs scripts/test-partner-presentation.cjs scripts/test-partner-discovery-navigation.cjs scripts/test-partner-admin.cjs scripts/test-partner-authorization.cjs
npm run typecheck -- --incremental false --pretty false
node node_modules/eslint/bin/eslint.js --max-warnings 0 src/lib/partners/rackItUp2026.ts src/lib/partners/public.ts src/app/partners/[slug]/page.tsx src/components/partners/PublicEventPage.tsx scripts/test-rack-it-up-2026.cjs qa/browser/rack-it-up-2026.cjs
node qa/browser/rack-it-up-2026.cjs
node scratch/build-maintenance-offline.cjs
```

`node scripts/test-rack-it-up-2026.cjs --preview` generates real component/CSS fixture HTML at `scratch/rack-it-up-preview/{active,pending}.html`. The active snapshot is also checked in at `docs/qa/rack-it-up-2026-preview.html`, with a regression asserting it contains the current component and stylesheet. It is explicitly labeled synthetic; its event UUID is a throwaway test fixture, never a configuration value. Fonts use local fallbacks. The browser runner blocks all page requests, disables service workers, keeps Chromium sandboxing, and defines 17 checks across 390px/1440px. It does not access a deployment or click an external registration link. Production auth/team creation and actual participant matching are not acceptance-tested by these fixtures.

Logo handoff: `public/brand/hackermate-logo-transparent.png`, 1112×432 RGBA. It is a direct 2× raster export of official `public/logo.svg`, with no background, artwork or palette changes. Alpha corners and original opaque colours are regression-tested. Use the established dark-background branding; no organizer logo/banner is fabricated. The original SVG is unchanged.

## Separately founder-approved activation checklist

1. Event identity/details are founder-verified as reported above. During a separately approved activation, reuse `f8dd958a-bb3a-46e5-bd51-432ecf067203` and confirm public/non-archived discovery eligibility. Finals December 14 and results December 15 remain separate milestones. Codex has not independently queried production.
2. Do not create another event. If later evidence conflicts with the founder-verified record, **STOP** for review of that existing record. Do not use the legacy portal provisioner or invent an ID, placeholder dates or prizes.
3. Read `GET /api/admin/partner-config` through the existing authenticated admin session. If this slug is absent, prepare the following `POST /api/admin/partner-config` body using the verified real UUID. The placeholder is intentionally invalid and must not be submitted. No credentials belong in files or logs.

```json
{"config":{
  "slug":"rack-it-up-2026",
  "partner_name":"Rack It Up 2026",
  "hackathon_id":"FOUNDER_VERIFIED_EXISTING_EVENT_UUID",
  "tagline":"Free teammate discovery for Rack It Up 2026. Register separately on Unstop.",
  "portal_version":"organizer-v1",
  "registration_mode":"external",
  "official_website":"https://rackitup.karmaenterprises.tech",
  "logo_url":null,"banner_url":null,"accent_color":null,
  "public_contact":null,"approved_links":[]
}}
```

4. Idempotency: if the slug already has exactly this verified association/public configuration, do nothing. If it differs, **STOP**; do not overwrite it or any other partner. Concurrent POST conflict (409) means reread and compare, never automatically retry or update. A separately approved correction can use the existing revision-guarded PATCH; it is not part of this task. Configuration grants no organizer account, role or extra permission. No migration is required for this payload.
5. After separate code-release and configuration approvals, verify `/partners/rack-it-up-2026`, the external CTA, `/hackathons/ACTUAL_UUID?tab=looking_for_teams`, solo/team bounds, login return path, pending/error states, keyboard focus and both viewport widths. Complete the blocked browser/build gates and check final-head CI before launch. Registration must open exactly `https://unstop.com/hackathons/rack-it-up-2026-48-hour-online-hackathon-by-rackem-karma-enterprises-1777639`.
6. Obtain founder launch approval before sharing the live matching URL or logo with the organizer. No emails, production reads/writes, migrations, deployment commands or launch were performed here. Main advanced during this task to `f1917c5ce0b586e0a8d68f02d17c466405b40f04` through workflow-only PR #81; application source is unchanged. That workflow runs TypeScript, auth/evaluator/matching, and existing partner presentation/discovery/authorization tests. It does not automatically run the new Rack/browser tests. This PR does not modify the workflow.
