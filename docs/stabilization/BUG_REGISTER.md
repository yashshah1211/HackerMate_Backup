# Stabilization bug register

Baseline: `652d1ef` (latest `origin/main` fetched 2026-11-05). Branch: `stabilize/full-codebase-20261105`.
Only demonstrated defects enter this register. Local fixture verification does not establish deployed RLS or production health.

Confirmed code-level defects: **P0 0 / P1 8 / P2 3 / P3 0**. Ten resolved locally; STAB-006 remains unresolved. STAB-011 is an additional P1 credential risk needing production verification, excluded from confirmed-defect totals. Severity describes impact of demonstrated code paths, not proof of a deployed breach.

| Priority | Issue | Evidence | Local outcome |
| --- | --- | --- | --- |
| 1 | STAB-006, P1 | Presign returns public URL without inspecting bytes, size or moderation | Open; external consumer/R2 policy verification needed |
| 2 | STAB-003, P1 | Suspended identity reaches both upload providers and returns 200 | Fixed; denied before provider calls |
| 3 | STAB-004, P1 | Unrecognized HTML accepted as advertised audio; reaches mocked storage | Fixed; handler returns 400, no write |
| 4 | STAB-001, P1 | Profile permission failure renders protected dashboard children | Fixed; actual error logged, verification notice |
| 5 | STAB-002, P1 | In-flight profile success restores children after sign-out | Fixed; stale result ignored, current account recovery preserved |

Second batch adds three confirmed P1 fixes (STAB-008/009/012) and one P2 fix (STAB-010). The only remaining confirmed P0/P1 defect is STAB-006; the separate STAB-011 credential review requires an authorized production check. No P0 breach was established.

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

## STAB-008 — P1 — PPT history and deletion bypass active-account verification

- Feature/files: `src/app/api/teams/[id]/ppt-evaluations/route.ts`, GET and DELETE.
- Actual: a suspended owner/admin can list private evaluation history or delete it using the service-role path. A getUser response containing both a user and an auth error is accepted. Missing/unknown/mismatched profiles and failed authorization queries can authorize by another successful branch.
- Expected: verify error-free identity, matching protected active profile, existing team and successful authorization reads before disclosing/deleting evaluations. Retain active owner/member/admin permissions.
- Evidence: focused actual-handler regressions fail on baseline for both methods; suspended DELETE reaches the mocked database mutation. Permission-error fixtures log no actual error before the fix. HTTP regression now verifies suspended GET/DELETE 403 and active scoped access.
- Root cause: discarded auth/query errors; profile projection omits suspension; duplicated authorization blocks both lack the same checks.
- Minimal fix: shared local read/delete authorization function checks all errors, matching profile identity and `is_banned === false`; team/membership checks retain their existing role semantics. No grants/RLS/schema changes.
- Regression: both methods × suspended owner/admin, absent/unknown/mismatched profile, rejected identity, failed profile/membership/team read, unrelated caller, missing team; active owner/member/admin compatibility. Real loopback HTTP check.
- Status: fixed locally; covered by final 66-test boundary selection and existing result-authority tests. Production sessions/RLS not exercised.

## STAB-009 — P1 — Suspended callers can dispatch non-warning notification emails

- Feature/files: `src/app/api/send-email/route.ts`.
- Actual: suspended/unknown accounts can send connection-request email; suspended admins can send onboarding nudges. Cookie getUser errors with a user payload are ignored. Provider quota is consumed through a service-role client.
- Expected: active protected profile and error-free verified identity before service-role creation, rate-limit RPC or email dispatch; preserve sender and relationship checks.
- Evidence: real-handler fixtures reproduce dispatch for suspended/unknown/rejected identities. Baseline access selection: 31 failures / 17 passes out of 48 (combined PPT/email tests).
- Root cause: custom identity-only cookie/bearer gate omits account suspension and ignores cookie auth errors. Only moderation warnings used the protected account helper.
- Minimal fix: use existing requireVerifiedProfile for every email type before privileged work. Keep cookie/bearer transports, moderation 403 lookup-failure behavior, rate limits and relationship checks.
- Regression: connection and onboarding flows × missing/banned/unknown/error profile, rejected/signed-out identity; zero provider and rate-limit calls on denial; active cookie/bearer compatibility; existing moderation suite unchanged.
- Status: fixed locally. Real providers/configuration unchanged; all emails in verification mocked.

