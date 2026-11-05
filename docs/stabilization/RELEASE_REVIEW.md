# PR #116 release-readiness review

Review base: `652d1ef0a34ef6b6bfbab480677892a153100343`. Initial reviewed head: `9d4c2159067dfbe60d83467897ac699e04a78623`. Review covers the entire PR and the follow-up fixes below. **Keep Draft and unmerged pending founder approval and the production dependency evidence below.** No production data, credentials or deployment settings were changed.

## Standards — independent reviewer

One P2 finding: stale profile-query failures disappeared before logging, contrary to AGENTS §2. Existing stale-response regression reproduced the diagnostic loss while confirming that access state remained correct. STAB-015 fixes the logging independently of UI sequence checks. The reviewer rechecked the fix, cookie/bearer identity selection, suspension denial and admin checks without finding another source blocker. No actionable smell-baseline findings.

## Spec — independent reviewer

One confirmed P2 regression: a valid cookie A plus a valid bearer B with senderId=A returned 200 on the baseline, but 401 on the initial PR head. STAB-014 restores this endpoint's cookie-first behavior without changing other helpers' default bearer priority. Two readiness gaps: crash/reconciliation evidence and production permissions/installed producer verification. The reviewer independently reran the updated email/replay suites (40 checks at that checkpoint, all passing), reviewed receipt persistence and identity selection, and found no additional source blocker. No scope expansion found.

Independent review was requested from two separate agents; each inspected the pinned full diff and then re-reviewed the source fixes. This is independent code review, not GitHub maintainer approval. No GitHub reviewer was silently assigned; the user can name an individual/team for a formal request. Neither review authorizes merge.

## Confirmed issues fixed during review

| Issue | Reproduction at initial head | Minimal correction | Regression |
| --- | --- | --- | --- |
| STAB-013, P2 | Accepted notification has a providerId in its response, but persisted outcome contains only status/time; reservation nonce/time are discarded | Retain provider receipt/status, attempt/sandbox/intended-recipient flags, original reservation nonce/time; no recipient/content in ledger | Real webhook receipt assertions, sandbox case and native SQL round trip |
| STAB-014, P2 | Different valid cookie and bearer identities change send-email 200 to 401 | Cookie-first only for this endpoint; error-free identity still requires a protected active profile; preserve bearer fallback/token trimming | Conflicting identities, rejected cookie fallback, suspended cookie denial, actual bearer-only flow and whitespace |
| STAB-015, P2 | Resolve newer active profile, then old 42501; protected UI remains correct but actual error is absent from logs | Log actual failure before checking whether it may update UI | Existing mounted React stale-error regression now also asserts logging |

Pre-fix review selection: **88 pass / 6 fail / 94 checks**. Several failed assertions describe the same cookie precedence defect. All three issues were reproduced before their source fixes. STAB-006 and STAB-011 are unchanged and tracked separately.

## Authentication and API compatibility

- The chosen identity must come from error-free getUser, then a readable protected profile with is_banned exactly false. A successful identity with a banned/missing/unknown profile cannot fall through to another credential. Admin/founder suspension checks and moderation warning's second administrator/identity gate remain intact.
- send-email retains its legacy valid-cookie precedence, then bearer fallback. All other existing requireVerifiedProfile consumers keep bearer-first precedence. Rejected getUser payloads cannot authorize even if they include a user. Tests explicitly distinguish transport clients.
- PPT GET/DELETE remain bearer-authenticated, with owner/member/admin access unchanged. All authorization reads must succeed. No service-role operation gains authority from a request-supplied role or sender ID.
- Guard refresh preserves mounted drafts for the same account; sign-out/account change invalidates old results. Stale failures now log without replacing current verified UI.

| API | Successful response compatibility | Intentional failure correction |
| --- | --- | --- |
| POST /api/upload | Exact fields: success, publicUrl, key | Unverified/suspended callers denied; unknown signatures rejected before storage |
| POST /api/upload/presign | Exact fields: uploadUrl, publicUrl, key; existing 900-second signing behavior retained | Malformed JSON/body/MIME now 400; active-profile gate. STAB-006 still open |
| POST /api/send-email | Non-warning success, dispatch, message, accounting retained; moderation warning contract unchanged | Suspended/unverifiable callers denied before privileged work; cookie priority restored |
| GET /api/teams/[id]/ppt-evaluations | evaluations array retained, including track_id compatibility retry | Authorization errors fail closed and are logged |
| DELETE same path | Exact success:true and deletedId retained for an actual deletion | Missing/wrong-team/already-deleted ID now 404 rather than false success |
| POST /api/webhooks/notification | Existing dispatch/accounting fields retained; bookkeeping is additive; low-intent skip retained | notificationId/recipientId required, canonical stored event/profile authoritative; duplicate409, unavailable reservation503 |

Repository consumers read response.ok/error, publicUrl, evaluations or success; these fields remain available. Error text is not byte-for-byte identical. The authenticated webhook is intentionally stricter: any custom producer omitting IDs must be identified before rollout. Both tracked notification trigger versions already include them; this does not establish every external custom producer's behavior.

## Reservation behavior and crash evidence

The policy is **at most one automatic provider attempt per notification**, not exactly-once delivery. A permanent namespaced app_settings primary key serializes claims. Concurrent requests have one winner. Accepted, rejected, sandbox and unknown attempts stay held permanently. Only dispatchEmail's proven attempted:false path can conditionally delete its own exact reservation value. There is no expiry, lease stealing, automatic retry or age-based cleanup.

