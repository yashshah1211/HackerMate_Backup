# Social sharing and link-preview audit — Mission 12

Base: `98fc344fd30846078e3d4992d832b943cfa466e9`, 30 October 2026. Primary URLs: `https://hackermate.in/` and `https://hackermate.in/partners/rack-it-up-2026`.

**Evidence classes:** SOURCE = repository/code and image bytes; LOCAL HTTP = actual Linux production Next.js HTML/assets using synthetic loopback database responses and offline fonts; LIVE = public deployed HTTP; PLATFORM = an actual WhatsApp/Discord/LinkedIn/etc. rendered preview. SOURCE/LOCAL HTTP do not establish LIVE/PLATFORM acceptance.

## Ranked findings and focused fixes

| Impact | Verified before-change evidence | Action |
| --- | --- | --- |
| High: partner shares can lack any preview image | LOCAL HTTP Rack fixture with no configured artwork emitted neither `og:image` nor `twitter:image`. SOURCE explicitly returned empty image arrays, suppressing the global brand fallback. | Use the existing approved `/og-image.png` (1200×630) when normalized banner/logo is absent. Alt describes HackerMate, not an invented Rack poster. |
| Medium: unavailable partner shares claim homepage identity | LOCAL HTTP missing/error fixtures emitted `og:title=HackerMate \| Team Operating System`, homepage `og:url` and homepage Twitter tags despite the partner no-index state. | Explicitly clear inherited canonical/OG/Twitter values on missing/unavailable results. Keep existing page rendering/status logic. |
| Medium: square logo declared as a large landscape card | LOCAL HTTP official Rack logo fixture selected the 1024×1024 PNG with `twitter:card=summary_large_image`. This is an aspect/card mismatch risk; actual platform cropping was not observed. | Preserve the image and use `summary` for logo-only configurations; banners and the landscape fallback keep `summary_large_image`. Other logo dimensions still need owner/platform review. |
| Medium: homepage canonical absent | LOCAL HTTP `/` had no canonical link. Global OG URL was already absolute. | Add a homepage-only canonical `/`, resolved by existing `metadataBase`; do not give all child/private routes a homepage canonical. |
| Low: automatic global OG image has no alt text | LOCAL HTTP homepage lacked `og:image:alt` even though the root manual image descriptor had an alt. File-based `src/app/opengraph-image.png` takes precedence. | Add its supported `opengraph-image.alt.txt` companion using the existing approved alt text. No image bytes change. |
| Follow-up: discovery index is generic | SOURCE `/hackathons` is a client page without dedicated metadata; it inherits platform title/card/home OG URL rather than an index-specific card. | Not changed: do not broaden into Desktop's discovery/conversion work. Individual public event metadata is already specific and visibility-gated. |
| Operational: broken configured/external artwork | URL normalization rejects unsafe schemes, but syntax alone cannot prove a configured URL returns an image. Metadata cannot make a crawler choose a fallback after its chosen remote URL returns 404. | No SSR fetch/health probe added (avoids untrusted URL fetching, latency and extra dependencies). Check actual approved image endpoints during public acceptance. |

Baseline reproduction: six of nine new metadata expectations failed on unchanged main. Actual production HTML corroborated the missing canonical/image/alt and inherited-social cases. Only normalized public partner configuration and synthetic public event facts were supplied; no production Supabase was contacted. Missing partner rendering can stream an HTTP 200 while reporting not-found/no-index; changing page/status behavior is outside this metadata fix.

## Metadata and asset inventory

- Root `metadataBase` uses `NEXT_PUBLIC_SITE_URL` or `https://hackermate.in`; no configuration value was changed. Absolute output depends on the deployed value, which could not be inspected here.
- Root OG/Twitter title is `HackerMate | Team Operating System`; description is `Find teammates, discover hackathons, and collaborate with builders who share your vision.` OG uses `website`, `siteName=HackerMate`, locale `en_US`; Twitter uses a large card.
- `public/og-image.png` and `src/app/opengraph-image.png` are byte-identical PNGs, **1200×630**, **98,205 bytes**, SHA-256 `cef6a5e4ddf0ad79664414a34832e896ffb293aac82db4f29a8691d6b135b6bd`. The root file convention produces a versioned `/opengraph-image.png?...` URL; manual metadata points to `/og-image.png`. Both show the existing HackerMate identity. Neither is replaced.
- Official Rack mark: `public/partners/rack-it-up-2026/RackItUp-mark.png`, PNG **1024×1024**, **10,181 bytes**, transparent; SHA-256 `6e04d30b2da020cb0e2736be5c27b18867b796b9bf94b0fef1a9725b493e358e`. Its SVG and Karma/HackerMate marks remain unchanged. Karma's 400×400 opaque cream background is intentionally preserved.
- Rack title/description continue to use the existing founder-confirmed constants, not stale event text, unapproved prizes, registration totals or participant details. The official registration URL, conversion handlers, page rendering, branded assets and styles do not change.
- Banners retain priority over logos. Their dimensions/availability are configuration-specific and not inferred from the word “banner.” For the known square Rack logo, the compact card avoids requesting a large card; the exact crop is still platform-owned.
- No custom `robots.txt`/robots route was found. Public metadata is crawlable by default; missing/unavailable partner and event results use no-index. This is not access control. Actual deployed robots files, headers and crawl restrictions remain LIVE checks.

No new image is needed for the fixes. If the owner later requires a Rack-specific large landscape card rather than the compact logo/generic fallback, supply an approved 1200×630 PNG/JPEG using the official marks, readable mobile-safe central composition and confirmed public copy only. That is a separate artwork approval; no poster, organizer claim or substitute logo is improvised here.

