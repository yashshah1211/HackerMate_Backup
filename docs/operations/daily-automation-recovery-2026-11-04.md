# Daily automation restoration — November 4, 2026

- Keep Vercel crons disabled. Its legacy auto-scrape-leads endpoint is a hackathon catalog sync, NOT organizer lead discovery. The separate GitHub catalog worker is healthy.
- Restore one admin database-activity PDF report every day at 03:30 UTC / 09:00 IST using GitHub Actions. The report endpoint now inserts a primary-key claim into app_settings before a machine-authenticated send. Duplicate claims and unavailable DB claims do not send. A failure or unknown delivery status requires human inspection rather than retries.
- Create a daily read-only organizer-prospect candidate artifact at 04:15 UTC / 09:45 IST. It uses recent approved source snapshots, excludes partner/native and existing CRM URLs including removed leads, and labels all candidates as requiring human verification. No CRM writes, email addresses, or outreach sends.
- Inspect both workflows after the next scheduled run. Check Gmail/provider acceptance for the PDF; Actions success alone does not prove inbox delivery. Download candidate JSON from the organizer prospect workflow artifact.
- For a blocked report, inspect app_settings key cron:database-activity-report:YYYY-MM-DD (IST) and provider logs before any human-admin resend. Never automatically delete or reset a claim.
- Do not re-enable the legacy enrichment script, bulk outreach auto-send, the one-time Hustle cron, onboarding nudges, profile nudges, or duplicate analytics digests.
- The report route change needs a READY production Vercel deployment before the GitHub daily schedule starts. No migration or secret update is needed.
