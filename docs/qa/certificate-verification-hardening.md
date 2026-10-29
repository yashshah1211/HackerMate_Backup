# Certificate verification: privacy fix and blocked abuse protection

Base: `d0ed42f8e88d88f6b4b2715f910ff89bfc86f979`.

## Public data contract

No documented requirement was found authorizing public college disclosure. Remove `recipient_college` from the success response and `college` from the joined profile selection. Do not retrieve an unnecessary profile field just to discard it in the browser.

Successful responses retain this explicit allowlist: `valid`, `certificate_id`, `badge_name`, `issuer_name`, `rank_title`, `recipient_name`, `event_name`, `issued_at`. The verification page maps these to its six approved display fields. No profile ID, email, college, raw metadata or extra database fields are returned. Lookup, ambiguity and error behavior remain unchanged: exact legacy/numeric IDs, UUID aliases, 400, 404, 409 and sanitized 500. The query still returns at most two candidate records. This is data minimization, not access control or an enumeration defense.

Regression coverage uses the actual handler and installed Supabase client with intercepted synthetic transport. It checks the outgoing profile projection, an exact response allowlist even if the fixture over-returns private fields, no record/identity leakage in error responses, existing ID behavior and frontend compatibility. A synthetic 429 must render unavailable with an explicit retry; it does not demonstrate server enforcement.

## Central rate limiting: BLOCKED — not implemented by this PR

Existing infrastructure was inspected, not called against production:

- `supabase/migrations/20260928100000_phase1a_definer_function_privileges.sql` defines atomic `check_rate_limit(text, integer, interval)` using `INSERT ... ON CONFLICT (ip) DO UPDATE`; execution is service-role-only. It returns `allowed`, `remaining`, `reset_time`.
- `src/lib/evaluator/evaluatorBudgetGuard.ts` already validates that contract, consumes shared reservations, hashes actor keys, applies deadlines and fails closed. Its callers establish an authenticated actor, which is unsuitable as a login requirement for public verification.
- `src/app/api/contact/route.ts` uses the same RPC for anonymous traffic but assumes a trusted last forwarded-IP hop and falls back to other headers/loopback. No deployment-independent, verified anonymous ingress-identity helper was found. Copying that assumption would not establish a spoof-resistant per-caller budget.
- `src/lib/evaluator/rateLimitRetention.ts` supplies bounded cleanup through the existing authorized daily report GET. Source availability and logical counter expiry do not prove that the production cleanup is currently running.
- The evaluator reliability notes record historical catalog verification and explicitly retain proxy/operational release gates. That is not a fresh certificate-route or ingress attestation. This task has no staging bindings; no production schema, RPC, counters or credentials were inspected.

The atomic database primitive can potentially be reused **without new packages or a new data store**, but the complete anonymous admission boundary is not yet qualified. No in-memory limiter, unconditional shared-global bucket, untrusted-header per-IP limiter, new secret, migration, grant change or external dependency is added. The public route remains unthrottled at application level; an existing edge/WAF rule, if any, remains unverified. Do not describe this PR as complete abuse protection.

### Exact prerequisites to unblock a separate limiter change

1. **Trusted caller identity:** verify the deployment's ingress/proxy chain and the exact client-IP signal it overwrites; prove client-supplied forwarded headers cannot select a different budget. Preserve guest access. Do not use arbitrary request headers, certificate IDs or a loopback default as caller identity. If the deployment cannot supply a trustworthy signal, a separately approved managed edge/distributed admission layer and its configuration are needed.
2. **Existing server bindings:** approved non-production `NEXT_PUBLIC_SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` for safe qualification, then separately reviewed production binding readiness. The anonymous fallback key cannot execute this RPC; never broaden its grants or expose the service role in the client. No new raw credential is requested in chat or stored in instructions.
3. **Shared backend contract:** verify in authorized staging that `rate_limits.ip` is unique, the RPC is the reviewed atomic implementation with fixed search path and service-only grants, and the response is structurally valid under concurrent calls from separate application instances. A missing key/RPC, timeout, malformed result or unknown identity must fail closed (unavailable, no certificate read), not bypass protection.
4. **Policy and privacy:** specify the per-caller budget/window and how legitimate shared/NAT users are handled. Use a certificate-route namespace and a keyed digest following the existing evaluator pattern; never store raw IPs or certificate IDs in limiter keys or logs. One stable slot per caller/window scope avoids one new key per guessed certificate. Confirm retention/erasure scope before introducing these privacy-relevant keys.
5. **Retention and operations:** demonstrate that the existing authorized cleanup runs and that its bounded deletion/backlog monitoring meets the policy, or obtain separate infrastructure approval. Do not invoke the report workflow, send emails or run cleanup on production as part of this PR.
6. **Denial and safe acceptance:** reserve before certificate reads; return 429 with bounded valid `Retry-After` on a known exhausted budget and sanitized 503 on unavailable admission. Test allowed, exhausted, missing credentials, spoofed headers, timeout, malformed RPC data, concurrent instances, reset/recovery and no-read-on-denial using synthetic fixtures plus authorized staging. The frontend's generic 429 handling already fails closed. Do not load-test production or claim mocked counters prove deployed atomicity.

## Qualification and decision

Run complete certificate coverage:

```sh
node --test --test-concurrency=1 scripts/test-certificate-verification-page.cjs scripts/test-certificate-id-integrity.cjs scripts/test-evaluator-maintenance.cjs scripts/test-public-hackathon-shell.cjs
node qa/rack-qualification.cjs tests
npm run typecheck -- --incremental false --pretty false
```

The existing PR validation selection includes the modified certificate page/contract suite. Rack qualification remains unchanged; no portal, branding, event, participant or certificate records are modified. No production database access, real issuance, configuration changes, merge or deployment is authorized here.

**GO for independent review of the privacy fix; NO-GO for public launch acceptance.** Distributed anonymous rate enforcement is explicitly BLOCKED on the prerequisites above. Mission 07's verified staging pairing, existing authorized fixtures, deployed response/privacy/no-index checks, actual rate-policy enforcement and independent launch approval also remain outstanding. No deployed privacy improvement is claimed until this fix is reviewed and released through the separate authorized process.
