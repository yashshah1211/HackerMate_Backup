# PR A security review and dependency triage

Reviewed on October 18, 2026 against `main` `ca87b8ac419083e2a2b6e6b99bf79797e817f3cd`, including PR #26. Original implementation commit `9cbb409` is preserved; main was merged without rewriting history. Local merge simulation had no conflicts. GitHub subsequently reported `mergeable=true`, `mergeable_state=clean`; the PR remains a draft.

## Standards

Independent read-only review found no documented-standard violations or actionable heuristic findings in the PR A diff. Authorization precedes privileged work and UI, projections are explicit, new tables default-deny browser access, diagnostic logging excludes sensitive payload details, and all database test data is synthetic with disposable-cluster cleanup. Core-page smoke coverage is explicitly limited to synthetic query contracts.

## Spec

The review found one functional defect: cookie-session refresh updates were discarded on the new standalone organizer routes, which are outside the existing middleware's generic organizer matcher. Fixed by adding an optional cookie-update callback to the shared verified-profile/partner helpers and wrapping private Round 2 responses to persist updates on both successful and denied requests. Existing callers retain their default behavior. Tests cover an actual expired cookie, refresh-token rotation through the installed Supabase SSR client, and a follow-up authenticated request without a bearer header.

Additional privacy hardening changes generated links to `/partners/hustle-carnival/phase-2/invite#<secret>`. Fragments are not sent in HTTP request targets. The standalone landing page immediately removes the fragment with `history.replaceState`; it contains no token in server-rendered HTML and performs no database lookup on GET. An explicit same-origin POST exchanges the in-memory secret into an HttpOnly/SameSite cookie. Only hashes reach the database. Old token-path URLs are not issued and return a generic 404; no real invitations were issued during development. Regression checks compare raw tokens against HTTP URLs and Next access logs.

Follow-up independent review found no actionable defects in either fix. Standards findings: 0. Spec findings: 1, fixed; worst initial finding was cookie-refresh loss (P2).

## Dependency audit

`npm audit --json` was rerun against the unchanged lockfile. It reports **8 affected package entries: 7 high and 1 critical**. These are not eight independent vulnerabilities: five high entries describe the same development-tool dependency chain. No `npm audit fix`, downgrade or dependency upgrade was performed.

| Package / chain | Installed and advisory | Exposure assessment for this PR | Release action |
| --- | --- | --- | --- |
| Next.js | 16.3.5; critical [ImageResponse RCE](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | The advisory requires attacker-controlled SVG values in Node `next/og` ImageResponse. Repository search found no `ImageResponse` or `next/og` use; metadata images are static files. Round 2 serves escaped HTML/JSON, not generated images. No affected code path identified. | A separately reviewed framework security update is recommended before launch. 16.3.6 patches this issue; other listed Next issues require at least 16.3.8. Validate the chosen supported patch with the app's full regression suite. |
| Next.js | High [image-optimizer SSRF](https://github.com/advisories/GHSA-cjq9-62q9-8jv4), plus cache/metadata/dev-server findings in the audit JSON | No `images.remotePatterns` are configured; the advisory explicitly says this SSRF condition does not apply without them. New private routes are dynamic/no-store and do not invoke image optimization, Draft Mode or `use cache`. Existing ISR pages still need platform-wide assessment in the security update. | Preserve current restrictions. Resolve applicable framework advisories or document verified mitigations before enabling live registration. |
| sharp | 0.35.4; high [librsvg memory vulnerability](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) | Installed through Next. No direct sharp/SVG-decoding path in new routes. Current upload MIME allow-list excludes SVG; Next's SVG optimization is not enabled. This does not establish safety for every existing image path or Linux runtime. | Review/update to a compatible patched version (advisory: 0.35.5) in the security change. |
| source-map-js | 1.2.1; high [indexed-source-map DoS](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | Used by PostCSS/Tailwind/Next build tooling. New endpoints do not parse submitted source maps. No new public input path identified. | Review a compatible 1.2.2+ resolution and build regression tests. |
| eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces | braces 3.0.3; high [nested-pattern stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | Five affected-package entries for the lint dependency chain. New public routes do not accept glob patterns or invoke lint tools. | Resolve within a compatible lint/tooling update. Do not follow npm's suggested Next ESLint downgrade to 14.2.35 blindly. |

This triage does not claim the whole deployed application is free of these vulnerabilities. The disabled PR can be reviewed independently; live registration should wait for an explicitly accepted security update or verified mitigation decision. The dependency manifests and lockfile remain byte-identical to updated main.

## Remaining launch gates

1. Approve the final implementation and separately authorize release; the source and environment gates currently keep production and Preview off.
2. Verify the dedicated migration, current protected-profile/auth grants, and the existing organizer predicate against an approved schema-compatible environment. Disposable PostgreSQL tests are not a full Supabase/PostgREST integration deployment. Do not apply the migration to a connected database as part of this PR.
3. Resolve the dependency security decision above before launch.
4. Approve the official CSV mapping (leader plus optional second member; 500-team pilot cap), provision reviewed organizer accounts, import the official shortlist and explicitly activate the reviewed batch only during the separately approved release.
5. Verify platform/APM settings do not capture request bodies or cookies containing bearer secrets. Fragment links address normal URL access-log exposure; this is not permission to record sensitive POST bodies or auth cookies. Define access and retention for shortlist PII.
6. Separately authorize the actual invitation distribution process. This PR has no email/WhatsApp dispatch, no sent/read/delivery claims, and no automatic outreach.
7. Run approved end-to-end integration and release smoke checks, including the exact October 23 window (10:00:00 IST inclusive, 23:00:00 IST exclusive). Review the shared public mutation ceiling for the final shortlist and traffic volume.

Recommendation: suitable for final review as a disabled draft once the final Preview checks pass. It is not authorized or ready for live registration until the gates above are fulfilled.
