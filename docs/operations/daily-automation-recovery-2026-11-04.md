# Daily automation restoration — November 4, 2026

- Keep Vercel crons disabled. Its legacy auto-scrape-leads endpoint is a hackathon catalog sync, NOT organizer lead discovery. The separate GitHub catalog worker is healthy.
- Restore one admin database-activity PDF report every day at 03:37 UTC / 09:07 IST using GitHub Actions. The report endpoint now inserts a primary-key claim into app_settings before a machine-authenticated send. Duplicate claims and unavailable DB claims do not send. A failure or unknown delivery status requires human inspection rather than retries.
- Create a daily read-only organizer-prospect candidate artifact at 04:15 UTC / 09:45 IST. It uses recent approved source snapshots, excludes partner/native and existing CRM URLs including removed leads, and labels all candidates as requiring human verification. No CRM writes, email addresses, or outreach sends.
- Inspect both workflows after the next scheduled run. Check Gmail/provider acceptance for the PDF; Actions success alone does not prove inbox delivery. Download candidate JSON from the organizer prospect workflow artifact.
- For a blocked report, inspect app_settings key cron:database-activity-report:YYYY-MM-DD (IST) and provider logs before any human-admin resend. Never automatically delete or reset a claim.
- Do not re-enable the legacy enrichment script, bulk outreach auto-send, the one-time Hustle cron, onboarding nudges, profile nudges, or duplicate analytics digests.
- The report route change needs a READY production Vercel deployment before the GitHub daily schedule starts. No migration or secret update is needed.

## November 5 scheduling incident and verification

- September 13 commit `ab23b782c` removed the GitHub report schedule intentionally, explaining the last historical run. November 4 PR #113 restored it on `main` at 18:28 UTC, after that day's 03:30 UTC schedule. The first expected November 5 run was absent; the newly scheduled prospect preview run was also absent, although an established scheduled source-refresh workflow ran.
- The report endpoint had no November 5 IST claim in `app_settings` and Gmail had no Founder Brief. These observations confirm no accepted report is evidenced, but they do not prove why GitHub failed to create the run. GitHub scheduled events are best-effort.
- This patch changes the report cron expression to `37 3 * * *` (03:37 UTC / 09:07 IST), to refresh the GitHub scheduling registration/actor and avoid a common minute boundary. It does not invoke the endpoint or activate Vercel crons. A cron edit is a recommended recovery mechanism but is not proof that GitHub scheduling is fixed.
- **Post-merge verification:** inspect GitHub Actions for a `schedule` run after the next due time; inspect HTTP result/dispatch flags, exact IST-date claim, provider acceptance and target inbox independently. Do not manually trigger/resend while the delivery outcome is unknown. If no run appears, escalate to GitHub Support with the workflow path and commit history and assess an explicitly approved single-scheduler fallback.
- Verify the organizer-prospect workflow separately; this patch intentionally does not change that workflow or enable any outreach.
