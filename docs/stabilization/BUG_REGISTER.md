# Stabilization bug register

Baseline: `652d1ef` (latest `origin/main` fetched 2026-11-05). Branch: `stabilize/full-codebase-20261105`.
Only demonstrated defects enter this register. Local fixture verification does not establish deployed RLS or production health.

Confirmed code-level defects: **P0 0 / P1 16 / P2 9 / P3 0**. Twenty-four corrected in code including the unmerged STAB-026 follow-up; STAB-006 remains unresolved. Mission03 migration20261105132849 was applied in the founder-approved release; fresh live acceptance is distinguished in MISSION_03_PRODUCTION_ACCEPTANCE.md. STAB-011 is an additional P1 credential risk needing safe verification, excluded from confirmed-defect totals. Severity describes demonstrated code paths, not proof of a deployed breach. Current deployed baseline46d7fcd preserves Missions01–03.

| Priority | Issue | Evidence | Local outcome |
| --- | --- | --- | --- |
| 1 | STAB-006, P1 | Presign returns public URL without inspecting bytes, size or moderation | Open; external consumer/R2 policy verification needed |
| 2 | STAB-003, P1 | Suspended identity reaches both upload providers and returns 200 | Fixed; denied before provider calls |
| 3 | STAB-004, P1 | Unrecognized HTML accepted as advertised audio; reaches mocked storage | Fixed; handler returns 400, no write |
| 4 | STAB-001, P1 | Profile permission failure renders protected dashboard children | Fixed; actual error logged, verification notice |
| 5 | STAB-002, P1 | In-flight profile success restores children after sign-out | Fixed; stale result ignored, current account recovery preserved |

Second batch added three confirmed P1 fixes (STAB-008/009/012) and one P2 fix (STAB-010). Mission03 adds STAB-021–025 below. STAB-006 remains open; STAB-021–023 require approved production migration before deployed closure. The separate STAB-011 credential review remains blocked on safe application-side comparison. No P0 breach was established.

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
- Read-only follow-up: active database trigger credential does not match seeds extracted entirely inside PostgreSQL from retained migrations202607080005/202608030002. Both history records and the active secret exist; the installed trigger reads the expected app_secrets key. Only booleans/YES-NO-UNKNOWN left the server, with no credential/hash literals in query text or outputs.
- Unverified: application-side credential equality, whether retained migration SQL exactly represents every historically committed credential, and whether unauthorized access occurred. This is not evidence of a production breach; excluded from confirmed product-defect totals.
- Expected: production webhook credentials are generated and managed outside committed SQL, with known historical values invalidated.
- Root cause: migration embeds operational credential material rather than provisioning it outside source control.
- Proposed correction: complete a private equality-only comparison covering current application configuration and the installed trigger credential. Available Vercel tools retrieve values rather than compare privately, so they were not used to retrieve/decrypt the credential. If a historical value remains active, review the coordinated rotation plan in RELEASE_REVIEW.md; execution requires separate approval.
- Regression/verification needed: old bearer rejected, replacement accepted only for verified events, trigger producer and server remain compatible, no real email triggered. STAB-012 independently restricts replay and payload forgery but does not rotate this credential.
- Status: **blocked — application-side comparison has no safe available path.** Overall historical credential still active: UNKNOWN; trigger/application consistent: UNKNOWN; rotation required: UNKNOWN. Database-side historical match: NO within the retained-history scope. No production credential was revealed, hashed in output, rotated or modified; comparison was server-side/read-only and no webhook/email was triggered.

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

## STAB-013 — P2 — Notification outcomes discard reconciliation evidence

- Files: src/lib/notificationEmailClaim.ts and notification webhook.
- Actual/reproduction: execute an accepted real-handler fixture; HTTP dispatch contains providerId, but the persisted app_settings outcome contains only status/time and discards the original reservation identity/time. New receipt regression fails before the fix.
- Expected: retain existing provider receipt and non-PII attempt metadata so an operator can reconcile without guessing; never infer retry safety from absent metadata.
- Root cause: finish helper accepts only status/attempted and replaces the reservation with a two-field outcome.
- Minimal fix: persist providerId/status, sandbox/intended-recipient/attempted flags and original nonce/reservedAt under the same exact key/value compare-and-set. No recipient/content or secret is stored.
- Regression: accepted and sandbox receipts, native SQL persistence, stale release, persistence failure and fresh-handler replay. Reconciliation/crash policy documented in RELEASE_REVIEW.md.
- Status: fixed locally; real provider delivery and production records remain untouched.

## STAB-014 — P2 — Email auth refactor changes existing cookie precedence