| Failure boundary | Result and recovery rule |
| --- | --- |
| INSERT denied before commit | 503, no provider call; fix permissions before retry |
| INSERT committed but acknowledgment lost | No dispatch from that handler; later request409; retained reserved entry is ambiguous to another worker |
| Process dies after reservation, before dispatch | Reservation survives; later request409; email may never be sent |
| Process dies during dispatch or after provider accepts, before outcome write | Reservation survives; later request409; provider may already have accepted |
| Provider timeout/5xx/malformed response | unknown held; no automatic resend |
| Definitive provider rejection | failed held; correction/resend still needs deliberate reconciliation |
| Outcome UPDATE fails or returns no row | HTTP response retains provider outcome plus bookkeeping:failed; reservation still blocks replay |
| Provider config missing, never attempted | Exact key/value conditional release; failed/uncertain release stays held; stale release cannot delete a replacement |

Tests cover a real terminated Node worker after a committed native PostgreSQL claim, fresh-handler replay against durable state, lost claim acknowledgment, accepted provider with unfinished bookkeeping, in-flight provider concurrency, unknown responses, sandbox acceptance and stale compare-and-set release. Native fixtures are disposable and finally-cleaned. Mocked acceptance does not establish real delivery.

## Safe manual reconciliation

This is an operator procedure requiring separate authorization for any production mutation or resend. It was not executed. The PR adds no manual mutation endpoint, cleanup job or operational credential.

1. Record the specific notification UUID, reviewed code version and incident window privately. Inspect only that exact notification's `notification:email:<lowercase-uuid>` key in an authorized read-only session. Avoid broad setting exports; do not copy recipient details or secrets into tickets.
2. Preserve the exact stored value as evidence. New terminal entries retain providerId/providerStatus, nonce/reservedAt, outcome time, attempted, sandbox and intendedRecipientAccepted. Older entries may have only status/time; a reserved entry's at is its reservation time. Missing metadata is uncertainty, not evidence of no send.
3. Check provider records by receipt ID; if absent, privately correlate the intended recipient, subject and time window using authorized provider/app logs. Provider acceptance is not proof of delivery. Sandbox acceptance is not contact with the intended recipient. Missing logs or retention gaps do not prove no request occurred.
4. Leave accepted, ambiguous, reserved and unknown claims held while an attempt may exist or a worker may still be active. Never release by age, never bulk-delete this namespace, and never infer safe retry from HTTP500/502/503 alone. Preserve the in-app notification even if email cannot safely be recovered.
5. If independent evidence establishes no acceptance and an explicit resend is required, first obtain founder approval for a concrete plan. Quiesce the relevant dispatch/retry activity, confirm no in-flight worker can send, and re-read the exact reservation. Any separately reviewed mutation must compare both key and original value and affect exactly one row; never overwrite another reservation. There is deliberately no ready-to-run production DELETE here.
6. After an authorized recovery, record receipt/outcome and check for duplicates. If evidence stays ambiguous, leave the reservation and report suppressed/unknown delivery instead of resending.

Permanent entries grow with sent high-intent notifications. Capacity/retention must be monitored; deleting them re-enables replay and cannot be treated as harmless housekeeping.

## Production dependency gate

Run [notification-release-preflight.sql](../../scripts/notification-release-preflight.sql) in an authorized read-only SQL session and retain only its boolean output. It opens BEGIN READ ONLY and rolls back; no setting values, secrets or profile records are returned. All booleans must be true. A false result blocks rollout and requires investigation, not an automatic GRANT or migration.

- Required: service_role public-schema usage and RLS bypass; app_settings exists with key primary key and RLS enabled; SELECT/INSERT on key/value, UPDATE on value and DELETE; SELECT on notification id/user_id/message/link and profile id/full_name/email/is_banned. BYPASSRLS alone does not establish table privileges ([PostgreSQL](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)).
- Required producer: enabled AFTER INSERT ROW trigger, security definer function, UUID IDs, expected payload fields, app_secrets source and pg_net HTTP dispatch/extension. The actual tracked function/trigger is executed in a local PostgreSQL fixture with a capturing non-networked net.http_post stub; its IDs/content/path/bearer contract match the handler.
- The canonical lookup follows the notification commit: pg_net starts requests after commit ([Supabase documentation](https://supabase.com/docs/guides/database/extensions/pg_net)). The local stub proves the payload contract, not a real pg_net worker or deployed transaction/provider journey.
- This metadata check is a prerequisite, not proof of worker health, current URL/secret agreement, external custom producer inventory or delivered email. Preserve existing production configuration. Any live send or configuration/credential change needs separate authorization.

**Live preflight has not been run:** no authorized SQL connection is available in this session. The native fixture explicitly provisions its own privileges; it cannot certify production grants. Installed trigger/grants and the accepted crash delivery tradeoff remain merge/release decision gates. No production state was inferred from a green CI run.

## Validation and decision

Current evidence and exact commands are in VALIDATION_MATRIX.md. Existing source and follow-up fixes have independent review; final hosted CI must pass for the new head. Keep PR #116 Draft and unmerged. The founder decides whether to accept conservative suppressed email delivery after an ambiguous crash and must approve merge after the live dependency evidence is available. STAB-006 (uninspected presigned uploads) and STAB-011 (historical credential seed) remain separate unresolved items; this review neither resolves them nor authorizes their production changes.
