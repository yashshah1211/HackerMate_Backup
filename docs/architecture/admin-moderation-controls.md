# Admin moderation controls

## Authority and protected accounts

Users and Reports retain the existing middleware and `AuthGuard adminOnly`
gates. Ban/unban and moderation warnings additionally call `requireAdmin`, which
verifies Auth identity and the caller's current profile. Only the existing founder
identity or `role=admin`, with `is_banned=false`, can proceed. Lookup failures deny
the operation. No new role-granting policy or endpoint is introduced.

Promote/Demote is disabled until the founder approves a policy for who may grant
and revoke administrator privileges. Existing database privileges are not a
product policy. Neither browser-supplied roles nor UI visibility authorize writes.

Targets need an existing Auth identity and matching profile with a known boolean
ban state and `role=user`. The actor, founder (checked against both Auth and
profile email), administrators and unknown roles are protected. Warnings use the
Auth email and require it to be confirmed, rather than trusting a browser address
or an editable profile email. The service key is server-only and required for
target verification; absent configuration fails closed.

## Ban/unban result

`POST /api/admin/ban-user` accepts only `{userId, is_banned}` with a UUID and a
boolean. It changes only `profiles.is_banned`; existing database triggers may
maintain derived data. The update compares the target's verified role, ban state,
email and updated_at. A concurrent change or zero affected rows produces a
conflict, not success. The returned target ID, role and ban state must match.
Already-applied state returns `changed=false` without a write; the UI describes it
as already applied and refreshes. Duplicate in-flight UI submissions are blocked.
Lost responses have an unknown outcome: refresh before retrying.

## Warning result

Both tabs reuse `POST /api/send-email` with `type=moderation_warning`, the existing
escaped template, recipient verification, per-actor 15/hour rate limiter and
existing accounting call. Only the warning path receives the additional checks;
other notification types retain their prior behavior.

Warnings require 1–2000 trimmed characters, a configured provider key and a real
sender address. Missing configuration and Resend sandbox senders fail before any
send; there is no warning mock-success or sandbox redirection. A valid provider
response with an ID is **accepted**, not confirmed delivery. Provider rejection,
missing IDs, invalid responses and transport timeouts cannot produce success.
The UI preserves the draft on failure, serializes submissions, and refreshes after
accepted requests. It does not automatically retry. Check provider records before
resending after an ambiguous outcome.

This is not a durable delivery ledger or cross-tab/server idempotency system.
Shared quota/accounting concurrency and provider webhook reliability belong to
the separate email-reliability project. The existing shared budget infrastructure
is unchanged. Warning acceptance does not prove inbox delivery or reading.

## Existing ban enforcement limits

- Setting the profile flag does not revoke Auth sessions, refresh tokens or
  already-issued access tokens, remove team membership, or close Realtime sockets.
- `AuthGuard` checks the flag during session initialization/auth events; it does
  not subscribe to profile changes. An already-mounted page may remain visible.
- `requireAdmin` and newer partner authorization predicates check current ban
  state. Middleware's admin gate checks role and is not a comprehensive ban gate.
- Several existing product policies authorize team membership rather than current
  ban state (`team_tasks`, `team_documents`, `team_links` are examples). Existing
  authenticated sessions may retain allowed API/database actions. Ban/unban must
  not be described as an immediate platform-wide access revocation.
- Identity/profile verification and the subsequent operation are separate calls.
  The ban update protects its target profile snapshot atomically; it is not an
  atomic lock over Auth identity, caller privileges and all product actions.

No RLS, grants, migrations, session policy or transactional account-deletion code
is changed. General ban enforcement requires a separately reviewed security task.

## Validation and release verification

Offline tests execute real handlers with mocked Auth, database, rate limiter and
provider services, plus real React rendering/effects for both moderation tabs.
They make no remote calls or persistent fixture writes. Existing account-deletion,
dashboard and admin-authorization regressions must continue to pass.

After owner approval and release, verify using authorized isolated accounts:
admin access, protected-target denial, ban/unban and refreshed state, and the
explicitly limited behavior of an existing target session. Inspect configuration
without exposing its values. A real warning send requires separate approval and
an authorized recipient; provider acceptance and delivery must be checked
separately. Do not use real users as test targets or invoke these operations in
production merely to validate deployment.
