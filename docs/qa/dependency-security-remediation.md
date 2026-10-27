# Dependency security remediation

Base: verified main `768477307ec5eabfcbaf136b79a4835042af3a78` (includes PR #74). This patch changes only three transitive entries in `package-lock.json`; `package.json`, direct dependencies, overrides and application source are unchanged.

| Package | Before | After | Dependency chain and scope |
| --- | --- | --- | --- |
| DOMPurify | 3.4.16 | 3.4.17 | Optional dependency of production `jspdf@4.2.1` (`^3.3.1`). The application's inspected PDF creation paths use jsPDF text APIs; no direct `.html()` use was found in those paths. This does not prove all runtime exploit paths absent. |
| Zod | 4.4.3 | 4.6.7 | `eslint-config-next` → `eslint-plugin-react-hooks` (`^3.25.0 || ^4.0.0`), also satisfying the same peer range of `zod-validation-error`. Development tooling. |
| fast-uri | 3.1.8 | 3.1.9 | `@sentry/nextjs` → Sentry webpack plugin → webpack → schema-utils → two nested AJV 8 installations (`^3.0.1`). Build/schema tooling, but included in the production dependency tree; runtime exposure is not ruled out. |

The original registry audit reported three packages: one critical, one high and one moderate. DOMPurify's audit included GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr and GHSA-c6gr-qvv4-5v3f; Zod included GHSA-mrhx-c7xc-m3w5; fast-uri included GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr and GHSA-333x-w4r6-6crp. Original production-only audit reported two packages: one critical and one moderate. After the lock update, both `npm audit --json` and `npm audit --json --omit=dev` reported **zero findings**. Registry audit results are point-in-time, not proof that no undisclosed vulnerability exists.

| Check | Pristine-main baseline | Dependency candidate |
| --- | --- | --- |
| Full npm audit | 3 vulnerabilities | 0 vulnerabilities |
| Production-only npm audit | 2 vulnerabilities | 0 vulnerabilities |
| Targeted regression cases | The failing PPT deadline case independently reproduced with the original dependencies; the entire baseline suite was not rerun. | 830/831 distinct cases passed after the link-preview rerun; one PPT deadline case failed. |
| Scoped lint | 10 errors, 2 warnings | Identical 10 errors, 2 warnings |
| TypeScript | Not rerun for this comparison | PASS |
| Offline production build | Not rerun for this comparison | PASS with warnings |

## Clean install and local verification

- `npm ci --ignore-scripts --no-audit --no-fund` completed in an isolated, previously empty worktree: 673 packages installed. npm reported existing deprecations for `whatwg-encoding@3.1.1` and `@opentelemetry/sdk-trace-base@2.12.0`.
- Offline package smoke checks passed: DOMPurify reports 3.4.17; Zod and zod-validation-error interoperate on a rejected constrained array; fast-uri parses a synthetic HTTPS URI. These smoke checks do not replace advisory-specific exploit tests.
- All 673 present package manifests match their lock entries; 143 platform/optional entries were absent on Windows. `npm ls --all --json` reported no dependency-tree problems. `npm ls` and `npm explain` confirmed the three patched versions and parent ranges.
- Five lock entries declare lifecycle scripts: `@sentry/cli`, `core-js`, `esbuild`, `fsevents` and `unrs-resolver`. They were inspected and none was executed. Sentry and esbuild installers can download binaries; fsevents is not installed on this Windows host. The installed platform packages support `sentry-cli --version`, esbuild transform and unrs-resolver module loading. A synthetic jsPDF document was created and checked for a PDF header. A normal lifecycle-enabled installation is **not** attested.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false`: PASS.
- Scoped ESLint across PDF creation, evaluator, authentication and link-preview files: **10 errors, 2 warnings**, all reproduced identically on a pristine main source export with original dependencies. One error is in `CertificateModal.tsx`, nine in `databaseActivityReport.ts`, and two warnings in `PitchEvaluatorClient.tsx`. No rules were suppressed or source cleaned up.
- Exact scoped lint invocation: `node node_modules/eslint/bin/eslint.js src/lib/ppt/analysisMetadata.ts src/lib/ppt/evaluatorEngine.ts src/components/PPTEvaluatorTab.tsx src/components/PitchEvaluatorClient.tsx src/components/CertificateModal.tsx src/lib/net/publicHttpFetch.ts src/lib/auth/returnPath.ts src/lib/admin/analyticsSummary.ts src/lib/admin/databaseActivityReport.ts src/app/api/link-preview/route.ts src/app/api/evaluator/evaluate/route.ts src/app/api/evaluator/history/route.ts 'src/app/api/teams/[id]/ppt-evaluate/route.ts' scripts/test-ppt-document-identity.cjs scripts/test-ppt-vision.cjs scripts/test-link-preview-security.cjs scripts/test-auth-return-paths.cjs`. The baseline comparison used the same arguments against the pristine export and original dependencies.
- Offline Node suite covering PPT identity/vision, Idea/evaluator reliability and admission, result authority, Challenge correctness, authentication return paths and link preview: initial complete run **826/831**, with four local socket failures caused by sandbox `EACCES` and one PPT deadline assertion failure. Link-preview was then rerun with the same loopback-only network guard and existing OpenSSL outside the restrictive sandbox: **22/22 passed**, including TLS. The remaining distinct suite outcome is **830/831**, with one failing pre-existing assertion.
- Exact combined test invocation (with sanitized environment and the loopback-only guard): `node --test --test-concurrency=1 scripts/test-ppt-document-identity.cjs scripts/test-ppt-vision.cjs scripts/test-evaluator-reliability.cjs scripts/test-evaluator-generation-admission.cjs scripts/test-evaluator-result-authority.cjs scripts/test-challenge-correctness.cjs scripts/test-auth-return-paths.cjs scripts/test-link-preview-security.cjs`. Link-preview rerun: `node --test --test-concurrency=1 scripts/test-link-preview-security.cjs`, with the existing Git OpenSSL directory on PATH and the same guard.
- The failing `test-evaluator-reliability.cjs:469` expects `providerDeadlineAt` 30,000 ms while unchanged PR #73 code sets it to 36,000 ms; the effective request timeout still uses the minimum of the execution deadline and requested timeout. The same test against a clean main export using original DOMPurify 3.4.16, Zod 4.4.3 and fast-uri 3.1.8 failed identically (`36000 !== 30000`). The assertion likely needs updating to reflect the current timeout implementation, but whether changing the assertion alone correctly captures the intended deadline contract remains unconfirmed and requires separate review. This is a pre-existing test/source mismatch, not a passing test; no test was weakened or modified.
- The first test launch failed before test execution because Windows absolute paths require a file URL for Node's `--import`; the wrapper path was corrected, and this separate setup error is not a dependency finding.
- All application tests used synthetic fixtures, a loopback-only network guard and no paid model calls. No browser-based tests or production-connected checks were run.

## Offline build

`node node_modules/next/dist/bin/next build --webpack`: **PASS, exit 0**, including Next's TypeScript phase and 96/96 static pages. The process used a synthetic loopback-only Supabase fixture, mocked font responses, an allowlisted environment and the reviewed network guard; no production credentials were loaded. The build reported middleware deprecation, missing/recommended Sentry instrumentation, webpack cache serialization, and Edge Runtime warnings involving Next `process.features` and Supabase `process.version`. Warnings were not suppressed. These warnings are not evidence of a new dependency vulnerability; the Edge warnings were not independently baseline-built during this task.

## Rollback

If a later review finds an incompatibility, separately approve a revert of the eventual dependency commit and redeploy through the normal release process. Restoring the old lockfile reintroduces the documented critical, high and moderate advisories; preserve the audit evidence, assess exposure and arrange a supported replacement before restoring affected versions. Do not modify `node_modules` or restore database permissions as a rollback. No deployment, migration, environment change, Git staging, commit or push was performed here.