## STAB-010 — P2 — PPT deletion reports success when no evaluation was deleted

- Feature/files: DELETE in `src/app/api/teams/[id]/ppt-evaluations/route.ts`.
- Actual: nonexistent/already-deleted evaluation IDs return `{success:true,deletedId}` even when the scoped DELETE matches zero rows.
- Expected: successful response only for a returned deleted row; missing scoped record is 404; permission failure remains an error.
- Evidence: baseline focused test expects 404 but receives 200 with the original row unchanged. HTTP test now deletes once (200), repeats (404), and confirms no remaining row.
- Root cause: handler checks only database error, never whether any row matched.
- Minimal fix: select returned ID from the existing team/id-scoped deletion with maybeSingle; preserve 200 success shape for an actual deletion.
- Regression: nonexistent/repeated deletion, exact team/id filters, database error logging and successful deletion.
- Status: fixed locally.

## STAB-011 — P1 risk — Historical migration seeds a static notification webhook credential

- Feature/file: secret seeding in `supabase/migrations/202608030002_re_enable_offline_email_notifications.sql`; earlier migrations also contain placeholder/default webhook credentials. Values are intentionally not reproduced here.
- Confirmed fact: tracked SQL contains a fixed bearer credential and upserts it into app_secrets. Anyone with access to that source can know the seeded value.
- Unverified: whether production still uses the historical value, whether it was already rotated, and whether an unauthorized party accessed or used it. This is not evidence of a production breach; excluded from confirmed product-defect totals.
- Expected: production webhook credentials are generated and managed outside committed SQL, with known historical values invalidated.
- Root cause: migration embeds operational credential material rather than provisioning it outside source control.
- Proposed correction: separately authorize a private, boolean-only production comparison of current webhook configuration/trigger secret to known historical seeds. If any match, review and execute coordinated rotation of the server and trigger secret. Do not rewrite old migration history as a substitute for rotation or alter production secrets in this batch.
- Regression/verification needed: old bearer rejected, replacement accepted only for verified events, trigger producer and server remain compatible, no real email triggered. STAB-012 independently restricts replay and payload forgery but does not rotate this credential.
- Status: needs verification / founder decision on a scoped production credential check and conditional coordinated rotation. No production secret was revealed, compared, rotated or modified.

## STAB-012 — P1 — Replayed notifications resend email and trust forged payload content

- Feature/files: `src/app/api/webhooks/notification/route.ts`, new `src/lib/notificationEmailClaim.ts`.
- Actual: repeat/concurrent calls for the same notification dispatch multiple emails. A request after an ambiguous provider outcome can send again. Arbitrary recipient email/content from the request is trusted without checking the stored event/profile.
- Expected: one attempt per stored notification; ambiguous/accepted/rejected attempts cannot automatically resend. Verified stored event and active recipient determine content/address. Only a proven never-attempted dispatch may release its reservation for safe configuration recovery.
- Evidence: pre-fix real-handler replay/integrity selection has 15 failures / 2 passes out of 17. Concurrent identical requests call the mocked provider three times. Existing trigger SQL already sends notificationId and recipientId; old fixture payload was missing those real producer fields.
- Root cause: notification ID ignored; no atomic durable reservation; shared bearer authorization treated as sufficient authority for recipient/content.
- Minimal fix: read the exact notification and active recipient, use canonical stored content/address, then reserve a namespaced app_settings key with INSERT against its existing primary key. Retain every attempted outcome permanently; conditionally release only a never-attempted claim using its unique reservation value. Log persistence errors without inviting another dispatch. No schema/permission migration or provider configuration change.
- Regression: repeated/concurrent calls; accepted/rejected/unknown outcomes; claim/outcome/release errors; configuration recovery; wrong event/recipient/ban/query errors; payload substitution; wrong bearer. Native PostgreSQL proves primary-key concurrency and reservation compare-and-set semantics.
- Post-fix evidence: final 66 focused checks pass (PPT/email/replay combined); native PG18 fixture passes 12 real SQL assertions, with fresh synthetic cluster and finally cleanup. Existing email reliability checks retain their assertions and now provide the IDs present in the actual trigger payload.
- Status: fixed locally. Live app_settings grants and real producer/provider delivery remain deployment verification gates; no live email, secret change or production record mutation was performed.
