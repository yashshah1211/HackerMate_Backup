# Hustle Carnival Round 2 — communications foundation (PR C)

Independent branch `feat/hustle-phase2-communications`, based on production `main` **ca87b8ac419083e2a2b6e6b99bf79797e817f3cd**. PR #27 was read only, initially at `9cbb409`, then refreshed and inspected at **66501db9451346971207f5e6cd6b923959a50a16** while Desktop continued its work. No PR A code or unpublished types are imported. No existing tracked file, dependency, configuration, authentication helper, Supabase migration, portal, workshop, registration flow, dashboard or participation guard is modified.

**This is a disabled integration foundation, not an operational messaging system.** No real participant, email, WhatsApp message or connected database was used. No messaging API, worker, cron or live roster endpoint is introduced. `dispatchRound2Invitation()` always returns blocked; environment flags cannot enable it. The only new page is `/dev/hustle-communications`, using six explicitly synthetic teams, read-only controls, and production `notFound()` both in its own page and the existing development layout. It must stay inaccessible in Vercel Preview/production. A separately authorized production integration and release are still required.

## Included behavior

- Professional HTML **and plain-text** HackerMate × Club Ellusion invitation, using the existing `renderHackerMateEmail` engine and the existing `dispatchEmail` Resend input/outcome contract. No second email client, new dependency, tracking pixel or remote asset is added. Subject contains no recipient/team information. The organizer's existing contact address is used for replies.
- Congratulations, 24 October on-campus Round 2 at G.L. Bajaj Group of Institutions, Mathura, and the PR A response window: **23 October 2026, 10:00 AM inclusive to before 11:00 PM IST (UTC+05:30)**. Opening the invitation does not confirm registration; the leader chooses Confirm attendance or Decline invitation for the whole team.
- Fresh (at most 60 seconds old), activated, pending, exact-event shortlist DTO validation. This is input validation, **not authorization**. A future trusted server adapter must establish the DTO's provenance and recheck state before attempting dispatch.
- Organizer-approved template version and trusted HTTPS origin allowlist, both default unapproved/empty. The supplied URL is treated as an opaque PR A capability: no generation, token parsing, path reconstruction or raw-secret persistence. Fragments are preserved. Origin checking alone does not prove the link belongs to this team or is current.
- WhatsApp international-format syntax normalization (explicit country code; no country inference), approved message template and safely encoded `https://wa.me/<digits>?text=...`. This is **manual individual click-to-chat**, not automated bulk broadcasting. Syntax does not prove ownership, consent or WhatsApp availability. Messages point to the official email and contain no private invitation URL; a bearer in a wa.me query would be shared with WhatsApp/history.
- Read-only responsive roster component with separate registration, email and manual WhatsApp evidence labels. It accepts an already-authorized projection; it is not an authorization boundary. No email addresses, phone numbers or private URLs enter the development UI. `lastEvidenceAt` means a recorded event/action, not proof a message was sent or read.

## Durable ledger design

`docs/sql/hustle-communications-ledger.sql` is deliberately **outside `supabase/migrations`**. It is a source-only PostgreSQL design, tested in a disposable container; it is not installed or production-compatible by assertion. The custom private schema `hustle_comms` has no dependencies on PR A tables and no competing registration/invitation schema. `team_id` is an opaque eventual reference to PR A's internal team UUID. The draft provides no production grants: schema, table, sequence and function access is explicitly revoked from PUBLIC, anon, authenticated and service_role, even when permissive defaults exist. Tables use RLS with no browser policies. Future least-privilege worker/organizer access needs separate design and tests; the current functions are SECURITY INVOKER, not authenticated RPC endpoints.

Five tables store only job/team/actor identifiers, safe provider/event identifiers, states, timestamps, conservative quota reservations and evidence history. No recipient contacts, token/hash, URL, message body or registration response is persisted. The adapter must never store the prepared email or ephemeral handoff in this ledger.

| State | Stored meaning | Retry behavior |
| --- | --- | --- |
| `queued` | No provider attempt has been claimed. | May be claimed once after fresh authorization/eligibility/link/quota checks. |
| `unknown` | Attempt claimed durably, or response/worker/persistence outcome ambiguous. | Held indefinitely for review; no automatic retry or lease expiry/reclaim. |
| `accepted` | Valid intended-recipient Resend acceptance acknowledgement and provider ID. | No resend; not proof of delivery or registration. |
| `rejected` | Definite provider 4xx rejection, excluding ambiguous 408/409. | No automatic resend, including 429; explicit review required. |
| `confirmed_delivered` | A cryptographically verified `email.delivered` event matches the recorded provider ID. | Recipient-mail-server evidence, not a human read receipt or registration decision. |

