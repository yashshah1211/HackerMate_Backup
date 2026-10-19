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
3. `scripts/test-public-hackathon-metadata.cjs` — 29 offline metadata contract/security tests.
4. `scripts/test-public-hackathon-metadata-organizer.cjs` — eight nested-layout and native-portal compatibility regressions.
5. `scripts/test-public-hackathon-metadata-production.cjs` — actual Next production build and server HTML assertions.
6. `docs/architecture/public-hackathon-metadata.md` — audit and handoff.

## Verification

```sh
node scripts/test-public-hackathon-metadata.cjs
node scripts/test-public-hackathon-metadata-organizer.cjs
node scripts/test-public-hackathon-data.cjs
node scripts/test-public-hackathon-browsing.cjs
node scripts/test-public-hackathon-shell.cjs
node scripts/test-hackathon-discovery.cjs
node scripts/test-organizer-workspace.cjs
node scripts/test-organizer-broadcast-authorization.cjs
node scripts/test-public-hackathon-metadata-production.cjs
npx tsc --noEmit --incremental false
npx eslint src/lib/hackathons/publicMetadata.ts 'src/app/hackathons/[id]/layout.tsx' scripts/test-public-hackathon-metadata.cjs scripts/test-public-hackathon-metadata-organizer.cjs scripts/test-public-hackathon-metadata-production.cjs
```

The eight unit/regression suites pass **268 tests**: metadata 29, metadata/organizer compatibility 8, public data 21, browsing 63, public shell 11, discovery 47, organizer workspace 65 and organizer authorization 24. Existing guest/member/onboarding and account-verification behavior remains covered. TypeScript and scoped lint pass. No dependencies or lockfile changes.

The production harness builds the actual application with `next build --webpack` and runs `next start`, using synthetic anonymous credentials, a loopback read-only Supabase fixture and offline font responses. It removes inherited service/provider credentials from the child environment and refuses real `.env` / `.env.local` files. These are disposable test-process variables, not application/deployment configuration changes. Existing landing count queries receive empty read-only responses only during build.

It verifies **44 HTTP HTML cases**: approved, archived, rejected, missing, pending, hostile encoded text, denied public reads and malformed IDs for WhatsApp, LinkedIn, Twitter, Facebook and a regular browser user agent, plus four nested `/organizer` cases for approved, archived, pending and denied public reads. Bot assertions inspect `<head>` directly without executing JavaScript. Assertions cover title, description, canonical, OG URL/image/title/description, Twitter card/image/title/description, noindex and absence of private sentinels. Ordinary browser metadata may stream into the body, per Next's built-in behavior. All 39 valid runtime requests make a fresh fixture read with anonymous headers and approved/non-archived filters; malformed IDs make none. Evidence and build/runtime logs are saved under `work/public-metadata/`, outside the committed deliverables. No live Supabase reads or writes occur.

Existing Next middleware deprecation, Sentry instrumentation, Edge/Supabase compatibility and webpack cache warnings remain outside scope. An initial typecheck encountered stale malformed `.next/dev/types` from the supplied checkout; clearing that generated cache and rebuilding resolved it without source changes. The initial HTTP harness flagged inherited build-time landing HEAD count requests after the 30 HTML assertions passed; the fixture now explicitly handles only those known build reads and continues to reject unexpected runtime requests.

## Focused review follow-up

The only additional application-source change is in `publicMetadata.ts`. It reuses the existing, unchanged `plainEventText()` from `discovery.ts` for HTML stripping and common named-entity decoding. Markdown cleanup runs first, then the shared helper strips raw HTML and decodes once. Consequently `&lt;code&gt;` becomes literal `<code>` text, which Next safely escapes into metadata. Decoded angle brackets are not parsed as HTML again. Quote/heading markers are removed only at line starts; literal `>` comparisons, `C#`, unsupported numeric references and unknown/incomplete entities are preserved. The shared helper is intentionally not a complete HTML entity parser. Non-string descriptions retain the existing fallback, and control characters are normalized.

Ten added metadata tests cover the requested named entities, mixed HTML/Markdown, malformed formatting, literal special characters, headings/hashes, numeric references, control characters, non-string values, single-pass decoding and hostile encoded text/title handling. Production HTML assertions check raw escaping, DOM text/content equality, no double escaping, and absence of injected script nodes/attributes. A failed-read fixture uses HTTP 403 so the existing SDK's automatic 503 retries do not distort the one-read assertion; no retry behavior was changed in the application.

The existing nested organizer layout still constructs its own cookie-aware request and resolves the existing authorized redirect. The native page still wraps content in AuthGuard and independently verifies `getUser()`, `can_access_partner_event`, native event type and exact owner before registration/resource/stage/announcement reads. None of those files changed. The eight new composition/effect regressions exercise the real parent and nested layout functions and native page loading effect with separate public/authorized fixtures: public success, unpublished, archived and failed reads retain owner access; signed-out, revoked and wrong-owner cases remain denied; a failed metadata read does not swallow the existing authorized redirect. Visual AuthGuard rendering is stubbed in these focused tests; existing organizer authorization suites also pass. No live organizer session, Supabase connection, private user data or write is used.

The four nested production HTTP checks use signed-out requests and prove inherited metadata safety and render availability, not live authorized organizer content. Legitimate owner access is exercised by the isolated effect/server regressions above. Public metadata never reads organizer fields, even if the fixture deliberately returns private extra properties.

Follow-up files: `publicMetadata.ts`, the metadata unit and production scripts, the new metadata/organizer script, and this document. The parent metadata layout itself, organizer page/layout, shared discovery helper, auth, Desktop Codex first-team activation areas, onboarding, dashboard, team formation, Hustle/partnership code and dependency manifests remain unchanged. Final diff and independent merge review remain required before release; no merge or deployment is authorized by these checks.

## Preview and search limitations

Next 16.3.8's default HTML-limited bot list includes WhatsApp, LinkedInBot, Twitterbot and facebookexternalhit; no bot/deployment configuration override is necessary. Other user agents may receive streamed metadata. These tests prove generated HTML, not live third-party rendering or indexing. The client page still hydrates its event content; this focused change does not introduce server-rendered event content, a sitemap, structured Event data, or guarantee ranking.

Social platforms and search engines keep their own caches. Existing shared links may retain older previews until recrawled or refreshed through platform tools. Previously cached public data cannot be recalled after an event becomes private. Application metadata is checked afresh on each request, but third-party caching, robots/reachability policy and unknown bot parsing remain external limits. The existing shared image supplies site branding rather than event-specific artwork.

This is a draft review change only. No merge, deployment, production data change or release activation is performed.