## Representative expected output

These assume the default public metadata base `https://hackermate.in`; they are expectations plus local fixture evidence, not a claim about live environment bindings. Canonicals exclude tracking/search/tab parameters; trailing slash normalization of the homepage is harmless.

| Shared route/state | Canonical and OG URL | Image/card |
| --- | --- | --- |
| `/` | `https://hackermate.in/` (OG may serialize without trailing slash) | OG `https://hackermate.in/opengraph-image.png?<build-hash>`; Twitter `https://hackermate.in/og-image.png`; identical 1200×630 artwork, large card, approved alt |
| Rack, no artwork | `https://hackermate.in/partners/rack-it-up-2026` | OG/Twitter `https://hackermate.in/og-image.png`, 1200×630, large card, `HackerMate — Team Operating System` alt |
| Rack, official logo only | Same canonical/OG URL | OG/Twitter `https://hackermate.in/partners/rack-it-up-2026/RackItUp-mark.png`, 1024×1024, summary card, Rack title alt |
| Rack, approved banner | Same canonical/OG URL | Exact configured safe banner URL, large card; live image format/status/aspect still requires checking |
| Missing/unavailable partner | No canonical or inherited OG/Twitter identity | No-index/no-follow; no fabricated event/organizer data |
| `/hackathons/<PUBLIC_EVENT_UUID>?tab=looking_for_teams&utm_source=...` | `https://hackermate.in/hackathons/<PUBLIC_EVENT_UUID>` | Public event title/description, brand landscape `/og-image.png`, large card; not personalized filter results |

Individual event metadata uses only anonymous public visibility-filtered reads, disables sessions/caching, strips formatting and bounds descriptions. Invalid/missing/rejected/archived/error results clear canonical/social values and return generic no-index metadata. Existing privacy/escaping tests remain in validation. No protected, certificate, onboarding or authenticated user-flow files are modified.

## Verification and boundaries

- New focused suite: `node --test scripts/test-social-sharing-metadata.cjs`; run directly for this audit. Existing partner/Rack CI checks exercise the updated fallback expectations; no workflow/configuration change is included.
- Related metadata suites: `scripts/test-public-hackathon-metadata.cjs`, `scripts/test-public-hackathon-metadata-organizer.cjs`; partner/Rack/conversion selection: `node qa/rack-qualification.cjs tests`.
- Scoped ESLint covers the two metadata page files and three affected test scripts. TypeScript is run **after** production build/type regeneration; an earlier parallel type check failed on disappearing generated `.next/types` files, not a source defect.
- Linux production builds use the existing network guard, read-only loopback Supabase fixture and supported offline fonts. New static image alt metadata required invalidating the local generated Webpack cache after a cached build omitted it. A clean build and rendered-head check are required to qualify this addition; an old cached image loader output is not accepted as passing evidence. No PNG, production cache, deployment or configuration is changed.
- HTTP validation uses simulated WhatsApp, LinkedIn, Discord, Twitter, Facebook and Android browser user agents against the actual local production server. It checks head metadata for crawler agents, canonical/OG/Twitter URLs, descriptions, image HTTP 200/PNG MIME/measured dimensions, error suppression and query stripping. This is SSR compatibility, not a social app screenshot or cache refresh.
- Live check: an unauthenticated bounded HEAD request to `https://hackermate.in` was rejected by the environment proxy with CONNECT 403 before reaching origin. `hackermate.in`/Vercel hosts are not in the current egress allowlist. It is **not** a verified site 403, broken image or crawler denial. No network policy was changed or bypassed. Rack/event LIVE status, real configuration, redirects, robots and artwork URLs remain unverified.
- Final local results: **46 metadata tests passed** (9 new focused cases plus 37 event metadata/organizer compatibility cases), **841 partner/Rack/conversion tests passed**, scoped ESLint passed, TypeScript passed after regeneration, and a clean Linux production build passed. **42 production-HTTP cases passed** across six user-agent variants, including HTTP 200 PNG responses with measured dimensions. All database transport was a read-only synthetic loopback fixture; zero mutation requests.
- Prior Mission 10 documents remain untracked and untouched; they are not part of this PR. Only metadata, metadata expectations and this audit are in scope. No production DB, paid service, new dependency, deployment, merge, configuration, certificate/onboarding/auth-flow or reel-project change.

## Independent public/platform acceptance still required

After an independently approved release and permitted public HTTP access, record initial/final URL and redirect chain for apex and partner links with browser and crawler UAs. Inspect raw HTML (no JS requirement), canonical/OG/Twitter values, robots headers/tags and image URLs. Request only the selected approved image endpoints, confirm HTTPS, unauthenticated HTTP 200, actual `image/*` bytes, dimensions/size and no HTML/login/403 placeholder. Do not automatically fetch arbitrary partner URLs or access the production database directly.

Then obtain actual mobile WhatsApp/Discord/LinkedIn previews through the owner's normal approved workflow. Compare title/description, logo/landscape crop, fallback and branding, noting platform/app/version, URL and time. Do not message communities, scrape protected content or buy a service. Existing caches may persist; do not claim a refresh from a bot UA, canonical update, URL inspector request or arbitrary query suffix alone. No platform cache refresh or real platform preview is verified by this audit.

Recommendation: review the focused source fixes; require fresh-build metadata evidence and live/platform checks before claiming public preview acceptance. The existing source/API privacy and synthetic SSR evidence do not establish that every deployed share cache is correct.