The unique key is `(event_id, team_id, purpose='round2-invitation-v1')`, across all token revocations/reissues. A repeated request returns the existing job; it cannot reset status. The claim transaction locks the job, reserves a fresh verified UTC-day sub-allocation, then stores `unknown` **before** any provider request. Concurrent workers cannot claim twice or consume the same last slot. Rejections, unknowns and crashes retain their conservative reservation. Finish failures preserve the provider outcome in the immediate result but leave the durable hold; callers must not reinterpret this as unsent.

Verified delivery receipts use Svix event IDs for idempotency and store only the safe projection. Receipt-before-acknowledgement is handled with provider-ID serialization and pending evidence; unrelated IDs never mark a team delivered. Worker outcome writes cannot claim delivery. The verifier uses the installed `svix` infrastructure, rejects invalid/stale signatures, bounds payloads, ignores sent/opened/clicked events, and emits no contact fields. No webhook route is added or existing route modified.

Manual contact actions record actor UUID, action UUID and server time, with idempotency: `chat_opened`, `organizer_marked_sent`, `organizer_marked_replied`. No manual `delivered` state exists. No client timestamp or claim of WhatsApp delivery is accepted. Production adapter authorization remains mandatory before each action and roster read.

## Exact integration dependencies on PR A

1. **Verified identity and event authority.** Future private roster/action routes must use the authoritative `requirePartnerAccess(req, { hackathonId: '0da43cba-90dc-449c-a126-a2fc8be8a379' })` contract and current protected role/ban checks with the caller JWT. Never authorize from a DTO, client-supplied actor/event, college/domain, UI prop or mere possession of a row UUID. PR A at `66501db` propagates refreshed auth cookies through `withAuthCookies`/the optional cookie callback; future handlers must preserve those updates on success and failure. Token issuance/revocation remains PR A's verified founder/admin action; ordinary organizer access must not be promoted into that authority.
2. **Authoritative activated shortlist projection.** PR A's authenticated `hustle_phase2_snapshot()` exposes `teams[].id`, `team_name`, `leader_name`, `leader_email`, `leader_whatsapp`, `batch_id`, `decision`, `decided_at`, `invite_status`, plus `batches[].id`/`activated_at`. Adapt only those exact-event teams whose batch is activated and decision is pending. Use `teams[].id`, not the CSV external identifier, for the ledger. Do not select recipients from generic registrations, public Builders/Teams, event attendees or arbitrary request emails. Recheck promptly before a provider attempt; the 60-second DTO limit alone is not sufficient for authority or revocation races.
3. **Explicit one-time ephemeral handoff.** PR A's admin POST `/api/partners/hustle-carnival/phase-2/invite` accepts `teamId`, enforces active/pending state and returns `{ url, notice }` once. At the inspected head, the URL is a fragment capability; preserve it exactly. The database stores only hashes and does not offer raw-link recovery. A reviewed adapter must associate that one-time response with the authoritative team/contact in server memory, validate the current invitation and its expiry/revocation immediately before sending, and discard it afterward. No safe background queue of raw links exists. A future handoff API/atomic eligibility contract may be required; do not reconstruct links, mint tokens or assume `invite_status='ready'` proves current validity. Lost links require PR A's explicit revoke/reissue process. Claimed/unknown/accepted jobs must never be silently reset when reissuing.
4. **Concrete storage adapter and reviewed schema.** Map `queue`, `claim`, `finish` to the design's `queue_email`, `claim_email`, `record_outcome`. Review the actual Supabase schema, foreign-reference strategy, transaction semantics, least-privilege roles, private projection, retention and authoritative organizer policies after PR A settles. The source-only design has zero production grants and cannot be used as a production API. Run a separately approved end-to-end Supabase/PostgREST check before any installation/release. No connected schema was inspected or altered here.
5. **Verified Resend webhook integration and reconciliation.** In a separate change, connect the verified raw Resend/Svix webhook boundary to `verifyDeliveryEvidence` and `record_delivery`, with durable event-ID deduplication and bounded pending-evidence retention. Existing `src/app/api/webhooks/resend/route.ts` is untouched; legacy counters, opened events, stored arbitrary payloads and organizer assertions cannot directly mark this ledger delivered. An unknown attempt without a recorded provider ID cannot currently be associated with a delivery event; provider-side records must establish the exact job→provider ID mapping in a separately reviewed reconciliation workflow. No matching by guessed names/addresses, and no retry while unresolved. Define handling for bounces/complaints separately; an accepted message may later fail delivery.
6. **Shared quota reservation and sender readiness.** Existing `checkEmailBudget` is advisory and `daily_email_stats` is explicitly partial. No trustworthy global daily/monthly remaining budget can be inferred. A future atomic coordinator must verify provider usage, account for every existing email path and unknown attempt, and allocate a bounded slice to PR C. Missing/stale allocation blocks claims. `daily_allocation` is a design of a conservative slice, not proof of global headroom. Verify sender/domain/reply-to approval and the existing Resend configuration without sandbox redirects. After all launch gates, use the existing `dispatchEmail` transport; do not route invitations through generic broadcasts as a bypass.
7. **Privacy and separate release authorization.** Review email-domain click/open tracking: do not permit bearer-link rewriting/inspection/tracking pixels. Disable/redact analytics, replay, APM request-body/cookie capture and sensitive provider/access logs for the eventual private handoff and roster. PR A's fragment hardening avoids normal URL access-log exposure, but the email provider/recipient still sees the capability. Approve contact access/retention, the final templates, correct origin and actual outreach before enabling any production source gate. Do not use the development UI as a private production dashboard.

