# Email reliability: application-only phase

This phase changes application behavior only. It does not migrate data, configure
providers, execute cron endpoints, or send email during validation. The base is
`adbd8fbe3c324a646c6cd96f341b362089be99e5`.

## Dispatch contract

- `not_dispatched`: configuration unavailable; `attempted: false`.
- `attempted: true`: a provider request was initiated, not evidence of acceptance.
- `accepted`: a successful HTTP response contained a nonempty string message ID
  and no mock, sandbox-response or error marker. Delivery remains unconfirmed.
- `failed`: a definitive client rejection, excluding ambiguous timeout/conflict responses.
- `unknown`: transport interruption, malformed acknowledgment, ambiguous conflict,
  timeout response or provider server failure. Check provider records before resending.
- Delivery is evidenced only by verified delivery webhook events. A recipient
  mail server accepting a message is not proof that a person read it.

The shared boundary has a 15-second timeout and makes one request, without retries.
Both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` must be explicitly configured. Missing
configuration produces a diagnostic without recipient addresses or message contents.
An `onboarding@resend.dev` sender additionally requires `RESEND_SANDBOX_RECIPIENT`.
Sandbox acceptances consume counters but never mark the intended recipient contacted.
Sandbox pitch emails omit the CRM tracking pixel.

`success` on email-only responses means intended-recipient acceptance. Sandbox
acceptance returns `success: false` with the accepted sandbox outcome separately.
An announcement can return `success: true` for its publication while `emailSuccess`
is false. Consumers must use the email-specific fields, not HTTP status alone.
Contact honeypot responses deliberately retain their non-email success behavior.

## Business state and bookkeeping

Lead pitch timestamps, nudge timestamps and reminder completion change only for
intended-recipient acceptance. Announcement `sent_at` is written only when every
intended email was accepted; it is not a delivery timestamp.

Acceptance counts are independent of CRM persistence. API responses expose
`accounting` and `bookkeeping` failures without reclassifying accepted messages as
unsent. Row-based writes verify one affected row, including conditional predicates
for the observed state. The reminder completion RPC only exposes an error result;
its affected rows cannot be independently established by this application contract.

Unknown pitches use the existing free-text `email_outcome_unknown` CRM status,
without writing a pitch timestamp. Automatic eligibility excludes non-new leads
and deduplicates against both pitched and held email addresses using paginated reads.
Supplied lead selections are re-read before dispatch. History, eligibility and
budget lookup failures block dispatch. The cron's second pitch pass is skipped
after an uncertain outcome or persistence/accounting failure in the first pass.
The second pass also excludes the scraper's newly inserted leads, preventing an immediate retry of a definitive first-pass rejection. Discovery itself remains available.

## Honest accounting and reporting

Daily initialization uses INSERT-on-conflict-do-nothing semantics and reads the
winning row instead of overwriting existing counters with zeros. The advisory
function is named `checkEmailBudget`; it does not reserve capacity. Counter writes
compare the observed total and expose conflicts instead of silently overwriting
a concurrent increment. They do not retry and are not exactly-once accounting.

Usage reporting is read-only and labels legacy counters as partial evidence.
Missing metrics are null/unavailable. It does not infer remaining quota or a
complete account total from a single Resend results page or CRM timestamps.
Recent webhook rows are displayed as a sample, without authoritative delivery,
open or click rates. Daily business-record reports label rows UNVERIFIED, retain
the requested time window, and do not report inferred sends or zero failures as fact.
Historical CRM/pixel ratios are labeled as such, not delivery or human-read rates.

The signed Resend webhook returns a retryable server error if persistence fails.
Signature verification remains intact. Unique event-ID storage/deduplication is
deferred; replayed events may still appear more than once in the sample.

## Compatibility and remaining reliability work

The moderation-warning authorization, protected-target checks, template escaping
and acknowledgment behavior remain intact. Its acceptance response now also
exposes accounting status. The analytics-summary route is unchanged. No ban or
session enforcement, RLS, consent policy, template strategy or provider settings change.

There is no durable dispatch ledger or provider idempotency key in this phase.
Concurrent processes can still send duplicates or pass the same advisory budget.
A crash or failed hold write can leave an accepted/unknown pitch eligible in a
later invocation. Nudges/reminders cannot durably hold unknown outcomes in their
current schema. No new automatic retries are introduced, but subsequent independent
scheduled/manual invocations are not a durable retry-suppression guarantee.
Operators must reconcile uncertain/persistence-failed outcomes before running again.

Quota counters remain partial, with no guarantee over sends outside these paths,
monthly account limits or unknown provider outcomes. Historical mock contamination
is not repaired. The existing standalone `scripts/send_daily_report_now.ts` is not
invoked or migrated by this route-focused phase. Existing analytics-summary
dispatch is preserved and still outside these legacy counters. Complete admission
control, durable deduplication, uncertain-outcome reconciliation, webhook event
uniqueness and derived counters require the separate database-backed reliability PR.

No new dependency, worker, service or recurring cost is introduced.

## Changed files

- `docs/architecture/email-delivery-reliability.md`
- `scripts/test-admin-authorization.cjs`
- `scripts/test-admin-dashboard-data.cjs`
- `scripts/test-admin-moderation.cjs`
- `scripts/test-email-reliability.cjs`
- `scripts/test-email-ui.cjs`
- `src/app/admin/_tabs/OutreachTab.tsx`
- `src/app/admin/_tabs/PartneringTab.tsx`
- `src/app/admin/_tabs/UsersTab.tsx`
- `src/app/admin/page.tsx`
- `src/app/api/admin/email-analytics/route.ts`
- `src/app/api/admin/nudge-incomplete-onboarding/route.ts`
- `src/app/api/admin/scrape-unstop/route.ts`
- `src/app/api/admin/send-organizer-pitch/route.ts`
- `src/app/api/admin/send-outreach-summary-pdf/route.ts`
- `src/app/api/contact/route.ts`
- `src/app/api/cron/auto-scrape-leads/route.ts`
- `src/app/api/cron/daily-email-report/route.ts`
- `src/app/api/cron/database-activity-report/route.ts`
- `src/app/api/cron/reminders/route.ts`
- `src/app/api/organizer/broadcast/route.ts`
- `src/app/api/send-email/route.ts`
- `src/app/api/webhooks/notification/route.ts`
- `src/app/api/webhooks/resend/route.ts`
- `src/app/contact/page.tsx`
- `src/app/hackathons/[id]/organizer/page.tsx`
- `src/lib/admin/autoSendPitches.ts`
- `src/lib/admin/emailBudgetGuard.ts`
- `src/lib/emailDispatch.ts`
