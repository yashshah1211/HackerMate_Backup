# STAB-006 — blocked publication-boundary remediation

Status: **OPEN / BLOCKED on compatibility and infrastructure authorization.** No presign behavior, R2 configuration, credential, production object or public domain was changed. Existing POST response `{uploadUrl, publicUrl, key}` and successful PUT behavior remain available. This plan is not a claim that uploads are secure.

## Verified trust boundary

Baseline `7fc7acc`. Both in-repository chat image/voice callers use `/api/upload`; the only call to createPresignedUploadUrl is `/api/upload/presign`. No external consumer inventory or longer-term request archive is available; the earlier one-hour negative observation cannot exclude external users.

| Boundary | Evidence / limit |
| --- | --- |
| Identity/suspension | Both endpoints use getUser plus protected known-false is_banned before provider work. No service-role auth expansion. This is request-time verification, not revocation of an issued URL |
| Direct bytes/size | Direct endpoint receives the actual File, checks10MiB, signature allowlist and image moderation before PUT. These checks are a signature filter, not complete decoding/malware scanning; container headers do not establish every embedded stream |
| Presign bytes | Receives only claimed MIME/folder. No actual object bytes, size or moderation result exist when the public URL is returned |
| Actual SDK signing | Offline execution of real AWS SDK with synthetic credentials shows signedHeaders=host, payloadMode=UNSIGNED-PAYLOAD, expiry900seconds and exact bucket/key path. SDK also includes CRC32 query metadata; provider checksum enforcement was not tested and checksum matching is not content classification/moderation |
| Publication | Helper constructs publicUrl directly from R2_PUBLIC_URL and the signed key; there is no quarantine, verified publication record or read authorization gateway |
| MIME/browser rendering | Input MIME is allowlisted, but a claimed type/signature does not establish final stored object safety. Browser Content-Type/nosniff/CSP behavior and live bucket policy were not inspected. Chat renders image/voice public URLs; a database membership denial cannot revoke a previously copied public URL |
| Ownership/key | Server sanitizes folder to32characters and generates timestamp/random suffix; supplied filenames do not select an object path. No actor/tenant ownership record is bound to the final object. Returned key/publicURL are intended exposure, not authorization tokens |
| Scope/reuse | Signature is scoped to PUT bucket/key with900second expiry. It is not one-use. Reading an object after first upload is not enough if the same still-valid URL can replace it later |
| Abuse/orphans | Direct body cap exists; presign does not constrain actual size. Neither path has a demonstrated account quota/reservation boundary. Upload failure after object PUT or message persistence failure can orphan objects. No lifecycle cleanup is implemented here |

No real R2 request/upload or moderation/provider call was made. The local SDK result establishes signing structure, not a live exploit or provider policy. All current legacy signatures may remain valid until expiry; a future rollout must account for that interval.

## Why a claims-only patch is rejected

Adding contentLength/MIME fields to the request, signing those claims, checking the first uploaded object with HEAD or marking the URL verified does not bind every future public byte. A client can submit different content, checksums are not moderation, and a remaining write capability can replace inspected bytes. A server-side CopyObject after inspection also races replacement unless the exact inspected version/bytes are pinned. No such patch is being implemented or counted as a fix.

## Preferred approved design

1. Provision a genuinely private staging namespace/bucket with a signing identity that cannot write the public bucket. A folder named private inside the existing public bucket is not isolation. Stage objects must never be served through the existing public domain.
2. Bind each short-lived upload capability to the authenticated actor, a unique staging key and an explicit maximum, with account rate/quota admission. Actual stored-byte limits must be enforced by the storage/upload boundary, not by a JSON claim alone. Avoid reusable publication permissions.
3. In a server verification step, recheck current actor suspension and membership/ownership where the attachment belongs to private collaboration. Fetch bounded actual bytes, decode/validate supported format, verify size/type and moderate required content. Fail closed on unavailable inspection.
4. Publish **the inspected bytes** to a fresh destination key using a trusted writer; do not copy the latest mutable staging object by name. Keep the staging capability unable to overwrite that public destination. If preserving confidentiality/revocation is required, use authenticated serving rather than an unrevokable public object URL.
5. Return/publish the final URL only after verification. Idempotent finalize/recovery and ownership records require an explicitly approved persistence/contract design; no new schema or idempotency table is introduced in this mission.
6. Delete rejected/stale staging objects through an approved bounded lifecycle/cleanup policy, with audit and quota accounting. Never bulk-delete production objects or sweep existing media without separate review.

## Compatibility options and approvals needed

- **Consumer migration:** identify external users, document a versioned staged-upload/finalize flow and migrate known callers. Retire or restrict legacy public PUT signing only after explicit approval; field-name compatibility alone is insufficient.
- **Transparent controlled gateway:** preserve POST fields and PUT success semantics through a trusted upload/serving gateway that validates before publication. This needs an approved domain/route, request-size/runtime/streaming design and infrastructure configuration; it cannot be assumed compatible with existing R2 URLs or implemented as a silent Next.js proxy with different size limits.
- **Legacy contract retained:** keep STAB-006 open with explicit risk acceptance until one of those plans is approved. Switching a prefix or adding caller claims is not an acceptable substitute.

Required founder decisions: consumer/migration policy, private staging/serving configuration, publication and revocation semantics, bounded verification resource/cost budget, approved ownership/quota persistence, cleanup policy and rollout handling of outstanding900second signatures. No production change is authorized by this plan.

## Acceptance tests before closure

Prove actual private staging cannot be read publicly; different bytes/MIME, oversize bodies and moderation failures cannot publish; replay/replacement cannot change verified public bytes; finalization checks current identity/ownership/revocation; concurrent finalize and ambiguous provider outcomes do not double-publish; orphan cleanup is bounded and safe; supported clients retain approved success behavior. Use synthetic local boundaries first, then only separately authorized staging infrastructure verification. No claim of production closure until the deployed storage boundary is demonstrated.
