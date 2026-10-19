# Public hackathon metadata

Base: current `main`, `432e76c2760946116fc298efd02efc208972e0f7`.
Branch: `feat/public-hackathon-metadata`.

## Root cause and behavior

`src/app/hackathons/[id]/page.tsx` is a client component and had no server metadata layout. Every event inherited the root `HackerMate | Team Operating System` title, description and homepage Open Graph URL. Fetching details after hydration cannot reliably supply metadata to preview bots.

A passthrough server layout now awaits route params and generates metadata without changing the client page. Approved, explicitly non-archived events receive their public name, a plain-text description capped at 160 characters (or a meaningful fallback), event canonical URL, matching Open Graph and Twitter tags, and the existing `/og-image.png`. Root metadataBase resolves image URLs. The title is absolute to avoid adding the site suffix twice. Canonical URLs use the same configured site origin/fallback as the root layout and exclude query parameters.

Archived, rejected, pending/unpublished, absent and malformed events, invalid UUIDs, denied reads and transport failures receive the same generic unavailable metadata, `noindex, nofollow`, no event canonical, and no inherited social metadata. Invalid IDs do not query Supabase. A missing/malformed name or mismatched record ID also fails closed. Existing unavailable UI and HTTP status behavior remain unchanged (200 with noindex, rather than introducing a route-level 404).

## Security, scope and cost

- Reuses `loadPublicEvent`, `PUBLIC_EVENT_COLUMNS`, and the existing strict approved/non-archived checks. No new public projection or permissive visibility shortcut.
- Uses only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with the existing SDK. No service-role access, cookies, incoming authorization headers, stored sessions, profile/participation queries or writes in metadata.
- Requests explicitly use `cache: no-store` and a five-second timeout. No application/ISR cache retains an event after moderation. A valid detail request adds one bounded public read; existing client reads remain unchanged. This uses existing infrastructure/free allowances; no paid APIs, dependencies or recurring costs are introduced (₹0 added service cost).
- Next serializes metadata as escaped HTML; event text is never inserted as raw markup. Description formatting is deliberately lightweight, not a complete Markdown renderer.
- The passthrough layout also applies to nested organizer routes. It can expose only the same public event metadata and does not alter their authorization or content.
- No onboarding, dashboard, teams, builder matching, activation, partnership/Hustle, authentication, middleware, schema/RLS/migrations, data, real environment files, OAuth or deployment settings changed. Broad existing database permissions remain outside this change.

## Exact changed files

1. `src/app/hackathons/[id]/layout.tsx` — minimal server metadata layout.
2. `src/lib/hackathons/publicMetadata.ts` — anonymous public metadata loader and formatting.
3. `scripts/test-public-hackathon-metadata.cjs` — 19 offline metadata contract/security tests.
4. `scripts/test-public-hackathon-metadata-production.cjs` — actual Next production build and server HTML assertions.
5. `docs/architecture/public-hackathon-metadata.md` — audit and handoff.

## Verification

```sh
node scripts/test-public-hackathon-metadata.cjs
node scripts/test-public-hackathon-data.cjs
node scripts/test-public-hackathon-browsing.cjs
node scripts/test-public-hackathon-shell.cjs
node scripts/test-public-hackathon-metadata-production.cjs
npx tsc --noEmit --incremental false
npx eslint src/lib/hackathons/publicMetadata.ts 'src/app/hackathons/[id]/layout.tsx' scripts/test-public-hackathon-metadata.cjs scripts/test-public-hackathon-metadata-production.cjs
```

The four unit/regression suites pass **114 tests** (19 + 21 + 63 + 11), including existing guest/member/onboarding and account-verification behavior. TypeScript and scoped lint pass. No dependencies or lockfile changes.

The production harness builds the actual application with `next build --webpack` and runs `next start`, using synthetic anonymous credentials, a loopback read-only Supabase fixture and offline font responses. It removes inherited service/provider credentials from the child environment and refuses real `.env` / `.env.local` files. These are disposable test-process variables, not application/deployment configuration changes. Existing landing count queries receive empty read-only responses only during build.

It verifies **30 HTTP HTML cases**: approved, archived, rejected, missing, pending and malformed IDs for WhatsApp, LinkedIn, Twitter, Facebook and a regular browser user agent. Bot assertions inspect `<head>` directly without executing JavaScript. Assertions cover title, description, canonical, OG URL/image/title/description, Twitter card/image/title/description, noindex and absence of private sentinels. Ordinary browser metadata may stream into the body, per Next's built-in behavior. Every valid runtime request makes a fresh fixture read with anonymous headers and approved/non-archived filters; malformed IDs make none. Evidence and build/runtime logs are saved under `work/public-metadata/`, outside the committed deliverables. No live Supabase reads or writes occur.

Existing Next middleware deprecation, Sentry instrumentation, Edge/Supabase compatibility and webpack cache warnings remain outside scope. An initial typecheck encountered stale malformed `.next/dev/types` from the supplied checkout; clearing that generated cache and rebuilding resolved it without source changes. The initial HTTP harness flagged inherited build-time landing HEAD count requests after the 30 HTML assertions passed; the fixture now explicitly handles only those known build reads and continues to reject unexpected runtime requests.

## Preview and search limitations

Next 16.3.8's default HTML-limited bot list includes WhatsApp, LinkedInBot, Twitterbot and facebookexternalhit; no bot/deployment configuration override is necessary. Other user agents may receive streamed metadata. These tests prove generated HTML, not live third-party rendering or indexing. The client page still hydrates its event content; this focused change does not introduce server-rendered event content, a sitemap, structured Event data, or guarantee ranking.

Social platforms and search engines keep their own caches. Existing shared links may retain older previews until recrawled or refreshed through platform tools. Previously cached public data cannot be recalled after an event becomes private. Application metadata is checked afresh on each request, but third-party caching, robots/reachability policy and unknown bot parsing remain external limits. The existing shared image supplies site branding rather than event-specific artwork.

This is a draft review change only. No merge, deployment, production data change or release activation is performed.
