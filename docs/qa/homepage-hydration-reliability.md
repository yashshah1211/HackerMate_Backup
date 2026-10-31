# Mission 16 — Homepage hydration reliability

Base: `0ef764ca0b078c10ec18e7b3f017aa2ec0c70282`. Branch: `fix/homepage-hydration-reliability`. Founder approved both fixes and isolated validation on October 31, 2026. No deployment is part of this task.

## Confirmed causes

### 1. Homepage route identity changes across hydration

Public production `/` returned server HTML containing `[data-shell-root]` and the app navigation rail. Its serialized router payload contained `c: ["", "index"]`. The browser pathname was `/`; client React expected `PublicHeader` instead.

A read-only Chromium breakpoint at the actual #418 throw captured the failing host fiber as `header` and the existing server node as the app-shell `div`. Full named development diagnostics from the real shell with those captured path inputs reproduced:

```text
NotificationProvider > AppShell > AuthenticatedAppShell > ShellProvider > PublicHeader
+ <header className="fixed inset-x-0 top-0 ...">
- <div data-shell-root="true" className="flex h-[100dvh] ...">
```

The exact `/index` alias was not classified as the homepage. The correction canonicalizes only this value before shell, header and footer presentation decisions. Every other pathname, including null and `/index/child`, is preserved. No route, auth predicate, redirect, middleware or permission changes. A follow-on strict assertion caught footer spacing still using raw `/index`; the footer now uses the same normalization.

The platform reason for serializing the ISR homepage as `/index` is not claimed fixed or fully explained. The observed application-level mismatch is reproduced and corrected. Unchanged localhost production builds did not naturally emit this alias; the real-component regression supplies the exact captured server/browser pathname pair rather than claiming that localhost reproduces Vercel routing internals.

### 2. Reduced-motion preference changes the first component tree

`useStoryActive` read Motion's browser preference during render. Server preference was false/unknown; a reduced-motion browser returned true immediately. `HeroPipeline` consequently changed from `running 1/5` / first stage / `StatusDot` to `passed 5/5` / final stage / `Check` SVG before hydration completed. Other preview components also use this shared value structurally.

The real landing component, real React and real Motion reproduced this independently of the shell. Development diagnostics identify `LandingPageClient > LandingHero > HeroPipeline > Check > svg`. The unchanged local Webpack and default Turbopack production builds both reproduced #418 with reduced motion at 390px/1440px; normal motion passed locally when the server pathname was `/`.

The correction uses `useSyncExternalStore` with a stable false server/hydration snapshot and the browser media-query snapshot afterwards. Preference changes subscribe to `change` and listeners are removed on unmount. Existing viewport/visibility activation, example timers, animation components, durations and manual stage controls remain intact. No SSR disabling or new hydration-warning suppression.

## Production reproduction and evidence

Extension-free sandboxed Chrome, fresh ephemeral contexts, no accounts/cookies supplied. Both widths (390/1440), normal/reduced motion and fresh/reload: #418 reproduced in all eight completed cases. One initial fast capture preceded hydration; it was not counted as a pass and was completed by a targeted rerun waiting for an actual React commit. A separate normal-motion breakpoint run reproduced without the commit observer.

Only public homepage/static GETs were permitted. Analytics, auth/data APIs, prefetches and write methods were blocked. No production SQL, database connector, authentication, user records or paid provider calls. Live production was not modified, so **there is no post-deployment production pass claim**.

Full before console stacks, captured public HTML, component ancestry and screenshots are local under workspace `scratch/mission16-hydration/`; unminified development evidence is under this worktree's ignored `scratch/mission16/`. Production stack begins at `r1 (.../2uxic1v42do3y.js:32:46297)`; the breakpoint evidence records the expected header and actual app-shell body. Raw production HTML is not committed.

## Changed files

1. `src/components/shell/navConfig.tsx` — exact alias normalization.
2. `src/components/shell/AppShell.tsx` — consistent pathname in both shell decisions. Explicitly includes React's stable `setInboxOpen` setter in its existing callback dependency array to retain compiler-compatible memoization; behavior/identity semantics unchanged.
3. `src/components/shell/PublicHeader.tsx` — same homepage identity for stage navigation/progress.
4. `src/components/Footer.tsx` — same homepage spacing identity.
5. `src/components/landing/primitives.tsx` — hydration-safe motion preference and cleanup.
6. `scripts/test-homepage-hydration.cjs` — real server rendering and separate JSDOM/browser React realm; route boundary, server-node identity, first commit, preference and cleanup assertions.
7. `qa/browser/homepage-hydration.cjs` — builds the actual default production bundle, starts temporary loopback Next, gates scripts to capture SSR nodes and qualifies eight Chromium navigations.
8. `qa/rack-qualification.cjs` — includes the new focused suite and keeps the synthetic fixture alive across build/start/browser qualification, avoiding a compiled-port mismatch.
9. `.github/workflows/rack-portal-qualification.yml` — relevant path filters and existing isolated build step now runs hydration qualification; retains screenshot/log artifacts. No deploy/secret/write permission added.
10. This report.

