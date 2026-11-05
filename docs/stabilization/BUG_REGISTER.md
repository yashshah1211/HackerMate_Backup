# Stabilization bug register

Baseline: `652d1ef` (latest `origin/main` fetched 2026-11-05). Branch: `stabilize/full-codebase-20261105`.
Only demonstrated defects enter this register. Local fixture verification does not establish deployed RLS or production health.

Code-level findings: **P0 0 / P1 5 / P2 2 / P3 0**. Six resolved locally; one P1 enforcement gap requires integration/consumer verification. Severity describes potential impact of the demonstrated code path, not proof of a deployed exploit.

| Priority | Issue | Evidence | Local outcome |
| --- | --- | --- | --- |
| 1 | STAB-006, P1 | Presign returns public URL without inspecting bytes, size or moderation | Open; external consumer/R2 policy verification needed |
| 2 | STAB-003, P1 | Suspended identity reaches both upload providers and returns 200 | Fixed; denied before provider calls |
| 3 | STAB-004, P1 | Unrecognized HTML accepted as advertised audio; reaches mocked storage | Fixed; handler returns 400, no write |
| 4 | STAB-001, P1 | Profile permission failure renders protected dashboard children | Fixed; actual error logged, verification notice |
| 5 | STAB-002, P1 | In-flight profile success restores children after sign-out | Fixed; stale result ignored, current account recovery preserved |

## STAB-001 — P1 — Account guard grants access after failed profile verification

- Feature/files: protected pages; `src/components/AuthGuard.tsx`, profile query and authorization branches.
- Actual: a Supabase `42501` result with null data renders dashboard children. Missing profiles, null ban flags and mismatched profile identities can also authorize dashboard access.
- Expected: database errors must be logged and show verification unavailable; only the matching profile with a known false ban flag can authorize.
- Evidence/reproduction: `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-stabilization-boundaries.cjs`; first four tests fail on baseline. The first test supplies `{data:null,error:{code:'42501'}}` to the real mounted guard and observes protected children.
- Root cause: query `error` is discarded; the missing-profile onboarding exception authorizes dashboard/developer/hackathon routes; ban status is tested by truthiness.
- Minimal fix: check the actual query error, identity and boolean ban flag before onboarding/access decisions. Preserve verified active users with incomplete onboarding on existing allowed routes.
- Regression: failed/missing/mismatched/unknown profiles; completed and incomplete active profiles.
- Status: fixed (local fixture runtime). Final 54-test boundary suite and desktop/mobile Chromium pass. Production authentication/RLS remain unverified.

## STAB-002 — P1 — Stale account verification restores access after sign-out

- Feature/files: session lifecycle; `src/components/AuthGuard.tsx`, effect/auth subscription.
- Actual: start profile lookup, emit SIGNED_OUT, resolve the old lookup successfully: protected children reappear. A later valid sign-in also retains a previous suspension notice.
- Expected: only the latest session verification may change access; sign-out invalidates pending requests; current verified account state replaces old notices.
- Evidence: failing tests `sign-out invalidates an in-flight profile success` and `a newly verified account clears a previous suspension notice` in the boundary suite.
- Root cause: mounted ref prevents unmounted writes but does not distinguish requests or session transitions; ban state never resets.
- Minimal fix: effect-local verification sequence, invalidate on sign-out/cleanup and account changes, apply state only for the current sequence. Same-account refresh retains existing mounted child state until verification resolves; failures revoke access.
- Regression: sign-out during a lookup, out-of-order success/error/suspension, recovery after account change, unmount.
- Status: fixed (local fixture runtime). Sign-out/account recovery tests pass; added a mounted-child regression to prevent token refresh from discarding workspace drafts. Desktop/mobile Chromium pass.

## STAB-003 — P1 — Suspended accounts can upload and obtain storage write URLs

- Feature/files: `src/app/api/upload/route.ts`, `src/app/api/upload/presign/route.ts`.
- Actual: getUser returns a suspended identity and both routes still invoke mocked storage/moderation/signing providers and return 200. Missing/unknown/error profile states also reach providers.
- Expected: authenticate and verify an active protected profile before reading media bodies or contacting providers; missing/unknown/suspended denies, query failures fail closed and are logged.
- Evidence: eight failing real-handler tests covering both endpoints; baseline returns 200 instead of 403/500.
- Root cause: endpoints check getUser only and never read protected suspension state.
- Minimal fix: reuse existing `requireVerifiedProfile`, preserving unsigned 401, valid upload responses and cookie transport; request lookup failures as 500.
- Regression: both endpoints × signed-out/suspended/missing/unknown/query failure/active, zero provider calls on denial.
- Status: fixed (real handlers, mocked providers). Shared helper logs actual database errors even when returning sanitized 500 responses. No database permission changes.

## STAB-004 — P1 — Unrecognized bytes pass media signature validation

