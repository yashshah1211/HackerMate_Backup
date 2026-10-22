# Round 2 delivery (PR #45 base, after-reset follow-up)

The preserved PR #45 head is `3b4c9a71dc6bac0c940c2df40401ffd1d8678840`.
Its migration `20261022141142_hustle_round2_delivery.sql` is unchanged:
SHA256 `5b9d24cd4d18094ca6fb5ea43a0b42b3b356ae8bbc804296871c082143f38062`
for canonical Git/LF bytes. Windows autocrlf checkout bytes have a different hash;
use the exact reviewed artifact, never silently normalize an execution envelope.

**Operational instructions are now in [hustle-round2-after-reset.md](hustle-round2-after-reset.md).**
The previous morning delivery proposal is revoked. All participant invitation
messages must be scheduled exactly **23 October 2026 14:05 IST / 08:35 UTC**.
Do not schedule tonight: verified current daily headroom is insufficient.

PR #45 supplies exact batch manifests, atomic per-batch activation/invitation and
per-team delivery reservations, service-only claim/finish/report RPCs, a current
administrator UI, and permanent fail-stop behavior after uncertainty. The follow-up
adds a separately gated one-time worker and provider schedule verification. No
other roster imports, member messages, reminders or automatic attendance decisions.

Each authenticated UI mutation retains current admin/founder authorization, ban and
active-session checks, same-origin JSON POST, rate limits and no-store headers.
The background route has distinct, explicitly delegated server-held admin authority;
it never fabricates a browser session. SQL rechecks current founder/admin eligibility
and ban status on every mutation. Ordinary organizers cannot dispatch.

Private links use a fragment. Tokens are HMAC-derived from a dedicated 256-bit
server secret plus exact batch/digest/team. Only token hashes enter SQL. Google
session provenance, verified official roster email, onboarding and leader-only
attendance checks are unchanged. Attendance remains **10 AM inclusive to 11 PM
exclusive IST**. Delivery timing is a separate rule.

The source approval constant in server.ts remains false. Both participant switches,
both delivery switches, and both new autodispatch switches default OFF. Import and
participant modes are mutually exclusive. Environment changes cannot override the
source approvals. No hosted Preview fixture bypass is introduced.

Scheduled provider acceptance is not inbox delivery. Never reissue a team token or
resubmit a dispatching/unknown/rejected/failed record to recover a failed run.