- Files: src/app/api/send-email/route.ts, src/lib/admin/requireAdmin.ts.
- Actual/reproduction: valid cookie identity A plus different valid bearer B, senderId=A and valid pending relationship: baseline real handler returns200/sends once; initial PR returns401/sends nothing. Independently reproduced; new dual-credential regression fails.
- Expected: preserve this endpoint's valid-cookie-first behavior while denying rejected identities and inactive profiles; use bearer when cookie authentication fails.
- Root cause: replacing the old local auth gate with the shared helper silently adopted its bearer-first policy.
- Minimal fix: explicit cookieFirst option used only by send-email. Other callers retain bearer-first behavior. Error-free selected identity still passes the same protected-profile gate. Preserve legacy token trimming.
- Regression: conflicting credentials, rejected cookie fallback, suspension cannot fall through, actual cookie-only/bearer-only compatibility, surrounding token whitespace; existing admin/moderation suites retained.
- Status: fixed locally and independently re-reviewed; no role expansion or profile-error fallback.

## STAB-015 — P2 — Stale profile query errors disappear from logs

- Files: src/components/AuthGuard.tsx, existing stale-response regression.
- Actual/reproduction: resolve newer active profile, then older 42501 failure; current authorized UI remains correct but console.error never receives the actual failure. Extended mounted React regression fails.
- Expected: actual Supabase query error is logged per AGENTS §2 even when too stale to update UI.
- Root cause: sequence return precedes profileError handling, and logging is inside the current-request branch.
- Minimal fix: throw/log actual query failures before UI currentness checks; retain sequence checks around every state update.
- Regression: exact old error logged, newer verified UI remains authorized, no verification notice replaces it; desktop/mobile guard regression remains passing.
- Status: fixed locally and independently re-reviewed.

## Mission02 — messaging, teams and workspace state

