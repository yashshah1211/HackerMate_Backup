# HM08 daily analytics digest at 07:10 India time

Branch `feat/hm08-daily-digest-0710-ist` starts at `acc99508ad5d6a6e92557dbd7693a2e83dfe910f`. **READY FOR PR.** The five-file implementation has passed local verification and independent review. Production activation requires the checks below.

## Schedule and recipient

The existing analytics workflow has one schedule, `10 7 * * *` with `timezone: Asia/Kolkata`. It targets 07:10 IST (01:40 UTC) daily, including weekends. GitHub schedules the workflow from the latest commit on the default branch, which is `main`. The time is approximate because a busy Actions queue can delay or drop scheduled runs. There is no catch-up job. A delayed invocation uses the India reporting date at the server's analytics snapshot. If the delay crosses India midnight, it can claim the new day. [GitHub scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

Manual **Run workflow** remains defined. Manual and scheduled invocations share one job and one authenticated POST. Their shared concurrency group leaves the active run alone. GitHub may replace an older pending run with a newer one. The unchanged PostgreSQL claim is authoritative. The first authorized email-producing invocation on an India reporting date owns that day's claim. An earlier manual run that acquires the claim makes the scheduled POST return HTTP 409 without contacting Resend, even if the earlier outcome was rejected or uncertain. This safe duplicate response makes the current Actions job fail its HTTP-status check. Rejected or uncertain attempts keep their daily claim permanently, and a later India reporting date has its own claim. PDF-only requests never acquire the email claim. [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

The analytics route sends the PDF to `yashshah7117@gmail.com`. The unrelated admin-contact and sandbox recipient variables cannot override it. The email subject, PDF attachment, analytics data, database status, and authenticated PDF download retain their existing behavior.

## Activation prerequisites

- **Workflow state.** Publication-time read-only GitHub metadata confirmed `disabled_manually`. After PR review, merge and successful deployment of the fixed-recipient route, an authorized owner must explicitly enable the workflow and verify its effective state. Verify that it remains disabled during deployment. Publication does not authorize enablement or a manual run.
- **Credentials and host.** GitHub metadata confirms repository secrets named `CRON_SECRET` and `SITE_URL`. Their values are hidden. Confirm privately that the cron secret is nonempty, single-line, and matches the production application's `CRON_SECRET`. Confirm the `SITE_URL` secret is empty or exactly `https://hackermate.in` or `https://www.hackermate.in`, without a trailing slash. The workflow defaults and normalizes to `https://www.hackermate.in`. Other values fail before curl. The single POST rejects redirects and has a bounded timeout with no retry.
- **Sender and recipient.** Confirm that the production deployment contains the fixed-recipient route and serves every authorized digest request. Verify the Resend sending key, a `RESEND_FROM_EMAIL` on a domain verified in the same Resend account, and that the destination can receive mail. The fallback `onboarding@resend.dev` is restricted to the account owner's address. Verify configuration and domain status without sending. [Resend sending-domain requirements](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain)
- **Production firewall and daily claims.** The owner independently verified that the old HM08 analytics-summary rollout hold was previously removed from the Vercel production firewall. There is no active old hold to rely on. This publication does not change the firewall. Keep the GitHub workflow disabled while reconciling current-date provider history and the private daily ledger. Resolve any earlier or uncertain attempt before activation. Confirm the deployed instances share the existing primary database and claim namespace. No migration or claim reset is needed.

## First run, verification, and disablement

Before activation, inspect the reviewed workflow and the deployed route's revision, confirm the secret and sender prerequisites through configuration metadata, and verify the POST and PDF paths with isolated fixtures. Avoid **Run workflow** or a production email-producing request for verification. After PR review, a merge to `main`, successful deployment and separately authorized explicit workflow enablement, the first eligible automatic run is the next 07:10 IST slot. A same-day claim can still suppress that run. A missed slot is not replayed.

The Actions success message confirms provider acceptance. Check the provider's delivery or bounce event and the recipient mailbox for delivery evidence. An ambiguous transport outcome or held claim requires read-only reconciliation before any further action.

To stop recurring dispatch promptly, an authorized operator can disable the workflow in GitHub and review queued or active runs. Disabling the workflow does not retract a POST already issued. The old HM08 firewall hold is absent. Disabling this workflow does not block direct endpoint callers. Review those callers and any active invocations before treating dispatch as stopped. To remove only the recurring schedule, revert the schedule block on `main` through review and retain `workflow_dispatch`. Preserve the daily claims. [GitHub workflow disablement](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)

## Local verification and review

| Check | Result |
| --- | --- |
| Analytics workflow, PDF/recipient, and HM08 claim suites | 212 passed, zero failures or skips |
| Existing disposable PostgreSQL and loopback HTTP suite | 21 passed, zero failures or skips. Its 24 concurrent GET/POST invocations made one synthetic provider POST. |
| Exact 42-file offline PR selection, including affected HM03–HM09 email regressions | 1,690 passed, one existing Windows CRLF failure, zero skipped |
| TypeScript and changed-file ESLint | Passed |
| YAML, schedule, Bash syntax, and preserved job/permission checks | Passed. Exactly one daily trigger and the manual trigger share the original job. |
| Offline webpack production build | Passed, with 89 of 89 static pages generated |
| Diff, credentials, scope, and fingerprints | Passed. Five intended files and an empty index. |

The first focused run failed because Windows Git Bash could not initialize in the sandbox, even for `bash -n`, returning `0xC0000142`. The initial full run also hit sandbox-denied loopback connections. The first requests to rerun outside the sandbox were interrupted by the approval service's usage limit. After resumption, the approved reruns passed with the same fixtures and external Node network guard. No source change was needed for those environment failures. Tests still intercept curl through a verified read-only Bash function. The legacy database-report test is confirmed to stop at its CRLF assertion before reaching its PATH-only curl fixture.

The remaining full-selection failure is `scripts/test-database-report-workflow.cjs:11`. Its LF-only marker does not match the unchanged Windows CRLF checkout of `daily-database-report.yml`. Neither file was changed, skipped or excluded. Existing test assertions were retained or updated for the newly approved trigger and recipient contract. Counts overlap.

The build used fixture fonts, synthetic configuration, no production environment file and blocked external Node networking. No actual Resend call, production cron request, workflow dispatch or production database operation occurred. Native fixture cleanup completed.

Independent Standards/security and Specification reviews reported no implementation blockers. They verified the shared secure POST, fixed recipient, unchanged daily ledger and HM09 scope, and the disabled-workflow prerequisite. Their initial rollout notes assumed an active endpoint hold. Publication review corrected that assumption using the owner's independent verification that the old Vercel hold had already been removed. The Specification review required a successful guarded rerun after the Bash initialization failure, now recorded above.

Reviewed source hashes and verification-log hashes are retained in ignored `build/verification/hm08-schedule-final-manifest.json`. Publication fingerprints, including the corrected handoff, are recorded in ignored `build/verification/hm08-schedule-publication-manifest.json`. No new migration, shared email-dispatch change or production configuration change is part of this task.

The exact changed files are

1. `.github/workflows/analytics-digest.yml`
2. `scripts/test-analytics-digest-workflow.cjs`
3. `scripts/test-analytics-summary.cjs`
4. `src/app/api/cron/analytics-summary/route.ts`
5. `docs/security/hm08-daily-digest-schedule.md`