No dependency, lockfile, environment file, signup, evaluator, certificate, promotional asset, social metadata, schema or production configuration changes. Installed dependencies were reused only after identical lockfile verification; no package installation/lifecycle scripts ran locally.

## Validation

| Exact command | Fresh local result |
| --- | --- |
| `node --import=./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-homepage-hydration.cjs` | Before: 1/6 pass, 5 fail; after: 6/6 PASS. The normal-motion root control passed before the fix. |
| `node qa/rack-qualification.cjs tests` | 854/854 PASS (existing 848 plus 6 new), external application traffic blocked |
| `node qa/rack-qualification.cjs hydration` | Default production build PASS, 96/96 static pages; 8/8 real Chromium fresh/reload/motion/width cases PASS; 4 synthetic fixture reads, 0 mutations |
| `node qa/rack-qualification.cjs funnel-browser` | 32/32 PASS, synthetic guest/incomplete/member Rack journeys |
| `node qa/rack-qualification.cjs browser` | 19/19 PASS, existing portal branding/CTA/responsive/isolation checks |
| `node qa/test-rack-network-guard.cjs` | 8/8 PASS |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS on final source |
| Scoped ESLint (command below) | 1 pre-existing error / 0 warnings; all other edited code/test files clean |
| `git diff --check` | PASS before publication |

```powershell
node node_modules/eslint/bin/eslint.js src/components/landing/primitives.tsx src/components/shell/navConfig.tsx src/components/shell/AppShell.tsx src/components/shell/PublicHeader.tsx src/components/Footer.tsx scripts/test-homepage-hydration.cjs qa/browser/homepage-hydration.cjs qa/rack-qualification.cjs
git show '0ef764ca0b078c10ec18e7b3f017aa2ec0c70282:src/components/shell/AppShell.tsx' | node node_modules/eslint/bin/eslint.js --stdin --stdin-filename src/components/shell/AppShell.tsx
```

Both candidate and exact main report the same existing `no-explicit-any` error in the stored theme cast. An introduced compiler diagnostic was isolated by in-memory lint comparisons and resolved with the stable setter dependency; it is not relabeled as baseline. No rule was suppressed and no unrelated lint cleanup performed.

Additional command: `node --import=./qa/fixtures/rack-network-guard.mjs --test --test-concurrency=1 scripts/test-auth-browsing-compatibility.cjs scripts/test-public-hackathon-shell.cjs scripts/test-homepage-hydration.cjs`: 17 tests passed; one archival cross-branch file could not initialize because `AUTH_REVIEW_ROOT` / `SUSPENSION_REVIEW_ROOT` historical checkout prerequisites were absent. Those were not invented or redirected to current source. Current shell and hydration tests passed; the archived comparison is unverified, not a candidate functional failure.

The Chromium checks assert no recoverable/runtime hydration error, no server header/main/heading replacement, no missing initial heading, no heading layout jump, no horizontal overflow, retained dark public theme even with a light system preference, correct existing CTA hrefs, working autoplay/manual stages and honored reduced motion. Media/locale/timezone cases use actual Chromium. JSDOM provides its missing native scrolling API; its geometry is not presented as browser evidence. The focused suite captures unknown console errors and uses real React/Motion, not a mock hydration implementation.

Expected blocked-analytics resource errors and the existing guest SDK `AuthSessionMissingError` console log remain distinguishable from hydration errors. Production build retains existing framework/Sentry/Edge warnings, unsuppressed. Mocked fonts and synthetic empty data are intentional; pixel identity with production fonts/data is not claimed.

## Evidence and remaining gates

After screenshots/logs: `scratch/homepage-hydration/{390,1440}-{no-preference,reduce}-{fresh,reload}-{server,hydrated}.png`, `results.json` and `server.log`. Mobile/desktop hydrated screenshots visually inspected. The existing Linux workflow publishes them with qualification logs; current-head CI results will be linked in the Draft PR.

GO for independent Draft review after current-head CI. Merge, deployment and production changes are not authorized. A separately approved release and fresh public production smoke check are needed to confirm the deployed symptom is gone. The patch does not alter Vercel routing/cache configuration. Rollback is an application commit revert, with no database or environment recovery required. Browser coverage is Chromium; live authentication and private data were not exercised.