Baseline6e6b0e3b1fbb6b351112e011bed78e27033db258 (PR#116 merged). Branch stabilize/messaging-workspaces-20261105. Seven original component regressions failed before fixes; a separate baseline route test also failed. Nineteen final focused checks pass. Reviewer-discovered cleanup/reply gaps were reproduced and corrected before publication. See MISSION_02_HANDOFF.md for full evidence and limitations.

### STAB-016 — P1 — Chat state and stale loads cross identity boundaries

- Files: src/components/chatThread.tsx.
- Actual/reproduction: mount conversationone, delay its message query, switch totwo, resolveone; one's private message replaces two. A private draft also survives the switch; changing currentUserId with the same conversation similarly reuses state.
- Expected: thread/account identity owns its messages, draft, block state, recipient, reactions and subscriptions; old work cannot publish into the current UI or mark old incoming events read after teardown.
- Root cause: one component instance owns all state across prop identities; asynchronous loads/realtime callbacks have no session boundary.
- Minimal fix: keyed inner session by user+conversation; mounted/active checks before committing an old load or processing a torn-down subscription. Same-identity rerenders retain drafts.
- Independent review correction: key-driven unmount exposed missing microphone/timer/preview cleanup. Three failing regressions reproduced active recorder, late permission stream and preview leaks; cleanup now stops recorder/tracks/timer, detaches callbacks, rejects late acquisition, revokes previews and blocks stale media completion before send RPC.
- Regression: delayed old read, thread/account switch, same-account preservation, late event after unsubscribe, active/pending recorder and preview lifecycle; real desktop/mobile Chromium.
- Status: fixed locally, independently re-reviewed. This does not certify server RLS or all pagination/realtime ordering paths.

### STAB-017 — P1 — Concurrent composer sends duplicate writes and erase newer intent

- Files: src/components/chatThread.tsx.
- Actual/reproduction: press Enter twice before the pending RPC settles; two send_message_with_mentions calls occur. Type a new draft while the first send is pending; successful completion empties it. A reply selected during the pending send was also cleared by the first attempted fix (independently reproduced).
- Expected: one outstanding composer submission; completion clears only the captured draft/reply, and a rejected write retains the draft for deliberate recovery.
- Root cause: disabled button/state flag does not exclude keyboard reentry; unconditional completion clears editable state created after the request began.
- Minimal fix: synchronous ref lock acquired before asynchronous work, released in finally; draft revision and reply identity checks before clearing. Preserve replacement staged attachments and log actual text-write errors.
- Regression: repeated same-tick Enter, newer draft, newer reply, actual rejected persistence and subsequent deliberate retry; browser keyboard flow. No automatic retry or backend idempotency protocol added.
- Status: fixed locally and independently re-reviewed. Ambiguous network outcomes still require reconciliation; this is not an exactly-once server guarantee.

### STAB-018 — P2 — Failed read receipt clears unread state

- Files: src/app/messages/page.tsx.
- Actual/reproduction: mark_conversation_read returns42501; the handler discards the error and immediately clears the unread badge.
- Expected: change local unread state only after acknowledgment; log the real failure and show an error.
- Root cause: resolved RPC promise is treated as success without checking its error field.
- Minimal fix: check/catch error before updating conversation unreadCount; retain existing RPC/response contracts.
- Regression: mounted production page asserts actual error logging and the current DOM unread badge. Independent review strengthened this assertion from historical JSX to committed DOM.
- Status: fixed locally. Production notification/read-receipt transport not invoked.

### STAB-019 — P2 — Workspace deletion reports success after zero affected rows

- Files: src/components/TeamWorkspaceView.tsx.
- Actual/reproduction: synthetic RLS/stale-record response has data:null,error:null; UI reports Task deleted and removes the task, although no deletion was acknowledged.
- Expected: success only after the exact scoped row is returned; missing/denied record remains visible with an error.
- Root cause: DELETE checks only error, not whether any row matched.
- Minimal fix: retain id predicate, add team_id, select returnedid/maybeSingle, and require a row before success/removal.
- Regression: zero row, actual42501, successful returnedid and exact team/id/column query assertions; desktop/mobile failed-deletion journey.
- Status: fixed locally. No grants/RLS/schema changed and no production mutation performed.

### STAB-020 — P1 — Workspace state outlives its team/task authority

- Files: src/app/teams/[id]/workspace/page.tsx and src/components/TeamWorkspaceView.tsx.
- Actual/reproduction: open owned teamone, navigate to teamtwo where caller is neither owner nor member: isOwner remains true and the private workspace subtree renders. Separately, open taskone then tasktwo and resolve one's delayed comments last: wrong-task comments replace the current discussion.
- Expected: each route independently verifies ownership/membership from a fresh deny-by-default state; each selected task accepts only its latest active comment request.
- Root cause: route component state reused across team IDs, owner flag only set true; comment load and realtime paths lack cleanup/request ordering.
- Minimal fix: key workspace content by route team ID; assign owner boolean on every verified load. Comment effect uses primitive task ID, active/request sequence, one shared read path, cleanup and typed rows. No server-side authority was expanded.
- Regression: actual route rendering proves previous owner cannot enter another workspace; task switches, same-task out-of-order realtime loads and late callbacks after unsubscribe; real desktop/mobile route gate.
- Status: fixed locally and independently re-reviewed. The UI reproduction does not prove a database RLS bypass; live membership revocation/account lifecycle remain separate integration coverage limits.

## Mission 03 — backend permissions and concurrent persistence

Baseline `7fc7acc83dc4585c2624ec047f2c34c1dff312a6`. New IDs do not reuse Mission 01/02 identifiers. Native fixtures use synthetic IDs and fresh localhost clusters with finally cleanup. The migration below is prepared only; deployed RLS/grants are unchanged.

### STAB-021 — P1 — Removed creators retain task/link deletion authority

- Actual: remove creator from team_members; SELECT returns zero, but `WITH removed AS (DELETE FROM team_tasks RETURNING 1) SELECT count(*) FROM removed` returns one. Same for links. Reading visibility alone concealed the minimal-return DELETE bypass.
- Root cause: DELETE checks created_by/owner without current membership.
- Fix: require current owner/member and active profile alongside creator-or-owner deletion. Migration: `20261105132849_workspace_actor_boundaries.sql`; query inventory precedes authoring.
- Reproduction/regression: set `MISSION03_WORKSPACE_BASELINE=1` and run `node --test scripts/test-mission03-workspace-rls.cjs` to use original policies in the disposable fixture; desired removed-creator denials fail. Unset that variable for the normal run applying the proposed migration. Original native selection: ten subtests failed; final expanded suite 19/19 passes, independently repeated.
- Status: corrected in migration/local native runtime; **not deployed**. Active owner without roster row, current creator deletion and same-session committed revocation are covered.

### STAB-022 — P1 — Writable creator identity bypasses deletion restrictions

- Actual: ordinary member's direct DELETE of an owner's task/link affects zero; UPDATE created_by=self succeeds, then DELETE removes it.
- Root cause: table-wide UPDATE permits immutable id/team_id/created_by/created_at fields; RLS only verifies membership, not identity immutability.
- Fix: remove table-wide and independent immutable-column UPDATE grants from PUBLIC/anon/authenticated, then grant existing mutable fields. SELECT/INSERT success shapes are unchanged; nullable-creator insert compatibility retained.
- Regression: real native table/column privileges, seeded inherited column grants, denied creator forgery, allowed task/link mutable fields, owner/creator deletion, service-role maintenance, FK ON DELETE SET NULL and migration reapplication. All pass in final 19-case native suite.
- Status: corrected locally; requires approved migration and installed-grant verification before deployed closure.

### STAB-023 — P1 — Suspended roster members retain workspace data access

- Actual: banned current member SELECT/UPDATE succeeds on tasks/links. Independent review also read one document and committed a banned save through the existing invoker RPC. Desired document denial then failed with count 1 instead of 0 before its policy was added.
- Root cause: is_team_member includes roster/owner without consulting current protected profile suspension.
- Fix: current known-false is_banned gate in task/link policies and an additional restrictive document actor policy, preserving original membership and revision protections. No global helper/profile grant change; document queries were inventoried before extending the policy.
- Regression: banned read/update/create/delete, live false→true/null flag transitions, document read/save/create/delete denial, active owner/member CAS saved/conflict and immutable grants. Final native 19/19 passes; independent security reviewer repeated 19/19.
- Status: corrected locally for these inventoried tables, not an exhaustive workspace suspension claim. Public object revocation remains STAB-006. Production policy application/acceptance remains open.

### STAB-024 — P1 — History reads corrupt concurrent realtime chat state

- Actual: offset pagination shifts during insertion, rendering boundary message twice; pending initial read loses a newer insert, replaces an update or resurrects a deletion. Independent review also reproduced history restoration after Clear chat.
- Root cause: offset uses mutable rendered count; snapshots replace/prepend without stable cursor, identity reconciliation or event/clear precedence.
- Fix: exact microsecond-preserving (created_at,id) keyset; stable ordering and deduplication; realtime upsert/delete overlay retained only while reads are pending; cursor follows raw page; clear generation/current boundary rejects stale history. Actual errors log even when stale; rejected pagination unlocks retry.
- Regression: real mounted component initial/paged races, clear and failure paths, actual Supabase SDK filter serialization, timestamp ties/microseconds/timezones, and desktop/mobile Chromium. Original four history regressions fail; final focused selection 36/36 passes including prior Mission 02 checks.
- Status: corrected in code/local runtime; no message send contract or durable exactly-once guarantee introduced.

### STAB-025 — P1 — Out-of-order task persistence loses latest intent

- Actual: dispatch in_progress then completed; complete newer write first and older write last: database and UI finish in_progress. Zero-row UPDATE also falsely changes the UI. Review demonstrated stale reload-after-ack and stale ack-after-remote-write reversions.
- Root cause: independent writes and uncoordinated task snapshots/patch acknowledgments.
- Fix: serialize mutations per task; require id/team_id-scoped returned row; authoritative read after commit rather than replaying old patch; shared request sequence rejects obsolete reloads. No optimistic state requiring destructive rollback, automatic mutation retry or global last-writer guarantee.
- Regression: controlled server commit order, zero/error/throw outcomes, deliberate retry, both read/ack races; actual browser stored-state order and queued work cancellation after route unmount. Original ordering/zero/throw tests fail; expanded focused 36/36 and browser 2/2 pass.
- Status: corrected locally and independently re-reviewed. Different clients retain existing last-writer semantics; ambiguous external commit outcomes remain a separate acceptance limit.

### STAB-026 — P2 — Resource deletion claims success without an affected row

- Found during read-only post-release acceptance of46d7fcd. Source handler handleDeleteLink uses DELETE byid with no returned row and treats error=null as deletion success. Native policies can deny a removed/noncreator/suspended actor with0affected rows and no database error.
- Reproduction: actual mounted TeamWorkspaceView, synthetic team_links row, DELETE returns data=null/error=null. Confirmation shows success and removes the resource locally. No live production DELETE was attempted; this is a confirmed source/UI persistence defect, not an installed authorization bypass or proof of a live user incident.
- Minimal correction in separate unmerged follow-up: id+team_id scope, SELECT returnedid/maybeSingle; only confirmed affected row permits success/removal. A zero result retains the resource and requests refresh/access verification; actual errors remain logged.
- Regression:3mounted cases for zero, explicit42501 and valid deleted row; final focused39/39 plus TypeScript pass. Before: zero falsely removed row; other cases also failed newly asserted scope/projection. Existing valid owner/creator database behavior is unchanged.
- Status: corrected only on fix/workspace-link-delete-ack-20261105; separate Draft PR/CI required. Deployed release still contains this P2 issue. See MISSION_03_PRODUCTION_ACCEPTANCE.md and controlled plan for remaining live acceptance gates. STAB-006 and STAB-011 remain open separately.