- Feature/files: direct media uploads; `src/lib/mediaValidation.ts`.
- Actual: HTML/arbitrary bytes return `isValid:true` for image/audio claims. An audio claim bypasses image moderation and proceeds to object storage.
- Expected: unmatched bytes fail the signature gate.
- Evidence: five failing signature tests; known-format compatibility checks pass on baseline.
- Root cause: final fallback returns true for every unrecognized buffer of at least four bytes.
- Minimal fix: reject unknown signatures; retain recognized MPEG version/CRC variants with frame-header checks. Header bit checks were cross-checked with the primary [FFmpeg header validator](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/mpegaudiodecheader.h). This is a signature filter, not a malware scanner or complete file decoder.
- Regression: unknown image/audio signatures, recognized advertised types, real direct handler proves no storage write for invalid audio.
- Status: fixed (local runtime). Arbitrary audio rejected by the real direct handler before storage; known formats/MPEG variants pass, reserved headers fail. R2/moderation were mocked.

## STAB-005 — P2 — Malformed presign JSON produces server errors

- Feature/files: `src/app/api/upload/presign/route.ts`.
- Actual: null JSON, numeric or object contentType returns 500; malformed client input is classified as server failure.
- Expected: 400 for invalid JSON/body/MIME type without signing an upload URL.
- Evidence: three failing real-handler tests; baseline throws during destructuring or toLowerCase.
- Root cause: TypeScript assumptions used without runtime object/string validation.
- Minimal fix: validate JSON parse, plain object shape and string MIME type before processing.
- Regression: null, array, numeric/object type, malformed JSON, valid request.
- Status: fixed (real handler with mocked signing). Invalid body/type is 400; valid response contract retained. No signed R2 URL requested.

## STAB-006 — P1 — Presigned upload bypasses byte validation and moderation

- Feature/files: `src/app/api/upload/presign/route.ts`, `src/lib/r2.ts`.
- Actual: an active caller receives a public object URL and PUT signature using a claimed MIME type only. This path never calls `validateMagicBytes`/`moderateImageWithGemini`, and PutObjectCommand has no size bound. No repository callers currently use this endpoint (`rg '/api/upload/presign' src` returns none).
- Expected: public uploads satisfy the same byte, size and moderation rules as the direct path.
- Evidence: real presign handler fixture calls signing with no moderation/byte read; direct and presign source contracts differ. No real R2 object was created; bucket policy and actual exploitability remain unverified.
- Root cause: direct-to-public-storage signing precedes content inspection.
- Proposed minimal safe approach: confirm external consumers, then route them through existing direct upload; otherwise design private quarantine/finalization and size enforcement. Do not silently remove an existing public contract.
- Regression needed: cannot publish oversized/uninspected objects; finalization verifies actor, size, bytes, moderation and ownership; denied objects stay private and are cleaned up.
- Status: needs verification — separate reviewable batch; storage policy/external consumers unavailable. Not resolved by STAB-003/004.
- Usage follow-up (2026-11-05): user requires verification before contract changes. History confirms both known chat callers migrated in `c7a5e76`. After Vercel was connected, repository/project/production commit were confirmed and dashboard Request Logs/CDN Requests showed no presign matches in the available last-hour window; a populated HTTP control query succeeded. Seven-day history was rejected by Hobby retention. External clients outside that short window remain unknown. Preserve the successful contract. The earlier local CLI 403 is no longer a connector access blocker. See `PRESIGN_USAGE.md`.

## STAB-007 — P2 — Admin authorization regression harness cannot load current report route

- Feature/files: offline security regression coverage; `scripts/test-admin-authorization.cjs`.
- Actual: 50 of 75 tests fail at import with `Unmocked dependency: jspdf`, before executing report authorization checks. Broader run: 901 pass / 50 fail / 951 tests.
- Expected: real route authorization runs with synthetic report data/rendering; denied identities do no privileged work.
- Evidence: standalone baseline run `node --import ./qa/fixtures/rack-network-guard.mjs --test scripts/test-admin-authorization.cjs`: 25 pass / 50 fail. Harness and report source unchanged from main at reproduction (`git diff` contained neither file).
- Root cause: report moved from databaseActivityReport renderer to founderBrief/founderBriefPdf; harness only mocks old renderer and rejects the new renderer's jspdf dependency.
- Minimal fix: mock current metrics/brief/PDF boundaries while retaining real route and requireAdmin. Extend no-privileged-work assertion to metrics/brief calls. Keep dedicated founder-brief and daily claim regressions real.
- Regression: all existing 75 authorization tests, founder-brief/claim suites and broader run; no assertions removed or weakened.
- Status: fixed. Existing 75 authorization tests pass as part of the 965-test broader run; dedicated founder-brief/claim tests pass. No assertion removed or weakened.
