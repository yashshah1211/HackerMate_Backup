# HackerMate unattended source refresh — existing infrastructure only

## Purpose and release hold

The worker uses GitHub Actions (Node.js 22), existing Supabase project
rhryjrbebfrrfhtyyzbs and the existing HackerMate parsers. It does not use
AI APIs, Docker, new cloud projects, the Vercel cron endpoint, or an
unrestricted browser crawler. It never deploys or promotes a public domain.

The worker performs three bounded passes: refresh source-verified records first,
adopt uniquely matched and freshly verified legacy records through metadata-only
writes under the founder's 2026-11-03 bulk policy, and discover/insert genuinely
verified new opportunities. Organizer fields, registrations, teams, saves and
partner settings are protected by the existing guarded PostgreSQL functions.

## One-time operator setup

1. Merge the separately reviewed workflow update. Do not promote any
   Vercel build as part of this workflow change.
2. In the existing GitHub repository yashshah1211/HackerMate_Backup, the
   repository Actions secret SUPABASE_SERVICE_ROLE_KEY already exists.
   The worker uses this existing secret; do not copy or create another key.
   Never paste the secret into chat, an issue, a PR, or a commit.
3. Run a manual read-only qualification first at Actions > HackerMate
   Unattended Source Refresh > Run workflow, select main and dry-run.
   The dry-run is permitted when HACKERMATE_AGGREGATOR_ENABLED is unset;
   its code never executes SQL writer RPCs.
4. After verifying the dry-run, open Settings > Secrets and variables >
   Actions > Variables and set HACKERMATE_AGGREGATOR_ENABLED to true.
   When absent or false, scheduled writes and manual apply are skipped.
5. Run workflow_dispatch apply once on main, verify the exact source counts
   and preservation checks, then leave enabled for the recurring schedule.

Do NOT enable the existing Vercel /api/cron/auto-scrape-leads route or change
its firewall policy. The GitHub job is independent of the old public site.

## Frequency, limits, and monitoring

Schedule: 23 1,9,17 * * * UTC, normally three runs daily. GitHub scheduling
is best-effort and may be delayed. Source evidence expires after 26 hours, so
monitor missed executions and growing stale backlogs.

Each run uses allowlisted source origins and paths, robots compliance,
redirect denial, response-size caps, rate pacing, strict source validation,
identity deduplication, current row snapshots and SQL compare-and-apply
guards. It prioritizes oldest evidence, then rotates among legacy records
and source discoveries. Counts are logged as AGGREGATOR_RESULT and posted
to the GitHub Actions job summary.

If remaining_refresh rises, capacity is too low for the number of admitted
records: adjust the worker budget or cadence through review, NEVER make
expired observations count as fresh. If any provider becomes unavailable,
investigate documented source schemas and access policies. Do not bypass
robots or invent event dates. Individual failures are held without blocking
other valid opportunities.

## Emergency stop

Set HACKERMATE_AGGREGATOR_ENABLED=false in repository Actions variables
and cancel any already-running source-refresh job. If necessary revoke or
rotate the dedicated repository secret. Disabling the variable only stops
future runs, not transactions already committed.

## Guarded database write modes

- Legacy and partner-protected records: store_hackathon_source_evidence
  updates metadata only; no organizer field, registration, team or partner
  configuration is rewritten.
- Source-created records: begin_hackathon_source_check followed by
  apply_hackathon_source_check maintains source-controlled facts with the
  existing editorial protection logic.
- New records: apply_hackathon_source_check handles identity matching
  and atomic insertion; nonmatching/invalid discoveries are held.

Existing PR #99 and PR #100 migrations are prerequisites. This workflow does
not change migrations, Vercel deployment aliases, cron configuration or
firewall settings. Public release still needs a separate final authorization.