## Quota, cost and timing

No paid service, automation service, WhatsApp API or npm dependency is introduced. WhatsApp remains manual individual communication through the organizer's existing account, subject to normal user/network costs and platform rules. No real messages are sent, including test/sandbox emails.

The repository's configured Resend global daily guard is **100 emails/day**, while legacy outreach/nudge categories can nominally consume 60 + 40 of that. These are code constants, not a verified current account entitlement or remaining capacity. Other transactional/admin/broadcast paths share the same provider, and legacy counters are incomplete. Monthly quota, current usage, account status, sender readiness and actual free-tier headroom were not queried or configured. Unknown outcomes conservatively consume budget in this design.

At PR A's 500-team pilot cap, 100 exclusively allocated attempts/day would require at least five quota days; other traffic, rejection handling and unknowns reduce usable throughput. This is a lower bound, not a promise of free capacity or completion by 23 October. Do not enable dispatch, buy capacity, reset counters or invent delivery rates to meet the deadline. If verified free capacity is insufficient, the organizer must review a reduced/staggered plan and authorized manual follow-up. PR C alone cannot guarantee all invitations by the deadline.

## Reproducible checks

Use the repository's declared dependencies. The pre-provisioned checkout lacked some declared test packages; they were restored in independent scratch tooling/copied node_modules only. No tracked manifest or lockfile changed.

```sh
npm run typecheck
npm run lint -- src/lib/hustle-communications src/components/hustle-communications src/app/dev/hustle-communications scripts/hustle-communications-harness.cjs scripts/test-hustle-communications.cjs scripts/test-hustle-communications-sql.cjs scripts/test-hustle-communications-browser.cjs
node scripts/test-hustle-communications.cjs
node scripts/test-hustle-communications-sql.cjs
node scripts/test-hustle-carnival.cjs
node scripts/test-hustle-carnival-workshops.cjs
node scripts/test-email-reliability.cjs
node scripts/test-partner-authorization.cjs
```

The SQL runner requires a **local Docker daemon** and the `postgres:17-alpine` image. It explicitly selects `unix:///var/run/docker.sock`, clears alternate Docker endpoint/TLS selectors, accepts no database URL, creates a uniquely named/labeled `--network none` container without published ports or host mounts, verifies its fixture database/marker, and deletes the container and volumes in `finally`. It never connects to Supabase. An image download may be needed; no paid database is used. Tests create only synthetic roles/UUIDs and stress real PostgreSQL transactions, permissive default grants, a BYPASSRLS service-role fixture, duplicate and cross-team quota races, evidence ordering and manual action constraints.

