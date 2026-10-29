# Rack It Up 2026 official branding

Base: `1d010c145cfbd080ba68796cf89cab231db2ebb4` (merged PR #82).

Original organizer assets are copied byte-for-byte to:

- `/partners/rack-it-up-2026/RackItUp-mark.png` — primary event mark, 1024 × 1024, transparent corners.
- `/partners/rack-it-up-2026/RackItUp-mark.svg` — supplied vector, retained unchanged.
- `/partners/rack-it-up-2026/karma-logo.png` — 400 × 400; opaque cream background intentionally preserved.

The existing `logo_url` field controls the event mark. Only the Rack slug receives the small Karma logo and “Organised by Karma Enterprises” credit. HackerMate's logo, Community Partner wording, event facts, registration link and event-scoped discovery are unchanged. No tracking, queries, permissions, dependencies or schema changes.

## Verification

Focused tests check original SHA-256 asset hashes, image dimensions/backgrounds, configured logo rendering, missing-event behavior and isolation from other portals. Browser checks use actual component markup/CSS at 390px and 1440px, embedding only these local PNGs while blocking all network requests. Existing CTA, focus, facts and overflow assertions remain.

Local results: `node --test scripts/test-rack-it-up-2026.cjs` passed 27/27; `node qa/test-rack-network-guard.cjs` passed 8/8; `node qa/rack-qualification.cjs tests` passed 339/339, with zero database mutations or reads. The first attempt to generate the preview before the dependency copy completed failed with a missing React package; after the matching-lockfile copy completed, preview generation and all tests passed. No installation or dependency update was performed.

`node node_modules/typescript/bin/tsc --noEmit` passed. Scoped ESLint passed with zero errors/warnings: `node node_modules/eslint/bin/eslint.js src/components/partners/PublicEventPage.tsx scripts/test-rack-it-up-2026.cjs qa/browser/rack-it-up-2026.cjs`.

Linux browser/build results and screenshot evidence will be recorded in the Draft PR after execution. Known Windows browser/build restrictions from PR #82 are not retried. No live portal or production Supabase testing is performed. Screenshots are synthetic previews, not evidence of production configuration.

Initial Linux CI at `da7b1449574b880be05155b936999052a2f6d9ac`: 8/8 network checks; partner tests 338/339; browser 19/19; production build passed (96 static pages, four synthetic reads, zero mutations); standard PR validation passed. The single failure correctly detected Git's CRLF-to-LF normalization of the supplied SVG. A directory-local `.gitattributes` rule disables text normalization for this exact SVG, preserving its original 285 bytes. The original hash assertion remains unchanged. Final CI results are recorded in the PR.

## Separate founder-approved activation

After independent review, merge and deployment approval, verify all three deployed asset URLs manually. Then use the existing admin partner configuration flow to update **only** the existing `rack-it-up-2026` row's `logo_url` to:

```text
/partners/rack-it-up-2026/RackItUp-mark.png
```

The existing authenticated `PATCH /api/admin/partner-config` body is:

```json
{
  "partnerId": "<existing Rack partner configuration row ID>",
  "expectedRevision": "<fresh revision returned by the admin GET>",
  "config": {
    "logo_url": "/partners/rack-it-up-2026/RackItUp-mark.png"
  }
}
```

Placeholders must be replaced from the existing admin record; do not use the event UUID as the partner configuration ID. Preserve the current logo value for rollback. Do not POST a new configuration or event. Keep the founder-verified event binding `f8dd958a-bb3a-46e5-bd51-432ecf067203` unchanged. A revision conflict requires reloading and reviewing, not overwriting.

This PR performs no production configuration update. If rollback is required, restore only the previous `logo_url` using a fresh revision and revert the branding code through the normal reviewed release process. No database migration is needed.
