# Hustle Carnival local portal

The narrow `/partners/hustle-carnival` route reuses `Logo`, `PartnerImage`, the existing partner/app shell and `eventDiscoveryHref`. A separate component and CSS module provide the two-phase presentation without modifying shared partner layouts or relying on a missing production partner config. The supplied JPEGs are copied unchanged. No dependency manifest, lockfile, migration, global style, discovery flow or existing route was changed.

The typed presentation facts are independent of database metadata. An anonymous server-only resolver checks only the exact approved event's explicit public projection, disables session persistence and caching, and bounds each fetch to four seconds. The community action fails closed on stale metadata, missing/unapproved/archived rows, mismatched IDs, incorrect event type and lookup failures. The reviewed corrected fixture enables the existing event-specific discovery deep link. Official registration remains on Unstop in every state. The metadata plan is in `docs/hustle-carnival-metadata-correction-plan.md`.

## Reproduce checks

Use the repository's declared dependencies. This workspace initially lacked `@playwright/test`, `jsdom` and `esbuild`; those were restored only in scratch dependencies, without editing the paused checkout or tracked manifests. `axe-core`, used by the browser checks, is already supplied by the locked `eslint-plugin-jsx-a11y` development dependency. No package versions or manifests were changed. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` if Chromium is not `/usr/bin/chromium`.

```sh
npm run typecheck
npm run lint -- src/app/partners/hustle-carnival src/components/partners/HustleCarnivalPage.tsx src/lib/partners/hustleCarnival.ts src/lib/partners/hustleCarnivalPublic.ts scripts/hustle-carnival-harness.cjs scripts/test-hustle-carnival.cjs scripts/test-hustle-carnival-browser.cjs scripts/test-hustle-carnival-next-browser.cjs
node scripts/test-hustle-carnival.cjs
node scripts/test-hustle-carnival-browser.cjs
```

The offline browser harness renders the actual server route against fixtures and loads its real component CSS and JPEG assets. It checks 1440/390/320px, stale/ready/unavailable states, native FAQ keyboard use, skip links, visible focus, target sizes, overflow, safe external links and axe WCAG A/AA/best-practice rules, while blocking external HTTP requests. It does not exercise Next hydration.

For actual Next hydration, start a dedicated local process with **synthetic configuration only**:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4276 NEXT_PUBLIC_SUPABASE_ANON_KEY=hustle-offline-fixture NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 4275
```

Then, in another terminal:

```sh
node scripts/test-hustle-carnival-next-browser.cjs
```

This test owns a synthetic HTTP database on `127.0.0.1:4276`, checks the real Next route, app shell, CSS, fonts, images and hydrated FAQ at 1440/390/320px, and verifies fresh ready/error responses. External browser requests are blocked; it never follows official registration or community links into live systems. Stop the dedicated Next process after testing. The local app must be started exactly with the synthetic configuration above; the browser guard cannot audit a server started with other credentials.

Artifacts are written to ignored `scratch/hustle-carnival-qa/`, or `HUSTLE_QA_OUTPUT`. Axe automation is not a substitute for human assistive-technology testing. No staging authentication, real team-size enforcement, database RLS or production correctness is established by fixture passes.

## Release review

Keep this local and uncommitted until authorized. Required review: organizer co-branding/poster-use/community-hub approval; eligibility and registration cutoff clarification; precise database correction including date semantics, existing teams and joining/creation enforcement; authorized staging checks. Draft `noindex, nofollow` must be reviewed before public indexing. No production `partner_configs` entry was created or required for this static route.