Start a separate development server with **synthetic settings only**, no `.env` or real credentials:

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:4399 NEXT_PUBLIC_SUPABASE_ANON_KEY=communications-offline-fixture NEXT_TELEMETRY_DISABLED=1 npm run dev -- --webpack --hostname 127.0.0.1 --port 4307
```

Then:

```sh
node scripts/test-hustle-communications-browser.cjs
```

The browser test owns port 4308 for a synthetic email HTML preview and uses system Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, default `/usr/bin/chromium`). All external browser requests and writes are blocked; no email/wa.me destinations are followed. Synthetic confirmation URLs use `example.invalid`. Port 4399 is an unused loopback placeholder required by the inherited app shell, not a connected database. Artifacts default to `work/communications-qa` (`HUSTLE_COMMS_QA_OUTPUT` override); keep that directory untracked.

### Results, 18 October 2026

- TypeScript and scoped ESLint: passed.
- **25** new unit/security/provider tests: passed. Actual existing Resend transport exercised with fake fetch and fake credentials only; success, rejection, 408/409/429/5xx, malformed/mock acknowledgements, aborted requests, duplicate workers, lost responses and bookkeeping failures covered. No automatic retries and no real HTTP to Resend.
- **56** actual PostgreSQL checks: passed. Explicit denial for anonymous/authenticated/service roles even under permissive defaults; RLS and no PII columns; durable unknown-before-attempt, no reclaim, unique jobs, safe outcome/evidence transitions, receipt-before-acknowledgement, idempotent manual actions and real quota/claim concurrency.
- **158** existing regressions: passed (19 carnival, 7 workshops, 82 email reliability, 50 partner authorization). PR A's unpublished suites are not copied or claimed as executed.
- **88** final browser checks at 1440/768/390/320px: passed, zero uncaught page errors and zero axe WCAG A/AA violations in the dashboard main landmark. Real Next development route and inherited shell/hydration; safe disabled actions, horizontal roster keyboard scrolling without page overflow, skip focus, native FAQ keyboard operation, 44px controls, email layout and no email trackers. Dashboard/email screenshots visually reviewed.
- One initial cold-development browser run completed its layout/axe assertions but caught `Internal Next.js error: Router action dispatched before initialization`. A full warm rerun passed with error capture intact. Its root cause is not established; no claim of fixing shared Next/router behavior is made. The page is production-disabled. An initial SQL rerun caught the image's temporary bootstrap server shutting down; the runner now waits for completed initialization before `pg_isready`, and the hardened full SQL rerun passed with cleanup.
- No full production build or live Preview/participant workflow, mail-client matrix, screen-reader manual session, connected Supabase integration or external delivery verification is claimed. Preview status is tracked on the draft PR for its exact commit. The synthetic page should return 404 on production/Preview builds, not display the roster.

## Read-only security review and launch blockers

No new critical issue was identified in the inspected PR A source. Desktop's latest fragment and session-refresh hardening were read only. This is a scoped review, not a full security audit or confirmation of production configuration. PR A's own security review reports existing dependency advisories, including Next.js, and requires an explicit patched/mitigated release decision. No dependency fixes are attempted in PR C.

Launch remains blocked on: PR A final contracts/approval and official shortlist activation; authoritative private roster/action/handoff adapters; zero-grant ledger schema/permission/retention review and separately approved installation; signed webhook and unknown-outcome reconciliation; verified shared daily/monthly free capacity and sender/domain configuration; organizer approval of templates/origin/contact workflow; tracking/logging/privacy review; framework/dependency security decision; approved end-to-end checks and separate authorization to enable and send. No merge, production deploy, connected migration or outreach is authorized by this draft.

## Exact added files

1. `src/lib/hustle-communications/contracts.ts`
2. `src/lib/hustle-communications/templates.ts`
3. `src/lib/hustle-communications/dispatch.ts`
4. `src/lib/hustle-communications/delivery.ts`
5. `src/components/hustle-communications/CommunicationDashboard.tsx`
6. `src/components/hustle-communications/CommunicationDashboard.module.css`
7. `src/app/dev/hustle-communications/page.tsx`
8. `docs/sql/hustle-communications-ledger.sql`
9. `scripts/hustle-communications-harness.cjs`
10. `scripts/test-hustle-communications.cjs`
11. `scripts/test-hustle-communications-sql.cjs`
12. `scripts/test-hustle-communications-browser.cjs`
13. `docs/hustle-communications-pr-c.md`
